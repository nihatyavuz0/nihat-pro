const sec = require('../_security');

module.exports = async (req, res) => {
  if (sec.handlePreflight(req, res)) return;
  if (req.method !== 'POST') {
    sec.setSecurityHeaders(req, res);
    return res.status(405).json({ ok: false, error: 'Yalnızca POST isteği desteklenir.' });
  }

  const ip = sec.getClientIp(req);
  const rl = sec.checkRateLimit(`login|${ip}`, 10, 15 * 60 * 1000);
  sec.setSecurityHeaders(req, res);
  res.setHeader('X-RateLimit-Remaining', String(rl.remaining));

  if (!rl.allowed) {
    res.setHeader('Retry-After', String(rl.retryAfterSec));
    sec.logSecurityEvent('ALERT', 'LOGIN_RATE_LIMIT_EXCEEDED', req, { detail: '15 dakikada 10 giriş isteği sınırı aşıldı.' });
    return res.status(429).json({
      ok: false,
      code: 'RATE_LIMITED',
      error: `Çok fazla giriş denemesi algılandı. ${Math.ceil(rl.retryAfterSec / 60)} dakika sonra tekrar deneyin.`
    });
  }

  if (!sec.checkSameOrigin(req, true)) {
    sec.logSecurityEvent('ALERT', 'LOGIN_ORIGIN_BLOCKED', req, { detail: 'Farklı kaynaktan giriş isteği engellendi.' });
    return res.status(403).json({
      ok: false,
      code: 'ORIGIN_BLOCKED',
      error: 'Güvenlik politikası: Farklı kaynaktan giriş isteği engellendi.'
    });
  }

  let body;
  try {
    body = sec.parseSafeBody(req, 4096);
  } catch (err) {
    return res.status(err.statusCode || 400).json({ ok: false, error: 'Geçersiz giriş isteği formatı.' });
  }

  // Honeypot anti-bot trap
  if (body.website && String(body.website).trim().length > 0) {
    sec.logSecurityEvent('WARN', 'HONEYPOT_TRIGGERED', req, { detail: 'Bot tuzağı alanı dolduruldu.' });
    return res.status(400).json({ ok: false, error: 'Geçersiz istek.' });
  }

  const username = String(body.username || '').trim();
  const password = String(body.password || '');

  if (!username || !password || username.length > 64 || password.length > 128) {
    return res.status(400).json({ ok: false, error: 'Geçerli kullanıcı adı ve şifre zorunludur.' });
  }

  const bf = sec.getBruteForceStatus(ip, username);
  if (bf.locked) {
    res.setHeader('Retry-After', String(bf.retryAfterSec));
    sec.logSecurityEvent('WARN', 'LOCKED_LOGIN_ATTEMPT', req, { user: username, detail: 'Kilitli hesaba giriş denemesi.' });
    return res.status(429).json({
      ok: false,
      code: 'ACCOUNT_LOCKED',
      error: `Üst üste hatalı deneme nedeniyle hesap geçici olarak kilitlendi (${Math.ceil(bf.retryAfterSec / 60)} dk).`
    });
  }

  const verified = sec.verifyCredentials(username, password);
  if (!verified.ok) {
    if (verified.reason === 'AUTH_NOT_CONFIGURED') {
      sec.logSecurityEvent('CRITICAL', 'AUTH_ENV_MISSING', req, { detail: 'NIHAT_SESSION_SECRET veya NIHAT_ADMIN_PASSWORD_HASH tanımlı değil.' });
      return res.status(503).json({
        ok: false,
        code: 'SETUP_REQUIRED',
        setupRequired: sec.isInitialLocalSetupRequired(req),
        error: sec.IS_PRODUCTION_CLOUD
          ? 'Sunucu güvenlik yapılandırması eksik: Ortam değişkenlerinde NIHAT_SESSION_SECRET ve NIHAT_ADMIN_PASSWORD_HASH (bcrypt) tanımlanmalıdır.'
          : 'İlk kurulum gerekli: Lütfen yerel yönetici hesabınızı oluşturun.'
      });
    }

    const rec = sec.recordFailedLogin(req, ip, username);
    const remaining = Math.max(0, 5 - rec.count);
    await new Promise(r => setTimeout(r, 320));
    return res.status(401).json({
      ok: false,
      code: 'INVALID_CREDENTIALS',
      error: remaining > 0
        ? `Kullanıcı adı veya şifre hatalı. (Kalan deneme hakkı: ${remaining})`
        : '5 hatalı deneme nedeniyle giriş 15 dakika boyunca kilitlendi.'
    });
  }

  sec.clearFailedLogin(ip, username);
  const { expiresAt, csrfToken } = sec.issueSessionCookies(req, res, verified.user, verified.role);
  sec.logSecurityEvent('INFO', 'LOGIN_SUCCESS', req, { user: verified.user, detail: `Rol: ${verified.role}` });

  return res.status(200).json({
    ok: true,
    authenticated: true,
    user: verified.user,
    role: verified.role,
    expiresAt,
    csrfToken
  });
};
