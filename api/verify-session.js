// api/verify-session.js
// Después de que alguien paga en Stripe, esta función confirma el pago
// y guarda en la base de datos (Vercel KV) que ese dispositivo ya tiene acceso.

async function kvSet(key, value) {
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) throw new Error('Falta configurar KV_REST_API_URL/UPSTASH_REDIS_REST_URL y su token en Vercel.');
  await fetch(`${url}/set/${encodeURIComponent(key)}/${encodeURIComponent(value)}`, {
    headers: { Authorization: `Bearer ${token}` }
  });
}

async function kvGet(key) {
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  try {
    const resp = await fetch(`${url}/get/${encodeURIComponent(key)}`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    const data = await resp.json();
    return (data && data.result) ? data.result : null;
  } catch (e) {
    return null;
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Método no permitido' });
    return;
  }

  const stripeKey = process.env.STRIPE_SECRET_KEY;
  if (!stripeKey) {
    res.status(500).json({ error: 'Falta configurar STRIPE_SECRET_KEY en Vercel.' });
    return;
  }

  const { sessionId } = req.body || {};
  if (!sessionId) {
    res.status(400).json({ error: 'Falta sessionId.' });
    return;
  }

  try {
    const upstream = await fetch(
      `https://api.stripe.com/v1/checkout/sessions/${encodeURIComponent(sessionId)}?expand[]=subscription`,
      { headers: { Authorization: 'Bearer ' + stripeKey } }
    );
    const session = await upstream.json();

    if (!upstream.ok) {
      const msg = (session && session.error && session.error.message) || 'Error verificando el pago.';
      res.status(upstream.status).json({ error: msg });
      return;
    }

    if (session.payment_status !== 'paid' && session.status !== 'complete') {
      res.status(200).json({ active: false });
      return;
    }

    const deviceId = session.client_reference_id;
    const subscription = session.subscription;
    const currentPeriodEnd = (subscription && subscription.current_period_end)
      ? subscription.current_period_end * 1000
      : (Date.now() + 31 * 24 * 60 * 60 * 1000);

    // El plan viene de la metadata que guardamos al crear la sesión de pago.
    // Si por alguna razón no viene ahí, lo buscamos en la metadata de la suscripción.
    let plan = (session.metadata && session.metadata.plan)
      || (subscription && subscription.metadata && subscription.metadata.plan)
      || null;

    let programStart = Date.now();

    if (deviceId) {
      // Si ya existía un registro previo (ej. una renovación), respetamos
      // la fecha de inicio original — el "Día 1" no se reinicia solo porque pague de nuevo.
      const existingRaw = await kvGet(`access:${deviceId}`);
      if (existingRaw) {
        try {
          const existing = JSON.parse(existingRaw);
          if (existing.programStart) programStart = existing.programStart;
          if (!plan && existing.plan) plan = existing.plan;
        } catch (e) {}
      }

      await kvSet(`access:${deviceId}`, JSON.stringify({
        active: true,
        customerId: session.customer || null,
        subscriptionId: subscription ? subscription.id : null,
        until: currentPeriodEnd,
        programStart,
        plan
      }));
    }

    res.status(200).json({ active: true, until: currentPeriodEnd, programStart, plan });
  } catch (err) {
    res.status(500).json({ error: err.message || 'Error interno del servidor.' });
  }
}
