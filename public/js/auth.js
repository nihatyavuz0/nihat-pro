window.NihatAuth = (function () {
  let sessionState = {
    authenticated: false,
    user: null,
    role: null,
    expiresAt: null,
    csrfToken: '',
    setupRequired: false,
    protections: []
  };

  let idleTimer = null;
  const IDLE_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes inactivity lock

  // Standalone HTML encoder — never relies on external load order
  function esc(str) {
    return String(str == null ? '' : str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function getCsrfToken() {
    return sessionState.csrfToken || '';
  }

  function getSession() {
    return Object.assign({}, sessionState);
  }

  function isAuthenticated() {
    return Boolean(sessionState.authenticated);
  }

  function isAdmin() {
    return Boolean(sessionState.authenticated && sessionState.role === 'admin');
  }

  function resetIdleTimer() {
    if (idleTimer) clearTimeout(idleTimer);
    if (!sessionState.authenticated) return;
    idleTimer = setTimeout(() => {
      logout('30 dakika hareketsizlik nedeniyle oturumunuz güvenlik için kilitlendi.');
    }, IDLE_TIMEOUT_MS);
  }

  function bindIdleListeners() {
    ['mousemove', 'keydown', 'click', 'touchstart'].forEach(evt => {
      window.addEventListener(evt, resetIdleTimer, { passive: true });
    });
  }

  async function secureFetch(url, options = {}) {
    const opts = Object.assign({ credentials: 'same-origin' }, options);
    const method = String(opts.method || 'GET').toUpperCase();
    const headers = new Headers(opts.headers || {});
    if (!['GET', 'HEAD', 'OPTIONS'].includes(method)) {
      const csrf = getCsrfToken();
      if (csrf) headers.set('X-CSRF-Token', csrf);
    }
    opts.headers = headers;

    const resp = await fetch(url, opts);
    if (resp.status === 401 && url !== '/api/auth/login' && url !== '/api/auth/setup') {
      sessionState.authenticated = false;
      sessionState.user = null;
      sessionState.role = null;
      sessionState.csrfToken = '';
      if (window.NihatStore && window.NihatStore.resetMemory) {
        window.NihatStore.resetMemory();
      }
      showLoginGate('Oturum süreniz doldu. Güvenliğiniz için lütfen tekrar giriş yapın.');
    }
    return resp;
  }

  async function checkSession() {
    if (window.location.protocol === 'file:') {
      return { serverReachable: false, authenticated: false, fileProtocolBlocked: true };
    }
    try {
      const resp = await fetch('/api/auth/session', {
        method: 'GET',
        credentials: 'same-origin',
        cache: 'no-store'
      });
      if (!resp.ok) {
        return { serverReachable: false, authenticated: false };
      }
      const data = await resp.json();
      sessionState = {
        authenticated: Boolean(data.authenticated),
        user: data.user || null,
        role: data.role || null,
        expiresAt: data.expiresAt || null,
        csrfToken: data.csrfToken || '',
        setupRequired: Boolean(data.setupRequired),
        protections: Array.isArray(data.protections) ? data.protections : []
      };
      if (sessionState.authenticated) resetIdleTimer();
      return {
        serverReachable: true,
        authenticated: sessionState.authenticated,
        setupRequired: sessionState.setupRequired
      };
    } catch {
      return { serverReachable: false, authenticated: false };
    }
  }

  function showLoginGate(noticeText = '') {
    const gate = document.getElementById('auth-gate');
    const shell = document.getElementById('app-shell');
    if (shell) shell.classList.add('hidden');
    if (!gate) return;
    gate.classList.remove('hidden');

    const isFileMode = window.location.protocol === 'file:';
    const isSetup = !isFileMode && Boolean(sessionState.setupRequired);

    gate.innerHTML = `
      <div class="auth-card">
        <div class="auth-brand">
          <div class="auth-logo-wrap">
            <img class="brand-logo-img logo-for-dark" src="assets/logo-dark.png" alt="NİHAT PRO" />
            <img class="brand-logo-img logo-for-light" src="assets/logo-light.png" alt="NİHAT PRO" />
          </div>
          <div class="auth-title-group">
            <div class="auth-kicker"><span class="status-dot emerald"></span><span>${isSetup ? 'İlk Güvenli Kurulum' : 'Korumalı Yönetim Paneli'}</span></div>
            <h1 class="auth-title">NİHAT PRO</h1>
            <p class="auth-sub">${isFileMode
              ? 'Güvenlik politikası gereği doğrudan dosya (file://) üzerinden erişim kapalıdır. Lütfen Baslat_NIHAT_PRO.bat ile sunucuyu başlatın.'
              : (isSetup
                ? 'Yerel sunucunuz için ilk yönetici (admin) kullanıcı adınızı ve güçlü şifrenizi oluşturun.'
                : 'SEO, GEO ve Reklam Otomasyon Ajanı’na güvenli giriş yapın.')}</p>
          </div>
        </div>

        ${noticeText ? `<div class="auth-alert warn">${esc(noticeText)}</div>` : ''}
        <div id="auth-error-box" class="auth-alert error hidden"></div>

        ${isFileMode ? '' : `
          <form id="auth-login-form" class="stack-sm" autocomplete="on" novalidate>
            <input type="text" name="website" id="auth-hp" class="hp-trap" tabindex="-1" autocomplete="off" aria-hidden="true" />

            <div class="field">
              <label for="auth-username">${isSetup ? 'Yönetici Kullanıcı Adı (3-32 karakter)' : 'Kullanıcı Adı'}</label>
              <input type="text" id="auth-username" class="input" placeholder="Örn: nihatstark" autocomplete="username" required />
            </div>

            <div class="field">
              <label for="auth-password">${isSetup ? 'Güçlü Şifre (En az 10 kar., Büyük/Küçük Harf + Rakam)' : 'Şifre'}</label>
              <div class="auth-pass-wrap">
                <input type="password" id="auth-password" class="input" placeholder="••••••••••••" autocomplete="${isSetup ? 'new-password' : 'current-password'}" required />
                <button type="button" class="auth-eye-btn" id="auth-toggle-pass" aria-label="Şifreyi Göster/Gizle" title="Göster / Gizle">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>
                </button>
              </div>
            </div>

            <button type="submit" class="btn btn-primary btn-lg w-full mt-6" id="auth-submit-btn">
              ${isSetup ? 'Yönetici Hesabını Oluştur ve Başlat' : 'Güvenli Giriş Yap'}
            </button>
          </form>
        `}

        <div class="auth-shield-foot">
          <span>Bcrypt (Cost 12)</span>
          <span>·</span>
          <span>HttpOnly HMAC + RBAC</span>
          <span>·</span>
          <span>İmzalı CSRF &amp; Hız Kalkanı</span>
        </div>
      </div>
    `;

    if (isFileMode) return;

    const userInp = gate.querySelector('#auth-username');
    const passInp = gate.querySelector('#auth-password');
    const toggleBtn = gate.querySelector('#auth-toggle-pass');
    const form = gate.querySelector('#auth-login-form');
    const errBox = gate.querySelector('#auth-error-box');
    const submitBtn = gate.querySelector('#auth-submit-btn');

    setTimeout(() => { try { userInp.focus(); } catch {} }, 40);

    toggleBtn.addEventListener('click', () => {
      passInp.type = passInp.type === 'password' ? 'text' : 'password';
    });

    form.addEventListener('submit', async e => {
      e.preventDefault();
      errBox.classList.add('hidden');
      const username = userInp.value.trim();
      const password = passInp.value;
      const hp = gate.querySelector('#auth-hp').value;

      if (!username || !password) {
        errBox.textContent = 'Lütfen kullanıcı adı ve şifrenizi girin.';
        errBox.classList.remove('hidden');
        return;
      }

      submitBtn.disabled = true;
      submitBtn.textContent = isSetup ? 'Hesap Oluşturuluyor...' : 'Doğrulanıyor...';

      try {
        const endpoint = isSetup ? '/api/auth/setup' : '/api/auth/login';
        const resp = await fetch(endpoint, {
          method: 'POST',
          credentials: 'same-origin',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username, password, website: hp })
        });
        const data = await resp.json();
        if (!resp.ok || !data.ok) {
          if (data && data.setupRequired) {
            sessionState.setupRequired = true;
            showLoginGate(data.error || 'İlk kurulum gerekli.');
            return;
          }
          errBox.textContent = data.error || 'İşlem tamamlanamadı. Bilgilerinizi kontrol edin.';
          errBox.classList.remove('hidden');
          submitBtn.disabled = false;
          submitBtn.textContent = isSetup ? 'Yönetici Hesabını Oluştur ve Başlat' : 'Güvenli Giriş Yap';
          passInp.value = '';
          passInp.focus();
          return;
        }

        sessionState.authenticated = true;
        sessionState.setupRequired = false;
        sessionState.user = data.user;
        sessionState.role = data.role || 'user';
        sessionState.expiresAt = data.expiresAt;
        sessionState.csrfToken = data.csrfToken || '';

        resetIdleTimer();
        hideLoginGate();
        if (window.NihatApp && window.NihatApp.onAuthenticated) {
          await window.NihatApp.onAuthenticated();
        }
      } catch {
        errBox.textContent = 'Sunucu bağlantısı kurulamadı. Lütfen Baslat_NIHAT_PRO.bat sunucusunun açık olduğundan emin olun.';
        errBox.classList.remove('hidden');
        submitBtn.disabled = false;
        submitBtn.textContent = isSetup ? 'Yönetici Hesabını Oluştur ve Başlat' : 'Güvenli Giriş Yap';
      }
    });
  }

  function hideLoginGate() {
    const gate = document.getElementById('auth-gate');
    const shell = document.getElementById('app-shell');
    if (gate) gate.classList.add('hidden');
    if (shell) shell.classList.remove('hidden');
  }

  async function logout(reason) {
    if (idleTimer) clearTimeout(idleTimer);
    try {
      await secureFetch('/api/auth/logout', { method: 'POST' });
    } catch {}
    sessionState.authenticated = false;
    sessionState.user = null;
    sessionState.role = null;
    sessionState.csrfToken = '';
    if (window.NihatStore && window.NihatStore.resetMemory) {
      window.NihatStore.resetMemory();
    }
    if (window.NihatApp) window.NihatApp.closeModal();
    showLoginGate(reason || 'Güvenli şekilde çıkış yaptınız.');
  }

  async function openSecurityModal() {
    const s = sessionState;
    const expStr = s.expiresAt ? new Date(s.expiresAt).toLocaleString('tr-TR') : 'Aktif';
    const roleLabel = s.role === 'admin' ? 'Yönetici (admin)' : 'Standart Kullanıcı (user)';
    const list = (s.protections && s.protections.length) ? s.protections : [
      'Bcrypt (Cost 12) Şifre Özeti & Sabit Zamanlı Doğrulama',
      'HttpOnly + SameSite=Strict + HMAC-SHA256 & İptal Edilebilir Oturum',
      'Oturuma Kriptografik Bağlı CSRF & Sıkı Same-Origin Kalkanı',
      'Rol Tabanlı Yetkilendirme (RBAC) & Kullanıcı Veri Sahipliği İzolasyonu',
      'AES-256-GCM Sunucu API Kasası (Tarayıcıda Sıfır Gizli Anahtar)',
      'SSRF Yönlendirme Duvarı, Sıkı CSP & Güvenlik Günlüğü'
    ];

    let secLogsHtml = '';
    if (s.role === 'admin') {
      try {
        const resp = await secureFetch('/api/admin/security-logs');
        if (resp.ok) {
          const logData = await resp.json();
          const items = Array.isArray(logData.logs) ? logData.logs.slice(0, 6) : [];
          secLogsHtml = `
            <div class="issue-action-box mt-4">
              <div class="row-between mb-6">
                <strong>Sunucu Güvenlik Günlüğü (Son Kayıtlar)</strong>
                <span class="badge ${logData.alertCount > 0 ? 'badge-danger' : 'badge-success'}">${Number(logData.alertCount) || 0} Uyarı</span>
              </div>
              ${items.length === 0 ? '<div class="fs-12 text-muted">Henüz kayıtlı güvenlik olayı yok.</div>' : items.map(l => `
                <div class="fs-12 text-sec mt-4">
                  <span class="mono">[${esc(String(l.time || '').slice(11, 19))}]</span>
                  <strong>${esc(l.event)}</strong> — ${esc(l.detail || '')}
                </div>
              `).join('')}
            </div>
          `;
        }
      } catch {}
    }

    window.NihatApp.openModal({
      eyebrow: 'Siber Güvenlik Kalkanı',
      title: 'Oturum, Rol ve Koruma Durumu',
      subtitle: `Kullanıcı: ${s.user || '-'} · Rol: ${roleLabel} · Bitiş: ${expStr}`,
      tone: 'emerald',
      bodyHtml: `
        <div class="clean-list">
          ${list.map(item => `
            <div class="clean-row py-10 items-center">
              <div class="row gap-10">
                <span class="status-dot emerald"></span>
                <span class="fs-13 text-sec">${esc(item)}</span>
              </div>
              <span class="badge badge-success">Aktif</span>
            </div>
          `).join('')}
        </div>
        ${secLogsHtml}
        <div class="issue-action-box mt-4">
          <strong>Güvenli Anahtar &amp; Şifre Yönetimi:</strong>
          <div class="mt-4 fs-12 text-sec">
            Şifre özetleri yalnızca <span class="mono">bcrypt (cost 12)</span> formatında, API anahtarları ise tarayıcı yerine sunucu ortam değişkenlerinde (<span class="mono">.env</span>) veya şifreli sunucu kasasında saklanır.
          </div>
        </div>
      `,
      footerHtml: `
        <button type="button" class="btn btn-soft-rose btn-sm" id="sec-logout-btn">Güvenli Çıkış Yap</button>
        <button type="button" class="btn btn-secondary btn-sm" data-modal-close>Kapat</button>
      `,
      onReady: card => {
        card.querySelector('#sec-logout-btn').onclick = () => logout('Oturumunuz güvenli şekilde kapatıldı.');
      }
    });
  }

  bindIdleListeners();

  return {
    esc,
    checkSession,
    secureFetch,
    getCsrfToken,
    getSession,
    isAuthenticated,
    isAdmin,
    showLoginGate,
    hideLoginGate,
    logout,
    openSecurityModal
  };
})();
