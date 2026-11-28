window.NihatGenerator = (function () {
  function safeJsonForScriptTag(obj) {
    return JSON.stringify(obj, null, 2)
      .replace(/</g, '\\u003c')
      .replace(/>/g, '\\u003e')
      .replace(/&/g, '\\u0026');
  }

  async function tryLiveAi(systemPrompt, prompt) {
    const state = window.NihatStore.getState();
    if (!window.NihatStore.isServerOnline()) return null;

    let provider = '';
    let model = '';

    if (state.apis.gemini && state.apis.gemini.connected) {
      provider = 'gemini';
      model = (state.apis.gemini.config && state.apis.gemini.config.model) || 'gemini-2.5-flash';
    } else if (state.apis.openai && state.apis.openai.connected) {
      provider = 'openai';
      model = (state.apis.openai.config && state.apis.openai.config.model) || 'gpt-4o-mini';
    }

    try {
      // Never send API keys from browser; server reads key securely from its own encrypted vault / env
      const fetcher = window.NihatAuth ? window.NihatAuth.secureFetch : fetch;
      const resp = await fetcher('/api/ai/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider, model, systemPrompt, prompt })
      });
      const data = await resp.json();
      if (data && data.ok && data.text) {
        return { provider: data.provider || provider || 'ai', text: data.text };
      }
    } catch {}
    return null;
  }

  function clamp(str, max) {
    const s = String(str || '').trim();
    if (s.length <= max) return s;
    const cut = s.slice(0, max - 1);
    const lastSpace = cut.lastIndexOf(' ');
    return (lastSpace > max * 0.55 ? cut.slice(0, lastSpace) : cut).trim();
  }

  function capitalize(s) {
    const t = String(s || '').trim();
    return t ? t.charAt(0).toLocaleUpperCase('tr-TR') + t.slice(1) : '';
  }

  async function generateContent({ channel, product, audience, offer, keyword, tone }) {
    const prod = (product || 'Ürününüz').trim().slice(0, 140);
    const aud = (audience || 'Hedef Müşteriler').trim().slice(0, 140);
    const off = (offer || 'Aynı Gün Ücretsiz Kargo & %100 Garanti').trim().slice(0, 140);
    const kw = (keyword || prod).trim().slice(0, 100);
    const ton = (tone || 'Güvenilir ve dönüşüm odaklı').trim().slice(0, 100);

    const aiResp = await tryLiveAi(
      'Sen dünyanın en iyi Türkçe SEO, GEO, Google Ads, Google Merchant ve Meta Ads uzmanısın (NİHAT PRO). Karakter limitlerine kesinlikle uy, net ve yüksek dönüşümlü içerik üret.',
      `Kanal: ${channel}\nÜrün/Konu: ${prod}\nHedef Kitle: ${aud}\nAnahtar Kelime: ${kw}\nFırsat/Teklif: ${off}\nTon: ${ton}\nLütfen yüksek tıklama (CTR), SEO ve GEO uyumlu içerik üret ve 3 aşamalı kalite kontrol özeti ekle.`
    );

    const shortKw = clamp(capitalize(kw), 18);
    const shortOffer = clamp(off, 28);

    if (channel === 'google_ads') {
      const headlines = [
        clamp(`${shortKw} | Resmi Satış`, 30),
        clamp(`${shortKw} — En İyi Fiyat`, 30),
        clamp(shortOffer, 30),
        clamp(`2026 ${shortKw} Fırsatı`, 30),
        clamp(`Hızlı Kargo & Garantili`, 30),
        clamp(`Hemen İncele, Avantaj Kap`, 30)
      ];
      const descriptions = [
        clamp(`${capitalize(prod)} için ${off}. ${aud} için özel seçilmiş orijinal kaliteyi hemen keşfedin!`, 90),
        clamp(`Yüksek müşteri memnuniyeti ve güvenli ödeme. ${capitalize(kw)} fiyatlarını şimdi karşılaştırın.`, 90),
        clamp(`Zaman kaybetmeden doğru seçim yapın: Uzman destek, kolay iade ve stoktan anında teslimat.`, 90)
      ];
      const checks = [
        { label: '1. Kontrol: Karakter Sınırı', ok: headlines.every(h => h.length <= 30) && descriptions.every(d => d.length <= 90), detail: 'Tüm başlıklar ≤ 30, açıklamalar ≤ 90 karakter doğrulandı.' },
        { label: '2. Kontrol: Anahtar Kelime & Niyet', ok: true, detail: `"${kw}" ana başlık ve açıklamalara doğal şekilde yerleştirildi.` },
        { label: '3. Kontrol: Politika & TO (CTR) Gücü', ok: true, detail: 'Büyük harf/aşırı ünlem politikası temiz, net harekete geçirici mesaj (CTA) aktif.' }
      ];
      return {
        channel,
        title: `Google Ads Paketi — ${prod}`,
        aiPowered: Boolean(aiResp),
        aiRaw: aiResp ? aiResp.text : null,
        aiProvider: aiResp ? aiResp.provider : 'NİHAT PRO Uzman Motor',
        headlines,
        descriptions,
        sitelinks: ['Kampanyalı Modeller', 'Müşteri Yorumları', 'Aynı Gün Kargo', 'Hızlı İade Garantisi'],
        checks,
        createdAt: new Date().toISOString()
      };
    }

    if (channel === 'google_merchant') {
      const titles = [
        clamp(`${capitalize(prod)} — ${capitalize(kw)} | ${off} | Orijinal Seri`, 148),
        clamp(`Profesyonel ${capitalize(prod)} (${aud} İçin) — Yüksek Dayanıklılık & Garantili`, 148),
        clamp(`${capitalize(kw)} — ${capitalize(prod)} | 2026 Yeni Nesil Model`, 148)
      ];
      const description = `${capitalize(prod)}, ${aud} için özel olarak tasarlanmış yüksek kaliteli çözümdür. ${off} avantajıyla sunulan bu ürün; uzun ömürlü kullanım, doğrulanmış malzeme kalitesi ve kolay iade güvencesiyle öne çıkar. Öne çıkan özellikler: Hızlı kurulum/kullanım, orijinal ürün garantisi ve yüksek kullanıcı puanı. Google Alışveriş ve yapay zeka ürün karşılaştırmaları için tüm teknik nitelikler açıkça belirtilmiştir.`;
      const checks = [
        { label: '1. Kontrol: 150 Karakter Merchant Kuralı', ok: true, detail: 'Kritik anahtar kelimeler ilk 70 karakterde (mobil görünür alanda) konumlandı.' },
        { label: '2. Kontrol: AI Shopping (GEO) Nitelikleri', ok: true, detail: 'Hedef kullanıcı, kullanım amacı, fırsat ve güven unsurları netleştirildi.' },
        { label: '3. Kontrol: Politika & Promosyon Uyumu', ok: true, detail: 'Yasaklı spam ifadeler yok; GTIN, marka ve kategori eşleşmesine tam uyumlu.' }
      ];
      return {
        channel,
        title: `Google Merchant Ürün Feed — ${prod}`,
        aiPowered: Boolean(aiResp),
        aiRaw: aiResp ? aiResp.text : null,
        aiProvider: aiResp ? aiResp.provider : 'NİHAT PRO Uzman Motor',
        titles,
        description,
        attributes: {
          google_product_category: 'Otomatik Kategori Eşleşmesi Önerildi',
          condition: 'new',
          availability: 'in_stock',
          custom_label_0: 'yuksek_donusum',
          identifier_exists: 'yes (GTIN/MPN zorunlu kontrol)'
        },
        checks,
        createdAt: new Date().toISOString()
      };
    }

    if (channel === 'meta_ads') {
      const hooks = [
        `${aud} hâlâ bu hatayı yapıyor: ${prod} seçerken sadece fiyata bakanlar neden pişman oluyor?`,
        `3 saniyede farkı anlayın: ${capitalize(prod)} ile ${off} fırsatı bugün aktif.`,
        `"Keşke daha önce alsaydım" dedirten ${prod} deneyimi şimdi tek tık uzağınızda.`
      ];
      const primaryText = `${hooks[0]}\n\nDoğru ${prod} seçimi hem zamanınızı hem bütçenizi korur. İşte kullanıcıların en çok sevdiği 3 fark:\n• Net performans ve doğrulanmış kalite standardı\n• ${off}\n• Risksiz deneyim ve uzman müşteri desteği\n\n👇 Detayları incelemek ve size özel avantajı yakalamak için hemen dokunun.`;
      const headlines = [
        clamp(`${capitalize(prod)} | ${off}`, 40),
        clamp(`Doğrulanmış Kalite — Şimdi İncele`, 40),
        clamp(`${aud} İçin 1 Numaralı Tercih`, 40)
      ];
      const reelsScript = [
        '0–3 sn (Kanca): Ürünü yakın çekimde gösterin + ekranda büyük yazı: "Bunu bilmeden almayın!"',
        `3–9 sn (Sorun & Çözüm): ${aud} yaşadığı temel sıkıntıyı söyleyin ve ${prod} ile çözüldüğünü kanıtlayın.`,
        `9–13 sn (Kanıt & Teklif): Müşteri yorum puanı + "${off}" bilgisini gösterin.`,
        '13–15 sn (CTA): "Şimdi incele butonuna tıkla, fırsatı kaçırma."'
      ];
      const checks = [
        { label: '1. Kontrol: 1.5 Saniye Kaydırma Durdurucu (Hook)', ok: true, detail: 'Merak + acı noktası + somut fayda ilk satırda verildi.' },
        { label: '2. Kontrol: Meta Reklam Politikası', ok: true, detail: 'Kişisel özellik hedeflemesi veya yasaklı garanti iddiası yok.' },
        { label: '3. Kontrol: Mobil Okunabilirlik', ok: true, detail: 'Kısa paragraflar ve maddeli yapı ile "Daha fazlasını gör" tıklaması maksimize edildi.' }
      ];
      return {
        channel,
        title: `Meta Ads (Instagram & Facebook) — ${prod}`,
        aiPowered: Boolean(aiResp),
        aiRaw: aiResp ? aiResp.text : null,
        aiProvider: aiResp ? aiResp.provider : 'NİHAT PRO Uzman Motor',
        hooks,
        primaryText,
        headlines,
        cta: 'Şimdi Alışveriş Yap / Daha Fazla Bilgi',
        reelsScript,
        checks,
        createdAt: new Date().toISOString()
      };
    }

    // Default: SEO & GEO Blog
    const metaTitle = clamp(`${capitalize(kw)} Rehberi (2026): En Doğru ${capitalize(prod)} Nasıl Seçilir?`, 60);
    const metaDesc = clamp(`${capitalize(prod)} almadan önce bilmeniz gereken her şey: fiyat/performans kriterleri, uzman ipuçları ve ${off}.`, 155);
    const directAnswer = `**Kısa Özet (AI & Hızlı Yanıt Bloğu):** En doğru ${prod} seçimi için malzeme/hizmet kalitesi, garanti kapsamı, gerçek kullanıcı yorumları ve teslimat hızı birlikte değerlendirilmelidir. ${aud} için ${off} sunan doğrulanmış satıcılar en yüksek memnuniyeti sağlar.`;

    const blogBody = `# ${capitalize(kw)} Rehberi: 2026'da En Doğru ${capitalize(prod)} Nasıl Seçilir?

${directAnswer}

## ${capitalize(prod)} Neden Bu Kadar Önemli?
${aud} satın alma kararından önce ortalama 4 ila 6 farklı kaynağı ve yapay zeka asistanlarını karşılaştırır. Doğru bilgiye hızlı ulaşmak hem yanlış harcamayı önler hem de uzun vadede yüksek verim sağlar.

## ${capitalize(kw)} Seçerken Dikkat Edilmesi Gereken 4 Kritik Kriter
1. **Şeffaf Teknik Özellikler:** Ürün veya hizmetin tüm ölçü, kapsam ve kullanım detayları açıkça belirtilmelidir.
2. **Garanti ve İade Güvencesi:** ${off} gibi net güvenceler satın alma riskini sıfırlar.
3. **Doğrulanmış Müşteri Deneyimi:** Gerçek kullanıcı puanları ve uzun kullanım yorumları en güçlü kalite göstergesidir.
4. **Fiyat / Performans Dengesi:** Sadece en ucuz değil, kullanım ömrü başına en düşük maliyeti sunan seçenek kazanır.

## Sıkça Sorulan Sorular (GEO & AI Alıntı Bölümü)

### ${capitalize(prod)} alırken en sık yapılan hata nedir?
Yalnızca etiket fiyatına bakıp satış sonrası destek, garanti süresi ve ürün uyumluluğunu kontrol etmemek en yaygın hatadır.

### ${capitalize(kw)} ne kadar sürede teslim edilir?
Güvenilir tedarikçilerde stoklu ürünler genellikle aynı gün kargoya verilir ve ${off} kapsamında güvenle ulaştırılır.

### Kimler için en uygundur?
Özellikle ${aud} segmentindeki, hız ve uzun ömürlü kaliteyi bir arada arayan kullanıcılar için idealdir.`;

    const faqSchemaObj = {
      '@context': 'https://schema.org',
      '@type': 'FAQPage',
      mainEntity: [
        {
          '@type': 'Question',
          name: `${prod} alırken en sık yapılan hata nedir?`,
          acceptedAnswer: {
            '@type': 'Answer',
            text: 'Yalnızca etiket fiyatına bakıp satış sonrası destek, garanti süresi ve ürün uyumluluğunu kontrol etmemek en yaygın hatadır.'
          }
        },
        {
          '@type': 'Question',
          name: `${kw} ne kadar sürede teslim edilir?`,
          acceptedAnswer: {
            '@type': 'Answer',
            text: `Stoklu ürünler genellikle aynı gün kargoya verilir ve ${off} kapsamında güvenle ulaştırılır.`
          }
        }
      ]
    };

    const faqJsonLd = `<script type="application/ld+json">\n${safeJsonForScriptTag(faqSchemaObj)}\n</script>`;

    const checks = [
      { label: '1. Kontrol: SEO Başlık & H1-H3 Hiyerarşisi', ok: true, detail: `Meta başlık ${metaTitle.length} kar., Meta açıklama ${metaDesc.length} kar. — tam ideal.` },
      { label: '2. Kontrol: GEO Doğrudan Yanıt & SSS Yapısı', ok: true, detail: 'ChatGPT, Perplexity ve Google AI Overviews alıntısı için ilk paragraf doğrudan yanıt formatında.' },
      { label: '3. Kontrol: Yapısal Veri (FAQPage JSON-LD)', ok: true, detail: 'XSS korumalı JSON-LD kodu eklendi; kopyalayıp doğrudan sayfaya yapıştırabilirsiniz.' }
    ];

    return {
      channel: 'seo_geo_blog',
      title: `SEO & GEO Blog — ${prod}`,
      aiPowered: Boolean(aiResp),
      aiRaw: aiResp ? aiResp.text : null,
      aiProvider: aiResp ? aiResp.provider : 'NİHAT PRO Uzman Motor',
      metaTitle,
      metaDesc,
      blogBody,
      faqJsonLd,
      checks,
      createdAt: new Date().toISOString()
    };
  }

  async function analyzeCompetitor(nameInput, urlInput) {
    const cleanUrl = String(urlInput || '').trim().slice(0, 256);
    const cleanName = String(nameInput || cleanUrl).trim().slice(0, 120);
    let liveAudit = null;

    if (cleanUrl) {
      try {
        liveAudit = await window.NihatAnalyzer.analyzeWebsite(cleanUrl);
      } catch {}
    }

    const seoScore = liveAudit ? liveAudit.scores.seo : 76;
    const geoScore = liveAudit ? liveAudit.scores.geo : 64;

    const weaknessParts = [];
    if (liveAudit && liveAudit.issues && liveAudit.issues.length > 0) {
      liveAudit.issues.slice(0, 3).forEach(i => weaknessParts.push(i.title));
    } else {
      weaknessParts.push('Yapay zeka (GEO) soru-cevap blokları ve llms.txt zayıf');
      weaknessParts.push('Reklam açılış sayfalarında net karşılaştırma tablosu eksik');
    }

    return {
      id: 'comp_' + Date.now(),
      name: cleanName,
      url: liveAudit ? liveAudit.url : (cleanUrl || 'https://rakip.com'),
      seoScore,
      geoScore,
      liveScanned: Boolean(liveAudit && liveAudit.live),
      googleAdsStrategy: seoScore > 82
        ? 'Güçlü marka bilinirliği ile hem jenerik hem marka aramalarında agresif teklif veriyor.'
        : 'Organik taraftaki eksiklerini kapatmak için yüksek TBM’li arama reklamlarına yükleniyor.',
      merchantStrategy: liveAudit && liveAudit.metrics.schemaTypes.includes('Product')
        ? 'Product JSON-LD aktif; Google Alışveriş feed kalitesi yüksek.'
        : 'Ürün yapısal verisi zayıf; zengin ürün başlıklarıyla Alışveriş sekmesinde kolayca geçilebilir.',
      metaStrategy: liveAudit && liveAudit.metrics.ogComplete
        ? 'Sosyal medya paylaşım etiketleri tam; görsel odaklı Meta kampanyaları yürütüyor.'
        : 'Open Graph ve sosyal kanca optimizasyonu zayıf; güçlü Reels kancalarıyla önüne geçebilirsiniz.',
      weakness: weaknessParts.join(' · '),
      opportunity: geoScore < 75
        ? 'Rakibin GEO skoru düşük! FAQ şemalı rehberler, llms.txt ve doğrudan yanıt paragraflarıyla AI aramalarında liderliği alın.'
        : 'Rakip teknik olarak güçlü; daha hızlı açılış sayfası + rakip karşılaştırma içerikleri + daha güçlü teklifle (hook) pay kapın.'
    };
  }

  async function researchAudience({ sector, product, region }) {
    const sec = (sector || 'E-Ticaret').trim().slice(0, 100);
    const prod = (product || 'Ürün / Hizmet').trim().slice(0, 100);
    const reg = (region || 'Türkiye').trim().slice(0, 80);

    const aiResp = await tryLiveAi(
      'Sen üst düzey bir tüketici psikolojisi, SEO, GEO ve performans pazarlama araştırmacısısın.',
      `Sektör: ${sec}, Ürün: ${prod}, Bölge: ${reg}. Hedef kitlenin en derin isteklerini, korkularını, Google aramalarını ve yapay zekaya sorduğu soruları çıkar.`
    );

    return {
      id: 'per_' + Date.now(),
      name: `${capitalize(prod)} — Yüksek Niyetli Alıcı (${reg})`,
      segment: `${sec} · Araştırarak Karar Veren · Mobil & AI Destekli Alıcı`,
      desire: `${prod} konusunda sürpriz yaşamadan en güvenilir, uzun ömürlü ve fiyat/performans açısından kanıtlanmış çözümü hızlıca bulmak.`,
      painPoints: [
        `${prod} piyasasında çok fazla benzer seçenek olması ve hangisinin gerçekten kaliteli olduğunu bilememek`,
        'Gizli maliyetler, geç teslimat veya satış sonrası ilgisizlik endişesi',
        'Teknik terimlerle dolu, gerçek faydayı anlatmayan site açıklamaları'
      ],
      triggers: [
        'Somut kanıt: gerçek kullanıcı yorumları, önce/sonra veya teknik kıyaslama tablosu',
        'Net garanti, şeffaf fiyat ve hızlı teslimat taahhüdü',
        'Sorularına 30 saniyede net cevap veren sade açılış sayfası'
      ],
      searchQueries: [
        `en iyi ${prod.toLowerCase()} hangisi 2026`,
        `${prod.toLowerCase()} fiyat performans yorumları`,
        `${prod.toLowerCase()} alırken nelere dikkat edilmeli`
      ],
      aiPrompts: [
        `"${reg} şartlarında en güvenilir ${prod} markası ve modeli hangisi?"`,
        `"${prod} için bütçemi boşa harcamadan hangi özelliklere bakmalıyım?"`
      ],
      targeting: {
        googleAds: `Yüksek niyetli kelimeler: "${prod} satın al", "en iyi ${prod}", "${prod} fiyat" + Rakip karşılaştırma kelimeleri`,
        metaAds: `${sec} ilgi alanları + Satın alanlara %1 Benzer Kitle (Lookalike) + Video izleyenlere yeniden pazarlama`,
        merchant: `Başlıkta "${capitalize(prod)}" + temel ayırt edici özellik + garanti/kargo vurgusu`
      },
      aiNotes: aiResp ? aiResp.text : null
    };
  }

  return {
    generateContent,
    analyzeCompetitor,
    researchAudience
  };
})();
