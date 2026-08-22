// api/create-checkout-session.js
// Crea una sesión de pago de Stripe (suscripción semanal o mensual).
// Necesita STRIPE_SECRET_KEY en las variables de entorno de Vercel.
//
// OJO: aquí NO guardamos ningún ID fijo de Stripe (ni de producto ni de
// precio) — cambian solos cada vez que se toca algo en el panel de Stripe.
// En su lugar, buscamos el producto por su NOMBRE exacto cada vez que alguien
// va a pagar, y de ahí sacamos su precio activo. Mientras el nombre del
// producto en Stripe siga siendo el mismo, esto nunca se rompe, sin importar
// cuántas veces se edite el producto o se le cambien los IDs por dentro.

const PRODUCT_NAMES = {
  weekly: 'Innerstanding — Acceso semanal',
  monthly: 'Innerstanding — Acceso mensual'
};

async function findProductIdByName(name, stripeKey){
  const url = `https://api.stripe.com/v1/products?active=true&limit=100`;
  const upstream = await fetch(url, {
    headers: { 'Authorization': 'Bearer ' + stripeKey }
  });
  const data = await upstream.json();
  if (!upstream.ok) {
    throw new Error((data && data.error && data.error.message) || 'Error buscando el producto.');
  }
  const match = (data.data || []).find(p => p.name === name);
  if (!match) {
    throw new Error(`No encontré ningún producto activo en Stripe llamado exactamente "${name}".`);
  }
  return match.id;
}

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
  if (!deviceId || !plan || !PRODUCT_NAMES[plan]) {
    res.status(400).json({ error: 'Faltan datos (deviceId o plan no válido).' });
    return;
  }

  const origin = req.headers.origin || ('https://' + req.headers.host);

  try {
    const productId = await findProductIdByName(PRODUCT_NAMES[plan], stripeKey);
    const priceId = await getActivePriceId(productId, stripeKey);

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
