import crypto from 'crypto';

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '25mb',
    },
  },
};

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  // Headers CORS para permitir llamadas directas a Netlify desde el browser
  res.setHeader('Access-Control-Allow-Origin', '*');

  const { action } = req.body;

  // ── DEVOLVER TOKEN DE NETLIFY AL FRONTEND ──
  if (action === 'getToken') {
    const token = process.env.NETLIFY_TOKEN;
    if (!token) return res.status(500).json({ error: 'NETLIFY_TOKEN no configurado' });
    return res.status(200).json({ token });
  }

  // ── LLAMADA A ANTHROPIC ──
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return res.status(500).json({ error: { message: 'ANTHROPIC_API_KEY no configurada' } });

  try {
    const upstream = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({ ...req.body, model: 'claude-haiku-4-5-20251001' }),
    });
    const data = await upstream.json();
    res.status(upstream.status).json(data);
  } catch (e) {
    res.status(500).json({ error: { message: e.message } });
  }
}
