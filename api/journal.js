// api/journal.js
// Guarda y recupera entradas de journaling por dispositivo (pensado para plan mensual).
// Usa la misma base de datos (Vercel KV) que ya tienes conectada para el acceso pagado.
// Guarda hasta las 100 entradas más recientes por dispositivo.

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

async function kvSet(key, value) {
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) throw new Error('Falta configurar KV_REST_API_URL/UPSTASH_REDIS_REST_URL y su token en Vercel.');
  await fetch(`${url}/set/${encodeURIComponent(key)}/${encodeURIComponent(value)}`, {
    headers: { Authorization: `Bearer ${token}` }
  });
}

const MAX_ENTRIES = 100;

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Método no permitido' });
    return;
  }

  const { action, deviceId, entry } = req.body || {};
  if (!deviceId) {
    res.status(400).json({ error: 'Falta deviceId.' });
    return;
  }

  const key = `journal:${deviceId}`;

  try {
    if (action === 'list') {
      const raw = await kvGet(key);
      const entries = raw ? JSON.parse(raw) : [];
      res.status(200).json({ entries });
      return;
    }

    if (action === 'save') {
      if (!entry || typeof entry !== 'string' || !entry.trim()) {
        res.status(400).json({ error: 'Falta el texto de la entrada.' });
        return;
      }
      const raw = await kvGet(key);
      const entries = raw ? JSON.parse(raw) : [];
      entries.unshift({ text: entry.trim(), date: Date.now() });
      const trimmed = entries.slice(0, MAX_ENTRIES);
      await kvSet(key, JSON.stringify(trimmed));
      res.status(200).json({ ok: true, count: trimmed.length });
      return;
    }

    res.status(400).json({ error: 'El campo "action" debe ser "save" o "list".' });
  } catch (err) {
    res.status(500).json({ error: err.message || 'Error interno del servidor.' });
  }
}
