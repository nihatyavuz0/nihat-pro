window.NihatViews = window.NihatViews || {};

window.NihatViews.audience = function (root) {
  const esc = window.NihatApp.esc;

  function render() {
    const s = window.NihatStore.getState();

    root.innerHTML = `
      <div class="stack">
        <section class="card">
          <div class="card-header">
            <div>
              <h2 class="card-title">Derin Hedef Kitle Araştırması ve Alıcı Psikolojisi</h2>
              <p class="card-subtitle">Hedef kitlenizin gerçekte ne istediğini, neden çekindiğini, Google’da ne aradığını ve yapay zekaya hangi soruları sorduğunu ortaya çıkarın.</p>
            </div>
          </div>

          <form id="audience-form" class="grid grid-4 items-end gap-12">
            <div class="field">
              <label>Sektör *</label>
              <input class="input" id="aud-sector" maxlength="100" placeholder="Örn: Moda, Kozmetik, SaaS, Sağlık" required />
            </div>
            <div class="field">
              <label>Ürün / Hizmet *</label>
              <input class="input" id="aud-product" maxlength="100" placeholder="Örn: Cilt Bakım Serumu" required />
            </div>
            <div class="field">
              <label>Hedef Bölge</label>
              <input class="input" id="aud-region" maxlength="80" value="Türkiye" placeholder="Örn: Türkiye / Avrupa" />
            </div>
            <div>
              <button type="submit" class="btn btn-primary btn-lg w-full" id="aud-submit-btn">
                Kitleyi Araştır
              </button>
            </div>
          </form>
        </section>

        <section class="stack">
          ${s.personas.map(p => `
            <article class="card stack">
              <div class="row-between">
                <div>
                  <span class="badge badge-info mb-6">${esc(p.segment)}</span>
                  <h3 class="card-title fs-17">${esc(p.name)}</h3>
                </div>
                <button class="btn btn-ghost btn-sm delete-persona-btn" data-id="${esc(p.id)}" title="Sil">✕</button>
              </div>

              <div class="issue-action-box box-primary-soft">
                <strong class="text-primary">Hedef Kitle Aslında Ne İstiyor?</strong>
                <div class="mt-4">${esc(p.desire)}</div>
              </div>

              <div class="grid grid-2">
                <div class="diff-box diff-before">
                  <div class="diff-label">Acı Noktaları &amp; Satın Alma Korkuları</div>
                  <ul class="mt-6 m-0 pl-18">
                    ${(p.painPoints || []).map(x => `<li>${esc(x)}</li>`).join('')}
                  </ul>
                </div>
                <div class="diff-box diff-after">
                  <div class="diff-label">Satın Aldıran Tetikleyiciler</div>
                  <ul class="mt-6 m-0 pl-18">
                    ${(p.triggers || []).map(x => `<li>${esc(x)}</li>`).join('')}
                  </ul>
                </div>
              </div>

              <div class="grid grid-2">
                <div class="issue-action-box">
                  <strong>Google’da Yazdıkları Aramalar (SEO &amp; Ads)</strong>
                  <div class="row mt-8 gap-6">
                    ${(p.searchQueries || []).map(q => `<span class="badge badge-neutral">${esc(q)}</span>`).join('')}
                  </div>
                </div>
                <div class="issue-action-box">
                  <strong>Yapay Zekaya Sordukları Sorular (GEO)</strong>
                  <ul class="mt-6 m-0 pl-18 fs-13">
                    ${(p.aiPrompts || []).map(q => `<li>${esc(q)}</li>`).join('')}
                  </ul>
                </div>
              </div>

              <div>
                <strong class="block mb-8">Hazır Reklam Hedefleme Planı (Google Ads · Meta · Merchant)</strong>
                <div class="grid grid-3 gap-10">
                  <div class="issue-action-box"><strong>Google Ads:</strong><br/>${esc(p.targeting && p.targeting.googleAds)}</div>
                  <div class="issue-action-box"><strong>Meta Ads:</strong><br/>${esc(p.targeting && p.targeting.metaAds)}</div>
                  <div class="issue-action-box"><strong>Google Merchant:</strong><br/>${esc(p.targeting && p.targeting.merchant)}</div>
                </div>
              </div>

              ${p.aiNotes ? `
                <div>
                  <strong>Canlı Yapay Zeka Derin İçgörüleri</strong>
                  <pre class="code-box prose-pre mt-6">${esc(p.aiNotes)}</pre>
                </div>
              ` : ''}
            </article>
          `).join('')}
        </section>
      </div>
    `;

    bindEvents();
  }

  function bindEvents() {
    const form = root.querySelector('#audience-form');
    if (form) {
      form.addEventListener('submit', async e => {
        e.preventDefault();
        const btn = root.querySelector('#aud-submit-btn');
        btn.disabled = true;
        btn.textContent = 'Araştırılıyor...';
        try {
          const persona = await window.NihatGenerator.researchAudience({
            sector: root.querySelector('#aud-sector').value,
            product: root.querySelector('#aud-product').value,
            region: root.querySelector('#aud-region').value
          });
          window.NihatStore.update(s => s.personas.unshift(persona));
          window.NihatStore.addLog('Hedef Kitle', `"${persona.name}" alıcı personası ve hedefleme planı oluşturuldu.`);
          window.NihatApp.toast('Hedef kitle araştırması tamamlandı!', 'success');
          render();
        } catch (err) {
          window.NihatApp.toast(err.message || 'Araştırma hatası', 'error');
          btn.disabled = false;
          btn.textContent = 'Kitleyi Araştır';
        }
      });
    }

    root.querySelectorAll('.delete-persona-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const target = window.NihatStore.getState().personas.find(p => p.id === btn.dataset.id);
        const ok = await window.NihatApp.confirm({
          eyebrow: 'Hedef Kitle',
          title: 'Persona Kaydını Kaldır',
          message: `"${target ? target.name : 'Bu persona'}" kaydını listeden kaldırmak istediğinize emin misiniz?`,
          confirmLabel: 'Kaldır',
          cancelLabel: 'Vazgeç',
          tone: 'rose',
          confirmClass: 'btn-soft-rose'
        });
        if (!ok) return;
        window.NihatStore.update(s => {
          s.personas = s.personas.filter(p => p.id !== btn.dataset.id);
        });
        window.NihatApp.toast('Persona kaydı kaldırıldı.', 'info');
        render();
      });
    });
  }

  render();
};
