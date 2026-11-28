const sec = require('../_security');

module.exports = (req, res) => {
  if (sec.handlePreflight(req, res)) return;
  if (!sec.enforcePublicRateLimit(req, res, 'session', 60, 60000)) return;
  if (req.method !== 'GET') {
    return res.status(405).json({ ok: false, error: 'Yalnızca GET isteği desteklenir.' });
  }

  const session = sec.verifySession(req);

  const protections = [
    'Bcrypt (Cost 12) Şifre Özeti & Sabit Zamanlı Doğrulama',
    'HttpOnly + SameSite=Strict + HMAC-SHA256 & İptal Edilebilir Oturum',
    'Oturuma Kriptografik Bağlı CSRF & Sıkı Same-Origin Kalkanı',
    'Rol Tabanlı Yetkilendirme (RBAC) & Kullanıcı Veri Sahipliği İzolasyonu',
    'AES-256-GCM Sunucu API Kasası (Tarayıcıda Sıfır Gizli Anahtar)',
    'SSRF Yönlendirme Duvarı, Sıkı CSP (unsafe-inline Kapalı) & Güvenlik Günlüğü'
  ];

  if (!session.ok) {
    return res.status(200).json({
      ok: true,
      authenticated: false,
      setupRequired: sec.isInitialLocalSetupRequired(req),
      protections
    });
  }

  return res.status(200).json({
    ok: true,
    authenticated: true,
    user: session.user,
    role: session.role,
    expiresAt: session.expiresAt,
    csrfToken: session.csrfToken,
    protections
  });
};
