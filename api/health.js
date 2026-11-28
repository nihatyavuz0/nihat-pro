const sec = require('./_security');

module.exports = (req, res) => {
  if (sec.handlePreflight(req, res)) return;
  if (!sec.enforcePublicRateLimit(req, res, 'health', 60, 60000)) return;
  if (req.method !== 'GET') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  res.status(200).json({
    ok: true,
    app: 'NİHAT PRO',
    mode: sec.IS_PRODUCTION_CLOUD ? 'vercel-cloud' : 'live-server',
    security: 'hardened-v3',
    time: new Date().toISOString()
  });
};
