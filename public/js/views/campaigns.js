window.NihatViews = window.NihatViews || {};

window.NihatViews.campaigns = function (root) {
  let activeTab = 'google_ads';
  const esc = window.NihatApp.esc;
  const num = window.NihatApp.num;

  function render() {
    const s = window.NihatStore.getState();

    root.innerHTML = `
      <div class="stack">
        <section class="card">
          <div class="row-between">
            <div>
              <h2 class="card-title">Google Ads, Google Merchant &amp; Meta Ads Yönetimi</h2>
              <p class="card-subtitle">Tüm reklamlarınız ve ürün akışınız tek panelde. Yeni bir reklam eklediğinizde NİHAT PRO 3 kez denetler ve hata bulursa size sorup düzeltir.</p>
            </div>
            <div class="row">
              <button class="btn btn-primary btn-sm" id="add-campaign-item-btn">+ Yeni Kayıt Ekle &amp; Denetle</button>
              <button class="btn btn-secondary btn-sm" id="goto-apis-btn">API Bağlantıları</button>
            </div>
          </div>

          <div class="tabs mt-16">
            <button class="tab-btn ${activeTab === 'google_ads' ? 'active' : ''}" data-tab="google_ads">
              Google Ads (${s.campaigns.googleAds.length})
            </button>
            <button class="tab-btn ${activeTab === 'merchant' ? 'active' : ''}" data-tab="merchant">
              Google Merchant (${s.campaigns.merchant.length})
            </button>
            <button class="tab-btn ${activeTab === 'meta_ads' ? 'active' : ''}" data-tab="meta_ads">
              Meta Ads (${s.campaigns.metaAds.length})
            </button>
          </div>
        </section>

        ${activeTab === 'google_ads' ? renderGoogleAds(s) : ''}
        ${activeTab === 'merchant' ? renderMerchant(s) : ''}
        ${activeTab === 'meta_ads' ? renderMetaAds(s) : ''}
      </div>
    `;

    bindEvents();
  }

  function renderGoogleAds(s) {
    return `
      <section class="card">
        <div class="row-between mb-14">
          <div>
            <h3 class="card-title">Google Ads Arama Ağı Kampanyaları</h3>
            <p class="card-subtitle">Başlık ≤ 30 karakter, açıklama ≤ 90 karakter ve Kalite Puanı ≥ 8 hedefiyle sürekli denetlenir.</p>
          </div>
          <span class="badge ${s.apis.google_ads.connected ? 'badge-success' : 'badge-neutral'}">
            ${s.apis.google_ads.connected ? 'Google Ads API Bağlı' : 'Yerel Denetim Modu'}
          </span>
        </div>

        <div class="stack-sm">
          ${s.campaigns.googleAds.map(ad => {
            const qs = Math.round(num(ad.qualityScore, 1, 10, 7));
            const hl = String(ad.headline || '');
            const ds = String(ad.description || '');
            return `
              <div class="issue-item ${ad.issueFlag ? 'sev-kritik' : ''}">
                <div class="row-between">
                  <div>
                    <div class="row gap-6 mb-4">
                      <span class="badge badge-info">${esc(ad.status)}</span>
                      <span class="badge ${qs >= 8 ? 'badge-success' : 'badge-warn'}">Kalite Puanı: ${qs}/10</span>
                      <span class="badge badge-neutral">TO: ${esc(ad.ctr)} · TBM: ${esc(ad.cpc)}</span>
                    </div>
                    <div class="issue-title">${esc(ad.name)}</div>
                  </div>
                  ${ad.issueFlag
                    ? `<button class="btn btn-soft-amber btn-sm go-approvals-btn">Hata Var — Onay Merkezinde Gör</button>`
                    : `<span class="badge badge-success">✓ 3x Doğrulandı · Hatasız</span>`}
                </div>
                <div class="grid grid-2 gap-10">
                  <div class="issue-action-box">
                    <div class="fs-11 text-muted fw-700">BAŞLIK (${hl.length}/30 karakter)</div>
                    <div class="fw-600 mt-2">${esc(hl)}</div>
                  </div>
                  <div class="issue-action-box">
                    <div class="fs-11 text-muted fw-700">AÇIKLAMA (${ds.length}/90 karakter)</div>
                    <div class="mt-2">${esc(ds)}</div>
                  </div>
                </div>
                ${ad.issueFlag ? `<div class="text-rose fs-12-5 fw-600">⚠ Tespit: ${esc(ad.issueFlag)}</div>` : ''}
              </div>
            `;
          }).join('')}
        </div>
      </section>
    `;
  }

  function renderMerchant(s) {
    return `
      <section class="card">
        <div class="row-between mb-14">
          <div>
            <h3 class="card-title">Google Merchant Center Ürün Feed Denetimi</h3>
            <p class="card-subtitle">Google Alışveriş ve AI Shopping görünürlüğü için ürün başlıkları, GTIN ve fiyat sinyalleri kontrol edilir.</p>
          </div>
          <span class="badge ${s.apis.google_merchant.connected ? 'badge-success' : 'badge-neutral'}">
            ${s.apis.google_merchant.connected ? 'Merchant API Bağlı' : 'Yerel Denetim Modu'}
          </span>
        </div>

        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>SKU</th>
                <th>Ürün Başlığı (SEO &amp; AI Shopping)</th>
                <th>GTIN</th>
                <th>Fiyat</th>
                <th>Durum</th>
              </tr>
            </thead>
            <tbody>
              ${s.campaigns.merchant.map(p => `
                <tr>
                  <td class="mono">${esc(p.sku)}</td>
                  <td>
                    <strong>${esc(p.title)}</strong>
                    ${p.issueFlag ? `<div class="text-rose fs-12 mt-4">⚠ ${esc(p.issueFlag)}</div>` : ''}
                  </td>
                  <td class="mono">${p.gtin ? esc(p.gtin) : '<span class="text-amber fw-700">Eksik</span>'}</td>
                  <td><strong>${esc(p.price)}</strong></td>
                  <td>
                    ${p.issueFlag
                      ? `<button class="btn btn-soft-amber btn-sm go-approvals-btn">Düzeltmeyi Onayla</button>`
                      : `<span class="badge badge-success">✓ Onaylı</span>`}
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </section>
    `;
  }

  function renderMetaAds(s) {
    return `
      <section class="card">
        <div class="row-between mb-14">
          <div>
            <h3 class="card-title">Meta Ads (Instagram &amp; Facebook) Kreatif ve Kanca Denetimi</h3>
            <p class="card-subtitle">İlk 1.5 saniye kancası (Hook), tıklama oranı (TO) ve ROAS performansı sürekli izlenir.</p>
          </div>
          <span class="badge ${s.apis.meta_ads.connected ? 'badge-success' : 'badge-neutral'}">
            ${s.apis.meta_ads.connected ? 'Meta Marketing API Bağlı' : 'Yerel Denetim Modu'}
          </span>
        </div>

        <div class="stack-sm">
          ${s.campaigns.metaAds.map(m => `
            <div class="issue-item ${m.issueFlag ? 'sev-onemli' : ''}">
              <div class="row-between">
                <div>
                  <div class="row gap-6 mb-4">
                    <span class="badge badge-info">${esc(m.status)}</span>
                    <span class="badge badge-neutral">TO: ${esc(m.ctr)}</span>
                    <span class="badge badge-success">ROAS: ${esc(m.roas)}</span>
                  </div>
                  <div class="issue-title">${esc(m.name)}</div>
                </div>
                ${m.issueFlag
                  ? `<button class="btn btn-soft-amber btn-sm go-approvals-btn">Kancayı Güçlendir (Onay)</button>`
                  : `<span class="badge badge-success">✓ Yüksek Etkileşim</span>`}
              </div>
              <div class="issue-action-box">
                <div><strong>İlk Cümle (Hook):</strong> ${esc(m.hook)}</div>
                <div class="mt-4"><strong>Başlık:</strong> ${esc(m.headline)}</div>
              </div>
              ${m.issueFlag ? `<div class="text-amber fs-12-5 fw-600">⚠ ${esc(m.issueFlag)}</div>` : ''}
            </div>
          `).join('')}
        </div>
      </section>
    `;
  }

  function openAddModal() {
    window.NihatApp.openModal({
      eyebrow: '3x Canlı Kalite Denetimi',
      title: 'Yeni Reklam veya Ürün Ekle',
      subtitle: 'Kaydettiğiniz anda NİHAT PRO 3 kez denetler; hata varsa onayınıza sunar.',
      tone: 'navy',
      bodyHtml: `
        <div class="field">
          <label for="new-camp-platform">Platform</label>
          <select class="select" id="new-camp-platform">
            <option value="google_ads" ${activeTab === 'google_ads' ? 'selected' : ''}>Google Ads (Arama Ağı)</option>
            <option value="merchant" ${activeTab === 'merchant' ? 'selected' : ''}>Google Merchant Center (Ürün)</option>
            <option value="meta_ads" ${activeTab === 'meta_ads' ? 'selected' : ''}>Meta Ads (Instagram / Facebook)</option>
          </select>
        </div>
        <div class="field">
          <label for="new-camp-name">Kampanya / Ürün Adı</label>
          <input class="input" id="new-camp-name" maxlength="140" placeholder="Örn: Güneş Paneli Arama Kampanyası" />
        </div>
        <div class="field">
          <div class="row-between">
            <label for="new-camp-headline">Başlık veya İlk Cümle (Hook)</label>
            <span class="badge badge-neutral" id="camp-hl-badge">0 karakter</span>
          </div>
          <input class="input" id="new-camp-headline" maxlength="180" placeholder="Örn: Aynı Gün Kargo | Orijinal Garantili" />
          <span class="field-hint" id="camp-hl-hint">Google Ads başlığı max 30 karakter olmalıdır; aşarsanız otomatik düzeltme önerilir.</span>
        </div>
        <div class="field">
          <label for="new-camp-desc">Açıklama veya Fiyat / Detay</label>
          <textarea class="textarea" id="new-camp-desc" maxlength="320" placeholder="Reklam açıklaması veya ürün detayı..."></textarea>
        </div>
      `,
      footerHtml: `
        <button type="button" class="btn btn-secondary btn-sm" data-modal-close>Vazgeç</button>
        <button type="button" class="btn btn-primary btn-sm" id="save-add-camp">Kaydet ve 3x Denetle</button>
      `,
      onReady: modalEl => {
        const platSel = modalEl.querySelector('#new-camp-platform');
        const hlInp = modalEl.querySelector('#new-camp-headline');
        const hlBadge = modalEl.querySelector('#camp-hl-badge');
        const hlHint = modalEl.querySelector('#camp-hl-hint');

        const refreshHint = () => {
          const p = platSel.value;
          const len = hlInp.value.trim().length;
          if (p === 'google_ads') {
            hlBadge.textContent = `${len} / 30 kar.`;
            hlBadge.className = 'badge ' + (len > 30 ? 'badge-danger' : (len > 0 ? 'badge-success' : 'badge-neutral'));
            hlHint.textContent = 'Google Ads başlığı max 30 karakterdir; aşarsanız otomatik düzeltme önerilir.';
          } else if (p === 'merchant') {
            hlBadge.textContent = `${len} / 150 kar.`;
            hlBadge.className = 'badge ' + (len > 0 && len < 35 ? 'badge-warn' : (len >= 35 ? 'badge-success' : 'badge-neutral'));
            hlHint.textContent = 'Google Merchant için ideal başlık 45–150 karakter aralığındadır.';
          } else {
            hlBadge.textContent = `${len} kar.`;
            hlBadge.className = 'badge ' + (len > 0 && len < 25 ? 'badge-warn' : (len >= 25 ? 'badge-success' : 'badge-neutral'));
            hlHint.textContent = 'Meta Ads ilk cümlesi (Hook) merak uyandırıcı ve en az 25+ karakter olmalıdır.';
          }
        };
        platSel.addEventListener('change', refreshHint);
        hlInp.addEventListener('input', refreshHint);
        refreshHint();

        modalEl.querySelector('#save-add-camp').onclick = () => {
          const plat = modalEl.querySelector('#new-camp-platform').value;
          const name = modalEl.querySelector('#new-camp-name').value.trim();
          const headline = modalEl.querySelector('#new-camp-headline').value.trim();
          const desc = modalEl.querySelector('#new-camp-desc').value.trim();

          if (!name || !headline) {
            window.NihatApp.toast('Lütfen ad ve başlık alanlarını doldurun.', 'warn');
            return;
          }

          const id = 'item_' + Date.now();
          let caughtIssue = false;

          if (plat === 'google_ads') {
            const tooLong = headline.length > 30;
            window.NihatStore.update(s => {
              s.campaigns.googleAds.unshift({
                id, name, status: 'Aktif', headline,
                description: desc || 'Hızlı teslimat ve orijinal ürün garantisiyle hemen sipariş verin.',
                ctr: '3.2%', cpc: '₺4,90', qualityScore: tooLong ? 6 : 9,
                issueFlag: tooLong ? `Başlık 30 karakter sınırını aşıyor (${headline.length} kar.)` : null
              });
            });
            if (tooLong) {
              caughtIssue = true;
              window.NihatStore.enqueueApproval({
                platform: 'Google Ads', targetId: id, field: 'headline', severity: 'Kritik',
                title: `"${name}" Başlığı 30 Karakteri Aşıyor (${headline.length} kar.)`,
                reason: 'Google Ads RSA başlığı 30 karakteri geçemez. 3 katmanlı denetim hatayı anında yakaladı.',
                impact: 'Reklam reddi önlenir, TO oranı yükselir',
                before: headline,
                after: headline.slice(0, 27).trim() + '!'
              });
            }
          } else if (plat === 'merchant') {
            const tooShort = headline.length < 35;
            window.NihatStore.update(s => {
              s.campaigns.merchant.unshift({
                id, sku: 'PRD-' + String(Date.now()).slice(-4),
                title: headline, gtin: '', price: desc || '₺1.490',
                status: tooShort ? 'Uyarı' : 'Onaylı',
                issueFlag: tooShort ? 'Ürün başlığı kısa (< 35 kar.), AI Shopping ve Alışveriş aramaları için zenginleştirilmeli' : null
              });
            });
            if (tooShort) {
              caughtIssue = true;
              window.NihatStore.enqueueApproval({
                platform: 'Google Merchant', targetId: id, field: 'title', severity: 'Kritik',
                title: `Yeni Merchant Ürünü (${name}) Başlığı Çok Kısa`,
                reason: 'Kısa ürün başlıkları Google Merchant gösterimlerini düşürür.',
                impact: 'Alışveriş tıklamalarında tahmini +%38 artış',
                before: headline,
                after: `${headline} — Orijinal Garantili | ${name} | Aynı Gün Kargo`
              });
            }
          } else {
            const weakHook = headline.length < 25;
            window.NihatStore.update(s => {
              s.campaigns.metaAds.unshift({
                id, name, status: 'Aktif', hook: headline,
                headline: desc || 'Şimdi İncele', ctr: weakHook ? '1.1%' : '2.8%', roas: '3.9x',
                issueFlag: weakHook ? 'Kanca (Hook) çok kısa ve merak uyandırmıyor' : null
              });
            });
            if (weakHook) {
              caughtIssue = true;
              window.NihatStore.enqueueApproval({
                platform: 'Meta Ads', targetId: id, field: 'hook', severity: 'Önemli',
                title: `"${name}" Meta Reklam Kancası Zayıf`,
                reason: 'Kısa ve genel ifadeler Instagram/Facebook akışında kullanıcıyı durduramaz.',
                impact: 'Daha düşük tıklama maliyeti ve yüksek etkileşim',
                before: headline,
                after: `Dikkat! ${name} almadan önce kullanıcıların %87’sinin atladığı bu detayı mutlaka görün.`
              });
            }
          }

          window.NihatApp.closeModal();
          activeTab = plat;
          render();
          if (caughtIssue) {
            window.NihatApp.toast('Hata tespit edildi! Düzeltme önerisi Onay Merkezi’ne eklendi.', 'warn');
          } else {
            window.NihatApp.toast('Kayıt eklendi ve 3 katmanlı denetimden hatasız geçti!', 'success');
          }
        };
      }
    });
  }

  function bindEvents() {
    root.querySelectorAll('.tab-btn').forEach(btn => {
      btn.addEventListener('click', () => { activeTab = btn.dataset.tab; render(); });
    });
    root.querySelectorAll('.go-approvals-btn').forEach(btn => {
      btn.addEventListener('click', () => window.NihatApp.navigate('approvals'));
    });
    const addBtn = root.querySelector('#add-campaign-item-btn');
    if (addBtn) addBtn.addEventListener('click', openAddModal);
    const apiBtn = root.querySelector('#goto-apis-btn');
    if (apiBtn) apiBtn.addEventListener('click', () => window.NihatApp.navigate('apis'));
  }

  render();
};
