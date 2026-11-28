const sec = require('./_security');

module.exports = (req, res) => {
  if (sec.handlePreflight(req, res)) return;
  if (!sec.enforcePublicRateLimit(req, res, 'version', 60, 60000)) return;
  if (req.method !== 'GET') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  res.status(200).json({
    ok: true,
    version: process.env.VERCEL_DEPLOYMENT_ID || process.env.NIHAT_BUILD_VERSION || '2.3.0'
  });
};
