// api/restore-access.js
// Permite que alguien que ya pagó recupere su acceso en un dispositivo
// nuevo (o después de borrar caché) escribiendo el email con el que pagó.
// Verifica EN VIVO con Stripe (no solo con lo que tengamos guardado),
// así que si la persona canceló o el pago falló, esto lo refleja bien.

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

function isValidEmail(email){
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
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

  const { deviceId, email } = req.body || {};
  if (!deviceId || !email || !isValidEmail(email)) {
    res.status(400).json({ error: 'Falta un deviceId o un email válido.' });
    return;
  }

  const cleanEmail = email.toLowerCase().trim();

  try {
    // 1) Buscamos al cliente en Stripe por su email.
    const customersResp = await fetch(
      `https://api.stripe.com/v1/customers?email=${encodeURIComponent(cleanEmail)}&limit=5`,
      { headers: { Authorization: 'Bearer ' + stripeKey } }
    );
    const customersData = await customersResp.json();
    if (!customersResp.ok) {
      const msg = (customersData && customersData.error && customersData.error.message) || 'Error buscando el cliente en Stripe.';
      res.status(customersResp.status).json({ error: msg });
      return;
    }

    const customers = customersData.data || [];
    if (!customers.length) {
      res.status(404).json({ error: 'No encontramos ninguna cuenta con ese email. Revisa que sea el mismo que usaste al pagar.' });
      return;
    }

    // 2) Para cada cliente encontrado, buscamos una suscripción activa o en período de gracia.
    let bestSubscription = null;
    let matchedCustomerId = null;

    for (const customer of customers) {
      const subsResp = await fetch(
        `https://api.stripe.com/v1/subscriptions?customer=${encodeURIComponent(customer.id)}&status=all&limit=10&expand[]=data.items.data.price.product`,
        { headers: { Authorization: 'Bearer ' + stripeKey } }
      );
      const subsData = await subsResp.json();
      if (!subsResp.ok) continue;

      const active = (subsData.data || []).find(s => s.status === 'active' || s.status === 'trialing');
      if (active) {
        bestSubscription = active;
        matchedCustomerId = customer.id;
        break;
      }
    }

    if (!bestSubscription) {
      res.status(404).json({ error: 'Encontramos tu cuenta, pero no tienes ninguna suscripción activa ahorita. Si crees que es un error, escríbenos.' });
      return;
    }

    // 3) Detectamos el plan por el nombre del producto (igual que en verify-session.js).
    let plan = (bestSubscription.metadata && bestSubscription.metadata.plan) || null;
    if (!plan) {
      try {
        const productName = bestSubscription.items.data[0].price.product.name;
        if (productName === 'Innerstanding — Acceso semanal') plan = 'weekly';
        else if (productName === 'Innerstanding — Acceso mensual') plan = 'monthly';
      } catch (e) {}
    }

    // 4) Respetamos el "Día 1" original del programa si ya existía.
    let programStart = Date.now();
    const existingRaw = await kvGet(`access_email:${cleanEmail}`);
    if (existingRaw) {
      try {
        const existing = JSON.parse(existingRaw);
        if (existing.programStart) programStart = existing.programStart;
      } catch (e) {}
    }

    const currentPeriodEnd = bestSubscription.current_period_end * 1000;

    const record = JSON.stringify({
      active: true,
      customerId: matchedCustomerId,
      subscriptionId: bestSubscription.id,
      until: currentPeriodEnd,
      programStart,
      plan,
      email: cleanEmail
    });

    await kvSet(`access:${deviceId}`, record);
    await kvSet(`access_email:${cleanEmail}`, record);

    res.status(200).json({ active: true, until: currentPeriodEnd, programStart, plan });
  } catch (err) {
    res.status(500).json({ error: err.message || 'Error interno del servidor.' });
  }
}
