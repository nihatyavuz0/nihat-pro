const sec = require('../_security');

module.exports = (req, res) => {
  if (sec.handlePreflight(req, res)) return;

  // Strictly enforce admin role on every request
  const session = sec.requireAuth(req, res, {
    role: 'admin',
    bucket: 'admin-logs',
    rateLimit: { max: 30, windowMs: 60000 }
  });
  if (!session) return;

  if (req.method !== 'GET') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  const logs = sec.getRecentSecurityLogs(60);
  const alertCount = logs.filter(l => l.alert).length;

  return res.status(200).json({
    ok: true,
    alertCount,
    logs
  });
};
