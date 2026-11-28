window.NihatViews = window.NihatViews || {};

window.NihatViews.competitors = function (root) {
  const esc = window.NihatApp.esc;
  const num = window.NihatApp.num;

  function render() {
    const s = window.NihatStore.getState();
    const mySeo = Math.round(num(s.metrics.seoScore, 0, 100, 80));
    const myGeo = Math.round(num(s.metrics.geoScore, 0, 100, 75));

    root.innerHTML = `
      <div class="stack">
        <section class="card">
          <div class="card-header">
            <div>
              <h2 class="card-title">Rakip Analizi ve Fırsat İstihbaratı</h2>
              <p class="card-subtitle">Rakiplerinizin web sitesini, SEO &amp; GEO gücünü, Google Ads / Merchant / Meta Ads stratejilerini ve zayıf noktalarını analiz edin.</p>
            </div>
          </div>

          <form id="add-comp-form" class="grid grid-3 items-end gap-12">
            <div class="field">
              <label>Rakip Marka Adı *</label>
              <input class="input" id="comp-name" maxlength="120" placeholder="Örn: Rakip Marka X" required />
            </div>
            <div class="field">
              <label>Rakip Web Sitesi URL *</label>
              <input class="input" id="comp-url" maxlength="256" placeholder="https://rakipsite.com" required />
            </div>
            <div>
              <button type="submit" class="btn btn-primary btn-lg w-full" id="comp-submit-btn">
                Rakibi 3x Analiz Et &amp; Ekle
              </button>
            </div>
          </form>
        </section>

        <section class="card">
          <div class="card-header">
            <div>
              <h3 class="card-title">Sizin Markanız vs Rakipler (Hızlı Kıyaslama)</h3>
              <p class="card-subtitle">SEO ve Yapay Zeka (GEO) skorlarında rakiplerinizin neresindesiniz?</p>
            </div>
          </div>
          <div class="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Marka</th>
                  <th>SEO Gücü</th>
                  <th>GEO (AI) Gücü</th>
                  <th>En Büyük Zayıflık</th>
                  <th>Kazanma Fırsatınız</th>
                </tr>
              </thead>
              <tbody>
                <tr class="row-highlight">
                  <td><strong>${esc(s.brand.name)} (SİZ)</strong></td>
                  <td><span class="badge badge-info">${mySeo}/100</span></td>
                  <td><span class="badge badge-success">${myGeo}/100</span></td>
                  <td>${s.approvals.length > 0 ? `${s.approvals.length} onay bekleyen düzeltme` : 'Kritik hata yok'}</td>
                  <td>Onaylı düzeltmeleri tamamlayıp GEO içerikleriyle öne geçin.</td>
                </tr>
                ${s.competitors.map(c => {
                  const cSeo = Math.round(num(c.seoScore, 0, 100, 0));
                  const cGeo = Math.round(num(c.geoScore, 0, 100, 0));
                  return `
                    <tr>
                      <td>
                        <strong>${esc(c.name)}</strong>
                        <div class="mono fs-11 text-muted">${esc(c.url)}</div>
                      </td>
                      <td><span class="badge ${cSeo > mySeo ? 'badge-warn' : 'badge-success'}">${cSeo}/100</span></td>
                      <td><span class="badge ${cGeo > myGeo ? 'badge-warn' : 'badge-success'}">${cGeo}/100</span></td>
                      <td class="fs-12-5">${esc(c.weakness)}</td>
                      <td class="fs-12-5 text-emerald fw-600">${esc(c.opportunity)}</td>
                    </tr>
                  `;
                }).join('')}
              </tbody>
            </table>
          </div>
        </section>

        <section class="grid grid-2">
          ${s.competitors.map(c => {
            const cSeo = Math.round(num(c.seoScore, 0, 100, 0));
            const cGeo = Math.round(num(c.geoScore, 0, 100, 0));
            return `
              <article class="card stack-sm">
                <div class="row-between">
                  <div>
                    <h3 class="card-title">${esc(c.name)}</h3>
                    <div class="mono fs-12 text-muted">${esc(c.url)}</div>
                  </div>
                  <div class="row gap-6">
                    <span class="badge badge-info">SEO ${cSeo}</span>
                    <span class="badge badge-success">GEO ${cGeo}</span>
                    <button class="btn btn-ghost btn-sm delete-comp-btn" data-id="${esc(c.id)}" title="Sil">✕</button>
                  </div>
                </div>

                <div class="issue-action-box"><strong>Google Ads Stratejisi:</strong> ${esc(c.googleAdsStrategy)}</div>
                <div class="issue-action-box"><strong>Google Merchant Stratejisi:</strong> ${esc(c.merchantStrategy)}</div>
                <div class="issue-action-box"><strong>Meta Ads Stratejisi:</strong> ${esc(c.metaStrategy)}</div>

                <div class="diff-grid">
                  <div class="diff-box diff-before">
                    <div class="diff-label">Rakibin Açığı</div>
                    ${esc(c.weakness)}
                  </div>
                  <div class="diff-box diff-after">
                    <div class="diff-label">Sizin Hamleniz</div>
                    ${esc(c.opportunity)}
                  </div>
                </div>
              </article>
            `;
          }).join('')}
        </section>
      </div>
    `;

    bindEvents();
  }

  function bindEvents() {
    const form = root.querySelector('#add-comp-form');
    if (form) {
      form.addEventListener('submit', async e => {
        e.preventDefault();
        const name = root.querySelector('#comp-name').value.trim();
        const url = root.querySelector('#comp-url').value.trim();
        const btn = root.querySelector('#comp-submit-btn');
        btn.disabled = true;
        btn.textContent = 'Rakip Taranıyor...';

        try {
          const comp = await window.NihatGenerator.analyzeCompetitor(name, url);
          window.NihatStore.update(s => s.competitors.unshift(comp));
          window.NihatStore.addLog('Rakip Analizi', `${comp.name} analiz edildi (SEO: ${comp.seoScore}, GEO: ${comp.geoScore}).`);
          window.NihatApp.toast(`${comp.name} rakip analizi tamamlandı!`, 'success');
          render();
        } catch (err) {
          window.NihatApp.toast(err.message || 'Rakip analizi başarısız', 'error');
          btn.disabled = false;
          btn.textContent = 'Rakibi 3x Analiz Et & Ekle';
        }
      });
    }

    root.querySelectorAll('.delete-comp-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const target = window.NihatStore.getState().competitors.find(c => c.id === btn.dataset.id);
        const ok = await window.NihatApp.confirm({
          eyebrow: 'Rakip Listesi',
          title: 'Rakip Kaydını Kaldır',
          message: `"${target ? target.name : 'Bu rakip'}" analiz kaydını listeden kaldırmak istediğinize emin misiniz?`,
          confirmLabel: 'Kaldır',
          cancelLabel: 'Vazgeç',
          tone: 'rose',
          confirmClass: 'btn-soft-rose'
        });
        if (!ok) return;
        window.NihatStore.update(s => {
          s.competitors = s.competitors.filter(c => c.id !== btn.dataset.id);
        });
        window.NihatApp.toast('Rakip kaydı kaldırıldı.', 'info');
        render();
      });
    });
  }

  render();
};
