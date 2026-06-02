export const config = {
  api: { bodyParser: { sizeLimit: '25mb' } }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()

  const key = process.env.ANTHROPIC_API_KEY
  if (!key) return res.status(500).json({ error: { message: 'ANTHROPIC_API_KEY no configurada en Vercel' } })

  try {
    const upstream = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({ ...req.body, model: 'claude-opus-4-5' }),
    })
    const data = await upstream.json()
    res.status(upstream.status).json(data)
  } catch (e) {
    res.status(500).json({ error: { message: e.message } })
  }
}
