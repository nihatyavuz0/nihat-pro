const fs = require('fs');
const http = require('http');
const path = require('path');
const sec = require('./api/_security');

const PORT = Math.max(1024, Math.min(65535, parseInt(process.env.NIHAT_PORT || process.argv[2] || '8787', 10) || 8787));
const BIND_HOST = '127.0.0.1';
const ROOT_DIR = __dirname;
const PUBLIC_DIR = path.resolve(ROOT_DIR, 'public');

const API_ROUTES = {
  '/api/health': require('./api/health'),
  '/api/version': require('./api/version'),
  '/api/state': require('./api/state'),
  '/api/vault': require('./api/vault'),
  '/api/analyze': require('./api/analyze'),
  '/api/test-connection': require('./api/test-connection'),
  '/api/ai/generate': require('./api/ai/generate'),
  '/api/auth/login': require('./api/auth/login'),
  '/api/auth/logout': require('./api/auth/logout'),
  '/api/auth/session': require('./api/auth/session'),
  '/api/auth/setup': require('./api/auth/setup'),
  '/api/admin/security-logs': require('./api/admin/security-logs')
};

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon'
};

function computeBuildVersion() {
  let maxMtime = 0;
  function walk(dir) {
    try {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(full);
        else {
          const m = fs.statSync(full).mtimeMs;
          if (m > maxMtime) maxMtime = m;
        }
      }
    } catch {}
  }
  walk(PUBLIC_DIR);
  return String(Math.floor(maxMtime || Date.now()));
}

function applyStaticSecurityHeaders(req, res, contentType) {
  res.setHeader('Content-Type', contentType);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=(), usb=()');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
  res.setHeader('Content-Security-Policy', sec.CSP_POLICY);
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Vary', 'Origin');
}

function wrapRes(res) {
  res.status = function (code) {
    res.statusCode = code;
    return res;
  };
  res.json = function (obj) {
    const payload = Buffer.from(JSON.stringify(obj), 'utf8');
    if (!res.getHeader('Content-Type')) {
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
    }
    res.setHeader('Content-Length', String(payload.length));
    res.end(payload);
    return res;
  };
  return res;
}

function readRawBody(req, maxBytes = 300 * 1024) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let total = 0;
    req.on('data', chunk => {
      total += chunk.length;
      if (total > maxBytes) {
        const err = new Error('İstek boyutu güvenlik sınırını aşıyor.');
        err.statusCode = 413;
        req.destroy();
        reject(err);
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

const server = http.createServer(async (req, rawRes) => {
  const res = wrapRes(rawRes);
  const rawUrl = String(req.url || '/');
  const pathOnly = rawUrl.split('?')[0];

  try {
    process.env.NIHAT_BUILD_VERSION = computeBuildVersion();

    // Route API calls to exact Vercel serverless handlers
    if (pathOnly.startsWith('/api/')) {
      const handler = API_ROUTES[pathOnly];
      if (!handler) {
        sec.setSecurityHeaders(req, res);
        return res.status(404).json({ ok: false, error: 'API uç noktası bulunamadı.' });
      }
      if (!['GET', 'HEAD', 'OPTIONS'].includes(String(req.method || 'GET').toUpperCase())) {
        try {
          req.body = await readRawBody(req, 300 * 1024);
        } catch (bodyErr) {
          sec.setSecurityHeaders(req, res);
          return res.status(bodyErr.statusCode || 413).json({ ok: false, error: 'İstek boyutu sınırını aşıyor.' });
        }
      }
      await handler(req, res);
      return;
    }

    // Strict HTTP method check for static assets
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      applyStaticSecurityHeaders(req, res, 'text/plain; charset=utf-8');
      res.statusCode = 405;
      return res.end('Method Not Allowed');
    }

    // Strict Path Traversal & Dotfile Firewall
    let decodedPath;
    try {
      decodedPath = decodeURIComponent(pathOnly);
    } catch {
      sec.logSecurityEvent('ALERT', 'MALFORMED_URI_BLOCKED', req, { detail: 'Geçersiz URL kodlaması engellendi.' });
      applyStaticSecurityHeaders(req, res, 'text/plain; charset=utf-8');
      res.statusCode = 400;
      return res.end('Bad Request');
    }

    if (
      decodedPath.includes('\0') ||
      decodedPath.includes('..') ||
      decodedPath.includes('\\') ||
      /(?:^|\/)\.[a-zA-Z0-9_]/.test(decodedPath)
    ) {
      sec.logSecurityEvent('ALERT', 'PATH_TRAVERSAL_BLOCKED', req, { detail: `Engellenen statik yol: ${decodedPath}` });
      applyStaticSecurityHeaders(req, res, 'text/plain; charset=utf-8');
      res.statusCode = 403;
      return res.end('403 Forbidden');
    }

    const relTarget = decodedPath === '/' ? 'index.html' : decodedPath.replace(/^\/+/, '');
    const resolvedFull = path.resolve(PUBLIC_DIR, relTarget);
    const relativeCheck = path.relative(PUBLIC_DIR, resolvedFull);

    if (relativeCheck.startsWith('..') || path.isAbsolute(relativeCheck)) {
      sec.logSecurityEvent('ALERT', 'PATH_TRAVERSAL_BLOCKED', req, { detail: 'Kök dizin dışına çıkış engellendi.' });
      applyStaticSecurityHeaders(req, res, 'text/plain; charset=utf-8');
      res.statusCode = 403;
      return res.end('403 Forbidden');
    }

    let finalFile = resolvedFull;
    if (!fs.existsSync(finalFile) || fs.statSync(finalFile).isDirectory()) {
      const ext = path.extname(resolvedFull);
      // Only SPA routes without file extensions fall back to index.html; missing files (.env, .sql, .ps1, .js) get strict 404!
      if (!ext) {
        finalFile = path.join(PUBLIC_DIR, 'index.html');
      } else {
        applyStaticSecurityHeaders(req, res, 'text/plain; charset=utf-8');
        res.statusCode = 404;
        return res.end('404 Not Found');
      }
    }

    const ext = path.extname(finalFile).toLowerCase();
    const mime = MIME_TYPES[ext] || 'application/octet-stream';
    applyStaticSecurityHeaders(req, res, mime);

    if (path.basename(finalFile).toLowerCase() === 'index.html') {
      const ver = process.env.NIHAT_BUILD_VERSION;
      let html = fs.readFileSync(finalFile, 'utf8');
      html = html.replace(/(href|src)="((?:css|js|assets)\/[^"?]+)"/g, `$1="$2?v=${ver}"`);
      const buf = Buffer.from(html, 'utf8');
      res.setHeader('Content-Length', String(buf.length));
      res.statusCode = 200;
      return res.end(req.method === 'HEAD' ? undefined : buf);
    }

    const buf = fs.readFileSync(finalFile);
    res.setHeader('Content-Length', String(buf.length));
    res.statusCode = 200;
    return res.end(req.method === 'HEAD' ? undefined : buf);
  } catch {
    sec.logSecurityEvent('WARN', 'UNHANDLED_SERVER_ERROR', req, { detail: 'Beklenmeyen sunucu hatası maskelendi.' });
    if (!res.headersSent) {
      sec.setSecurityHeaders(req, res);
      res.status(500).json({ ok: false, error: 'Sunucu işlemi sırasında beklenmeyen bir hata oluştu.' });
    }
  }
});

server.requestTimeout = 25000;
server.headersTimeout = 12000;

server.listen(PORT, BIND_HOST, () => {
  console.log(`NİHAT PRO v2.3 Güvenli Yerel Sunucu aktif: http://${BIND_HOST}:${PORT}`);
});
