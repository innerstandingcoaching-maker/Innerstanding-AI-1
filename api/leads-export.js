// api/leads-export.js
// Te deja ver todos los emails que has capturado con el formulario gratis.
// Protegido con una clave secreta que tú eliges.
//
// PASO 1: crea en Vercel una variable de entorno nueva llamada ADMIN_EXPORT_KEY
//         con cualquier clave secreta que inventes (ej: algo largo y random).
// PASO 2: abre esta URL en el navegador, reemplazando TU_CLAVE:
//         https://innerstanding-ai-1.vercel.app/api/leads-export?key=TU_CLAVE

async function kvListRange(listKey) {
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return [];
  const resp = await fetch(`${url}/lrange/${encodeURIComponent(listKey)}/0/-1`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  const data = await resp.json();
  return (data && data.result) || [];
}

export default async function handler(req, res) {
  const adminKey = process.env.ADMIN_EXPORT_KEY;
  if (!adminKey) {
    res.status(500).json({ error: 'Falta configurar ADMIN_EXPORT_KEY en Vercel.' });
    return;
  }

  const providedKey = (req.query && req.query.key) || (req.body && req.body.key);
  if (providedKey !== adminKey) {
    res.status(401).json({ error: 'No autorizado. Agrega ?key=TU_CLAVE a la URL.' });
    return;
  }

  try {
    const leads = await kvListRange('leads_all');
    res.status(200).json({ count: leads.length, leads });
  } catch (err) {
    res.status(500).json({ error: err.message || 'Error interno del servidor.' });
  }
}
