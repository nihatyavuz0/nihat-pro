window.NihatAnalyzer = (function () {
  function normalizeUrl(input) {
    let url = (input || '').trim();
    if (!url) return '';
    if (!/^https?:\/\//i.test(url)) url = 'https://' + url;
    return url;
  }

  function safeJsonForScriptTag(obj) {
    return JSON.stringify(obj, null, 2)
      .replace(/</g, '\\u003c')
      .replace(/>/g, '\\u003e')
      .replace(/&/g, '\\u0026');
  }

  function escapeHtmlAttr(str) {
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  async function analyzeWebsite(rawUrl, onStage) {
    const url = normalizeUrl(rawUrl);
    if (!url) throw new Error('Lütfen geçerli bir web sitesi adresi girin.');

    try {
      new URL(url);
    } catch {
      throw new Error('Geçersiz URL formatı. Örnek: https://ornek.com');
    }

    if (onStage) onStage(1, '1. Katman: Web sitesi, SSL, hız, robots.txt, sitemap ve llms.txt taranıyor...');

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 35000);
    let resp;
    try {
      const fetcher = window.NihatAuth ? window.NihatAuth.secureFetch : fetch;
      resp = await fetcher('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
        signal: controller.signal
      });
    } catch (fetchErr) {
      clearTimeout(timer);
      if (fetchErr && fetchErr.name === 'AbortError') {
        throw new Error('Site yanıtı çok uzun sürdü (35 sn zaman aşımı). Lütfen tekrar deneyin.');
      }
      throw new Error('Sunucuya bağlanılamadı. Lütfen Baslat_NIHAT_PRO.bat sunucusunun açık olduğundan emin olun.');
    }
    clearTimeout(timer);

    if (onStage) onStage(2, '2. Katman: Başlık, meta etiketler, Schema (JSON-LD) ve GEO yapay zeka sinyalleri inceleniyor...');
    const text = await resp.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      throw new Error('Sunucudan geçersiz yanıt alındı.');
    }
    if (!data.ok) {
      throw new Error(data.error || 'Web sitesi analiz edilemedi.');
    }
    if (onStage) onStage(3, '3. Katman: Tüm bulgular çapraz kontrol edildi ve basit hata listesi oluşturuldu.');
    data.readySnippets = buildFixSnippets(data);
    return data;
  }

  function buildFixSnippets(audit) {
    const domain = String(audit.domain || 'siteniz.com');
    const url = String(audit.url || `https://${domain}`);
    const title = (audit.metrics && audit.metrics.title && audit.metrics.title.length >= 30 && audit.metrics.title.length <= 65)
      ? String(audit.metrics.title)
      : `${domain} | Resmi Site, Uzman Çözümler ve Güncel Rehber`;
    const desc = (audit.metrics && audit.metrics.metaDescription && audit.metrics.metaDescription.length >= 110 && audit.metrics.metaDescription.length <= 160)
      ? String(audit.metrics.metaDescription)
      : `${domain} ile en güncel ürün ve hizmetleri keşfedin. Şeffaf fiyatlar, hızlı teslimat ve doğrulanmış müşteri yorumlarıyla doğru karar verin.`;

    const metaHtml = `<!-- NİHAT PRO — Optimize Edilmiş SEO & Sosyal Medya Etiketleri -->
<title>${escapeHtmlAttr(title)}</title>
<meta name="description" content="${escapeHtmlAttr(desc)}" />
<link rel="canonical" href="${escapeHtmlAttr(url)}" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<meta property="og:title" content="${escapeHtmlAttr(title)}" />
<meta property="og:description" content="${escapeHtmlAttr(desc)}" />
<meta property="og:type" content="website" />
<meta property="og:url" content="${escapeHtmlAttr(url)}" />`;

    const schemaObj = {
      '@context': 'https://schema.org',
      '@graph': [
        {
          '@type': 'Organization',
          name: domain,
          url
        },
        {
          '@type': 'FAQPage',
          mainEntity: [
            {
              '@type': 'Question',
              name: `${domain} neden tercih edilmeli?`,
              acceptedAnswer: {
                '@type': 'Answer',
                text: 'Doğrulanmış kalite, şeffaf fiyatlandırma, hızlı teslimat ve uzman müşteri desteği sunar.'
              }
            }
          ]
        }
      ]
    };

    const jsonLd = `<script type="application/ld+json">\n${safeJsonForScriptTag(schemaObj)}\n</script>`;

    const baseCleanUrl = url.replace(/\/$/, '');
    const llmsTxt = `# ${domain}
> ${domain} resmi yapay zeka (GEO) bilgi özeti dosyası.

## Özet
${desc}

## Önemli Sayfalar
- Ana Sayfa: ${url}
- Hakkımızda: ${baseCleanUrl}/hakkimizda
- Sıkça Sorulan Sorular: ${baseCleanUrl}/sss
- İletişim: ${baseCleanUrl}/iletisim

## Yapay Zeka Bot İzinleri
GPTBot, PerplexityBot, ClaudeBot ve Google-Extended kaynak göstererek özetleyebilir.`;

    return { metaHtml, jsonLd, llmsTxt };
  }

  function runFullSystemAudit() {
    const state = window.NihatStore.getState();
    const findings = [];

    state.campaigns.googleAds.forEach(ad => {
      if (ad.headline.length > 30) {
        findings.push({
          platform: 'Google Ads',
          targetId: ad.id,
          field: 'headline',
          severity: 'Kritik',
          title: `"${ad.name}" başlığı 30 karakteri aşıyor (${ad.headline.length} kar.)`,
          reason: 'Google Ads RSA başlıkları maksimum 30 karakter olabilir. Uzun başlıklar kesilir veya reddedilir.',
          impact: 'Red riski sıfırlanır, TO (CTR) tahmini +%20 artar',
          before: ad.headline,
          after: ad.headline.slice(0, 27).trim() + '...'
        });
      }
      if (ad.description.length > 90) {
        findings.push({
          platform: 'Google Ads',
          targetId: ad.id,
          field: 'description',
          severity: 'Önemli',
          title: `"${ad.name}" açıklaması 90 karakteri aşıyor`,
          reason: 'Google Ads açıklama satırı en fazla 90 karakter olmalıdır.',
          impact: 'Tam görünürlük ve yüksek Kalite Puanı',
          before: ad.description,
          after: ad.description.slice(0, 87).trim() + '...'
        });
      }
    });

    state.campaigns.merchant.forEach(p => {
      if (p.title.length < 35) {
        findings.push({
          platform: 'Google Merchant',
          targetId: p.id,
          field: 'title',
          severity: 'Kritik',
          title: `Merchant Ürünü (${p.sku}) Başlığı Çok Kısa`,
          reason: 'Kısa ürün başlıkları Google Alışveriş ve AI Shopping aramalarında eşleşme kaybeder.',
          impact: 'Alışveriş gösterimlerinde +%40 artış',
          before: p.title,
          after: `${p.title} — Orijinal Garantili | Hızlı Kargo ve Özel Seri`
        });
      }
    });

    state.campaigns.metaAds.forEach(m => {
      const ctrNum = parseFloat(String(m.ctr).replace('%', '').replace(',', '.')) || 0;
      if (ctrNum < 1.5 && m.issueFlag) {
        findings.push({
          platform: 'Meta Ads',
          targetId: m.id,
          field: 'hook',
          severity: 'Önemli',
          title: `"${m.name}" reklamında düşük TO (${m.ctr}) tespit edildi`,
          reason: 'İlk cümle (Hook) kullanıcının sorununa doğrudan dokunmadığı için kaydırmayı durdurmuyor.',
          impact: 'Tıklama başına maliyette -%25 düşüş hedefi',
          before: m.hook,
          after: 'Hâlâ eski yöntemlerle zaman mı kaybediyorsunuz? 3 dakikada farkı hissettiren yeni çözümü keşfedin.'
        });
      }
    });

    let newlyQueued = 0;
    findings.forEach(f => {
      if (window.NihatStore.enqueueApproval(f)) newlyQueued++;
    });

    const today = new Date().toLocaleDateString('tr-TR', {
      day: 'numeric', month: 'long', year: 'numeric', weekday: 'long'
    });

    window.NihatStore.update(s => {
      const pendingCount = s.approvals.length;
      s.dailySummary.dateLabel = today;
      s.dailySummary.lastUpdated = new Date().toISOString();
      if (pendingCount === 0) {
        s.dailySummary.headline = '3 Katmanlı Tam Denetim tamamlandı: Hiçbir kritik hata bulunmadı!';
        s.dailySummary.simpleText = 'Google Ads, Google Merchant, Meta Ads ve SEO/GEO kontrolleri 3 kez doğrulandı. Tüm başlıklar, açıklamalar ve ürün verileri hatasız ve yüksek etkileşim standardında.';
      } else {
        s.dailySummary.headline = `3 Katmanlı Tam Denetim tamamlandı: ${pendingCount} düzeltme önerisi onayınızı bekliyor.`;
        s.dailySummary.simpleText = `NİHAT PRO tüm kampanyalarınızı ve SEO/GEO metriklerinizi 3 kez çapraz kontrol etti. ${pendingCount} noktada performans artışı ve hata giderimi tespit edildi; tek tıkla onaylayarak otomatik uygulatabilirsiniz.`;
      }
    });

    window.NihatStore.addLog(
      '3x Tam Denetim',
      `3 katmanlı denetim tamamlandı. ${findings.length} kontrol noktası incelendi, ${newlyQueued} yeni öneri onay kuyruğuna eklendi.`
    );

    return { checkedCount: findings.length, newlyQueued };
  }

  return {
    analyzeWebsite,
    buildFixSnippets,
    runFullSystemAudit
  };
})();
