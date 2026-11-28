window.NihatViews = window.NihatViews || {};

window.NihatViews.approvals = function (root) {
  let tab = 'pending';
  const esc = window.NihatApp.esc;
  const num = window.NihatApp.num;

  function render() {
    const s = window.NihatStore.getState();
    const pending = s.approvals;
    const resolved = s.resolvedApprovals;

    root.innerHTML = `
      <div class="stack">
        <section class="card">
          <div class="row-between">
            <div>
              <h2 class="card-title">Onay &amp; Otomatik Hata Düzeltme Merkezi</h2>
              <p class="card-subtitle">NİHAT PRO başlık, açıklama, ürün verisi veya teknik bir hata bulduğunda önce 3 kez doğrular ve size sorar. Onay verdiğiniz anda kendisi en doğru şekilde düzenler.</p>
            </div>
            <div class="row">
              ${pending.length > 1 && tab === 'pending' ? `
                <button class="btn btn-emerald" id="approve-all-btn">Tümünü Onayla ve Uygula (${pending.length})</button>
              ` : ''}
              <button class="btn btn-secondary" id="rescan-approvals-btn">3x Yeniden Tara</button>
            </div>
          </div>

          <div class="tabs mt-16">
            <button class="tab-btn ${tab === 'pending' ? 'active' : ''}" data-tab="pending">
              Onay Bekleyenler (${pending.length})
            </button>
            <button class="tab-btn ${tab === 'resolved' ? 'active' : ''}" data-tab="resolved">
              Uygulanan &amp; Doğrulanan Geçmiş (${resolved.length})
            </button>
          </div>
        </section>

        ${tab === 'pending' ? renderPending(pending) : renderResolved(resolved)}
      </div>
    `;

    bindEvents();
  }

  function renderPending(items) {
    if (items.length === 0) {
      return `
        <section class="card empty-state">
          <div class="fs-32 text-emerald mb-8">✓</div>
          <h3 class="m-0 mb-6 text-main">Onay bekleyen hata bulunmuyor!</h3>
          <p class="m-0">Tüm başlık, açıklama ve kampanya kontrolleriniz hatasız durumda. Yeni bir site veya reklam eklediğinizde hatalar otomatik burada sorulur.</p>
        </section>
      `;
    }

    return `
      <div class="stack">
        ${items.map(item => `
          <article class="card ${item.severity === 'Kritik' ? 'border-left-rose' : 'border-left-amber'}">
            <div class="row-between mb-10">
              <div class="row gap-6">
                <span class="badge badge-info">${esc(item.platform)}</span>
                <span class="badge ${item.severity === 'Kritik' ? 'badge-danger' : 'badge-warn'}">${esc(item.severity)}</span>
                <span class="badge badge-success">✓ ${Math.round(num(item.verifiedPasses, 1, 10, 3))} Kez Doğrulandı</span>
              </div>
              <span class="mono fs-11-5 text-muted">
                ${esc(new Date(item.createdAt).toLocaleString('tr-TR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }))}
              </span>
            </div>

            <h3 class="m-0 mb-6 fs-16">${esc(item.title)}</h3>
            <p class="m-0 mb-8 text-sec"><strong>Tespit Nedeni:</strong> ${esc(item.reason)}</p>
            <p class="m-0 mb-14 fs-13 text-emerald fw-600">Tahmini Etki: ${esc(item.impact)}</p>

            <div class="diff-grid mb-16">
              <div class="diff-box diff-before">
                <div class="diff-label">Mevcut (Hatalı / Zayıf)</div>
                <div>${esc(item.before)}</div>
              </div>
              <div class="diff-box diff-after">
                <div class="diff-label">NİHAT PRO Önerisi (En Doğru Hali)</div>
                <div><strong>${esc(item.after)}</strong></div>
              </div>
            </div>

            <div class="row-between">
              <span class="fs-12 text-muted">Onayladığınızda ajan değişikliği uygular ve ardından tekrar doğrular.</span>
              <div class="row">
                <button class="btn btn-soft-rose btn-sm reject-btn" data-id="${esc(item.id)}">Reddet</button>
                <button class="btn btn-secondary btn-sm edit-approve-btn" data-id="${esc(item.id)}">Düzenleyerek Onayla</button>
                <button class="btn btn-emerald approve-btn" data-id="${esc(item.id)}">Onayla ve Otomatik Düzelt</button>
              </div>
            </div>
          </article>
        `).join('')}
      </div>
    `;
  }

  function renderResolved(items) {
    if (items.length === 0) {
      return `<section class="card empty-state">Henüz sonuçlandırılmış bir düzeltme geçmişi yok.</section>`;
    }
    return `
      <div class="stack-sm">
        ${items.map(item => `
          <article class="card">
            <div class="row-between mb-8">
              <div class="row gap-6">
                <span class="badge badge-info">${esc(item.platform)}</span>
                <span class="badge ${item.status === 'approved' ? 'badge-success' : 'badge-neutral'}">
                  ${item.status === 'approved' ? '✓ Uygulandı & Doğrulandı' : 'Reddedildi'}
                </span>
                ${item.postFixVerification ? `<span class="badge badge-success">${esc(item.postFixVerification)}</span>` : ''}
              </div>
              <span class="mono fs-11-5 text-muted">${esc(new Date(item.resolvedAt).toLocaleString('tr-TR'))}</span>
            </div>
            <div class="fw-700 mb-8">${esc(item.title)}</div>
            <div class="diff-grid">
              <div class="diff-box diff-before"><div class="diff-label">Eski Hali</div>${esc(item.before)}</div>
              <div class="diff-box diff-after"><div class="diff-label">Uygulanan Yeni Hali</div>${esc(item.after)}</div>
            </div>
          </article>
        `).join('')}
      </div>
    `;
  }

  function bindEvents() {
    root.querySelectorAll('.tab-btn').forEach(btn => {
      btn.addEventListener('click', () => { tab = btn.dataset.tab; render(); });
    });

    const rescanBtn = root.querySelector('#rescan-approvals-btn');
    if (rescanBtn) {
      rescanBtn.addEventListener('click', () => window.NihatApp.triggerFullAudit());
    }

    const allBtn = root.querySelector('#approve-all-btn');
    if (allBtn) {
      allBtn.addEventListener('click', async () => {
        const ids = window.NihatStore.getState().approvals.map(a => a.id);
        const ok = await window.NihatApp.confirm({
          eyebrow: 'Toplu Onay',
          title: `${ids.length} Düzeltmenin Tümünü Uygula`,
          message: `Onay bekleyen ${ids.length} adet 3x doğrulanmış düzeltme otomatik uygulanacak ve her biri işlem sonrası tekrar doğrulanacaktır.`,
          confirmLabel: 'Tümünü Onayla & Uygula',
          cancelLabel: 'Vazgeç',
          tone: 'emerald',
          confirmClass: 'btn-emerald'
        });
        if (!ok) return;
        ids.forEach(id => window.NihatStore.approveItem(id));
        window.NihatApp.toast(`${ids.length} düzeltme onayınızla otomatik uygulandı ve tekrar doğrulandı.`, 'success');
        render();
      });
    }

    root.querySelectorAll('.approve-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const res = window.NihatStore.approveItem(btn.dataset.id);
        if (res) {
          window.NihatApp.toast(`"${res.title}" otomatik düzeltildi ve 3/3 doğrulandı.`, 'success');
          render();
        }
      });
    });

    root.querySelectorAll('.reject-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        window.NihatStore.rejectItem(btn.dataset.id);
        window.NihatApp.toast('Öneri reddedildi, değişiklik yapılmadı.', 'warn');
        render();
      });
    });

    root.querySelectorAll('.edit-approve-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const item = window.NihatStore.getState().approvals.find(a => a.id === btn.dataset.id);
        if (!item) return;
        const limit = (item.platform === 'Google Ads' && item.field === 'headline') ? 30
          : (item.platform === 'Google Ads' && item.field === 'description') ? 90
          : (item.platform === 'Google Merchant' && item.field === 'title') ? 150
          : null;

        const afterStr = String(item.after || '');

        window.NihatApp.openModal({
          eyebrow: `${item.platform} · Düzeltme Özelleştirme`,
          title: 'Düzeltmeyi İncele ve Onayla',
          subtitle: item.title,
          tone: 'emerald',
          bodyHtml: `
            <div class="diff-box diff-before">
              <div class="diff-label">Mevcut (Değiştirilecek Hali)</div>
              <div>${esc(item.before)}</div>
            </div>
            <div class="field">
              <div class="row-between">
                <label for="custom-fix-textarea">Uygulanacak Nihai Metin</label>
                <span class="badge badge-info" id="custom-fix-counter">${afterStr.length}${limit ? ` / ${limit}` : ''} karakter</span>
              </div>
              <textarea class="textarea" id="custom-fix-textarea">${esc(afterStr)}</textarea>
            </div>
          `,
          footerHtml: `
            <button type="button" class="btn btn-secondary btn-sm" data-modal-close>Vazgeç</button>
            <button type="button" class="btn btn-emerald btn-sm" id="confirm-edit-modal">Onayla ve Uygula</button>
          `,
          onReady: modalEl => {
            const ta = modalEl.querySelector('#custom-fix-textarea');
            const counter = modalEl.querySelector('#custom-fix-counter');
            const updateCounter = () => {
              const len = ta.value.trim().length;
              counter.textContent = `${len}${limit ? ` / ${limit}` : ''} karakter`;
              counter.className = 'badge ' + (limit && len > limit ? 'badge-danger' : 'badge-success');
            };
            updateCounter();
            ta.addEventListener('input', updateCounter);
            modalEl.querySelector('#confirm-edit-modal').onclick = () => {
              const val = ta.value.trim();
              if (!val) {
                window.NihatApp.toast('Uygulanacak metin boş bırakılamaz.', 'warn');
                return;
              }
              window.NihatStore.approveItem(item.id, val);
              window.NihatApp.closeModal();
              window.NihatApp.toast('Özelleştirilmiş düzeltme uygulandı ve doğrulandı!', 'success');
              render();
            };
          }
        });
      });
    });
  }

  render();
};
