// api/create-checkout-session.js
// Crea una sesión de pago de Stripe (suscripción semanal o mensual).
// Necesita STRIPE_SECRET_KEY en las variables de entorno de Vercel,
// y que reemplaces los Price ID de abajo con los reales de tu cuenta de Stripe.

const PRICE_IDS = {
  weekly: 'price_1U6zA0FvFib9QAvbYI0OdfAu',
  monthly: 'price_1U7KjhFvFib9QAvbgNqwlE2E'
};

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

  const { deviceId, plan } = req.body || {};
  if (!deviceId || !plan || !PRICE_IDS[plan]) {
    res.status(400).json({ error: 'Faltan datos (deviceId o plan no válido).' });
    return;
  }

  if (PRICE_IDS[plan].startsWith('REEMPLAZA')) {
    res.status(500).json({ error: 'Falta poner el Price ID real en api/create-checkout-session.js.' });
    return;
  }

  const origin = req.headers.origin || ('https://' + req.headers.host);

  const params = new URLSearchParams();
  params.append('mode', 'subscription');
  params.append('line_items[0][price]', PRICE_IDS[plan]);
  params.append('line_items[0][quantity]', '1');
  params.append('client_reference_id', deviceId);
  params.append('success_url', origin + '/?session_id={CHECKOUT_SESSION_ID}');
  params.append('cancel_url', origin + '/');

  try {
    const upstream = await fetch('https://api.stripe.com/v1/checkout/sessions', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + stripeKey,
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: params.toString()
    });
    const data = await upstream.json();

    if (!upstream.ok) {
      const msg = (data && data.error && data.error.message) || 'Error creando la sesión de pago.';
      res.status(upstream.status).json({ error: msg });
      return;
    }

    res.status(200).json({ url: data.url });
  } catch (err) {
    res.status(500).json({ error: err.message || 'Error interno del servidor.' });
  }
}
