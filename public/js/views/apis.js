window.NihatViews = window.NihatViews || {};

window.NihatViews.apis = function (root) {
  const esc = window.NihatApp.esc;
  let vaultSummary = {};

  const API_DEFS = [
    {
      key: 'google_ads',
      name: 'Google Ads API',
      badge: 'Reklam',
      desc: 'Kampanya performansı çekme, RSA başlık/açıklama denetimi ve onaylı otomatik güncelleme.',
      fields: [
        { id: 'customerId', label: 'Müşteri ID (10 Haneli)', placeholder: '123-456-7890', secret: false },
        { id: 'managerId', label: 'MCC Yönetici ID (Opsiyonel)', placeholder: '987-654-3210', secret: false },
        { id: 'developerToken', label: 'Developer Token', placeholder: 'Sunucu kasasına kaydedilecek gizli anahtar', secret: true },
        { id: 'accessToken', label: 'OAuth 2.0 Access Token', placeholder: 'Sunucu kasasına kaydedilecek gizli token', secret: true }
      ],
      guide: [
        'Müşteri ID (10 haneli): Google Ads’e giriş yaptığınızda sağ üst köşede XXX-XXX-XXXX şeklinde yazar.',
        'Developer Token (ÖNEMLİ): Ücretsiz bir Google Ads Yönetici Hesabı (MCC) açın → Yönetici (Admin) → API Merkezi bölümünden Developer Token alın.',
        'OAuth Access Token: Google Cloud Console’da Google Ads API’yi etkinleştirip OAuth 2.0 yetkisiyle Access Token üretin.'
      ],
      links: [
        { label: 'Google Ads Yönetici Hesabı (MCC) Aç', url: 'https://ads.google.com/home/tools/manager-accounts/' },
        { label: 'Google Cloud — Ads API Etkinleştir', url: 'https://console.cloud.google.com/apis/library/googleads.googleapis.com' }
      ]
    },
    {
      key: 'google_merchant',
      name: 'Google Merchant Center API',
      badge: 'Alışveriş Feed',
      desc: 'Ürün başlıkları, GTIN doğrulaması, fiyat/stok uyumu ve reddedilen ürünleri otomatik yakalama.',
      fields: [
        { id: 'merchantId', label: 'Merchant Center ID', placeholder: '512345678', secret: false },
        { id: 'accessToken', label: 'OAuth 2.0 Access Token (Content API)', placeholder: 'Sunucu kasasına kaydedilecek gizli token', secret: true },
        { id: 'feedUrl', label: 'Ürün Feed URL (Opsiyonel XML/CSV)', placeholder: 'https://siteniz.com/feed.xml', secret: false }
      ],
      guide: [
        'Merchant Center ID: merchants.google.com sağ üst köşesindeki rakamsal mağaza ID’nizdir.',
        'Content API for Shopping servisini Google Cloud Console’dan etkinleştirip OAuth Access Token oluşturun.'
      ],
      links: [
        { label: 'Google Merchant Center’ı Aç', url: 'https://merchants.google.com/' },
        { label: 'Google Cloud — Content API for Shopping', url: 'https://console.cloud.google.com/apis/library/shoppingcontent.googleapis.com' }
      ]
    },
    {
      key: 'meta_ads',
      name: 'Meta Marketing API (Instagram & Facebook)',
      badge: 'Sosyal Reklam',
      desc: 'Meta reklam setleri, TO/ROAS metrikleri, kanca performansı ve onaylı reklam metni güncellemesi.',
      fields: [
        { id: 'adAccountId', label: 'Reklam Hesabı ID', placeholder: 'act_123456789012345', secret: false },
        { id: 'accessToken', label: 'System User / Graph API Access Token', placeholder: 'Sunucu kasasına kaydedilecek gizli token', secret: true },
        { id: 'pixelId', label: 'Meta Pixel ID (Opsiyonel)', placeholder: '9876543210', secret: false },
        { id: 'pageId', label: 'Facebook Sayfa ID (Opsiyonel)', placeholder: '1029384756', secret: false }
      ],
      guide: [
        'Meta Business Suite → İşletme Ayarları → Sistem Kullanıcıları bölümünden Sistem Kullanıcısı oluşturun.',
        'ads_read ve ads_management izinleriyle kalıcı Access Token üretin.'
      ]
    },
    {
      key: 'gemini',
      name: 'Google Gemini AI API',
      badge: 'Yapay Zeka Motoru',
      desc: 'İçerik Stüdyosu, Rakip Analizi ve Hedef Kitle araştırmalarında canlı Gemini zekasını devreye alır.',
      fields: [
        { id: 'apiKey', label: 'Gemini API Anahtarı', placeholder: 'Sunucu kasasına kaydedilecek gizli anahtar', secret: true },
        { id: 'model', label: 'Model Adı', placeholder: 'gemini-2.5-flash', secret: false }
      ],
      guide: [
        'aistudio.google.com/apikey adresinden yeni bir API anahtarı oluşturup sunucu kasasına kaydedin.'
      ]
    },
    {
      key: 'openai',
      name: 'OpenAI API (Alternatif AI Motoru)',
      badge: 'Yapay Zeka Motoru',
      desc: 'İsterseniz Gemini yerine veya yedek olarak GPT modellerini bağlayabilirsiniz.',
      fields: [
        { id: 'apiKey', label: 'OpenAI API Anahtarı', placeholder: 'Sunucu kasasına kaydedilecek gizli anahtar', secret: true },
        { id: 'model', label: 'Model Adı', placeholder: 'gpt-4o-mini', secret: false }
      ],
      guide: [
        'platform.openai.com/api-keys sayfasından yeni bir secret key oluşturup sunucu kasasına kaydedin.'
      ]
    },
    {
      key: 'pagespeed',
      name: 'Google PageSpeed Insights API',
      badge: 'SEO & Hız',
      desc: 'Web sitesi analizlerinde Core Web Vitals ve resmi Google hız/SEO verilerini destekler.',
      fields: [
        { id: 'apiKey', label: 'Google Cloud API Anahtarı', placeholder: 'Sunucu kasasına kaydedilecek gizli anahtar', secret: true }
      ],
      guide: [
        'Google Cloud Console → PageSpeed Insights API’yi etkinleştirip API anahtarını kaydedin.'
      ]
    }
  ];

  async function refreshVaultStatus() {
    if (!window.NihatAuth || !window.NihatAuth.isAdmin()) return;
    try {
      const resp = await window.NihatAuth.secureFetch('/api/vault');
      if (!resp.ok) return;
      const data = await resp.json();
      if (data && data.ok && data.providers) {
        vaultSummary = data.providers;
        window.NihatStore.update(s => {
          Object.keys(vaultSummary).forEach(k => {
            if (s.apis[k]) {
              const p = vaultSummary[k];
              s.apis[k].connected = Boolean(p.configured);
              if (p.configured && s.apis[k].statusText.startsWith('Bağlı Değil')) {
                s.apis[k].statusText = 'Sunucu Kasasında Tanımlı';
              }
              Object.assign(s.apis[k].config, p.publicConfig || {});
            }
          });
        });
      }
    } catch {}
  }

  function render() {
    const s = window.NihatStore.getState();
    const serverUp = window.NihatStore.isServerOnline();
    const isAdmin = window.NihatAuth && window.NihatAuth.isAdmin();

    root.innerHTML = `
      <div class="stack">
        <section class="card">
          <div class="row-between">
            <div>
              <h2 class="card-title">API Bağlantı Merkezi ve Şifreli Sunucu Kasası</h2>
              <p class="card-subtitle">Gizli API anahtarlarınız tarayıcıya (localStorage veya HTML) asla kaydedilmez; yalnızca sunucuda AES-256-GCM şifreli kasada veya ortam değişkenlerinde tutulur.</p>
            </div>
            <span class="badge ${serverUp ? 'badge-success' : 'badge-warn'}">
              ${serverUp ? '✓ AES-256-GCM Sunucu Kasası Aktif' : 'Sunucu Bağlantısı Bekleniyor'}
            </span>
          </div>
        </section>

        <section class="card">
          <div class="card-header mb-12">
            <div>
              <h3 class="card-title">Marka &amp; Site Profili</h3>
              <p class="card-subtitle">NİHAT PRO tüm günlük özet ve rakip kıyaslamalarını bu bilgilere göre kişiselleştirir.</p>
            </div>
          </div>
          <form id="brand-profile-form" class="grid grid-4 items-end gap-12">
            <div class="field">
              <label>Marka Adı</label>
              <input class="input" id="bp-name" maxlength="160" value="${esc(s.brand.name)}" />
            </div>
            <div class="field">
              <label>Web Sitesi</label>
              <input class="input" id="bp-domain" maxlength="256" value="${esc(s.brand.domain)}" />
            </div>
            <div class="field">
              <label>Sektör</label>
              <input class="input" id="bp-sector" maxlength="160" value="${esc(s.brand.sector)}" />
            </div>
            <div>
              <button type="submit" class="btn btn-primary w-full">Profili Kaydet</button>
            </div>
          </form>
        </section>

        ${!isAdmin ? `
          <section class="card box-amber-soft">
            <strong class="text-amber">Yönetici Yetkisi Gerekli (RBAC):</strong>
            <div class="mt-4 fs-13 text-sec">
              Mevcut hesabınız <strong>standart kullanıcı (user)</strong> rolündedir. Sunucu API anahtar kasasını görüntüleme, değiştirme ve bağlantı testi işlemleri yalnızca <strong>yönetici (admin)</strong> rolüne açıktır.
            </div>
          </section>
        ` : `
          <section class="grid grid-2">
            ${API_DEFS.map(def => {
              const apiState = s.apis[def.key] || { connected: false, statusText: 'Bağlı Değil', config: {} };
              const vInfo = vaultSummary[def.key] || { configured: false, publicConfig: {}, secretStatus: {} };
              return `
                <article class="card stack-sm" data-api-card="${esc(def.key)}">
                  <div class="row-between">
                    <div>
                      <div class="row gap-6 mb-4">
                        <span class="badge badge-info">${esc(def.badge)}</span>
                        <span class="badge ${(apiState.connected || vInfo.configured) ? 'badge-success' : 'badge-neutral'}">
                          ${apiState.connected ? '✓ Bağlı & Doğrulandı' : (vInfo.configured ? '✓ Kasada Kayıtlı' : esc(apiState.statusText || 'Bağlı Değil'))}
                        </span>
                      </div>
                      <h3 class="card-title">${esc(def.name)}</h3>
                    </div>
                    <button type="button" class="btn btn-ghost btn-sm api-guide-btn" data-key="${esc(def.key)}">Nasıl Alınır?</button>
                  </div>

                  <p class="m-0 fs-13 text-sec">${esc(def.desc)}</p>

                  <div class="stack-sm mt-4">
                    ${def.fields.map(f => {
                      const hasSecretOnServer = f.secret && vInfo.secretStatus && vInfo.secretStatus[f.id];
                      const pubVal = !f.secret ? ((vInfo.publicConfig && vInfo.publicConfig[f.id]) || (apiState.config && apiState.config[f.id]) || '') : '';
                      const placeholderText = hasSecretOnServer ? '•••••••••••• (Sunucu kasasında şifreli kayıtlı)' : f.placeholder;
                      return `
                        <div class="field">
                          <label>${esc(f.label)}</label>
                          <input
                            class="input api-field-input"
                            type="${f.secret ? 'password' : 'text'}"
                            autocomplete="off"
                            data-api="${esc(def.key)}"
                            data-field="${esc(f.id)}"
                            data-secret="${f.secret ? '1' : '0'}"
                            placeholder="${esc(placeholderText)}"
                            value="${esc(pubVal)}"
                          />
                        </div>
                      `;
                    }).join('')}
                  </div>

                  <div class="row-between mt-8">
                    <span class="fs-11-5 text-muted">
                      ${apiState.lastTested ? `Son test: ${esc(new Date(apiState.lastTested).toLocaleString('tr-TR'))}` : 'Sunucu kasasıyla korunuyor'}
                    </span>
                    <div class="row">
                      <button type="button" class="btn btn-secondary btn-sm api-save-btn" data-key="${esc(def.key)}">Kasaya Kaydet</button>
                      <button type="button" class="btn btn-primary btn-sm api-test-btn" data-key="${esc(def.key)}">Kaydet &amp; Canlı Test Et</button>
                    </div>
                  </div>
                </article>
              `;
            }).join('')}
          </section>
        `}

        <section class="card row-between">
          <div>
            <div class="row gap-8 mb-4">
              <strong>Kalıcı Kayıt &amp; Güvenli Yedekleme Koruması</strong>
              <span class="badge badge-success">✓ Gizli Anahtarsız Yedekleme</span>
            </div>
            <div class="fs-12-5 text-muted">
              Yedek dosyaları gizli API anahtarlarını içermez ve geri yüklemede hem boyut (≤ 256 KB) hem sunucu şema doğrulamasından geçirilir.
              ${s.lastSavedAt ? `Son kayıt: <strong>${esc(new Date(s.lastSavedAt).toLocaleString('tr-TR'))}</strong> (Rev #${Number(s.revision) || 1})` : ''}
            </div>
          </div>
          <div class="row">
            <button type="button" class="btn btn-secondary btn-sm" id="export-backup-btn">Yedek İndir (.json)</button>
            <label class="btn btn-soft-primary btn-sm cursor-pointer">
              Yedekten Geri Yükle
              <input type="file" id="import-backup-input" accept=".json,application/json" class="hidden" />
            </label>
          </div>
        </section>
      </div>
    `;

    bindEvents();
  }

  function readCardConfig(key) {
    const pubCfg = {};
    const fullCfg = {};
    root.querySelectorAll(`.api-field-input[data-api="${key}"]`).forEach(inp => {
      const f = inp.dataset.field;
      const val = inp.value.trim();
      const isSec = inp.dataset.secret === '1';
      if (!isSec) {
        pubCfg[f] = val;
        fullCfg[f] = val;
      } else if (val) {
        fullCfg[f] = val;
      }
    });
    return { pubCfg, fullCfg };
  }

  function clearSecretInputs(key) {
    root.querySelectorAll(`.api-field-input[data-api="${key}"][data-secret="1"]`).forEach(inp => {
      inp.value = '';
    });
  }

  function bindEvents() {
    const bpForm = root.querySelector('#brand-profile-form');
    if (bpForm) {
      bpForm.addEventListener('submit', e => {
        e.preventDefault();
        window.NihatStore.update(s => {
          s.brand.name = root.querySelector('#bp-name').value.trim() || s.brand.name;
          s.brand.domain = root.querySelector('#bp-domain').value.trim() || s.brand.domain;
          s.brand.sector = root.querySelector('#bp-sector').value.trim() || s.brand.sector;
        });
        window.NihatApp.toast('Marka profili kaydedildi!', 'success');
      });
    }

    root.querySelectorAll('.api-save-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const key = btn.dataset.key;
        const { pubCfg, fullCfg } = readCardConfig(key);
        window.NihatStore.update(s => {
          s.apis[key].config = Object.assign({}, s.apis[key].config, pubCfg);
        });

        try {
          const resp = await window.NihatAuth.secureFetch('/api/vault', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ platform: key, config: fullCfg })
          });
          const data = await resp.json();
          clearSecretInputs(key);
          if (!resp.ok || !data.ok) {
            window.NihatApp.toast((data && data.error) || 'Kasa kaydı başarısız oldu.', 'error');
            return;
          }
          if (data.providers) vaultSummary = data.providers;
          window.NihatApp.toast(data.message || 'API bilgileri şifreli sunucu kasasına kaydedildi.', 'success');
          render();
        } catch {
          window.NihatApp.toast('Sunucu kasasına erişilemedi.', 'error');
        }
      });
    });

    root.querySelectorAll('.api-test-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const key = btn.dataset.key;
        const { pubCfg, fullCfg } = readCardConfig(key);
        window.NihatStore.update(s => {
          s.apis[key].config = Object.assign({}, s.apis[key].config, pubCfg);
        });

        const prevText = btn.textContent;
        btn.disabled = true;
        btn.textContent = 'Test Ediliyor...';

        try {
          const resp = await window.NihatAuth.secureFetch('/api/test-connection', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ platform: key, config: fullCfg })
          });
          const data = await resp.json();
          clearSecretInputs(key);
          await refreshVaultStatus();
          window.NihatStore.update(s => {
            s.apis[key].connected = Boolean(data.ok);
            s.apis[key].statusText = data.ok ? 'Bağlı & Doğrulandı' : 'Bağlantı Hatası';
            s.apis[key].lastTested = new Date().toISOString();
          });
          window.NihatStore.addLog('API Testi', `[${key}] ${data.message || 'Test tamamlandı'}`);
          window.NihatApp.toast(data.message || 'Test tamamlandı.', data.ok ? 'success' : 'error');
          render();
        } catch {
          window.NihatApp.toast('Test isteği başarısız oldu.', 'error');
          btn.disabled = false;
          btn.textContent = prevText;
        }
      });
    });

    root.querySelectorAll('.api-guide-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const def = API_DEFS.find(d => d.key === btn.dataset.key);
        if (!def) return;
        window.NihatApp.openModal({
          eyebrow: `${def.badge} · Bağlantı Kılavuzu`,
          title: def.name,
          subtitle: 'Gerekli anahtarları adım adım ve güvenli şekilde alın.',
          tone: 'navy',
          bodyHtml: `
            <ol class="np-step-list">
              ${def.guide.map((step, i) => `
                <li class="np-step-item">
                  <span class="np-step-num">${i + 1}</span>
                  <span>${esc(step)}</span>
                </li>
              `).join('')}
            </ol>
            ${def.links && def.links.length ? `
              <div class="stack-sm pt-6">
                <span class="uppercase-label">Direkt Sayfa Bağlantıları</span>
                <div class="row gap-8">
                  ${def.links.map(l => `<a href="${esc(l.url)}" target="_blank" rel="noopener noreferrer" class="btn btn-soft-primary btn-sm no-underline">${esc(l.label)} ↗</a>`).join('')}
                </div>
              </div>
            ` : ''}
          `,
          footerHtml: `<button type="button" class="btn btn-primary btn-sm" data-modal-close>Anladım</button>`
        });
      });
    });

    const exportBtn = root.querySelector('#export-backup-btn');
    if (exportBtn) {
      exportBtn.addEventListener('click', () => {
        const json = window.NihatStore.exportBackup();
        const blob = new Blob([json], { type: 'application/json;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `NIHAT_PRO_yedek_${new Date().toISOString().slice(0, 10)}.json`;
        a.click();
        URL.revokeObjectURL(url);
        window.NihatApp.toast('Gizli anahtarlardan arındırılmış yedek indirildi!', 'success');
      });
    }

    const importInput = root.querySelector('#import-backup-input');
    if (importInput) {
      importInput.addEventListener('change', e => {
        const file = e.target.files && e.target.files[0];
        if (!file) return;
        if (!file.name.toLowerCase().endsWith('.json')) {
          window.NihatApp.toast('Yalnızca .json uzantılı yedek dosyaları kabul edilir.', 'error');
          e.target.value = '';
          return;
        }
        if (file.size > 262144) {
          window.NihatApp.toast('Yedek dosyası boyutu 256 KB sınırını aşıyor.', 'error');
          e.target.value = '';
          return;
        }
        const reader = new FileReader();
        reader.onload = async () => {
          try {
            await window.NihatStore.importBackup(String(reader.result || ''));
            window.NihatApp.toast('Yedek sunucu doğrulamasından geçirilerek geri yüklendi!', 'success');
            render();
          } catch (err) {
            window.NihatApp.toast(err.message || 'Yedek dosyası doğrulanamadı.', 'error');
          } finally {
            e.target.value = '';
          }
        };
        reader.readAsText(file, 'utf-8');
      });
    }
  }

  render();
  refreshVaultStatus().then(() => render());
};
