window.NihatViews = window.NihatViews || {};

window.NihatViews.content = function (root) {
  const esc = window.NihatApp.esc;
  let lastResult = window.NihatStore.getState().contents[0] || null;

  function render() {
    const s = window.NihatStore.getState();

    root.innerHTML = `
      <div class="stack">
        <section class="grid grid-asymmetric">
          <div class="card">
            <div class="card-header">
              <div>
                <h2 class="card-title">Güçlü Başlık, Açıklama, Reklam ve SEO/GEO Blog Üreticisi</h2>
                <p class="card-subtitle">Her içerik karakter sınırı, tıklama psikolojisi (CTR), SEO ve yapay zeka alıntı (GEO) kurallarına göre 3 kez kontrol edilerek üretilir.</p>
              </div>
            </div>

            <form id="content-gen-form" class="stack-sm">
              <div class="grid grid-2">
                <div class="field">
                  <label>Üretim Kanalı</label>
                  <select class="select" id="cg-channel">
                    <option value="google_ads">Google Ads (Başlık 30k + Açıklama 90k + Uzantı)</option>
                    <option value="google_merchant">Google Merchant (SEO + AI Shopping Ürün Başlık/Açıklama)</option>
                    <option value="meta_ads">Meta Ads (Durdurucu Hook + Ana Metin + Reels Senaryosu)</option>
                    <option value="seo_geo_blog">SEO &amp; GEO Blog Makalesi (+ FAQPage JSON-LD Şema)</option>
                  </select>
                </div>
                <div class="field">
                  <label>Ton ve Yaklaşım</label>
                  <select class="select" id="cg-tone">
                    <option value="Güvenilir, net ve dönüşüm odaklı">Güvenilir ve Dönüşüm Odaklı</option>
                    <option value="Aciliyet ve fırsat vurgulu">Aciliyet ve Fırsat Odaklı</option>
                    <option value="Premium ve uzman otorite dili">Premium &amp; Uzman Otorite</option>
                    <option value="Samimi ve akıcı sosyal medya dili">Samimi &amp; Sosyal Medya Odaklı</option>
                  </select>
                </div>
              </div>

              <div class="grid grid-2">
                <div class="field">
                  <label>Ürün / Hizmet / Konu *</label>
                  <input class="input" id="cg-product" maxlength="140" placeholder="Örn: Ortopedik Günlük Koşu Ayakkabısı" required />
                </div>
                <div class="field">
                  <label>Ana Anahtar Kelime</label>
                  <input class="input" id="cg-keyword" maxlength="100" placeholder="Örn: ortopedik spor ayakkabı" />
                </div>
              </div>

              <div class="grid grid-2">
                <div class="field">
                  <label>Hedef Kitle</label>
                  <input class="input" id="cg-audience" maxlength="140" placeholder="Örn: Gün boyu ayakta çalışan profesyoneller" />
                </div>
                <div class="field">
                  <label>Güçlü Fırsat / Teklif</label>
                  <input class="input" id="cg-offer" maxlength="140" placeholder="Örn: Aynı Gün Ücretsiz Kargo &amp; 30 Gün İade" />
                </div>
              </div>

              <div class="row mt-6">
                <button type="submit" class="btn btn-primary btn-lg" id="cg-submit-btn">
                  3x Doğrulamalı İçerik Üret
                </button>
                <span class="fs-12 text-muted">
                  ${(s.apis.gemini.connected || s.apis.openai.connected) ? 'Sunucu kasasındaki canlı AI bağlantısı kullanılacak' : 'NİHAT PRO Yerel Uzman Motoru aktif'}
                </span>
              </div>
            </form>
          </div>

          <div class="card">
            <div class="card-header">
              <div>
                <h3 class="card-title">Son Üretilen İçerikler (${s.contents.length})</h3>
                <p class="card-subtitle">Kayıtlı taslaklarınızı tek tıkla tekrar açın.</p>
              </div>
            </div>
            ${s.contents.length === 0 ? `
              <div class="empty-state p-empty-sm">
                Henüz kayıtlı içerik yok. Soldaki formdan saniyeler içinde ilk güçlü içeriğinizi üretin.
              </div>
            ` : `
              <div class="stack-sm">
                ${s.contents.slice(0, 6).map((c, idx) => `
                  <button class="issue-action-box saved-item-btn open-saved-content" data-idx="${idx}">
                    <div class="fw-700 fs-13">${esc(c.title)}</div>
                    <div class="fs-11-5 text-muted mt-2">
                      ${esc(c.aiProvider)} · ${esc(new Date(c.createdAt).toLocaleString('tr-TR', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' }))}
                    </div>
                  </button>
                `).join('')}
              </div>
            `}
          </div>
        </section>

        ${lastResult ? renderResultCard(lastResult) : ''}
      </div>
    `;

    bindEvents();
  }

  function renderResultCard(res) {
    let bodyHtml = '';

    if (res.channel === 'google_ads') {
      bodyHtml = `
        <div class="grid grid-2">
          <div class="stack-sm">
            <strong>Yüksek Tıklamalı Başlıklar (Max 30 Karakter)</strong>
            ${(res.headlines || []).map(h => {
              const s = String(h || '');
              return `
                <div class="row-between issue-action-box">
                  <span><strong>${esc(s)}</strong></span>
                  <span class="badge ${s.length <= 30 ? 'badge-success' : 'badge-danger'}">${s.length}/30</span>
                </div>
              `;
            }).join('')}
          </div>
          <div class="stack-sm">
            <strong>Dönüşüm Odaklı Açıklamalar (Max 90 Karakter)</strong>
            ${(res.descriptions || []).map(d => {
              const s = String(d || '');
              return `
                <div class="issue-action-box">
                  <div>${esc(s)}</div>
                  <div class="mt-4"><span class="badge badge-success">${s.length}/90 kar.</span></div>
                </div>
              `;
            }).join('')}
            <strong class="mt-6">Site Bağlantısı (Sitelink) Önerileri</strong>
            <div class="row">${(res.sitelinks || []).map(sl => `<span class="badge badge-info">${esc(sl)}</span>`).join('')}</div>
          </div>
        </div>
      `;
    } else if (res.channel === 'google_merchant') {
      bodyHtml = `
        <div class="stack-sm">
          <strong>Optimize Ürün Başlık Alternatifleri (SEO + AI Shopping)</strong>
          ${(res.titles || []).map((t, i) => {
            const s = String(t || '');
            return `
              <div class="issue-action-box">
                <div class="row-between">
                  <strong>Seçenek ${i + 1}</strong>
                  <span class="badge badge-success">${s.length}/150 kar.</span>
                </div>
                <div class="mt-4">${esc(s)}</div>
              </div>
            `;
          }).join('')}
          <strong class="mt-8">Zengin Ürün Açıklaması</strong>
          <div class="issue-action-box">${esc(res.description)}</div>
        </div>
      `;
    } else if (res.channel === 'meta_ads') {
      bodyHtml = `
        <div class="grid grid-2">
          <div class="stack-sm">
            <strong>Durdurucu İlk Cümleler (3x Hook Varyasyonu)</strong>
            ${(res.hooks || []).map((h, i) => `<div class="issue-action-box"><strong>Hook ${i + 1}:</strong> ${esc(h)}</div>`).join('')}
            <strong class="mt-6">Reklam Başlıkları &amp; CTA</strong>
            ${(res.headlines || []).map(h => `<div class="issue-action-box">${esc(h)}</div>`).join('')}
            <div><span class="badge badge-info">CTA: ${esc(res.cta)}</span></div>
          </div>
          <div class="stack-sm">
            <strong>Ana Reklam Metni (Primary Text)</strong>
            <pre class="code-box prose-pre">${esc(res.primaryText)}</pre>
            <strong>15 Saniyelik Reels / Video Senaryosu</strong>
            ${(res.reelsScript || []).map(step => `<div class="issue-action-box">${esc(step)}</div>`).join('')}
          </div>
        </div>
      `;
    } else {
      const mt = String(res.metaTitle || '');
      const md = String(res.metaDesc || '');
      bodyHtml = `
        <div class="stack">
          <div class="grid grid-2">
            <div class="issue-action-box">
              <div class="fs-11 fw-700 text-muted">META BAŞLIK (${mt.length}/60)</div>
              <strong>${esc(mt)}</strong>
            </div>
            <div class="issue-action-box">
              <div class="fs-11 fw-700 text-muted">META AÇIKLAMA (${md.length}/155)</div>
              <div>${esc(md)}</div>
            </div>
          </div>
          <div>
            <strong>SEO &amp; GEO Yapılandırılmış Blog Makalesi</strong>
            <pre class="code-box prose-pre mt-6">${esc(res.blogBody)}</pre>
          </div>
          <div>
            <strong>Hazır FAQPage JSON-LD Yapısal Veri Kodu</strong>
            <pre class="code-box mt-6">${esc(res.faqJsonLd)}</pre>
          </div>
        </div>
      `;
    }

    return `
      <section class="card">
        <div class="row-between mb-14">
          <div>
            <div class="row gap-6 mb-4">
              <span class="badge badge-success">✓ 3 Katmanlı Doğrulamadan Geçti</span>
              <span class="badge badge-info">${esc(res.aiProvider)}</span>
            </div>
            <h3 class="card-title">${esc(res.title)}</h3>
          </div>
          <button class="btn btn-secondary btn-sm" id="copy-full-content-btn">Tüm Çıktıyı Kopyala</button>
        </div>

        <div class="passes-strip mb-16">
          ${(res.checks || []).map(ch => `
            <div class="pass-card done">
              <div class="pass-title"><span>${esc(ch.label)}</span><span class="badge badge-success">✓</span></div>
              <p class="pass-summary">${esc(ch.detail)}</p>
            </div>
          `).join('')}
        </div>

        ${bodyHtml}

        ${res.aiRaw ? `
          <div class="mt-16">
            <strong>Canlı AI Ek Üretimi (${esc(res.aiProvider)})</strong>
            <pre class="code-box prose-pre mt-6">${esc(res.aiRaw)}</pre>
          </div>
        ` : ''}
      </section>
    `;
  }

  function bindEvents() {
    const form = root.querySelector('#content-gen-form');
    if (form) {
      form.addEventListener('submit', async e => {
        e.preventDefault();
        const btn = root.querySelector('#cg-submit-btn');
        btn.disabled = true;
        btn.textContent = '3 Katmanlı Üretiliyor...';

        try {
          const result = await window.NihatGenerator.generateContent({
            channel: root.querySelector('#cg-channel').value,
            tone: root.querySelector('#cg-tone').value,
            product: root.querySelector('#cg-product').value,
            keyword: root.querySelector('#cg-keyword').value,
            audience: root.querySelector('#cg-audience').value,
            offer: root.querySelector('#cg-offer').value
          });
          lastResult = result;
          window.NihatStore.update(s => {
            s.contents.unshift(result);
            if (s.contents.length > 80) s.contents.length = 80;
          });
          window.NihatStore.addLog('İçerik Üretimi', `"${result.title}" 3 kez doğrulanarak üretildi.`);
          window.NihatApp.toast('İçerik üretildi ve 3 katmanlı doğrulamadan geçti!', 'success');
          render();
        } catch (err) {
          window.NihatApp.toast(err.message || 'Üretim hatası', 'error');
          btn.disabled = false;
          btn.textContent = '3x Doğrulamalı İçerik Üret';
        }
      });
    }

    root.querySelectorAll('.open-saved-content').forEach(btn => {
      btn.addEventListener('click', () => {
        const st = window.NihatStore.getState();
        lastResult = st.contents[parseInt(btn.dataset.idx, 10)];
        render();
      });
    });

    const copyBtn = root.querySelector('#copy-full-content-btn');
    if (copyBtn && lastResult) {
      copyBtn.addEventListener('click', () => {
        const text = JSON.stringify(lastResult, null, 2);
        navigator.clipboard.writeText(lastResult.blogBody || lastResult.primaryText || (lastResult.headlines ? lastResult.headlines.join('\n') + '\n\n' + lastResult.descriptions.join('\n') : text))
          .then(() => window.NihatApp.toast('İçerik panoya kopyalandı!', 'success'));
      });
    }
  }

  render();
};
