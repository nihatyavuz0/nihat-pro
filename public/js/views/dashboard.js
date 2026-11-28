window.NihatViews = window.NihatViews || {};

window.NihatViews.dashboard = function (root) {
  const s = window.NihatStore.getState();
  const esc = window.NihatApp.esc;
  const num = window.NihatApp.num;

  const pendingCount = s.approvals.length;
  const connectedApis = Object.values(s.apis).filter(a => a.connected).length;
  const totalApis = Object.keys(s.apis).length;
  const lastAudit = s.siteAudits[0] || null;

  const seoScore = Math.round(num(s.metrics.seoScore, 0, 100, 80));
  const geoScore = Math.round(num(s.metrics.geoScore, 0, 100, 75));
  const adsHealth = Math.round(num(s.metrics.adsHealth, 0, 100, 85));
  const roas = num(s.metrics.roas, 0, 999, 4.0);

  function renderProgressSvg(pct, toneClass) {
    const safePct = Math.round(num(pct, 0, 100, 0));
    const cls = toneClass ? ` ${toneClass}` : '';
    return `
      <svg class="progress-svg" viewBox="0 0 100 4" preserveAspectRatio="none" aria-hidden="true">
        <rect x="0" y="0" width="${safePct}" height="4" rx="2" class="progress-svg-fill${cls}"></rect>
      </svg>
    `;
  }

  root.innerHTML = `
    <div class="stack">
      <section class="editorial-brief">
        <div class="row-between mb-4">
          <span class="editorial-kicker">
            <img class="logo-for-dark kicker-logo" src="assets/logo-dark.png" alt="" />
            <img class="logo-for-light kicker-logo" src="assets/logo-light.png" alt="" />
            <span>Günlük Özet</span>
            <span class="opacity-40">/</span>
            <span class="text-muted fw-500">${esc(s.dailySummary.dateLabel)}</span>
          </span>
          <button class="btn btn-ghost btn-sm" id="dash-refresh-brief">Özeti Yenile</button>
        </div>

        <h2 class="editorial-headline">${esc(s.dailySummary.headline)}</h2>
        <p class="editorial-lead">${esc(s.dailySummary.simpleText)}</p>

        <div class="editorial-notes">
          ${(s.dailySummary.highlights || []).map(h => `
            <div class="editorial-note">
              <div class="editorial-note-label">${esc(h.label)}</div>
              <div class="editorial-note-text">${esc(h.text)}</div>
            </div>
          `).join('')}
        </div>
      </section>

      <section class="metric-strip">
        <div class="metric-cell clickable" data-goto="site-audit">
          <div class="metric-top">
            <span>SEO Gücü</span>
            <span class="status-dot ${seoScore >= 80 ? 'emerald' : 'amber'}"></span>
          </div>
          <div class="metric-num">${seoScore}<small> / 100</small></div>
          ${renderProgressSvg(seoScore, seoScore >= 80 ? 'emerald' : 'amber')}
          <div class="metric-foot">${lastAudit ? esc(lastAudit.domain) : 'Site testi bekleniyor'}</div>
        </div>

        <div class="metric-cell clickable" data-goto="site-audit">
          <div class="metric-top">
            <span>GEO (Yapay Zeka)</span>
            <span class="status-dot navy"></span>
          </div>
          <div class="metric-num">${geoScore}<small> / 100</small></div>
          ${renderProgressSvg(geoScore, '')}
          <div class="metric-foot">AI arama alıntılanabilirliği</div>
        </div>

        <div class="metric-cell clickable" data-goto="campaigns">
          <div class="metric-top">
            <span>Reklam Sağlığı</span>
            <span class="mono text-emerald fs-11">ROAS ${roas}x</span>
          </div>
          <div class="metric-num">%${adsHealth}</div>
          ${renderProgressSvg(adsHealth, 'emerald')}
          <div class="metric-foot">Google Ads · Merchant · Meta</div>
        </div>

        <div class="metric-cell clickable" id="dash-kpi-approvals">
          <div class="metric-top">
            <span>Onay Bekleyen</span>
            <span class="status-dot ${pendingCount > 0 ? 'amber' : 'emerald'}"></span>
          </div>
          <div class="metric-num ${pendingCount > 0 ? 'text-amber' : 'text-emerald'}">${pendingCount}</div>
          <div class="metric-foot">${pendingCount > 0 ? 'İncele ve tek tıkla düzelt →' : 'Tüm kayıtlar temiz'}</div>
        </div>
      </section>

      <section class="grid grid-asymmetric">
        <div class="card">
          <div class="card-header">
            <div>
              <h3 class="card-title">Onayınızı Bekleyen Düzeltmeler</h3>
              <p class="card-subtitle">Her bulgu 3 kez doğrulanır; siz onayladığınızda uygulanır.</p>
            </div>
            <button class="btn btn-ghost btn-sm" data-goto="approvals">Tümü (${pendingCount}) →</button>
          </div>

          ${pendingCount === 0 ? `
            <div class="empty-state p-empty-sm">
              <strong class="text-main">Bekleyen hata yok</strong>
              <p class="mt-4 m-0 fs-13">Tüm reklamlarınız ve site kontrolleriniz şu an temiz görünüyor.</p>
            </div>
          ` : `
            <div class="clean-list">
              ${s.approvals.slice(0, 3).map(item => `
                <div class="clean-row">
                  <div class="min-w-0 flex-1">
                    <div class="row gap-6 mb-4">
                      <span class="status-dot ${item.severity === 'Kritik' ? 'rose' : 'amber'}"></span>
                      <span class="fs-11-5 text-muted fw-500">${esc(item.platform)} · ${esc(item.severity)}</span>
                    </div>
                    <div class="fw-600 fs-14 text-main">${esc(item.title)}</div>
                    <div class="fs-12-5 text-sec mt-4">Öneri: <span class="text-emerald">${esc(item.after)}</span></div>
                  </div>
                  <button class="btn btn-emerald btn-sm quick-approve-btn" data-id="${esc(item.id)}">Onayla</button>
                </div>
              `).join('')}
            </div>
          `}
        </div>

        <div class="stack gap-20">
          <div class="card">
            <div class="card-header mb-14">
              <div>
                <h3 class="card-title">Hızlı Site SEO &amp; GEO Testi</h3>
                <p class="card-subtitle">Link verin, hataları sade liste olarak görün.</p>
              </div>
            </div>
            <form id="dash-quick-audit-form" class="stack-sm">
              <input type="text" class="input" id="dash-audit-url" placeholder="https://siteniz.com" value="${esc(lastAudit ? lastAudit.url : '')}" />
              <button type="submit" class="btn btn-primary w-full">Siteyi Analiz Et</button>
            </form>
          </div>

          <div class="card">
            <div class="card-header mb-10">
              <div>
                <h3 class="card-title">Kanal &amp; API Özeti</h3>
                <p class="card-subtitle">${connectedApis} / ${totalApis} canlı API bağlı</p>
              </div>
              <button class="btn btn-ghost btn-sm" data-goto="apis">Ayarlar →</button>
            </div>
            <div class="clean-list">
              ${renderChannelRow('Google Ads', s.campaigns.googleAds.filter(x => x.issueFlag).length, s.apis.google_ads.connected, false)}
              ${renderChannelRow('Google Merchant', s.campaigns.merchant.filter(x => x.issueFlag).length, s.apis.google_merchant.connected, false)}
              ${renderChannelRow('Meta Ads', s.campaigns.metaAds.filter(x => x.issueFlag).length, s.apis.meta_ads.connected, false)}
              ${renderChannelRow('Yapay Zeka Motoru', 0, s.apis.gemini.connected || s.apis.openai.connected, true)}
            </div>
          </div>
        </div>
      </section>

      <section class="card">
        <div class="card-header mb-12">
          <div>
            <h3 class="card-title">Son İşlemler</h3>
            <p class="card-subtitle">Son denetimler ve onaylı değişiklikler.</p>
          </div>
        </div>
        <div class="clean-list">
          ${s.auditLog.slice(0, 5).map(log => `
            <div class="clean-row py-10 items-center">
              <div class="row gap-12 min-w-0 flex-1">
                <span class="mono fs-11-5 text-muted flex-shrink-0">
                  ${esc(new Date(log.time).toLocaleString('tr-TR', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' }))}
                </span>
                <span class="fs-13 text-sec">${esc(log.message)}</span>
              </div>
              <span class="badge badge-neutral">${esc(log.type)}</span>
            </div>
          `).join('')}
        </div>
      </section>
    </div>
  `;

  function renderChannelRow(name, issueCount, isApiConnected, isAi) {
    const safeCount = Math.round(num(issueCount, 0, 9999, 0));
    const sub = isAi
      ? (isApiConnected ? 'Canlı AI aktif' : 'Yerel uzman motor')
      : (safeCount > 0 ? `${safeCount} hata bekliyor` : 'Sorunsuz');
    return `
      <div class="clean-row py-10 items-center">
        <div class="row gap-10">
          <span class="status-dot ${isApiConnected ? 'emerald' : (safeCount > 0 ? 'amber' : 'navy')}"></span>
          <span class="fw-500 fs-13">${esc(name)}</span>
        </div>
        <span class="fs-12 text-muted">${esc(sub)}</span>
      </div>
    `;
  }

  root.querySelectorAll('[data-goto]').forEach(btn => {
    btn.addEventListener('click', () => window.NihatApp.navigate(btn.dataset.goto));
  });

  const kpiApr = root.querySelector('#dash-kpi-approvals');
  if (kpiApr) kpiApr.addEventListener('click', () => window.NihatApp.navigate('approvals'));

  const refreshBtn = root.querySelector('#dash-refresh-brief');
  if (refreshBtn) refreshBtn.addEventListener('click', () => window.NihatApp.triggerFullAudit());

  root.querySelectorAll('.quick-approve-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const res = window.NihatStore.approveItem(btn.dataset.id);
      if (res) {
        window.NihatApp.toast(`"${res.title}" uygulandı ve doğrulandı.`, 'success');
        window.NihatViews.dashboard(root);
      }
    });
  });

  const quickForm = root.querySelector('#dash-quick-audit-form');
  if (quickForm) {
    quickForm.addEventListener('submit', e => {
      e.preventDefault();
      const url = root.querySelector('#dash-audit-url').value.trim();
      if (!url) {
        window.NihatApp.toast('Lütfen test etmek istediğiniz web sitesinin linkini girin.', 'warn');
        return;
      }
      window.NihatApp.pendingAuditUrl = url;
      window.NihatApp.navigate('site-audit');
    });
  }
};
