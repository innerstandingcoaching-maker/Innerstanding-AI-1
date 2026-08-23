// api/lead.js
// Guarda el email de alguien que está probando la app gratis, para armar tu
// base de datos de leads. Usa la misma base de datos (Vercel KV / Upstash)
// que ya tienes conectada para el acceso pagado.

function isValidEmail(email){
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

async function kvSet(key, value) {
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) throw new Error('Falta configurar KV_REST_API_URL/UPSTASH_REDIS_REST_URL y su token en Vercel.');
  await fetch(`${url}/set/${encodeURIComponent(key)}/${encodeURIComponent(value)}`, {
    headers: { Authorization: `Bearer ${token}` }
  });
}

async function kvListPush(listKey, value) {
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) throw new Error('Falta configurar KV_REST_API_URL/UPSTASH_REDIS_REST_URL y su token en Vercel.');
  await fetch(`${url}/lpush/${encodeURIComponent(listKey)}/${encodeURIComponent(value)}`, {
    headers: { Authorization: `Bearer ${token}` }
  });
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Método no permitido' });
    return;
  }

  const { deviceId, email } = req.body || {};
  if (!deviceId || !email) {
    res.status(400).json({ error: 'Faltan deviceId o email.' });
    return;
  }
  if (!isValidEmail(email)) {
    res.status(400).json({ error: 'Ese email no se ve válido.' });
    return;
  }

  try {
    // Guardamos el email asociado a este dispositivo (para no duplicar),
    // y lo agregamos también a la lista general de leads para exportar.
    await kvSet(`lead:${deviceId}`, email);
    await kvListPush('leads_all', `${email} | ${deviceId} | ${new Date().toISOString()}`);
    res.status(200).json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message || 'Error interno del servidor.' });
  }
}
