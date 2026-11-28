window.NihatViews = window.NihatViews || {};

window.NihatViews['site-audit'] = function (root) {
  const s = window.NihatStore.getState();
  const esc = window.NihatApp.esc;
  const num = window.NihatApp.num;
  let activeAudit = s.siteAudits[0] || null;
  let activeTab = 'issues';

  function scoreMeta(val) {
    const v = Math.round(num(val, 0, 100, 0));
    if (v >= 80) return { stroke: '#52A886', toneCls: 'tone-emerald' };
    if (v >= 60) return { stroke: '#CFA256', toneCls: 'tone-amber' };
    return { stroke: '#CF6F6F', toneCls: 'tone-rose' };
  }

  function scoreVerdict(val) {
    const v = Math.round(num(val, 0, 100, 0));
    if (v >= 85) return { text: 'Çok Güçlü', cls: 'badge-success' };
    if (v >= 70) return { text: 'İyi (Geliştirilebilir)', cls: 'badge-info' };
    if (v >= 50) return { text: 'Orta — Hatalar Var', cls: 'badge-warn' };
    return { text: 'Zayıf — Acil Düzeltme Gerekir', cls: 'badge-danger' };
  }

  function renderRing(score, label) {
    const safeScore = Math.round(num(score, 0, 100, 0));
    const r = 38;
    const c = 2 * Math.PI * r;
    const offset = c - (safeScore / 100) * c;
    const meta = scoreMeta(safeScore);
    return `
      <div class="score-ring">
        <svg viewBox="0 0 92 92">
          <circle cx="46" cy="46" r="${r}" fill="none" stroke="var(--surface-2)" stroke-width="8"></circle>
          <circle cx="46" cy="46" r="${r}" fill="none" stroke="${meta.stroke}" stroke-width="8" stroke-linecap="round"
            stroke-dasharray="${c.toFixed(1)}" stroke-dashoffset="${offset.toFixed(1)}"></circle>
        </svg>
        <div class="score-ring-val ${meta.toneCls}">
          <span>${safeScore}</span>
          <small>${esc(label)}</small>
        </div>
      </div>
    `;
  }

  function render() {
    const state = window.NihatStore.getState();
    if (!activeAudit && state.siteAudits.length > 0) activeAudit = state.siteAudits[0];

    root.innerHTML = `
      <div class="stack">
        <section class="card">
          <div class="card-header mb-14">
            <div>
              <h2 class="card-title">Web Sitesi SEO &amp; GEO Analiz ve Test Merkezi</h2>
              <p class="card-subtitle">Site linkinizi girin; NİHAT PRO sitenizi 3 katmanlı olarak tarasın, SEO ve yapay zeka (GEO) gücünü ölçsün ve hataları basit maddeler halinde listelesin.</p>
            </div>
            <span class="badge ${window.NihatStore.isServerOnline() ? 'badge-success' : 'badge-warn'}">
              ${window.NihatStore.isServerOnline() ? 'Canlı Site Tarama Motoru Aktif' : 'Yerel Sunucu Kapalı'}
            </span>
          </div>

          <form id="site-audit-form" class="row gap-10 items-stretch">
            <input type="text" id="audit-url-input" class="input flex-1 min-w-0"
              placeholder="https://siteniz.com veya ornek.com.tr"
              value="${esc(window.NihatApp.pendingAuditUrl || (activeAudit ? activeAudit.url : ''))}" />
            <button type="submit" class="btn btn-primary btn-lg" id="audit-submit-btn">
              <span>3 Katmanlı Analizi Başlat</span>
            </button>
          </form>

          <div class="row mt-10 gap-8">
            <span class="fs-12 text-muted">Hızlı test örnekleri:</span>
            <button type="button" class="btn btn-ghost btn-sm sample-url-btn" data-url="https://example.com">example.com</button>
            <button type="button" class="btn btn-ghost btn-sm sample-url-btn" data-url="https://tr.wikipedia.org/wiki/Arama_motoru_optimizasyonu">Wikipedia SEO</button>
            <button type="button" class="btn btn-ghost btn-sm sample-url-btn" data-url="https://www.apple.com/tr/">apple.com/tr</button>
          </div>

          <div id="audit-progress-box" class="hidden audit-progress-panel">
            <div class="row gap-10">
              <div class="spinner dark"></div>
              <strong id="audit-progress-text" class="text-primary">Analiz başlatılıyor...</strong>
            </div>
          </div>
        </section>

        ${activeAudit ? renderResults(activeAudit, state.siteAudits) : `
          <section class="card empty-state">
            <h3 class="m-0 mb-6 text-main">Henüz bir web sitesi test edilmedi</h3>
            <p class="m-0 max-w-520">
              Yukarıya kendi sitenizin veya rakibinizin linkini yapıştırın. NİHAT PRO sayfa başlıklarını, meta açıklamalarını, hızını, H1-H3 yapısını, Schema (JSON-LD) verilerini, robots.txt AI bot izinlerini ve llms.txt dosyasını inceleyip sade Türkçe ile raporlar.
            </p>
          </section>
        `}
      </div>
    `;

    bindEvents();
  }

  function renderResults(audit, allAudits) {
    const seoScore = Math.round(num(audit.scores && audit.scores.seo, 0, 100, 0));
    const geoScore = Math.round(num(audit.scores && audit.scores.geo, 0, 100, 0));
    const overallScore = Math.round(num(audit.scores && audit.scores.overall, 0, 100, 0));
    const respMs = Math.round(num(audit.responseMs, 0, 999999, 0));
    const issues = Array.isArray(audit.issues) ? audit.issues : [];
    const passes = Array.isArray(audit.passes) ? audit.passes : [];

    const seoV = scoreVerdict(seoScore);
    const geoV = scoreVerdict(geoScore);
    const overallV = scoreVerdict(overallScore);
    const kritikCount = issues.filter(i => i.severity === 'Kritik').length;
    const onemliCount = issues.filter(i => i.severity === 'Önemli').length;

    return `
      ${audit.offlineNotice ? `
        <div class="card box-amber-soft">
          <strong class="text-amber">Bilgi:</strong> ${esc(audit.offlineNotice)}
        </div>
      ` : ''}

      <section class="grid grid-3">
        <div class="card">
          <div class="score-ring-wrap">
            ${renderRing(seoScore, 'SEO')}
            <div>
              <div class="fs-12 fw-700 text-muted">SEO UYUMLULUK GÜCÜ</div>
              <div class="mt-4 mb-6"><span class="badge ${seoV.cls}">${esc(seoV.text)}</span></div>
              <div class="fs-12-5 text-sec">Google arama sıralaması, teknik etiketler, hız ve mobil uyum.</div>
            </div>
          </div>
        </div>

        <div class="card">
          <div class="score-ring-wrap">
            ${renderRing(geoScore, 'GEO')}
            <div>
              <div class="fs-12 fw-700 text-muted">GEO (YAPAY ZEKA) GÜCÜ</div>
              <div class="mt-4 mb-6"><span class="badge ${geoV.cls}">${esc(geoV.text)}</span></div>
              <div class="fs-12-5 text-sec">ChatGPT, Perplexity, Gemini ve Google AI Overviews görünürlüğü.</div>
            </div>
          </div>
        </div>

        <div class="card">
          <div class="score-ring-wrap">
            ${renderRing(overallScore, 'GENEL')}
            <div>
              <div class="fs-12 fw-700 text-muted">TOPLAM SİTE GÜCÜ</div>
              <div class="mt-4 mb-6"><span class="badge ${overallV.cls}">${esc(overallV.text)}</span></div>
              <div class="fs-12-5 text-sec">
                <span class="mono">${esc(audit.domain)}</span> · ${respMs} ms · ${issues.length} bulgu
              </div>
            </div>
          </div>
        </div>
      </section>

      <section class="passes-strip">
        ${passes.map(p => `
          <div class="pass-card done">
            <div class="pass-title">
              <span>${esc(p.name)}</span>
              <span class="badge badge-success">✓ ${esc(p.status)}</span>
            </div>
            <p class="pass-summary">${esc(p.summary)}</p>
          </div>
        `).join('')}
      </section>

      <section class="card">
        <div class="row-between mb-18">
          <div class="tabs">
            <button class="tab-btn ${activeTab === 'issues' ? 'active' : ''}" data-tab="issues">
              Basit Hata Listesi (${issues.length})
            </button>
            <button class="tab-btn ${activeTab === 'metrics' ? 'active' : ''}" data-tab="metrics">
              Teknik Detaylar
            </button>
            <button class="tab-btn ${activeTab === 'snippets' ? 'active' : ''}" data-tab="snippets">
              Hazır Düzeltme Kodları
            </button>
            <button class="tab-btn ${activeTab === 'history' ? 'active' : ''}" data-tab="history">
              Geçmiş Testler (${allAudits.length})
            </button>
          </div>

          ${issues.length > 0 ? `
            <button class="btn btn-emerald btn-sm" id="queue-all-site-issues">
              Tüm Hataları Onay &amp; Düzeltme Merkezine Gönder
            </button>
          ` : ''}
        </div>

        ${activeTab === 'issues' ? renderIssuesTab(issues, kritikCount, onemliCount) : ''}
        ${activeTab === 'metrics' ? renderMetricsTab(audit) : ''}
        ${activeTab === 'snippets' ? renderSnippetsTab(audit) : ''}
        ${activeTab === 'history' ? renderHistoryTab(allAudits) : ''}
      </section>
    `;
  }

  function renderIssuesTab(issues, kritikCount, onemliCount) {
    if (issues.length === 0) {
      return `
        <div class="empty-state">
          <div class="fs-32 text-emerald mb-6">✓</div>
          <strong class="text-main">Harika! Bu sayfada kritik bir SEO veya GEO hatası bulunmadı.</strong>
          <p class="mt-6">Tüm başlıklar, açıklamalar, yapısal veriler ve yapay zeka uyumluluk sinyalleri çok iyi durumda.</p>
        </div>
      `;
    }

    return `
      <div class="summary-banner">
        <strong>Özet:</strong> Sitenizde <strong>${kritikCount} kritik</strong>, <strong>${onemliCount} önemli</strong> ve toplam <strong>${issues.length}</strong> düzeltilebilir nokta bulundu. Aşağıda hepsi teknik karmaşa olmadan basit maddeler halinde sıralanmıştır:
      </div>
      <div class="stack-sm">
        ${issues.map((iss, idx) => {
          const sevClass = iss.severity === 'Kritik' ? 'sev-kritik' : (iss.severity === 'Önemli' ? 'sev-onemli' : 'sev-iyilestirme');
          const badgeCls = iss.severity === 'Kritik' ? 'badge-danger' : (iss.severity === 'Önemli' ? 'badge-warn' : 'badge-info');
          return `
            <div class="issue-item ${sevClass}">
              <div class="issue-head">
                <div>
                  <div class="row gap-6 mb-4">
                    <span class="badge badge-neutral">#${idx + 1}</span>
                    <span class="badge ${badgeCls}">${esc(iss.severity)}</span>
                    <span class="badge badge-info">${esc(iss.category)}</span>
                    <span class="badge badge-success">3x Doğrulandı</span>
                  </div>
                  <div class="issue-title">${esc(iss.title)}</div>
                </div>
                <button class="btn btn-soft-primary btn-sm send-issue-approval" data-idx="${idx}">
                  Onay Kuyruğuna Gönder
                </button>
              </div>
              <p class="issue-explain"><strong>Neden sorun?</strong> ${esc(iss.explain)}</p>
              <div class="issue-action-box">
                <strong>Basit Çözüm:</strong> ${esc(iss.action)}
              </div>
            </div>
          `;
        }).join('')}
      </div>
    `;
  }

  function renderMetricsTab(audit) {
    const m = audit.metrics || {};
    const httpStatus = Math.round(num(audit.httpStatus, 0, 999, 0));
    const respMs = Math.round(num(audit.responseMs, 0, 999999, 0));
    const rows = [
      ['Taranan URL', audit.url, httpStatus === 200 ? 'HTTP 200 OK' : `HTTP ${httpStatus}`],
      ['Güvenli Bağlantı (HTTPS)', m.isHttps ? 'Aktif' : 'Yok', m.isHttps ? 'Uygun' : 'Kritik'],
      ['Sunucu Yanıt Hızı', `${respMs} ms`, respMs < 1200 ? 'Hızlı' : 'Yavaş'],
      ['Sayfa Başlığı (<title>)', m.title || '(Bulunamadı)', `${Math.round(num(m.titleLength, 0, 9999, 0))} karakter`],
      ['Meta Açıklama', m.metaDescription || '(Bulunamadı)', `${Math.round(num(m.metaDescriptionLength, 0, 9999, 0))} karakter`],
      ['H1 Ana Başlık Sayısı', `${Math.round(num(m.h1Count, 0, 999, 0))} adet ${m.h1Samples && m.h1Samples[0] ? '— "' + m.h1Samples[0] + '"' : ''}`, m.h1Count === 1 ? 'İdeal' : 'Kontrol Et'],
      ['H2 / H3 Alt Başlıklar', `${Math.round(num(m.h2Count, 0, 999, 0))} H2 · ${Math.round(num(m.h3Count, 0, 999, 0))} H3 (${Math.round(num(m.questionHeadings, 0, 999, 0))} soru başlığı)`, m.questionHeadings > 0 ? 'GEO Uyumlu' : 'Soru Başlığı Ekle'],
      ['İçerik Uzunluğu', `${Math.round(num(m.wordCount, 0, 999999, 0))} kelime · ${Math.round(num(m.listCount, 0, 999, 0))} liste · ${Math.round(num(m.tableCount, 0, 999, 0))} tablo`, m.wordCount >= 400 ? 'Yeterli' : 'Kısa'],
      ['Görseller & Alt Etiket', `${Math.round(num(m.imageCount, 0, 9999, 0))} görsel (${Math.round(num(m.imagesMissingAlt, 0, 9999, 0))} adet alt eksik)`, m.imagesMissingAlt === 0 ? 'Tam' : 'Eksik Var'],
      ['Yapısal Veri (JSON-LD Schema)', Array.isArray(m.schemaTypes) && m.schemaTypes.length ? m.schemaTypes.join(', ') : 'Bulunamadı', Array.isArray(m.schemaTypes) && m.schemaTypes.length ? 'Var' : 'Eksik'],
      ['robots.txt & sitemap.xml', `robots.txt: ${m.hasRobotsTxt ? 'Var' : 'Yok'} · sitemap.xml: ${m.hasSitemap ? 'Var' : 'Yok'}`, (m.hasRobotsTxt && m.hasSitemap) ? 'Tam' : 'Eksik'],
      ['GEO Yapay Zeka Dosyası (llms.txt)', m.hasLlmsTxt ? 'Mevcut' : 'Bulunamadı', m.hasLlmsTxt ? 'Mükemmel' : 'Eklenmeli'],
      ['Engellenen Yapay Zeka Botları', Array.isArray(m.blockedAiBots) && m.blockedAiBots.length ? m.blockedAiBots.join(', ') : 'Yok (Tüm AI botlara açık)', !Array.isArray(m.blockedAiBots) || m.blockedAiBots.length === 0 ? 'Açık' : 'Engelli!']
    ];

    return `
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th class="th-w-240">Kontrol Noktası</th>
              <th>Tespit Edilen Değer</th>
              <th class="th-w-150">Durum</th>
            </tr>
          </thead>
          <tbody>
            ${rows.map(r => `
              <tr>
                <td><strong>${esc(r[0])}</strong></td>
                <td class="word-break">${esc(r[1])}</td>
                <td><span class="badge badge-neutral">${esc(r[2])}</span></td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;
  }

  function renderSnippetsTab(audit) {
    const snip = audit.readySnippets || window.NihatAnalyzer.buildFixSnippets(audit);
    return `
      <div class="stack">
        <div>
          <div class="row-between mb-8">
            <strong>1. Optimize Edilmiş SEO &amp; Sosyal Medya (&lt;head&gt;) Kodları</strong>
            <button class="btn btn-secondary btn-sm copy-snippet-btn" data-target="snip-meta">Kopyala</button>
          </div>
          <pre class="code-box" id="snip-meta">${esc(snip.metaHtml)}</pre>
        </div>
        <div>
          <div class="row-between mb-8">
            <strong>2. Yapay Zeka (GEO) &amp; Google Uyumlu JSON-LD Şema Kodu</strong>
            <button class="btn btn-secondary btn-sm copy-snippet-btn" data-target="snip-schema">Kopyala</button>
          </div>
          <pre class="code-box" id="snip-schema">${esc(snip.jsonLd)}</pre>
        </div>
        <div>
          <div class="row-between mb-8">
            <strong>3. Site Ana Dizinine Eklenecek /llms.txt Dosyası</strong>
            <button class="btn btn-secondary btn-sm copy-snippet-btn" data-target="snip-llms">Kopyala</button>
          </div>
          <pre class="code-box" id="snip-llms">${esc(snip.llmsTxt)}</pre>
        </div>
      </div>
    `;
  }

  function renderHistoryTab(allAudits) {
    return `
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Tarih</th>
              <th>Web Sitesi</th>
              <th>SEO</th>
              <th>GEO</th>
              <th>Hata Sayısı</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            ${allAudits.map((a, idx) => `
              <tr>
                <td class="mono fs-12">${esc(new Date(a.analyzedAt).toLocaleString('tr-TR'))}</td>
                <td><strong>${esc(a.domain)}</strong><div class="fs-11-5 text-muted">${esc(a.url)}</div></td>
                <td><span class="badge badge-info">${Math.round(num(a.scores && a.scores.seo, 0, 100, 0))}/100</span></td>
                <td><span class="badge badge-success">${Math.round(num(a.scores && a.scores.geo, 0, 100, 0))}/100</span></td>
                <td>${Array.isArray(a.issues) ? a.issues.length : 0} bulgu</td>
                <td><button class="btn btn-secondary btn-sm open-history-audit" data-idx="${idx}">Raporu Aç</button></td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;
  }

  async function runAudit(url) {
    const progressBox = root.querySelector('#audit-progress-box');
    const progressText = root.querySelector('#audit-progress-text');
    const submitBtn = root.querySelector('#audit-submit-btn');

    progressBox.classList.remove('hidden');
    submitBtn.disabled = true;

    try {
      const result = await window.NihatAnalyzer.analyzeWebsite(url, (stage, msg) => {
        progressText.textContent = msg;
      });
      activeAudit = result;
      activeTab = 'issues';

      window.NihatStore.update(st => {
        st.siteAudits.unshift(result);
        if (st.siteAudits.length > 60) st.siteAudits.length = 60;
        st.metrics.seoScore = result.scores.seo;
        st.metrics.geoScore = result.scores.geo;
      });
      window.NihatStore.addLog(
        'Site Analizi',
        `${result.domain} 3 katmanlı analiz edildi — SEO: ${result.scores.seo}/100, GEO: ${result.scores.geo}/100 (${result.issues.length} bulgu).`
      );
      window.NihatApp.toast(`${result.domain} analizi tamamlandı! SEO: ${result.scores.seo}, GEO: ${result.scores.geo}`, 'success');
      render();
    } catch (err) {
      window.NihatApp.toast(err.message || 'Analiz sırasında bir hata oluştu.', 'error');
      progressBox.classList.add('hidden');
      submitBtn.disabled = false;
    }
  }

  function bindEvents() {
    const form = root.querySelector('#site-audit-form');
    if (form) {
      form.addEventListener('submit', e => {
        e.preventDefault();
        const url = root.querySelector('#audit-url-input').value.trim();
        if (!url) {
          window.NihatApp.toast('Lütfen analiz edilecek web sitesi adresini yazın.', 'warn');
          return;
        }
        runAudit(url);
      });
    }

    root.querySelectorAll('.sample-url-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        root.querySelector('#audit-url-input').value = btn.dataset.url;
        runAudit(btn.dataset.url);
      });
    });

    root.querySelectorAll('.tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        activeTab = btn.dataset.tab;
        render();
      });
    });

    root.querySelectorAll('.send-issue-approval').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = parseInt(btn.dataset.idx, 10);
        const iss = activeAudit && activeAudit.issues && activeAudit.issues[idx];
        if (!iss) return;
        const added = window.NihatStore.enqueueApproval({
          platform: `Site ${iss.category}`,
          targetId: activeAudit.domain,
          field: iss.autoFixType,
          severity: iss.severity,
          title: `${activeAudit.domain}: ${iss.title}`,
          reason: iss.explain,
          impact: iss.action,
          before: iss.currentValue,
          after: iss.suggestedValue
        });
        window.NihatApp.toast(
          added ? 'Hata düzeltme önerisi Onay Merkezi’ne eklendi!' : 'Bu öneri zaten onay kuyruğunda bekliyor.',
          added ? 'success' : 'warn'
        );
      });
    });

    const queueAllBtn = root.querySelector('#queue-all-site-issues');
    if (queueAllBtn && activeAudit) {
      queueAllBtn.addEventListener('click', () => {
        let count = 0;
        (activeAudit.issues || []).forEach(iss => {
          const ok = window.NihatStore.enqueueApproval({
            platform: `Site ${iss.category}`,
            targetId: activeAudit.domain,
            field: iss.autoFixType,
            severity: iss.severity,
            title: `${activeAudit.domain}: ${iss.title}`,
            reason: iss.explain,
            impact: iss.action,
            before: iss.currentValue,
            after: iss.suggestedValue
          });
          if (ok) count++;
        });
        window.NihatApp.toast(`${count} adet site düzeltmesi Onay Merkezi’ne gönderildi.`, 'success');
      });
    }

    root.querySelectorAll('.copy-snippet-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const el = root.querySelector('#' + btn.dataset.target);
        if (el) {
          navigator.clipboard.writeText(el.textContent).then(() => {
            window.NihatApp.toast('Kod panoya kopyalandı!', 'success');
          });
        }
      });
    });

    root.querySelectorAll('.open-history-audit').forEach(btn => {
      btn.addEventListener('click', () => {
        const st = window.NihatStore.getState();
        activeAudit = st.siteAudits[parseInt(btn.dataset.idx, 10)];
        activeTab = 'issues';
        render();
      });
    });
  }

  render();

  if (window.NihatApp.pendingAuditUrl) {
    const u = window.NihatApp.pendingAuditUrl;
    window.NihatApp.pendingAuditUrl = null;
    runAudit(u);
  }
};
