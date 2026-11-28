const sec = require('./_security');

module.exports = (req, res) => {
  if (sec.handlePreflight(req, res)) return;

  // Admin-only endpoint: role checked on server on every request!
  const session = sec.requireAuth(req, res, {
    role: 'admin',
    bucket: 'vault',
    rateLimit: { max: 30, windowMs: 60000 }
  });
  if (!session) return;

  if (req.method === 'GET') {
    return res.status(200).json({
      ok: true,
      cloudMode: sec.IS_PRODUCTION_CLOUD,
      providers: sec.getVaultPublicSummary()
    });
  }

  if (req.method === 'POST') {
    try {
      const body = sec.parseSafeBody(req, 16384);
      const platform = String(body.platform || '').trim();
      const config = body.config && typeof body.config === 'object' ? body.config : {};
      if (!sec.VAULT_PLATFORMS[platform]) {
        return res.status(400).json({ ok: false, error: 'Geçersiz API platformu.' });
      }

      const result = sec.saveServerPlatformCredentials(platform, config);
      sec.logSecurityEvent('INFO', 'VAULT_CREDENTIALS_UPDATED', req, {
        user: session.user,
        detail: `Platform güncellendi: ${platform}`
      });

      return res.status(200).json({
        ok: true,
        persistedOnDisk: result.persistedOnDisk,
        cloudEnvRequired: result.cloudEnvRequired,
        providers: sec.getVaultPublicSummary(),
        message: result.cloudEnvRequired
          ? 'Bulut ortamında kalıcı API anahtarları Vercel Ortam Değişkenleri üzerinden tanımlanmalıdır.'
          : 'API bilgileri AES-256-GCM ile şifrelenerek yalnızca sunucu kasasına kaydedildi.'
      });
    } catch (err) {
      const code = (err && err.statusCode) || 400;
      return res.status(code).json({ ok: false, error: 'API kasası güncellenemedi.' });
    }
  }

  return res.status(405).json({ ok: false, error: 'Method not allowed' });
};
