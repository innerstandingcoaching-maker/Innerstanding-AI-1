// api/check-access.js
// Revisa en la base de datos (Vercel KV) si este dispositivo ya pagó
// y todavía tiene acceso vigente.

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Método no permitido' });
    return;
  }

  const { deviceId } = req.body || {};
  if (!deviceId) {
    res.status(400).json({ error: 'Falta deviceId.' });
    return;
  }

  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) {
    // Sin base de datos configurada todavía, nadie tiene acceso pagado.
    res.status(200).json({ active: false });
    return;
  }

  try {
    const upstream = await fetch(`${url}/get/${encodeURIComponent('access:' + deviceId)}`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    const data = await upstream.json();

    if (!data || !data.result) {
      res.status(200).json({ active: false });
      return;
    }

    const record = JSON.parse(data.result);
    const stillActive = !!(record.active && record.until && record.until > Date.now());
    res.status(200).json({ active: stillActive, until: record.until || null });
  } catch (err) {
    res.status(200).json({ active: false });
  }
}
