// api/generate.js
export const config = {
  api: {
    bodyParser: {
      sizeLimit: '25mb',
    },
    responseLimit: false,
  },
  maxDuration: 60,
};

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const body = req.body;

  // Netlify token for publishing
  if (body?.action === 'getToken') {
    const token = process.env.NETLIFY_TOKEN;
    if (!token) return res.status(500).json({ error: 'NETLIFY_TOKEN no configurado' });
    return res.json({ token });
  }

  // Proxy to Anthropic with streaming
  try {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) return res.status(500).json({ error: 'ANTHROPIC_API_KEY no configurado en Vercel' });

    // Force streaming to avoid gateway timeouts
    const anthropicBody = { ...body, stream: true };

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(anthropicBody),
    });

    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      return res.status(response.status).json(errData);
    }

    // Stream SSE from Anthropic, accumulate full text, then return JSON
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let fullText = '';
    let inputTokens = 0;
    let outputTokens = 0;
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop(); // keep incomplete line

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const data = line.slice(6).trim();
        if (data === '[DONE]') continue;
        try {
          const evt = JSON.parse(data);
          if (evt.type === 'content_block_delta' && evt.delta?.type === 'text_delta') {
            fullText += evt.delta.text;
          }
          if (evt.type === 'message_start' && evt.message?.usage) {
            inputTokens = evt.message.usage.input_tokens || 0;
          }
          if (evt.type === 'message_delta' && evt.usage) {
            outputTokens = evt.usage.output_tokens || 0;
          }
        } catch (_) {}
      }

      // Send a keepalive comment so Vercel doesn't close the connection
      res.write(': keepalive\n\n');
    }

    // Send final JSON as SSE event
    const finalPayload = {
      content: [{ type: 'text', text: fullText }],
      usage: { input_tokens: inputTokens, output_tokens: outputTokens },
    };
    res.write(`data: ${JSON.stringify(finalPayload)}\n\n`);
    res.end();
  } catch (err) {
    if (!res.headersSent) {
      return res.status(500).json({ error: err.message });
    }
    res.write(`data: ${JSON.stringify({ error: err.message })}\n\n`);
    res.end();
  }
}
