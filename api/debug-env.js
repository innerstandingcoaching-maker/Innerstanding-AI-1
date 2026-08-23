// api/debug-env.js
// Solo para diagnóstico temporal — confirma si Vercel realmente tiene
// guardada la variable ELEVENLABS_API_KEY, sin tocar nada de ElevenLabs.
// Bórralo cuando ya no lo necesites.

export default function handler(req, res) {
  const key = process.env.ELEVENLABS_API_KEY;
  const stripeKey = process.env.STRIPE_SECRET_KEY;
  res.status(200).json({
    tieneElevenLabsKey: !!key,
    largoElevenLabsKey: key ? key.length : 0,
    primerosCaracteres: key ? key.slice(0, 4) + '...' : null,
    tieneStripeKey: !!stripeKey
  });
}
