// api/create-checkout-session.js
// Crea una sesión de pago de Stripe (suscripción semanal o mensual).
// Necesita STRIPE_SECRET_KEY en las variables de entorno de Vercel.
//
// OJO: en vez de guardar un Price ID fijo (que cambia cada vez que se toca
// el producto en Stripe), guardamos el PRODUCT ID — mucho más estable — y en
// cada pago le preguntamos a Stripe cuál es el precio activo AHORA MISMO para
// ese producto. Así, aunque el precio se regenere solo en Stripe, la app
// nunca se rompe.

const PRODUCT_IDS = {
  weekly: 'prod_V7DPkjrADNkq15',
  monthly: 'prod_V7cmvGvmWtfr6j'
};

async function getActivePriceId(productId, stripeKey){
  const url = `https://api.stripe.com/v1/prices?product=${encodeURIComponent(productId)}&active=true&limit=1`;
  const upstream = await fetch(url, {
    headers: { 'Authorization': 'Bearer ' + stripeKey }
  });
  const data = await upstream.json();
  if (!upstream.ok) {
    throw new Error((data && data.error && data.error.message) || 'Error buscando el precio activo.');
  }
  if (!data.data || !data.data.length) {
    throw new Error('Este producto no tiene ningún precio activo en Stripe ahorita mismo.');
  }
  return data.data[0].id;
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

  const { deviceId, plan } = req.body || {};
  if (!deviceId || !plan || !PRODUCT_IDS[plan]) {
    res.status(400).json({ error: 'Faltan datos (deviceId o plan no válido).' });
    return;
  }

  const origin = req.headers.origin || ('https://' + req.headers.host);

  try {
    const priceId = await getActivePriceId(PRODUCT_IDS[plan], stripeKey);

    const params = new URLSearchParams();
    params.append('mode', 'subscription');
    params.append('line_items[0][price]', priceId);
    params.append('line_items[0][quantity]', '1');
    params.append('client_reference_id', deviceId);
    params.append('success_url', origin + '/?session_id={CHECKOUT_SESSION_ID}');
    params.append('cancel_url', origin + '/');

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
