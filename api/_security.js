const crypto = require('crypto');
const dns = require('dns').promises;
const fs = require('fs');
const net = require('net');
const path = require('path');
const bcrypt = require('bcryptjs');

const SESSION_TTL_SEC = 12 * 60 * 60; // 12 hours
const BCRYPT_COST = 12;
const BCRYPT_REGEX = /^\$2[aby]\$(1[2-9]|[23][0-9])\$[./A-Za-z0-9]{53}$/;
const USERNAME_REGEX = /^[a-z0-9._-]{3,32}$/;

// Ephemeral dummy bcrypt hash generated at boot (no static hash in source code) for constant-time user-miss comparisons
const DUMMY_BCRYPT_HASH = bcrypt.hashSync(crypto.randomBytes(18).toString('hex'), BCRYPT_COST);

const ROOT_DIR = path.resolve(__dirname, '..');
const IS_PRODUCTION_CLOUD = Boolean(process.env.VERCEL) || process.env.NODE_ENV === 'production';

// Load local .env once when running outside Vercel cloud
let envLoaded = false;
function loadLocalDotEnv() {
  if (envLoaded || process.env.VERCEL) return;
  envLoaded = true;
  const envPath = path.join(ROOT_DIR, '.env');
  try {
    if (!fs.existsSync(envPath)) return;
    const raw = fs.readFileSync(envPath, 'utf8');
    for (const rawLine of raw.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line || line.startsWith('#')) continue;
      const eq = line.indexOf('=');
      if (eq <= 0) continue;
      const key = line.slice(0, eq).trim();
      let val = line.slice(eq + 1).trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      if (process.env[key] === undefined && val !== '') {
        process.env[key] = val;
      }
    }
  } catch {
    // Ignore .env read errors safely
  }
}
loadLocalDotEnv();

function getDataDir() {
  if (process.env.NIHAT_DATA_DIR) return path.resolve(process.env.NIHAT_DATA_DIR);
  if (process.env.VERCEL) return null;
  const dir = path.join(ROOT_DIR, 'data');
  try {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  } catch {}
  return dir;
}

// In-memory security stores (augmented by disk persistence when dataDir is available)
const rateBuckets = new Map();
const loginAttempts = new Map();
const revokedSessionsMem = new Map();
const securityLogsMem = [];

const CSP_POLICY = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self'",
  "font-src 'self' data:",
  "img-src 'self' data: blob:",
  "connect-src 'self'",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
  ...(IS_PRODUCTION_CLOUD ? ['upgrade-insecure-requests'] : [])
].join('; ');

function redactSensitiveText(input) {
  const s = String(input == null ? '' : input);
  return s
    .replace(/(AIza[0-9A-Za-z\-_]{12,})/g, '[REDACTED_KEY]')
    .replace(/(sk-[0-9A-Za-z\-_]{12,})/g, '[REDACTED_KEY]')
    .replace(/(ya29\.[0-9A-Za-z\-_]{12,})/g, '[REDACTED_TOKEN]')
    .replace(/(EAA[0-9A-Za-z]{16,})/g, '[REDACTED_TOKEN]')
    .replace(/(\$2[aby]\$\d{2}\$[./A-Za-z0-9]{20,})/g, '[REDACTED_HASH]')
    .replace(/(Bearer\s+)[A-Za-z0-9\-._~+/]+=*/gi, '$1[REDACTED]')
    .replace(/([?&](?:key|access_token|token|secret|password)=)[^&\s]+/gi, '$1[REDACTED]')
    .slice(0, 360);
}

function readJsonFileSafe(filePath, fallback) {
  try {
    if (!filePath || !fs.existsSync(filePath)) return fallback;
    const raw = fs.readFileSync(filePath, 'utf8');
    if (!raw.trim()) return fallback;
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function writeJsonAtomic(filePath, data) {
  if (!filePath) return false;
  try {
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const tmp = `${filePath}.${process.pid}.${Date.now()}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(data, null, 2), { encoding: 'utf8', mode: 0o600 });
    fs.renameSync(tmp, filePath);
    return true;
  } catch {
    return false;
  }
}

function getLocalSecurityConfig() {
  const dataDir = getDataDir();
  if (!dataDir) return null;
  const cfgPath = path.join(dataDir, 'security-config.json');
  let cfg = readJsonFileSafe(cfgPath, null);
  let dirty = false;

  if (!cfg || typeof cfg !== 'object') {
    cfg = { users: [] };
    dirty = true;
  }
  if (!cfg.sessionSecret || String(cfg.sessionSecret).length < 64) {
    cfg.sessionSecret = crypto.randomBytes(32).toString('hex');
    dirty = true;
  }
  if (!cfg.vaultKey || String(cfg.vaultKey).length < 64) {
    cfg.vaultKey = crypto.randomBytes(32).toString('hex');
    dirty = true;
  }
  if (!Array.isArray(cfg.users)) {
    cfg.users = [];
    dirty = true;
  }
  if (dirty) {
    writeJsonAtomic(cfgPath, cfg);
  }
  return { cfg, cfgPath };
}

function getSessionSecret() {
  const envSec = String(process.env.NIHAT_SESSION_SECRET || '').trim();
  if (envSec.length >= 32) {
    return envSec;
  }
  if (!IS_PRODUCTION_CLOUD) {
    const local = getLocalSecurityConfig();
    if (local && local.cfg && local.cfg.sessionSecret) {
      return local.cfg.sessionSecret;
    }
  }
  return null; // Fail closed when unconfigured in production!
}

function getVaultKeyBuffer() {
  const envVault = String(process.env.NIHAT_VAULT_KEY || '').trim();
  if (envVault.length >= 32) {
    return crypto.createHash('sha256').update(`nihat-vault-v3|${envVault}`).digest();
  }
  const sessSec = getSessionSecret();
  if (!sessSec && !IS_PRODUCTION_CLOUD) {
    const local = getLocalSecurityConfig();
    if (local && local.cfg && local.cfg.vaultKey) {
      return crypto.createHash('sha256').update(`nihat-vault-v3|${local.cfg.vaultKey}`).digest();
    }
  }
  if (sessSec) {
    return crypto.hkdfSync
      ? Buffer.from(crypto.hkdfSync('sha256', Buffer.from(sessSec, 'utf8'), Buffer.from('nihat-pro-vault-salt', 'utf8'), Buffer.from('api-vault-aes256gcm', 'utf8'), 32))
      : crypto.createHash('sha256').update(`nihat-vault-hkdf|${sessSec}`).digest();
  }
  return null;
}

function getConfiguredUsers() {
  const usersMap = new Map();

  // Reject insecure plaintext NIHAT_ADMIN_PASSWORD if accidentally set
  if (process.env.NIHAT_ADMIN_PASSWORD) {
    logSecurityEvent('WARN', 'INSECURE_PLAINTEXT_ENV_IGNORED', null, {
      detail: 'NIHAT_ADMIN_PASSWORD açık metin ayarı güvenlik kuralı gereği reddedildi; NIHAT_ADMIN_PASSWORD_HASH (bcrypt) kullanılmalıdır.'
    });
  }

  const envAdminUser = String(process.env.NIHAT_ADMIN_USER || '').trim().toLowerCase();
  const envAdminHash = String(process.env.NIHAT_ADMIN_PASSWORD_HASH || '').trim();
  if (envAdminUser && USERNAME_REGEX.test(envAdminUser) && BCRYPT_REGEX.test(envAdminHash)) {
    usersMap.set(envAdminUser, {
      username: envAdminUser,
      role: 'admin',
      passwordHash: envAdminHash
    });
  }

  if (process.env.NIHAT_USERS_JSON) {
    try {
      const parsed = JSON.parse(process.env.NIHAT_USERS_JSON);
      if (Array.isArray(parsed)) {
        for (const item of parsed) {
          if (!item || typeof item !== 'object') continue;
          const u = String(item.username || '').trim().toLowerCase();
          const role = item.role === 'admin' ? 'admin' : 'user';
          const h = String(item.passwordHash || '').trim();
          if (USERNAME_REGEX.test(u) && BCRYPT_REGEX.test(h)) {
            usersMap.set(u, { username: u, role, passwordHash: h });
          }
        }
      }
    } catch {}
  }

  if (!IS_PRODUCTION_CLOUD) {
    const local = getLocalSecurityConfig();
    if (local && Array.isArray(local.cfg.users)) {
      for (const item of local.cfg.users) {
        if (!item || typeof item !== 'object') continue;
        const u = String(item.username || '').trim().toLowerCase();
        const role = item.role === 'admin' ? 'admin' : 'user';
        const h = String(item.passwordHash || '').trim();
        if (USERNAME_REGEX.test(u) && BCRYPT_REGEX.test(h) && !usersMap.has(u)) {
          usersMap.set(u, { username: u, role, passwordHash: h });
        }
      }
    }
  }

  return usersMap;
}

function isInitialLocalSetupRequired(req) {
  if (IS_PRODUCTION_CLOUD) return false;
  const ip = getClientIp(req);
  if (ip !== '127.0.0.1' && ip !== '::1' && ip !== '::ffff:127.0.0.1') return false;
  return getConfiguredUsers().size === 0;
}

function createLocalUser(usernameInput, passwordInput, role = 'admin') {
  if (IS_PRODUCTION_CLOUD) {
    throw new Error('Bulut ortamında kullanıcılar ortam değişkenleriyle yönetilir.');
  }
  const u = String(usernameInput || '').trim().toLowerCase();
  const p = String(passwordInput || '');
  if (!USERNAME_REGEX.test(u)) {
    throw new Error('Kullanıcı adı 3-32 karakter olmalı ve yalnızca küçük harf, rakam, nokta, tire veya alt çizgi içermelidir.');
  }
  const pwErr = validatePasswordStrength(p);
  if (pwErr) throw new Error(pwErr);

  const local = getLocalSecurityConfig();
  if (!local) throw new Error('Yerel güvenlik yapılandırmasına erişilemedi.');

  if (local.cfg.users.some(x => String(x.username || '').toLowerCase() === u)) {
    throw new Error('Bu kullanıcı adı zaten kayıtlı.');
  }
  const passwordHash = bcrypt.hashSync(p, BCRYPT_COST);
  const safeRole = role === 'admin' ? 'admin' : 'user';
  local.cfg.users.push({
    username: u,
    role: safeRole,
    passwordHash,
    createdAt: new Date().toISOString()
  });
  writeJsonAtomic(local.cfgPath, local.cfg);
  return { username: u, role: safeRole };
}

function validatePasswordStrength(password) {
  const p = String(password || '');
  if (p.length < 10 || p.length > 128) {
    return 'Şifre en az 10, en fazla 128 karakter olmalıdır.';
  }
  if (!/[a-z]/.test(p) || !/[A-Z]/.test(p) || !/[0-9]/.test(p)) {
    return 'Şifre en az bir büyük harf, bir küçük harf ve bir rakam içermelidir.';
  }
  return null;
}

function logSecurityEvent(severity, event, req, meta = {}) {
  const entry = {
    id: 'sec_' + crypto.randomBytes(6).toString('hex'),
    time: new Date().toISOString(),
    severity: severity || 'INFO',
    alert: severity === 'ALERT' || severity === 'CRITICAL',
    event: String(event || 'SECURITY_EVENT'),
    ip: req ? getClientIp(req) : (meta.ip || 'system'),
    method: req ? String(req.method || 'GET').toUpperCase() : undefined,
    path: req ? redactSensitiveText(String(req.url || '').split('?')[0]) : meta.path,
    user: meta.user ? redactSensitiveText(meta.user) : undefined,
    detail: meta.detail ? redactSensitiveText(meta.detail) : undefined
  };

  securityLogsMem.unshift(entry);
  if (securityLogsMem.length > 300) securityLogsMem.length = 300;

  const dataDir = getDataDir();
  if (dataDir) {
    try {
      const logPath = path.join(dataDir, 'security.log');
      fs.appendFileSync(logPath, JSON.stringify(entry) + '\n', { encoding: 'utf8', mode: 0o600 });
    } catch {}
  } else if (severity === 'ALERT' || severity === 'WARN' || severity === 'CRITICAL') {
    console.warn('[NIHAT-PRO-SECURITY]', JSON.stringify(entry));
  }

  // Optional async webhook alert on high-severity events
  if (entry.alert && process.env.NIHAT_SECURITY_WEBHOOK_URL) {
    dispatchSecurityAlertWebhook(entry).catch(() => {});
  }

  return entry;
}

async function dispatchSecurityAlertWebhook(entry) {
  const rawUrl = String(process.env.NIHAT_SECURITY_WEBHOOK_URL || '').trim();
  if (!rawUrl) return;
  const safeUrl = await assertSafeExternalUrl(rawUrl);
  if (!safeUrl.startsWith('https://')) return;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 4000);
  try {
    await fetch(safeUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify({ app: 'NIHAT_PRO', securityAlert: entry }),
      signal: controller.signal
    });
  } finally {
    clearTimeout(timer);
  }
}

function getRecentSecurityLogs(limit = 50) {
  const cap = Math.max(1, Math.min(200, Number(limit) || 50));
  const dataDir = getDataDir();
  if (dataDir) {
    const logPath = path.join(dataDir, 'security.log');
    try {
      if (fs.existsSync(logPath)) {
        const lines = fs.readFileSync(logPath, 'utf8').trim().split(/\r?\n/).filter(Boolean);
        return lines.slice(-cap).reverse().map(l => {
          try { return JSON.parse(l); } catch { return null; }
        }).filter(Boolean);
      }
    } catch {}
  }
  return securityLogsMem.slice(0, cap);
}

function getClientIp(req) {
  if (!req || !req.headers) return 'unknown';
  // On Vercel, trust ONLY platform-injected x-vercel-forwarded-for (cannot be spoofed by arbitrary client XFF)
  if (process.env.VERCEL) {
    const vff = req.headers['x-vercel-forwarded-for'];
    if (typeof vff === 'string' && vff.trim()) {
      return vff.split(',')[0].trim().slice(0, 64);
    }
    const realIp = req.headers['x-real-ip'];
    if (typeof realIp === 'string' && realIp.trim()) return realIp.trim().slice(0, 64);
  }
  const sockIp = (req.socket && req.socket.remoteAddress) || 'unknown';
  return sockIp === '::ffff:127.0.0.1' ? '127.0.0.1' : String(sockIp).slice(0, 64);
}

function isHttpsRequest(req) {
  if (Boolean(process.env.VERCEL)) return true;
  if (req && req.socket && req.socket.encrypted) return true;
  if (IS_PRODUCTION_CLOUD) {
    const proto = String((req && req.headers && req.headers['x-forwarded-proto']) || '').toLowerCase();
    if (proto === 'https') return true;
  }
  return false;
}

function getAllowedOrigins(req) {
  const set = new Set();
  const rawEnv = String(process.env.NIHAT_ALLOWED_ORIGINS || '').trim();
  if (rawEnv) {
    for (const part of rawEnv.split(',')) {
      const o = part.trim().replace(/\/$/, '').toLowerCase();
      if (o) set.add(o);
    }
  }
  if (req && req.headers) {
    const host = String((process.env.VERCEL && req.headers['x-forwarded-host']) || req.headers.host || '').trim().toLowerCase();
    if (host) {
      const scheme = isHttpsRequest(req) ? 'https' : 'http';
      set.add(`${scheme}://${host}`);
      if (!IS_PRODUCTION_CLOUD && (host.startsWith('127.0.0.1:') || host.startsWith('localhost:'))) {
        set.add(`http://${host}`);
      }
    }
  }
  if (set.size === 0 && IS_PRODUCTION_CLOUD) {
    set.add('https://nihat-pro.vercel.app');
  }
  return set;
}

function setSecurityHeaders(reqOrRes, maybeRes) {
  const req = maybeRes ? reqOrRes : null;
  const res = maybeRes || reqOrRes;

  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=(), usb=()');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
  res.setHeader('Content-Security-Policy', CSP_POLICY);
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Vary', 'Origin');

  if (!req || isHttpsRequest(req)) {
    res.setHeader('Strict-Transport-Security', 'max-age=63072000; includeSubDomains; preload');
  }

  if (req && req.headers && req.headers.origin) {
    const originNorm = String(req.headers.origin).trim().replace(/\/$/, '').toLowerCase();
    const allowed = getAllowedOrigins(req);
    if (allowed.has(originNorm)) {
      res.setHeader('Access-Control-Allow-Origin', req.headers.origin);
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-CSRF-Token');
      res.setHeader('Access-Control-Allow-Credentials', 'true');
      res.setHeader('Access-Control-Max-Age', '600');
    }
  }
}

function handlePreflight(req, res) {
  setSecurityHeaders(req, res);
  if (req.method !== 'OPTIONS') return false;
  const origin = req.headers && req.headers.origin;
  if (origin) {
    const originNorm = String(origin).trim().replace(/\/$/, '').toLowerCase();
    if (!getAllowedOrigins(req).has(originNorm)) {
      logSecurityEvent('WARN', 'CORS_PREFLIGHT_BLOCKED', req, { detail: `Engellenen Origin: ${originNorm}` });
      res.status(403).json({ ok: false, code: 'CORS_DENIED', error: 'Bu kaynağa CORS izni verilmiyor.' });
      return true;
    }
  }
  res.status(204).end();
  return true;
}

function parseCookies(req) {
  const out = {};
  const raw = (req && req.headers && req.headers.cookie) || '';
  if (!raw) return out;
  for (const part of raw.split(';')) {
    const idx = part.indexOf('=');
    if (idx <= 0) continue;
    const k = part.slice(0, idx).trim();
    const v = part.slice(idx + 1).trim();
    try { out[k] = decodeURIComponent(v); } catch { out[k] = v; }
  }
  return out;
}

function timingSafeEqualStr(a, b) {
  const ba = Buffer.from(String(a || ''), 'utf8');
  const bb = Buffer.from(String(b || ''), 'utf8');
  if (ba.length !== bb.length) {
    crypto.timingSafeEqual(ba, ba);
    return false;
  }
  return crypto.timingSafeEqual(ba, bb);
}

function checkSameOrigin(req, requireExplicitHeader = true) {
  const allowed = getAllowedOrigins(req);
  const origin = req.headers && req.headers.origin;
  const referer = req.headers && req.headers.referer;

  if (origin) {
    try {
      const u = new URL(origin);
      return allowed.has(`${u.protocol}//${u.host}`.toLowerCase());
    } catch {
      return false;
    }
  }
  if (referer) {
    try {
      const u = new URL(referer);
      return allowed.has(`${u.protocol}//${u.host}`.toLowerCase());
    } catch {
      return false;
    }
  }
  // Fail-closed for mutating endpoints when neither Origin nor Referer is provided
  return !requireExplicitHeader;
}

function checkRateLimit(bucketKey, maxReqs, windowMs) {
  const now = Date.now();
  let entry = rateBuckets.get(bucketKey);
  if (!entry || now - entry.windowStart >= windowMs) {
    entry = { count: 0, windowStart: now };
  }
  entry.count += 1;
  rateBuckets.set(bucketKey, entry);

  if (rateBuckets.size > 3000) {
    for (const [k, v] of rateBuckets.entries()) {
      if (now - v.windowStart >= windowMs) rateBuckets.delete(k);
    }
  }

  const remaining = Math.max(0, maxReqs - entry.count);
  const retryAfterSec = Math.max(1, Math.ceil((entry.windowStart + windowMs - now) / 1000));
  return { allowed: entry.count <= maxReqs, remaining, retryAfterSec };
}

function enforcePublicRateLimit(req, res, bucket, maxReqs = 60, windowMs = 60000) {
  setSecurityHeaders(req, res);
  const ip = getClientIp(req);
  const rl = checkRateLimit(`${bucket}|${ip}`, maxReqs, windowMs);
  res.setHeader('X-RateLimit-Remaining', String(rl.remaining));
  if (!rl.allowed) {
    res.setHeader('Retry-After', String(rl.retryAfterSec));
    logSecurityEvent('WARN', 'RATE_LIMIT_EXCEEDED', req, { detail: `Bucket: ${bucket}` });
    res.status(429).json({
      ok: false,
      code: 'RATE_LIMITED',
      error: `Çok fazla istek algılandı. Lütfen ${rl.retryAfterSec} saniye bekleyin.`
    });
    return false;
  }
  return true;
}

function loadLockoutsDisk() {
  const dataDir = getDataDir();
  if (!dataDir) return;
  const p = path.join(dataDir, 'lockouts.json');
  const data = readJsonFileSafe(p, {});
  const now = Date.now();
  for (const [k, v] of Object.entries(data)) {
    if (v && typeof v === 'object' && (!v.lockUntil || v.lockUntil > now)) {
      loginAttempts.set(k, v);
    }
  }
}
loadLockoutsDisk();

function saveLockoutsDisk() {
  const dataDir = getDataDir();
  if (!dataDir) return;
  const now = Date.now();
  const obj = {};
  for (const [k, v] of loginAttempts.entries()) {
    if (!v.lockUntil || v.lockUntil > now || now - (v.updatedAt || 0) < 15 * 60 * 1000) {
      obj[k] = v;
    }
  }
  writeJsonAtomic(path.join(dataDir, 'lockouts.json'), obj);
}

function getBruteForceStatus(ip, username) {
  const key = `${ip}|${String(username || '').toLowerCase().slice(0, 64)}`;
  const now = Date.now();
  const rec = loginAttempts.get(key);
  if (!rec) return { locked: false, attempts: 0, retryAfterSec: 0 };
  if (rec.lockUntil && now < rec.lockUntil) {
    return {
      locked: true,
      attempts: rec.count,
      retryAfterSec: Math.max(1, Math.ceil((rec.lockUntil - now) / 1000))
    };
  }
  if (rec.lockUntil && now >= rec.lockUntil) {
    loginAttempts.delete(key);
    saveLockoutsDisk();
    return { locked: false, attempts: 0, retryAfterSec: 0 };
  }
  return { locked: false, attempts: rec.count, retryAfterSec: 0 };
}

function recordFailedLogin(req, ip, username) {
  const safeUser = String(username || '').toLowerCase().slice(0, 64);
  const key = `${ip}|${safeUser}`;
  const now = Date.now();
  const rec = loginAttempts.get(key) || { count: 0, lockUntil: 0, updatedAt: now };
  rec.count += 1;
  rec.updatedAt = now;
  if (rec.count >= 5) {
    rec.lockUntil = now + 15 * 60 * 1000;
    logSecurityEvent('ALERT', 'ACCOUNT_LOCKED_BRUTE_FORCE', req, {
      user: safeUser,
      detail: `Ardışık ${rec.count} hatalı giriş denemesi nedeniyle 15 dakika kilitlendi.`
    });
  } else {
    logSecurityEvent('WARN', 'LOGIN_FAILED', req, {
      user: safeUser,
      detail: `Hatalı giriş denemesi (${rec.count}/5).`
    });
  }
  loginAttempts.set(key, rec);
  saveLockoutsDisk();
  return rec;
}

function clearFailedLogin(ip, username) {
  const key = `${ip}|${String(username || '').toLowerCase().slice(0, 64)}`;
  if (loginAttempts.delete(key)) {
    saveLockoutsDisk();
  }
}

function verifyCredentials(usernameInput, passwordInput) {
  const user = String(usernameInput || '').trim().toLowerCase();
  const pass = String(passwordInput || '');
  if (!user || !pass || user.length > 64 || pass.length > 128) {
    bcrypt.compareSync('invalid', DUMMY_BCRYPT_HASH);
    return { ok: false, reason: 'INVALID_INPUT' };
  }

  const sessionSecret = getSessionSecret();
  const users = getConfiguredUsers();
  if (!sessionSecret || users.size === 0) {
    bcrypt.compareSync(pass, DUMMY_BCRYPT_HASH);
    return { ok: false, reason: 'AUTH_NOT_CONFIGURED' };
  }

  const record = users.get(user);
  const targetHash = record ? record.passwordHash : DUMMY_BCRYPT_HASH;
  let passOk = false;
  try {
    passOk = BCRYPT_REGEX.test(targetHash) && bcrypt.compareSync(pass, targetHash);
  } catch {
    passOk = false;
  }

  if (record && passOk) {
    return { ok: true, user: record.username, role: record.role || 'user' };
  }
  return { ok: false, reason: 'INVALID_CREDENTIALS' };
}

function uaFingerprint(req) {
  const ua = String((req && req.headers && req.headers['user-agent']) || '').slice(0, 180);
  return crypto.createHash('sha256').update(ua).digest('hex').slice(0, 16);
}

function loadRevokedSessions() {
  const dataDir = getDataDir();
  if (!dataDir) return;
  const data = readJsonFileSafe(path.join(dataDir, 'revoked-sessions.json'), {});
  const now = Date.now();
  for (const [jti, exp] of Object.entries(data)) {
    if (Number(exp) > now) revokedSessionsMem.set(jti, Number(exp));
  }
}
loadRevokedSessions();

function revokeSession(jti, expMs) {
  if (!jti) return;
  const now = Date.now();
  const expiry = Number(expMs) > now ? Number(expMs) : now + SESSION_TTL_SEC * 1000;
  revokedSessionsMem.set(String(jti), expiry);

  for (const [k, v] of revokedSessionsMem.entries()) {
    if (v <= now) revokedSessionsMem.delete(k);
  }

  const dataDir = getDataDir();
  if (dataDir) {
    const obj = {};
    for (const [k, v] of revokedSessionsMem.entries()) obj[k] = v;
    writeJsonAtomic(path.join(dataDir, 'revoked-sessions.json'), obj);
  }
}

function isSessionRevoked(jti) {
  if (!jti) return true;
  const exp = revokedSessionsMem.get(String(jti));
  if (!exp) return false;
  if (Date.now() > exp) {
    revokedSessionsMem.delete(String(jti));
    return false;
  }
  return true;
}

function signSession(payloadObj) {
  const secret = getSessionSecret();
  if (!secret) throw new Error('Oturum sırrı yapılandırılmadı.');
  const payloadB64 = Buffer.from(JSON.stringify(payloadObj), 'utf8').toString('base64url');
  const sig = crypto
    .createHmac('sha256', secret)
    .update(payloadB64)
    .digest('base64url');
  return `${payloadB64}.${sig}`;
}

function getSessionCookieName(req) {
  return isHttpsRequest(req) ? '__Host-nihat_session' : 'nihat_session';
}

function verifySession(req) {
  const secret = getSessionSecret();
  if (!secret) return { ok: false };

  const cookies = parseCookies(req);
  const raw = cookies['__Host-nihat_session'] || (!isHttpsRequest(req) ? cookies.nihat_session : '');
  if (!raw || !raw.includes('.')) return { ok: false };

  const dotIdx = raw.indexOf('.');
  const payloadB64 = raw.slice(0, dotIdx);
  const sig = raw.slice(dotIdx + 1);
  if (!payloadB64 || !sig) return { ok: false };

  const expectedSig = crypto
    .createHmac('sha256', secret)
    .update(payloadB64)
    .digest('base64url');

  if (!timingSafeEqualStr(sig, expectedSig)) return { ok: false };

  try {
    const payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8'));
    if (!payload || !payload.u || !payload.exp || !payload.jti || !payload.csrf) return { ok: false };
    const now = Date.now();
    if (now > Number(payload.exp)) return { ok: false };
    if (payload.iat && Number(payload.iat) > now + 60000) return { ok: false };
    if (isSessionRevoked(payload.jti)) return { ok: false };
    if (payload.fp && payload.fp !== uaFingerprint(req)) return { ok: false };

    // Server-authoritative user & RBAC role check on every single request
    const users = getConfiguredUsers();
    const activeUser = users.get(String(payload.u).toLowerCase());
    if (!activeUser) return { ok: false };

    return {
      ok: true,
      user: activeUser.username,
      role: activeUser.role || 'user',
      jti: String(payload.jti),
      expMs: Number(payload.exp),
      expiresAt: new Date(Number(payload.exp)).toISOString(),
      csrfToken: String(payload.csrf)
    };
  } catch {
    return { ok: false };
  }
}

function issueSessionCookies(req, res, username, role = 'user') {
  const now = Date.now();
  const exp = now + SESSION_TTL_SEC * 1000;
  const jti = crypto.randomBytes(16).toString('hex');
  const csrfToken = crypto.randomBytes(24).toString('hex');
  const sessionToken = signSession({
    u: username,
    r: role,
    iat: now,
    exp,
    jti,
    csrf: csrfToken,
    fp: uaFingerprint(req)
  });

  const https = isHttpsRequest(req);
  const cookieName = https ? '__Host-nihat_session' : 'nihat_session';
  const secureFlag = https ? '; Secure' : '';

  res.setHeader('Set-Cookie', [
    `${cookieName}=${encodeURIComponent(sessionToken)}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${SESSION_TTL_SEC}${secureFlag}`
  ]);

  return { expiresAt: new Date(exp).toISOString(), csrfToken, jti };
}

function clearSessionCookies(req, res) {
  const https = isHttpsRequest(req);
  const secureFlag = https ? '; Secure' : '';
  const cookies = [
    `nihat_session=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0${secureFlag}`,
    `nihat_csrf=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0${secureFlag}`
  ];
  if (https) {
    cookies.unshift(`__Host-nihat_session=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0; Secure`);
  }
  res.setHeader('Set-Cookie', cookies);
}

function stripDangerousKeys(obj, depth = 0) {
  if (depth > 12 || obj === null || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.slice(0, 250).map(item => stripDangerousKeys(item, depth + 1));
  const clean = {};
  for (const key of Object.keys(obj)) {
    if (key === '__proto__' || key === 'constructor' || key === 'prototype') continue;
    clean[key] = stripDangerousKeys(obj[key], depth + 1);
  }
  return clean;
}

function parseSafeBody(req, maxBytes = 65536) {
  const ct = String((req.headers && req.headers['content-type']) || '').toLowerCase();
  if (req.body !== undefined && req.body !== null && req.body !== '' && ct && !ct.includes('application/json')) {
    const err = new Error('Yalnızca application/json içerik türü kabul edilir.');
    err.statusCode = 415;
    throw err;
  }

  if (req.body === undefined || req.body === null || req.body === '') return {};
  if (typeof req.body === 'string') {
    if (Buffer.byteLength(req.body, 'utf8') > maxBytes) {
      const err = new Error('İstek boyutu güvenlik sınırını aşıyor.');
      err.statusCode = 413;
      throw err;
    }
    let parsed;
    try {
      parsed = JSON.parse(req.body);
    } catch {
      const err = new Error('Geçersiz JSON formatı.');
      err.statusCode = 400;
      throw err;
    }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      const err = new Error('JSON kök nesnesi geçersiz.');
      err.statusCode = 400;
      throw err;
    }
    return stripDangerousKeys(parsed);
  }
  if (typeof req.body === 'object' && !Array.isArray(req.body)) {
    const serialized = JSON.stringify(req.body);
    if (Buffer.byteLength(serialized, 'utf8') > maxBytes) {
      const err = new Error('İstek boyutu güvenlik sınırını aşıyor.');
      err.statusCode = 413;
      throw err;
    }
    return stripDangerousKeys(req.body);
  }
  const err = new Error('Geçersiz istek gövdesi.');
  err.statusCode = 400;
  throw err;
}

function requireAuth(req, res, options = {}) {
  setSecurityHeaders(req, res);
  const ip = getClientIp(req);
  const maxReqs = (options.rateLimit && options.rateLimit.max) || 45;
  const windowMs = (options.rateLimit && options.rateLimit.windowMs) || 60000;
  const rl = checkRateLimit(`${options.bucket || 'api'}|${ip}`, maxReqs, windowMs);

  res.setHeader('X-RateLimit-Remaining', String(rl.remaining));
  if (!rl.allowed) {
    res.setHeader('Retry-After', String(rl.retryAfterSec));
    logSecurityEvent('WARN', 'RATE_LIMIT_EXCEEDED', req, { detail: `Bucket: ${options.bucket || 'api'}` });
    res.status(429).json({
      ok: false,
      code: 'RATE_LIMITED',
      error: `Çok fazla istek algılandı. Güvenlik kalkanı nedeniyle ${rl.retryAfterSec} saniye bekleyin.`
    });
    return null;
  }

  const isMutating = !['GET', 'HEAD', 'OPTIONS'].includes(String(req.method || 'GET').toUpperCase());
  if (isMutating && !checkSameOrigin(req, true)) {
    logSecurityEvent('ALERT', 'ORIGIN_BLOCKED', req, { detail: 'Farklı veya eksik Origin/Referer başlığı engellendi.' });
    res.status(403).json({
      ok: false,
      code: 'ORIGIN_BLOCKED',
      error: 'Güvenlik politikası: Kaynak doğrulaması (Same-Origin) başarısız.'
    });
    return null;
  }

  const session = verifySession(req);
  if (!session.ok) {
    logSecurityEvent('WARN', 'UNAUTHENTICATED_API_ACCESS', req, { detail: 'Geçersiz veya süresi dolmuş oturum.' });
    res.status(401).json({
      ok: false,
      code: 'AUTH_REQUIRED',
      error: 'Oturum süresi doldu veya giriş yapılmadı. Lütfen tekrar giriş yapın.'
    });
    return null;
  }

  if (isMutating && options.csrf !== false) {
    const headerCsrf = String(req.headers['x-csrf-token'] || '');
    if (!session.csrfToken || !headerCsrf || !timingSafeEqualStr(headerCsrf, session.csrfToken)) {
      logSecurityEvent('ALERT', 'CSRF_INVALID', req, { user: session.user, detail: 'Geçersiz veya eksik X-CSRF-Token.' });
      res.status(403).json({
        ok: false,
        code: 'CSRF_INVALID',
        error: 'Güvenlik doğrulaması (CSRF) başarısız. Sayfayı yenileyip tekrar deneyin.'
      });
      return null;
    }
  }

  if (options.role && session.role !== options.role) {
    logSecurityEvent('ALERT', 'AUTHZ_ROLE_DENIED', req, {
      user: session.user,
      detail: `Gerekli rol: ${options.role}, mevcut rol: ${session.role}`
    });
    res.status(403).json({
      ok: false,
      code: 'FORBIDDEN',
      error: 'Bu işlem için yönetici yetkisi gereklidir.'
    });
    return null;
  }

  return session;
}

// ==========================================================
// ENCRYPTED SERVER-SIDE API CREDENTIAL VAULT (AES-256-GCM)
// ==========================================================
const VAULT_PLATFORMS = {
  google_ads: {
    secretFields: ['developerToken', 'accessToken'],
    publicFields: ['customerId', 'managerId'],
    envMap: {
      customerId: 'GOOGLE_ADS_CUSTOMER_ID',
      managerId: 'GOOGLE_ADS_MANAGER_ID',
      developerToken: 'GOOGLE_ADS_DEV_TOKEN',
      accessToken: 'GOOGLE_ADS_ACCESS_TOKEN'
    }
  },
  google_merchant: {
    secretFields: ['accessToken'],
    publicFields: ['merchantId', 'feedUrl'],
    envMap: {
      merchantId: 'GOOGLE_MERCHANT_ID',
      accessToken: 'GOOGLE_MERCHANT_ACCESS_TOKEN',
      feedUrl: 'GOOGLE_MERCHANT_FEED_URL'
    }
  },
  meta_ads: {
    secretFields: ['accessToken'],
    publicFields: ['adAccountId', 'pixelId', 'pageId'],
    envMap: {
      adAccountId: 'META_ADS_ACCOUNT_ID',
      accessToken: 'META_ADS_ACCESS_TOKEN',
      pixelId: 'META_ADS_PIXEL_ID',
      pageId: 'META_ADS_PAGE_ID'
    }
  },
  gemini: {
    secretFields: ['apiKey'],
    publicFields: ['model'],
    envMap: {
      apiKey: 'GEMINI_API_KEY',
      model: 'GEMINI_MODEL'
    }
  },
  openai: {
    secretFields: ['apiKey'],
    publicFields: ['model'],
    envMap: {
      apiKey: 'OPENAI_API_KEY',
      model: 'OPENAI_MODEL'
    }
  },
  pagespeed: {
    secretFields: ['apiKey'],
    publicFields: [],
    envMap: {
      apiKey: 'PAGESPEED_API_KEY'
    }
  }
};

function encryptAesGcm(plainText, aadStr) {
  const key = getVaultKeyBuffer();
  if (!key) throw new Error('Sunucu şifreleme anahtarı yapılandırılmadı.');
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  if (aadStr) cipher.setAAD(Buffer.from(String(aadStr), 'utf8'));
  const enc = Buffer.concat([cipher.update(String(plainText), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('base64url')}.${tag.toString('base64url')}.${enc.toString('base64url')}`;
}

function decryptAesGcm(sealedStr, aadStr) {
  const key = getVaultKeyBuffer();
  if (!key || !sealedStr || typeof sealedStr !== 'string') return null;
  const parts = sealedStr.split('.');
  if (parts.length !== 3) return null;
  try {
    const iv = Buffer.from(parts[0], 'base64url');
    const tag = Buffer.from(parts[1], 'base64url');
    const enc = Buffer.from(parts[2], 'base64url');
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    if (aadStr) decipher.setAAD(Buffer.from(String(aadStr), 'utf8'));
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(enc), decipher.final()]).toString('utf8');
  } catch {
    return null;
  }
}

function readServerVaultRaw() {
  const dataDir = getDataDir();
  if (!dataDir) return {};
  const vaultPath = path.join(dataDir, 'api-vault.json');
  const raw = readJsonFileSafe(vaultPath, null);
  if (!raw || !raw.ciphertext) return {};
  const dec = decryptAesGcm(raw.ciphertext, 'nihat-pro-api-vault-v3');
  if (!dec) return {};
  try { return JSON.parse(dec) || {}; } catch { return {}; }
}

function writeServerVaultRaw(vaultObj) {
  const dataDir = getDataDir();
  if (!dataDir) return false;
  const ciphertext = encryptAesGcm(JSON.stringify(vaultObj || {}), 'nihat-pro-api-vault-v3');
  return writeJsonAtomic(path.join(dataDir, 'api-vault.json'), {
    version: 3,
    updatedAt: new Date().toISOString(),
    ciphertext
  });
}

function getServerPlatformCredentials(platform) {
  const spec = VAULT_PLATFORMS[platform];
  if (!spec) return {};
  const vault = readServerVaultRaw();
  const saved = (vault && vault[platform]) || {};
  const out = {};

  for (const field of [...spec.publicFields, ...spec.secretFields]) {
    const envName = spec.envMap[field];
    const envVal = envName ? String(process.env[envName] || '').trim() : '';
    out[field] = envVal || String(saved[field] || '').trim();
  }
  return out;
}

function saveServerPlatformCredentials(platform, incomingCfg) {
  const spec = VAULT_PLATFORMS[platform];
  if (!spec) throw new Error('Geçersiz platform.');
  if (IS_PRODUCTION_CLOUD) {
    return { persistedOnDisk: false, cloudEnvRequired: true };
  }
  const vault = readServerVaultRaw();
  const prev = vault[platform] || {};
  const next = Object.assign({}, prev);

  for (const field of spec.publicFields) {
    if (incomingCfg[field] !== undefined) {
      next[field] = String(incomingCfg[field] || '').trim().slice(0, 256);
    }
  }
  for (const field of spec.secretFields) {
    const val = String(incomingCfg[field] || '').trim();
    if (val && !val.startsWith('••••')) {
      next[field] = val.slice(0, 512);
    } else if (incomingCfg[field] === '__CLEAR__') {
      next[field] = '';
    }
  }

  vault[platform] = next;
  writeServerVaultRaw(vault);
  return { persistedOnDisk: true, cloudEnvRequired: false };
}

function getVaultPublicSummary() {
  const summary = {};
  for (const [platform, spec] of Object.entries(VAULT_PLATFORMS)) {
    const creds = getServerPlatformCredentials(platform);
    const hasAllSecrets = spec.secretFields.every(f => Boolean(creds[f]));
    const publicConfig = {};
    for (const f of spec.publicFields) {
      publicConfig[f] = creds[f] || '';
    }
    const secretStatus = {};
    for (const f of spec.secretFields) {
      secretStatus[f] = Boolean(creds[f]); // Only boolean indicator — never leak characters of keys
    }
    summary[platform] = {
      configured: hasAllSecrets,
      publicConfig,
      secretStatus
    };
  }
  return summary;
}

// ==========================================================
// PER-USER OWNERSHIP ISOLATED STATE STORAGE & SCHEMA VALIDATOR
// ==========================================================
function clampStr(val, maxLen = 500) {
  return String(val == null ? '' : val).trim().slice(0, maxLen);
}

function clampNum(val, min, max, def) {
  const n = Number(val);
  if (!Number.isFinite(n)) return def;
  return Math.max(min, Math.min(max, n));
}

function scrubApiSecretsFromState(apisObj) {
  const safeApis = {};
  for (const [k, spec] of Object.entries(VAULT_PLATFORMS)) {
    const src = (apisObj && typeof apisObj === 'object' && apisObj[k]) || {};
    const srcCfg = (src && typeof src.config === 'object' && src.config) || {};
    const cleanCfg = {};
    for (const pubField of spec.publicFields) {
      cleanCfg[pubField] = clampStr(srcCfg[pubField] || '', 256);
    }
    // Explicitly NEVER store secretFields (apiKey, accessToken, developerToken) in state!
    safeApis[k] = {
      connected: Boolean(src.connected),
      statusText: clampStr(src.statusText || 'Bağlı Değil', 120),
      lastTested: src.lastTested ? clampStr(src.lastTested, 40) : null,
      config: cleanCfg
    };
  }
  return safeApis;
}

function validateAndNormalizeState(incoming, expectedOwner) {
  if (!incoming || typeof incoming !== 'object' || Array.isArray(incoming)) {
    const err = new Error('Durum verisi geçerli bir nesne olmalıdır.');
    err.statusCode = 400;
    throw err;
  }

  if (incoming.owner && String(incoming.owner).toLowerCase() !== String(expectedOwner).toLowerCase()) {
    const err = new Error('Başka bir kullanıcıya ait veri kaydına erişim veya yazma engellendi.');
    err.statusCode = 403;
    err.code = 'OWNERSHIP_DENIED';
    throw err;
  }

  if (!incoming.brand || typeof incoming.brand !== 'object' || Array.isArray(incoming.brand)) {
    const err = new Error('Geçersiz veya eksik marka (brand) şeması reddedildi.');
    err.statusCode = 400;
    throw err;
  }

  const clean = {
    owner: String(expectedOwner).toLowerCase(),
    revision: Math.max(0, Math.floor(clampNum(incoming.revision, 0, 1000000000, 1))),
    lastSavedAt: new Date().toISOString(),
    lastRoute: clampStr(incoming.lastRoute || 'dashboard', 32),
    themeVersion: 2,
    theme: incoming.theme === 'light' ? 'light' : 'navy-slate',
    brand: {
      name: clampStr(incoming.brand.name || 'Markanız', 160),
      domain: clampStr(incoming.brand.domain || '', 256),
      sector: clampStr(incoming.brand.sector || '', 160),
      tone: clampStr(incoming.brand.tone || '', 160)
    },
    dailySummary: incoming.dailySummary && typeof incoming.dailySummary === 'object' ? {
      dateLabel: clampStr(incoming.dailySummary.dateLabel, 80),
      lastUpdated: clampStr(incoming.dailySummary.lastUpdated, 40),
      headline: clampStr(incoming.dailySummary.headline, 400),
      simpleText: clampStr(incoming.dailySummary.simpleText, 1200),
      highlights: Array.isArray(incoming.dailySummary.highlights)
        ? incoming.dailySummary.highlights.slice(0, 6).map(h => ({
            label: clampStr(h && h.label, 80),
            text: clampStr(h && h.text, 400)
          }))
        : []
    } : undefined,
    metrics: incoming.metrics && typeof incoming.metrics === 'object' ? {
      seoScore: Math.round(clampNum(incoming.metrics.seoScore, 0, 100, 80)),
      geoScore: Math.round(clampNum(incoming.metrics.geoScore, 0, 100, 75)),
      adsHealth: Math.round(clampNum(incoming.metrics.adsHealth, 0, 100, 85)),
      roas: Number(clampNum(incoming.metrics.roas, 0, 1000, 4.0).toFixed(2)),
      monthlyClicks: Math.round(clampNum(incoming.metrics.monthlyClicks, 0, 100000000, 0)),
      aiCitations: Math.round(clampNum(incoming.metrics.aiCitations, 0, 1000000, 0))
    } : undefined,
    campaigns: incoming.campaigns && typeof incoming.campaigns === 'object' ? {
      googleAds: Array.isArray(incoming.campaigns.googleAds) ? incoming.campaigns.googleAds.slice(0, 100).map(ad => ({
        id: clampStr(ad && ad.id, 48),
        name: clampStr(ad && ad.name, 160),
        status: clampStr(ad && ad.status, 32),
        headline: clampStr(ad && ad.headline, 180),
        description: clampStr(ad && ad.description, 320),
        ctr: clampStr(ad && ad.ctr, 24),
        cpc: clampStr(ad && ad.cpc, 24),
        qualityScore: Math.round(clampNum(ad && ad.qualityScore, 1, 10, 7)),
        issueFlag: ad && ad.issueFlag ? clampStr(ad.issueFlag, 240) : null
      })) : [],
      merchant: Array.isArray(incoming.campaigns.merchant) ? incoming.campaigns.merchant.slice(0, 100).map(p => ({
        id: clampStr(p && p.id, 48),
        sku: clampStr(p && p.sku, 64),
        title: clampStr(p && p.title, 240),
        gtin: clampStr(p && p.gtin, 32),
        price: clampStr(p && p.price, 32),
        status: clampStr(p && p.status, 32),
        issueFlag: p && p.issueFlag ? clampStr(p.issueFlag, 240) : null
      })) : [],
      metaAds: Array.isArray(incoming.campaigns.metaAds) ? incoming.campaigns.metaAds.slice(0, 100).map(m => ({
        id: clampStr(m && m.id, 48),
        name: clampStr(m && m.name, 160),
        status: clampStr(m && m.status, 32),
        hook: clampStr(m && m.hook, 320),
        headline: clampStr(m && m.headline, 160),
        ctr: clampStr(m && m.ctr, 24),
        roas: clampStr(m && m.roas, 24),
        issueFlag: m && m.issueFlag ? clampStr(m.issueFlag, 240) : null
      })) : []
    } : undefined,
    approvals: Array.isArray(incoming.approvals) ? incoming.approvals.slice(0, 150) : [],
    resolvedApprovals: Array.isArray(incoming.resolvedApprovals) ? incoming.resolvedApprovals.slice(0, 150) : [],
    siteAudits: Array.isArray(incoming.siteAudits) ? incoming.siteAudits.slice(0, 60) : [],
    competitors: Array.isArray(incoming.competitors) ? incoming.competitors.slice(0, 60) : [],
    personas: Array.isArray(incoming.personas) ? incoming.personas.slice(0, 60) : [],
    contents: Array.isArray(incoming.contents) ? incoming.contents.slice(0, 80) : [],
    apis: scrubApiSecretsFromState(incoming.apis),
    auditLog: Array.isArray(incoming.auditLog) ? incoming.auditLog.slice(0, 200) : []
  };

  return stripDangerousKeys(clean);
}

function getUserStatePaths(username) {
  const dataDir = getDataDir();
  if (!dataDir) return null;
  const safeSlug = String(username || '').toLowerCase().replace(/[^a-z0-9._-]/g, '_');
  const userHash = crypto.createHash('sha256').update(String(username || '').toLowerCase()).digest('hex').slice(0, 16);
  const statesDir = path.join(dataDir, 'states');
  const backupsDir = path.join(dataDir, 'backups', `${safeSlug}_${userHash}`);
  return {
    stateFile: path.join(statesDir, `${safeSlug}_${userHash}.json`),
    backupFile: path.join(statesDir, `${safeSlug}_${userHash}.backup.json`),
    backupsDir
  };
}

function readUserState(username, sealedHeaderEnvelope) {
  const owner = String(username || '').toLowerCase();
  const paths = getUserStatePaths(owner);
  if (paths) {
    let data = readJsonFileSafe(paths.stateFile, null);
    if (!data || !data.brand) {
      data = readJsonFileSafe(paths.backupFile, null);
    }
    if (data && data.brand) {
      if (data.owner && String(data.owner).toLowerCase() !== owner) {
        const err = new Error('Veri sahipliği doğrulaması başarısız.');
        err.statusCode = 403;
        throw err;
      }
      data.owner = owner;
      return data;
    }
    return null;
  }

  // Stateless cloud fallback: verify AES-256-GCM AAD bound strictly to this owner
  if (sealedHeaderEnvelope) {
    const dec = decryptAesGcm(sealedHeaderEnvelope, `state-owner:${owner}`);
    if (!dec) {
      const err = new Error('Şifreli durum zarfı doğrulanamadı veya farklı bir kullanıcıya ait.');
      err.statusCode = 403;
      throw err;
    }
    const parsed = JSON.parse(dec);
    if (parsed && parsed.owner === owner) return parsed;
  }
  return null;
}

function writeUserState(username, validatedState) {
  const owner = String(username || '').toLowerCase();
  validatedState.owner = owner;

  const paths = getUserStatePaths(owner);
  if (paths) {
    const existing = readJsonFileSafe(paths.stateFile, null);
    if (existing && existing.owner && existing.owner !== owner) {
      const err = new Error('Sahiplik uyuşmazlığı engellendi.');
      err.statusCode = 403;
      throw err;
    }
    if (existing && Number(existing.revision) > 0 && Number(validatedState.revision) > 0 && Number(validatedState.revision) < Number(existing.revision)) {
      return { skippedStale: true, serverRevision: Number(existing.revision), sealedEnvelope: null };
    }
    if (fs.existsSync(paths.stateFile)) {
      try { fs.copyFileSync(paths.stateFile, paths.backupFile); } catch {}
    }
    writeJsonAtomic(paths.stateFile, validatedState);
    try {
      const day = new Date().toISOString().slice(0, 10);
      writeJsonAtomic(path.join(paths.backupsDir, `state_${day}.json`), validatedState);
    } catch {}
    return { skippedStale: false, serverRevision: validatedState.revision, sealedEnvelope: null };
  }

  const sealedEnvelope = encryptAesGcm(JSON.stringify(validatedState), `state-owner:${owner}`);
  return { skippedStale: false, serverRevision: validatedState.revision, sealedEnvelope };
}

// ==========================================================
// SSRF FIREWALL — Blocks loopback, private, metadata & non-HTTP
// ==========================================================
function isPrivateOrReservedIp(ip) {
  if (!ip) return true;
  let clean = String(ip).trim().toLowerCase();
  if (clean.startsWith('::ffff:')) clean = clean.slice(7);

  if (net.isIPv4(clean)) {
    const parts = clean.split('.').map(n => parseInt(n, 10));
    const [a, b] = parts;
    if (a === 0) return true;
    if (a === 10) return true;
    if (a === 100 && b >= 64 && b <= 127) return true;
    if (a === 127) return true;
    if (a === 169 && b === 254) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 198 && (b === 18 || b === 19)) return true;
    if (a >= 224) return true;
    return false;
  }

  if (net.isIPv6(clean)) {
    if (clean === '::1' || clean === '::') return true;
    if (clean.startsWith('fc') || clean.startsWith('fd')) return true;
    if (clean.startsWith('fe8') || clean.startsWith('fe9') || clean.startsWith('fea') || clean.startsWith('feb')) return true;
    if (clean.startsWith('ff')) return true;
    return false;
  }

  return true;
}

function exposedError(msg) {
  const e = new Error(msg);
  e.expose = true;
  e.statusCode = 400;
  return e;
}

async function assertSafeExternalUrl(rawUrl, reqForLog = null) {
  let url = String(rawUrl || '').trim();
  if (!url || url.length > 2048 || /[\r\n\0]/.test(url)) {
    throw exposedError('Geçersiz web sitesi adresi.');
  }
  if (!/^https?:\/\//i.test(url)) url = 'https://' + url;

  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    throw exposedError('Geçersiz URL formatı. Örnek: https://ornek.com');
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw exposedError('Yalnızca HTTP ve HTTPS web adresleri analiz edilebilir.');
  }
  if (parsed.username || parsed.password) {
    throw exposedError('Kimlik bilgisi içeren URL adresleri güvenlik nedeniyle engellendi.');
  }
  if (parsed.port && parsed.port !== '80' && parsed.port !== '443') {
    if (reqForLog) logSecurityEvent('ALERT', 'SSRF_PORT_BLOCKED', reqForLog, { detail: `Engellenen port: ${parsed.port}` });
    throw exposedError('Standart dışı portlara (80/443 hariç) erişim güvenlik kalkanı tarafından engellendi.');
  }

  const host = parsed.hostname.toLowerCase();
  if (
    host === 'localhost' ||
    host.endsWith('.localhost') ||
    host.endsWith('.local') ||
    host.endsWith('.internal') ||
    host === 'metadata.google.internal'
  ) {
    if (reqForLog) logSecurityEvent('ALERT', 'SSRF_HOST_BLOCKED', reqForLog, { detail: `Engellenen iç host: ${host}` });
    throw exposedError('İç ağ ve yerel sunucu adresleri güvenlik duvarı (SSRF) tarafından engellendi.');
  }

  if (net.isIP(host)) {
    if (isPrivateOrReservedIp(host)) {
      if (reqForLog) logSecurityEvent('ALERT', 'SSRF_IP_BLOCKED', reqForLog, { detail: `Engellenen özel IP: ${host}` });
      throw exposedError('Özel veya dahili IP adreslerine erişim güvenlik duvarı (SSRF) tarafından engellendi.');
    }
    return parsed.href;
  }

  let resolved;
  try {
    resolved = await dns.lookup(host, { all: true });
  } catch {
    throw exposedError('Alan adı çözümlenemedi. Site adresini kontrol edin.');
  }

  if (!resolved || resolved.length === 0) {
    throw exposedError('Alan adı çözümlenemedi.');
  }

  for (const addr of resolved) {
    if (isPrivateOrReservedIp(addr.address)) {
      if (reqForLog) logSecurityEvent('ALERT', 'SSRF_DNS_REBIND_BLOCKED', reqForLog, { detail: `Alan adı özel IP döndürdü: ${host}` });
      throw exposedError('Hedef alan adı özel/dahili bir IP adresine işaret ettiği için güvenlik duvarı tarafından engellendi.');
    }
  }

  return parsed.href;
}

module.exports = {
  IS_PRODUCTION_CLOUD,
  CSP_POLICY,
  VAULT_PLATFORMS,
  redactSensitiveText,
  setSecurityHeaders,
  handlePreflight,
  getClientIp,
  checkSameOrigin,
  checkRateLimit,
  enforcePublicRateLimit,
  getBruteForceStatus,
  recordFailedLogin,
  clearFailedLogin,
  verifyCredentials,
  isInitialLocalSetupRequired,
  createLocalUser,
  validatePasswordStrength,
  verifySession,
  issueSessionCookies,
  clearSessionCookies,
  revokeSession,
  parseSafeBody,
  requireAuth,
  logSecurityEvent,
  getRecentSecurityLogs,
  getServerPlatformCredentials,
  saveServerPlatformCredentials,
  getVaultPublicSummary,
  validateAndNormalizeState,
  readUserState,
  writeUserState,
  assertSafeExternalUrl
};
