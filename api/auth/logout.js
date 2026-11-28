const sec = require('../_security');

module.exports = (req, res) => {
  if (sec.handlePreflight(req, res)) return;
  if (!sec.enforcePublicRateLimit(req, res, 'logout', 30, 60000)) return;

  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Yalnızca POST isteği desteklenir.' });
  }
  if (!sec.checkSameOrigin(req, true)) {
    sec.logSecurityEvent('ALERT', 'LOGOUT_ORIGIN_BLOCKED', req, { detail: 'Farklı kaynaktan çıkış isteği engellendi.' });
    return res.status(403).json({ ok: false, code: 'ORIGIN_BLOCKED', error: 'Farklı kaynaktan istek engellendi.' });
  }

  const session = sec.verifySession(req);
  if (session.ok) {
    const headerCsrf = String(req.headers['x-csrf-token'] || '');
    if (!headerCsrf || headerCsrf !== session.csrfToken) {
      sec.logSecurityEvent('ALERT', 'LOGOUT_CSRF_INVALID', req, { user: session.user, detail: 'Çıkış isteğinde geçersiz CSRF jetonu.' });
      return res.status(403).json({ ok: false, code: 'CSRF_INVALID', error: 'Güvenlik doğrulaması (CSRF) başarısız.' });
    }
    sec.revokeSession(session.jti, session.expMs);
    sec.logSecurityEvent('INFO', 'LOGOUT_SUCCESS', req, { user: session.user, detail: 'Oturum sunucuda iptal edildi.' });
  }

  sec.clearSessionCookies(req, res);
  return res.status(200).json({ ok: true, authenticated: false });
};
