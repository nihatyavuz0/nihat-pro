const sec = require('./_security');

module.exports = (req, res) => {
  if (sec.handlePreflight(req, res)) return;

  const session = sec.requireAuth(req, res, { bucket: 'state', rateLimit: { max: 60, windowMs: 60000 } });
  if (!session) return;

  // Block any attempt to query another user's records via query parameter
  const reqUrl = String(req.url || '');
  const qIdx = reqUrl.indexOf('?');
  if (qIdx >= 0) {
    const params = new URLSearchParams(reqUrl.slice(qIdx + 1));
    const requestedOwner = params.get('owner') || params.get('user');
    if (requestedOwner && requestedOwner.trim().toLowerCase() !== session.user) {
      sec.logSecurityEvent('ALERT', 'OWNERSHIP_QUERY_VIOLATION', req, {
        user: session.user,
        detail: `Başka kullanıcının kaydına erişim denemesi engellendi: ${requestedOwner}`
      });
      return res.status(403).json({
        ok: false,
        code: 'OWNERSHIP_DENIED',
        error: 'Yalnızca kendi hesabınıza ait kayıtlara erişebilirsiniz.'
      });
    }
  }

  if (req.method === 'GET') {
    try {
      const sealedHeader = String(req.headers['x-state-envelope'] || '');
      const loaded = sec.readUserState(session.user, sealedHeader);
      if (loaded) {
        return res.status(200).json(loaded);
      }
      return res.status(200).json({
        ok: true,
        empty: true,
        owner: session.user
      });
    } catch (err) {
      if (err && err.statusCode === 403) {
        sec.logSecurityEvent('ALERT', 'OWNERSHIP_ENVELOPE_VIOLATION', req, { user: session.user, detail: err.message });
        return res.status(403).json({ ok: false, code: 'OWNERSHIP_DENIED', error: 'Kayıt sahipliği doğrulanamadı.' });
      }
      return res.status(500).json({ ok: false, error: 'Durum verisi okunamadı.' });
    }
  }

  if (req.method === 'POST') {
    try {
      const incoming = sec.parseSafeBody(req, 262144); // Strict 256 KB limit
      const cleanState = sec.validateAndNormalizeState(incoming, session.user);
      const saved = sec.writeUserState(session.user, cleanState);
      return res.status(200).json({
        ok: true,
        owner: session.user,
        savedAt: cleanState.lastSavedAt,
        skippedStale: saved.skippedStale,
        serverRevision: saved.serverRevision,
        sealedEnvelope: saved.sealedEnvelope || undefined
      });
    } catch (err) {
      if (err && err.statusCode === 403) {
        sec.logSecurityEvent('ALERT', 'OWNERSHIP_WRITE_VIOLATION', req, { user: session.user, detail: err.message });
        return res.status(403).json({ ok: false, code: 'OWNERSHIP_DENIED', error: 'Başka bir kullanıcıya ait kaydı değiştiremezsiniz.' });
      }
      const code = (err && err.statusCode) || 400;
      return res.status(code).json({
        ok: false,
        error: code < 500 && err && err.message ? err.message : 'Durum verisi doğrulanamadı.'
      });
    }
  }

  return res.status(405).json({ ok: false, error: 'Method not allowed' });
};
