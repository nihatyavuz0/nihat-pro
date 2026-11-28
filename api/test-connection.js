const sec = require('./_security');

async function apiCall(method, url, headers = {}, bodyJson = null) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 14000);
  try {
    const resp = await fetch(url, {
      method,
      headers: Object.assign({ 'Content-Type': 'application/json; charset=utf-8' }, headers),
      body: bodyJson && ['POST', 'PUT', 'PATCH'].includes(method) ? bodyJson : undefined,
      signal: controller.signal
    });
    await resp.text();
    clearTimeout(timer);
    return { ok: resp.ok, status: resp.status };
  } catch {
    clearTimeout(timer);
    return { ok: false, status: 0 };
  }
}

module.exports = async (req, res) => {
  if (sec.handlePreflight(req, res)) return;
  if (req.method !== 'POST') {
    sec.setSecurityHeaders(req, res);
    return res.status(405).json({ ok: false, message: 'Method not allowed' });
  }

  // Admin-only action: testing & storing platform credentials
  const session = sec.requireAuth(req, res, {
    role: 'admin',
    bucket: 'test-conn',
    rateLimit: { max: 20, windowMs: 60000 }
  });
  if (!session) return;

  try {
    const payload = sec.parseSafeBody(req, 16384);
    const platform = String(payload.platform || '').trim();
    const incomingCfg = payload.config && typeof payload.config === 'object' ? payload.config : {};

    if (!sec.VAULT_PLATFORMS[platform]) {
      return res.status(400).json({ ok: false, message: 'Bilinmeyen platform.' });
    }

    // Persist non-empty secret updates into server vault first, then read authoritative credentials from server
    sec.saveServerPlatformCredentials(platform, incomingCfg);
    const serverCfg = sec.getServerPlatformCredentials(platform);
    const cfg = Object.assign({}, serverCfg);
    for (const k of Object.keys(incomingCfg)) {
      const v = String(incomingCfg[k] || '').trim();
      if (v && !v.startsWith('••••') && v !== '__CLEAR__') cfg[k] = v;
    }

    if (platform === 'gemini') {
      const key = String(cfg.apiKey || '').trim();
      if (!key) return res.status(400).json({ ok: false, message: 'Gemini API Anahtarı sunucuda tanımlı değil.' });
      // Send API key in header (x-goog-api-key) rather than URL query parameter
      const r = await apiCall('GET', 'https://generativelanguage.googleapis.com/v1beta/models', {
        'x-goog-api-key': key
      });
      return res.status(200).json(
        r.ok
          ? { ok: true, message: `Google Gemini API bağlantısı başarıyla doğrulandı (HTTP ${r.status}).` }
          : { ok: false, message: `Gemini API doğrulama hatası (HTTP ${r.status || 'Ağ'}): API anahtarını kontrol edin.` }
      );
    }

    if (platform === 'openai') {
      const key = String(cfg.apiKey || '').trim();
      if (!key) return res.status(400).json({ ok: false, message: 'OpenAI API Anahtarı sunucuda tanımlı değil.' });
      const r = await apiCall('GET', 'https://api.openai.com/v1/models', { Authorization: `Bearer ${key}` });
      return res.status(200).json(
        r.ok
          ? { ok: true, message: 'OpenAI API bağlantısı başarıyla doğrulandı.' }
          : { ok: false, message: `OpenAI API doğrulama hatası (HTTP ${r.status || 'Ağ'}).` }
      );
    }

    if (platform === 'meta_ads') {
      const token = String(cfg.accessToken || '').trim();
      let accId = String(cfg.adAccountId || '').trim().replace(/[^a-zA-Z0-9_]/g, '');
      if (!token || !accId) {
        return res.status(400).json({ ok: false, message: 'Meta Ads için Access Token ve Reklam Hesabı ID gereklidir.' });
      }
      if (!accId.startsWith('act_')) accId = 'act_' + accId;
      // Send Meta token in Authorization header instead of URL query string
      const r = await apiCall(
        'GET',
        `https://graph.facebook.com/v21.0/${encodeURIComponent(accId)}?fields=name,account_status,currency`,
        { Authorization: `Bearer ${token}` }
      );
      return res.status(200).json(
        r.ok
          ? { ok: true, message: `Meta Marketing API bağlantısı doğrulandı (${accId}).` }
          : { ok: false, message: `Meta Graph API hatası (HTTP ${r.status || 'Ağ'}): Token veya ads_management iznini kontrol edin.` }
      );
    }

    if (platform === 'google_ads') {
      const devToken = String(cfg.developerToken || '').trim();
      const accessToken = String(cfg.accessToken || '').trim();
      const custId = String(cfg.customerId || '').replace(/[^0-9]/g, '');
      if (!devToken || !accessToken || custId.length !== 10) {
        return res.status(400).json({ ok: false, message: 'Google Ads için 10 haneli Müşteri ID, Developer Token ve OAuth Access Token gereklidir.' });
      }
      const hdrs = { Authorization: `Bearer ${accessToken}`, 'developer-token': devToken };
      const mgr = String(cfg.managerId || '').replace(/[^0-9]/g, '');
      if (mgr) hdrs['login-customer-id'] = mgr;
      const r = await apiCall('GET', 'https://googleads.googleapis.com/v18/customers:listAccessibleCustomers', hdrs);
      return res.status(200).json(
        r.ok
          ? { ok: true, message: `Google Ads API bağlantısı başarıyla doğrulandı (Müşteri: ${custId}).` }
          : { ok: false, message: `Google Ads API hatası (HTTP ${r.status || 'Ağ'}): OAuth Token veya Developer Token yetkilerini kontrol edin.` }
      );
    }

    if (platform === 'google_merchant') {
      const mId = String(cfg.merchantId || '').replace(/[^0-9]/g, '');
      const accessToken = String(cfg.accessToken || '').trim();
      if (!mId || !accessToken) {
        return res.status(400).json({ ok: false, message: 'Google Merchant Center için Merchant ID ve OAuth Access Token gereklidir.' });
      }
      const r = await apiCall(`GET`, `https://shoppingcontent.googleapis.com/content/v2.1/${mId}/accounts/${mId}`, {
        Authorization: `Bearer ${accessToken}`
      });
      return res.status(200).json(
        r.ok
          ? { ok: true, message: `Google Merchant Center API bağlantısı doğrulandı (Merchant #${mId}).` }
          : { ok: false, message: `Merchant Center API hatası (HTTP ${r.status || 'Ağ'}): Content API iznini kontrol edin.` }
      );
    }

    if (platform === 'pagespeed') {
      const key = String(cfg.apiKey || '').trim();
      if (!key) return res.status(400).json({ ok: false, message: 'PageSpeed Insights API Anahtarı sunucuda tanımlı değil.' });
      const r = await apiCall('GET', `https://www.googleapis.com/pagespeedonline/v5/runPagespeed?url=https://example.com&category=SEO&key=${encodeURIComponent(key)}`);
      return res.status(200).json(
        r.ok
          ? { ok: true, message: 'Google PageSpeed Insights API başarıyla doğrulandı.' }
          : { ok: false, message: `PageSpeed API hatası (HTTP ${r.status || 'Ağ'}).` }
      );
    }

    return res.status(400).json({ ok: false, message: 'Bilinmeyen platform.' });
  } catch (err) {
    const code = (err && err.statusCode) || 400;
    return res.status(code).json({ ok: false, message: 'Bağlantı testi sırasında geçersiz istek algılandı.' });
  }
};
