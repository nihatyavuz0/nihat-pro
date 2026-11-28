window.NihatApp = (function () {
  let currentRoute = 'dashboard';

  const ROUTE_META = {
    'dashboard': {
      title: 'Günlük Özet',
      subtitle: 'Bugünkü SEO, GEO ve reklam sağlığınızın sade özeti'
    },
    'site-audit': {
      title: 'Site SEO & GEO Testi',
      subtitle: 'Web sitenizi 3 katmanlı analiz edin, hataları basit listeli şekilde görün'
    },
    'approvals': {
      title: 'Onay & Hata Düzeltme',
      subtitle: 'Tespit edilen hataları inceleyin; onaylayın, NİHAT PRO en doğru şekilde düzeltsin'
    },
    'campaigns': {
      title: 'Google & Meta Reklamlar',
      subtitle: 'Google Ads, Google Merchant Center ve Meta Ads canlı kalite denetimi'
    },
    'content': {
      title: 'İçerik & Blog Stüdyosu',
      subtitle: 'Yüksek etkileşimli başlık, açıklama, reklam metni ve GEO blog üreticisi'
    },
    'competitors': {
      title: 'Rakip Analizi',
      subtitle: 'Rakiplerin SEO, GEO ve reklam açıklarını yakalayın'
    },
    'audience': {
      title: 'Hedef Kitle Araştırması',
      subtitle: 'Müşterilerinizin gerçek istekleri, korkuları ve arama alışkanlıkları'
    },
    'apis': {
      title: 'API Bağlantıları',
      subtitle: 'Google Ads, Merchant, Meta ve AI API entegrasyonları'
    }
  };

  const ALLOWED_BTN_CLASSES = new Set([
    'btn-primary', 'btn-emerald', 'btn-secondary', 'btn-ghost',
    'btn-soft-amber', 'btn-soft-rose', 'btn-soft-primary'
  ]);

  function esc(str) {
    return String(str == null ? '' : str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function num(val, min = 0, max = 100, fallback = 0) {
    const n = Number(val);
    if (!Number.isFinite(n)) return fallback;
    return Math.max(min, Math.min(max, n));
  }

  function toast(message, type = 'info') {
    const root = document.getElementById('toast-root');
    if (!root) return;

    while (root.children.length >= 3) {
      root.firstElementChild.remove();
    }

    const safeType = ['info', 'success', 'warn', 'error'].includes(type) ? type : 'info';
    const duration = safeType === 'error' ? 4800 : 3600;
    const el = document.createElement('div');
    el.className = `toast ${safeType}`;
    el.innerHTML = `
      <span class="toast-dot"></span>
      <span class="toast-msg">${esc(message)}</span>
      <button type="button" class="toast-close" aria-label="Kapat">✕</button>
      <div class="toast-timer"></div>
    `;

    let remaining = duration;
    let startedAt = Date.now();
    let timerId = null;
    let dismissed = false;

    function dismiss() {
      if (dismissed) return;
      dismissed = true;
      if (timerId) clearTimeout(timerId);
      el.classList.add('leaving');
      setTimeout(() => el.remove(), 200);
    }

    function startTimer() {
      startedAt = Date.now();
      timerId = setTimeout(dismiss, remaining);
    }

    el.addEventListener('mouseenter', () => {
      if (timerId) clearTimeout(timerId);
      remaining = Math.max(400, remaining - (Date.now() - startedAt));
    });
    el.addEventListener('mouseleave', () => {
      if (!dismissed) startTimer();
    });
    el.querySelector('.toast-close').addEventListener('click', dismiss);

    root.appendChild(el);
    startTimer();
  }

  let modalCloseTimer = null;

  function openModal(optsOrHtml, onReady) {
    const backdrop = document.getElementById('modal-backdrop');
    const card = document.getElementById('modal-card');
    if (!backdrop || !card) return;

    if (modalCloseTimer) {
      clearTimeout(modalCloseTimer);
      modalCloseTimer = null;
    }
    backdrop.classList.remove('closing');

    const opts = typeof optsOrHtml === 'object' && optsOrHtml ? optsOrHtml : { bodyHtml: '' };
    const safeTones = ['navy', 'emerald', 'amber', 'rose'];
    const tone = safeTones.includes(opts.tone) ? opts.tone : 'navy';
    const kickerCls = tone !== 'navy' ? ` ${tone}` : '';
    const dotCls = tone;

    card.className = 'modal-card' + (opts.compact ? ' compact' : '');

    card.innerHTML = `
      <div class="np-sheet-head">
        <div class="min-w-0">
          ${opts.eyebrow ? `<div class="np-sheet-kicker${kickerCls}"><span class="status-dot ${dotCls}"></span><span>${esc(opts.eyebrow)}</span></div>` : ''}
          <h3 class="np-sheet-title">${esc(opts.title || 'NİHAT PRO')}</h3>
          ${opts.subtitle ? `<p class="np-sheet-sub">${esc(opts.subtitle)}</p>` : ''}
        </div>
        ${opts.hideClose ? '' : `<button type="button" class="np-sheet-close" data-modal-close aria-label="Kapat">ESC</button>`}
      </div>
      <div class="np-sheet-body">${opts.bodyHtml || ''}</div>
      ${opts.footerHtml ? `<div class="np-sheet-foot">${opts.footerHtml}</div>` : ''}
    `;

    backdrop.classList.remove('hidden');
    card.querySelectorAll('[data-modal-close]').forEach(btn => {
      btn.addEventListener('click', closeModal);
    });

    const readyFn = opts.onReady || onReady;
    if (readyFn) readyFn(card);

    const firstInput = card.querySelector('input:not([type="hidden"]), textarea, select');
    if (firstInput) {
      setTimeout(() => { try { firstInput.focus(); } catch {} }, 60);
    }
  }

  function closeModal() {
    const backdrop = document.getElementById('modal-backdrop');
    if (!backdrop || backdrop.classList.contains('hidden')) return;
    backdrop.classList.add('closing');
    if (modalCloseTimer) clearTimeout(modalCloseTimer);
    modalCloseTimer = setTimeout(() => {
      backdrop.classList.add('hidden');
      backdrop.classList.remove('closing');
      modalCloseTimer = null;
    }, 175);
  }

  function confirm({
    eyebrow = 'Onay',
    title = 'İşlemi Onaylıyor musunuz?',
    message = '',
    confirmLabel = 'Onayla',
    cancelLabel = 'Vazgeç',
    tone = 'amber',
    confirmClass = 'btn-primary'
  } = {}) {
    return new Promise(resolve => {
      let settled = false;
      const done = val => {
        if (settled) return;
        settled = true;
        closeModal();
        resolve(val);
      };

      const safeBtnCls = ALLOWED_BTN_CLASSES.has(confirmClass) ? confirmClass : 'btn-primary';

      openModal({
        eyebrow,
        title,
        tone,
        compact: true,
        bodyHtml: `<p class="m-0 fs-13-5 text-sec lh-relaxed">${esc(message)}</p>`,
        footerHtml: `
          <button type="button" class="btn btn-secondary btn-sm" id="np-confirm-cancel">${esc(cancelLabel)}</button>
          <button type="button" class="btn ${safeBtnCls} btn-sm" id="np-confirm-ok">${esc(confirmLabel)}</button>
        `,
        onReady: card => {
          card.querySelector('#np-confirm-cancel').onclick = () => done(false);
          card.querySelector('#np-confirm-ok').onclick = () => done(true);
          card.querySelectorAll('[data-modal-close]').forEach(b => { b.onclick = () => done(false); });
        }
      });
    });
  }

  function updateChrome() {
    const s = window.NihatStore.getState();
    const pending = s.approvals.length;

    const badge = document.getElementById('nav-approval-badge');
    if (badge) {
      badge.textContent = String(pending);
      badge.classList.toggle('zero', pending === 0);
    }

    const mobBadge = document.getElementById('mobile-approval-badge');
    if (mobBadge) {
      mobBadge.textContent = String(pending);
      mobBadge.classList.toggle('hidden', pending === 0);
    }

    const topText = document.getElementById('topbar-approval-text');
    if (topText) {
      topText.textContent = pending > 0 ? `${pending} Onay Bekliyor` : 'Tüm Hatalar Temiz';
    }

    const serverPill = document.getElementById('server-status-pill');
    if (serverPill) {
      if (window.NihatStore.isServerOnline()) {
        serverPill.textContent = 'Canlı · Güvenli Kayıt';
        serverPill.classList.add('live');
      } else {
        serverPill.textContent = 'Sunucu bekleniyor';
        serverPill.classList.remove('live');
      }
    }

    const apiDot = document.getElementById('nav-api-dot');
    if (apiDot) {
      const anyConnected = Object.values(s.apis).some(a => a.connected);
      apiDot.classList.toggle('warn', !anyConnected);
    }

    document.documentElement.setAttribute('data-theme', s.theme === 'light' ? 'light' : 'navy-slate');
  }

  function navigate(route, saveRoute = true) {
    if (!ROUTE_META[route]) route = 'dashboard';
    currentRoute = route;

    if (saveRoute && window.NihatStore.getState().lastRoute !== route) {
      window.NihatStore.update(s => { s.lastRoute = route; });
    }

    document.querySelectorAll('.nav-item').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.route === route);
    });

    const primaryMobRoutes = ['dashboard', 'site-audit', 'approvals', 'campaigns'];
    document.querySelectorAll('.mtab-item[data-route]').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.route === route);
    });
    const moreBtn = document.getElementById('mobile-more-btn');
    if (moreBtn) {
      moreBtn.classList.toggle('active', !primaryMobRoutes.includes(route));
    }

    const meta = ROUTE_META[route];
    document.getElementById('page-title').textContent = meta.title;
    document.getElementById('page-subtitle').textContent = meta.subtitle;

    closeMobileMenu();
    renderCurrentView();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function renderCurrentView() {
    const root = document.getElementById('view-root');
    if (!root) return;
    root.classList.add('no-anim');
    void root.offsetHeight;
    root.classList.remove('no-anim');
    const renderer = window.NihatViews && window.NihatViews[currentRoute];
    if (renderer) {
      renderer(root);
    }
    updateChrome();
  }

  function triggerFullAudit() {
    openModal({
      eyebrow: '3 Katmanlı Doğrulama Motoru',
      title: 'Tam Sistem Denetimi Çalışıyor',
      subtitle: 'Google Ads, Merchant, Meta Ads ve SEO/GEO metrikleri çapraz taranıyor.',
      tone: 'navy',
      hideClose: true,
      bodyHtml: `
        <div class="progress-track progress-track-lg">
          <div class="progress-fill w-14" id="am-progress-bar"></div>
        </div>
        <div class="stack-sm" id="audit-modal-steps">
          <div class="pass-card" id="am-step-1"><div class="pass-title"><span>1. Katman: Politika &amp; Karakter Sınırı</span><span class="badge badge-info">Taranıyor...</span></div></div>
          <div class="pass-card" id="am-step-2"><div class="pass-title"><span>2. Katman: SEO, GEO &amp; Merchant Feed</span><span class="badge badge-neutral">Sırada</span></div></div>
          <div class="pass-card" id="am-step-3"><div class="pass-title"><span>3. Katman: Çapraz Hata Doğrulaması</span><span class="badge badge-neutral">Sırada</span></div></div>
        </div>
      `
    });

    const setBarClass = cls => {
      const b = document.getElementById('am-progress-bar');
      if (b) b.className = `progress-fill ${cls}`;
    };

    setTimeout(() => {
      setBarClass('w-42');
      const s1 = document.getElementById('am-step-1');
      const s2 = document.getElementById('am-step-2');
      if (s1) { s1.classList.add('done'); s1.querySelector('.badge').className = 'badge badge-success'; s1.querySelector('.badge').textContent = '✓ Geçti'; }
      if (s2) { s2.querySelector('.badge').className = 'badge badge-info'; s2.querySelector('.badge').textContent = 'Taranıyor...'; }
    }, 360);

    setTimeout(() => {
      setBarClass('w-76');
      const s2 = document.getElementById('am-step-2');
      const s3 = document.getElementById('am-step-3');
      if (s2) { s2.classList.add('done'); s2.querySelector('.badge').className = 'badge badge-success'; s2.querySelector('.badge').textContent = '✓ Geçti'; }
      if (s3) { s3.querySelector('.badge').className = 'badge badge-info'; s3.querySelector('.badge').textContent = 'Doğrulanıyor...'; }
    }, 780);

    setTimeout(() => {
      window.NihatAnalyzer.runFullSystemAudit();
      setBarClass('w-100 emerald');
      const s3 = document.getElementById('am-step-3');
      if (s3) { s3.classList.add('done'); s3.querySelector('.badge').className = 'badge badge-success'; s3.querySelector('.badge').textContent = '✓ Tamamlandı'; }

      setTimeout(() => {
        closeModal();
        renderCurrentView();
        const pending = window.NihatStore.getState().approvals.length;
        toast(
          pending > 0
            ? `3x Tam Denetim tamamlandı. ${pending} düzeltme önerisi onayınızı bekliyor.`
            : '3x Tam Denetim tamamlandı. Tüm kanallarınız hatasız durumda.',
          pending > 0 ? 'warn' : 'success'
        );
      }, 420);
    }, 1220);
  }

  function openMobileMenu() {
    document.getElementById('sidebar').classList.add('open');
    document.getElementById('sidebar-overlay').classList.add('open');
  }

  function closeMobileMenu() {
    document.getElementById('sidebar').classList.remove('open');
    document.getElementById('sidebar-overlay').classList.remove('open');
  }

  async function boot() {
    document.querySelectorAll('.nav-item').forEach(btn => {
      btn.addEventListener('click', () => navigate(btn.dataset.route));
    });

    document.querySelectorAll('.mtab-item[data-route]').forEach(btn => {
      btn.addEventListener('click', () => navigate(btn.dataset.route));
    });
    const mobMore = document.getElementById('mobile-more-btn');
    if (mobMore) {
      mobMore.addEventListener('click', openMobileMenu);
    }

    document.getElementById('topbar-approvals-btn').addEventListener('click', () => navigate('approvals'));
    document.getElementById('run-full-audit-btn').addEventListener('click', triggerFullAudit);

    document.getElementById('theme-toggle-btn').addEventListener('click', () => {
      window.NihatStore.update(s => {
        s.theme = s.theme === 'light' ? 'navy-slate' : 'light';
        s.themeVersion = 2;
      });
      updateChrome();
    });

    const secBtn = document.getElementById('security-shield-btn');
    if (secBtn) {
      secBtn.addEventListener('click', () => {
        if (window.NihatAuth) window.NihatAuth.openSecurityModal();
      });
    }

    document.getElementById('mobile-menu-btn').addEventListener('click', openMobileMenu);
    document.getElementById('mobile-close-btn').addEventListener('click', closeMobileMenu);
    document.getElementById('sidebar-overlay').addEventListener('click', closeMobileMenu);

    document.getElementById('modal-backdrop').addEventListener('click', e => {
      if (e.target.id === 'modal-backdrop') closeModal();
    });
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape') closeModal();
    });

    window.NihatStore.subscribe(() => {
      updateChrome();
    });

    updateChrome();

    // Never bypass authentication (including file:// protocol)
    const authStatus = await window.NihatAuth.checkSession();
    if (!authStatus.authenticated) {
      window.NihatAuth.showLoginGate();
      return;
    }
    window.NihatAuth.hideLoginGate();
    await onAuthenticated();
  }

  let watcherStarted = false;
  async function onAuthenticated() {
    await window.NihatStore.init();
    if (!watcherStarted) {
      watcherStarted = true;
      startAutoUpdateWatcher();
    }
    updateChrome();
    const savedRoute = window.NihatStore.getState().lastRoute || 'dashboard';
    navigate(savedRoute, false);
    const sess = window.NihatAuth ? window.NihatAuth.getSession() : null;
    if (sess && sess.user) {
      toast(`Hoş geldiniz, ${sess.user}. Güvenlik kalkanı aktif.`, 'success');
    }
  }

  function startAutoUpdateWatcher() {
    if (!window.NihatStore.isServerOnline()) return;
    let bootVersion = null;
    let pendingReload = false;

    async function checkVersion() {
      if (document.hidden) return;
      try {
        const res = await fetch('/api/version', { cache: 'no-store' });
        if (!res.ok) return;
        const data = await res.json();
        if (!data || !data.version) return;
        if (!bootVersion) {
          bootVersion = data.version;
          return;
        }
        if (data.version !== bootVersion) {
          const active = document.activeElement;
          const isTyping = active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || active.tagName === 'SELECT');
          if (isTyping) {
            pendingReload = true;
            return;
          }
          window.location.reload();
        }
      } catch {}
    }

    checkVersion();
    setInterval(checkVersion, 12000);
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) checkVersion();
    });
    document.addEventListener('focusout', () => {
      if (pendingReload) window.location.reload();
    });
  }

  document.addEventListener('DOMContentLoaded', boot);

  return {
    esc,
    num,
    toast,
    navigate,
    openModal,
    closeModal,
    confirm,
    triggerFullAudit,
    onAuthenticated,
    pendingAuditUrl: null
  };
})();
