const sec = require('../_security');

module.exports = async (req, res) => {
  if (sec.handlePreflight(req, res)) return;
  if (!sec.enforcePublicRateLimit(req, res, 'auth-setup', 10, 15 * 60 * 1000)) return;

  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Yalnızca POST isteği desteklenir.' });
  }
  if (!sec.checkSameOrigin(req, true)) {
    return res.status(403).json({ ok: false, code: 'ORIGIN_BLOCKED', error: 'Kaynak doğrulaması başarısız.' });
  }
  if (!sec.isInitialLocalSetupRequired(req)) {
    sec.logSecurityEvent('ALERT', 'UNAUTHORIZED_SETUP_ATTEMPT', req, { detail: 'Kurulum zaten tamamlanmış veya bulut ortamında devre dışı.' });
    return res.status(403).json({
      ok: false,
      code: 'SETUP_LOCKED',
      error: 'İlk kurulum zaten tamamlanmış. Yönetici bilgileri yalnızca sunucu yapılandırmasından değiştirilebilir.'
    });
  }

  try {
    const body = sec.parseSafeBody(req, 4096);
    const created = sec.createLocalUser(body.username, body.password, 'admin');
    const { expiresAt, csrfToken } = sec.issueSessionCookies(req, res, created.username, created.role);
    sec.logSecurityEvent('INFO', 'INITIAL_ADMIN_CREATED', req, { user: created.username, detail: 'Yerel ilk kurulum tamamlandı (bcrypt cost 12).' });
    return res.status(200).json({
      ok: true,
      authenticated: true,
      user: created.username,
      role: created.role,
      expiresAt,
      csrfToken
    });
  } catch (err) {
    return res.status(err.statusCode || 400).json({
      ok: false,
      error: err && err.message ? err.message : 'İlk kurulum başarısız.'
    });
  }
};
