export const config = {
  api: {
    bodyParser: {
      sizeLimit: '25mb',
    },
  },
};

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const { action } = req.body;

  // ── PUBLICAR EN NETLIFY ──
  if (action === 'publish') {
    const netlifyToken = process.env.NETLIFY_TOKEN;
    if (!netlifyToken) return res.status(500).json({ error: 'NETLIFY_TOKEN no configurado' });

    const { siteName, htmlContent } = req.body;

    try {
      // Buscar si el sitio ya existe
      const listResp = await fetch('https://api.netlify.com/api/v1/sites?per_page=100', {
        headers: { Authorization: 'Bearer ' + netlifyToken }
      });
      const sites = await listResp.json();
      const existing = Array.isArray(sites) && sites.find(function(s) {
        return s.name === siteName;
      });

      const htmlB64 = Buffer.from(htmlContent).toString('base64');
      const fileHash = require('crypto').createHash('sha1').update(htmlContent).digest('hex');

      const deployBody = {
        files: { '/index.html': fileHash },
        async: false
      };

      let siteId;

      if (existing) {
        siteId = existing.id;
      } else {
        // Crear sitio nuevo
        const createResp = await fetch('https://api.netlify.com/api/v1/sites', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + netlifyToken },
          body: JSON.stringify({ name: siteName })
        });
        const newSite = await createResp.json();
        siteId = newSite.id;
      }

      // Crear deploy
      const deployResp = await fetch('https://api.netlify.com/api/v1/sites/' + siteId + '/deploys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + netlifyToken },
        body: JSON.stringify(deployBody)
      });
      const deploy = await deployResp.json();

      // Subir el archivo
      await fetch('https://api.netlify.com/api/v1/deploys/' + deploy.id + '/files/index.html', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/octet-stream',
          Authorization: 'Bearer ' + netlifyToken
        },
        body: htmlContent
      });

      return res.status(200).json({ url: 'https://' + siteName + '.netlify.app' });

    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
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
