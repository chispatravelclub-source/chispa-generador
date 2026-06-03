// api/generate.js — Vercel serverless function
export const config = { api: { bodyParser: { sizeLimit: '50mb' } } };

export default async function handler(req, res) {
  // CORS for direct browser calls to this endpoint
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const body = req.body;

  // Return Netlify token for publishing
  if (body?.action === 'getToken') {
    const token = process.env.NETLIFY_TOKEN;
    if (!token) return res.status(500).json({ error: 'NETLIFY_TOKEN no configurado' });
    return res.json({ token });
  }

  // Return Anthropic API key so browser can call API directly
  // This avoids Vercel's 4.5MB body limit on this route
  if (body?.action === 'getKey') {
    const key = process.env.ANTHROPIC_API_KEY;
    if (!key) return res.status(500).json({ error: 'ANTHROPIC_API_KEY no configurado' });
    return res.json({ key });
  }

  // Fallback: proxy to Anthropic (for small requests)
  try {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) return res.status(500).json({ error: 'ANTHROPIC_API_KEY no configurado' });

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(body),
    });

    const data = await response.json();
    return res.status(response.status).json(data);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
