// api/tts.js
// Convierte texto a voz usando tu clon de voz en ElevenLabs.
// Necesita la variable de entorno ELEVENLABS_API_KEY en Vercel,
// y que reemplaces ELEVEN_VOICE_ID abajo con el Voice ID real de tu clon.

const ELEVEN_VOICE_ID = 'K9yviW4Hlyt8Y7WqLFLk';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Método no permitido' });
    return;
  }

  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) {
    res.status(500).json({ error: 'Falta configurar ELEVENLABS_API_KEY en las variables de entorno de Vercel.' });
    return;
  }

  const { text } = req.body || {};
  if (!text || typeof text !== 'string' || !text.trim()) {
    res.status(400).json({ error: 'Falta el texto a convertir en voz.' });
    return;
  }

  try {
    const upstream = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${ELEVEN_VOICE_ID}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'xi-api-key': apiKey,
        'Accept': 'audio/mpeg'
      },
      body: JSON.stringify({
        text: text.slice(0, 5000),
        model_id: 'eleven_multilingual_v2',
        voice_settings: {
          stability: 0.5,
          similarity_boost: 0.8,
          style: 0.35,
          use_speaker_boost: true
        }
      })
    });

    if (!upstream.ok) {
      let errMsg = 'Error llamando a ElevenLabs.';
      try {
        const errJson = await upstream.json();
        errMsg = (errJson && errJson.detail && (errJson.detail.message || errJson.detail)) || errMsg;
      } catch (e) {}
      res.status(upstream.status).json({ error: errMsg });
      return;
    }

    const arrayBuffer = await upstream.arrayBuffer();
    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('Cache-Control', 'no-store');
    res.status(200).send(Buffer.from(arrayBuffer));
  } catch (err) {
    res.status(500).json({ error: err.message || 'Error interno del servidor.' });
  }
}
