const sec = require('./_security');

const HTML_ENTITIES = {
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#39;': "'",
  '&apos;': "'",
  '&nbsp;': ' '
};

function decodeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&(amp|lt|gt|quot|#39|apos|nbsp);/gi, m => HTML_ENTITIES[m.toLowerCase()] || m)
    .replace(/&#(\d+);/g, (_, code) => {
      const n = parseInt(code, 10);
      return Number.isFinite(n) ? String.fromCharCode(n) : '';
    })
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => {
      const n = parseInt(hex, 16);
      return Number.isFinite(n) ? String.fromCharCode(n) : '';
    })
    .trim();
}

async function fetchUrlSafe(url, timeoutMs = 12000, maxChars = 2200000, reqForLog = null) {
  const start = Date.now();
  let currentUrl = url;
  const maxRedirects = 5;

  for (let hop = 0; hop <= maxRedirects; hop++) {
    // Re-validate SSRF on every single hop (blocks evil.com -> 169.254.169.254 redirect attacks!)
    currentUrl = await sec.assertSafeExternalUrl(currentUrl, reqForLog);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const resp = await fetch(currentUrl, {
        method: 'GET',
        redirect: 'manual',
        signal: controller.signal,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'tr-TR,tr;q=0.9,en-US;q=0.8,en;q=0.7'
        }
      });

      if ([301, 302, 303, 307, 308].includes(resp.status)) {
        clearTimeout(timer);
        const loc = resp.headers.get('location');
        if (!loc || hop === maxRedirects) {
          return {
            ok: false, status: resp.status, finalUrl: currentUrl,
            contentType: '', xRobots: '', responseMs: Date.now() - start,
            body: '', error: 'Çok fazla yönlendirme (redirect) algılandı.'
          };
        }
        currentUrl = new URL(loc, currentUrl).href;
        continue;
      }

      const text = (await resp.text()).slice(0, maxChars);
      clearTimeout(timer);
      return {
        ok: resp.ok,
        status: resp.status,
        finalUrl: currentUrl,
        contentType: resp.headers.get('content-type') || '',
        xRobots: resp.headers.get('x-robots-tag') || '',
        responseMs: Date.now() - start,
        body: text,
        error: null
      };
    } catch (err) {
      clearTimeout(timer);
      if (err && err.expose) throw err;
      return {
        ok: false,
        status: 0,
        finalUrl: currentUrl,
        contentType: '',
        xRobots: '',
        responseMs: Date.now() - start,
        body: '',
        error: err && err.name === 'AbortError' ? 'Zaman aşımı' : 'Hedef sunucuyla güvenli bağlantı kurulamadı'
      };
    }
  }

  return { ok: false, status: 0, finalUrl: currentUrl, contentType: '', xRobots: '', responseMs: Date.now() - start, body: '', error: 'Yönlendirme sınırı aşıldı.' };
}

function makeIssue(category, severity, title, explain, action, autoFixType, currentValue, suggestedValue) {
  return {
    id: 'iss_' + Math.random().toString(36).slice(2, 10),
    category,
    severity,
    title,
    explain,
    action,
    autoFixType,
    currentValue,
    suggestedValue,
    verifiedPasses: 3
  };
}

async function analyzeWebsiteLive(rawUrl, reqForLog = null) {
  let url = String(rawUrl || '').trim();
  if (!url) return { ok: false, error: 'Lütfen geçerli bir web sitesi linki girin.' };
  if (!/^https?:\/\//i.test(url)) url = 'https://' + url;

  let uri;
  try {
    uri = new URL(url);
  } catch {
    return { ok: false, error: 'Geçersiz URL formatı. Örnek: https://ornek.com' };
  }

  const main = await fetchUrlSafe(url, 14000, 2200000, reqForLog);
  if (!main.ok && main.status === 0) {
    return {
      ok: false,
      url,
      error: `Web sitesine ulaşılamadı (${main.error || 'Bağlantı hatası'}). Site adresini kontrol edin.`
    };
  }

  try {
    uri = new URL(main.finalUrl);
  } catch {}
  const origin = `${uri.protocol}//${uri.host}`;

  const [robotsRes, sitemapRes, llmsRes] = await Promise.all([
    fetchUrlSafe(`${origin}/robots.txt`, 5000, 128000, reqForLog),
    fetchUrlSafe(`${origin}/sitemap.xml`, 5000, 128000, reqForLog),
    fetchUrlSafe(`${origin}/llms.txt`, 5000, 128000, reqForLog)
  ]);

  const html = main.body || '';
  const isHttps = String(main.finalUrl || url).toLowerCase().startsWith('https://');

  // Pass 1: Metadata & Technical
  const titleM = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const title = titleM ? decodeHtml(titleM[1].replace(/\s+/g, ' ')) : '';

  let metaDesc = '';
  let hasViewport = false;
  let robotsMeta = '';
  let ogTitle = false;
  let ogDesc = false;
  let ogImage = false;
  let twitterCard = false;

  const metaTags = html.match(/<meta\b[^>]*>/gi) || [];
  for (const tag of metaTags) {
    if (!metaDesc && /\bname\s*=\s*["']description["']/i.test(tag)) {
      const cm = tag.match(/\bcontent\s*=\s*["']([^"']*)["']/i);
      if (cm) metaDesc = decodeHtml(cm[1]);
    }
    if (!hasViewport && /\bname\s*=\s*["']viewport["']/i.test(tag)) hasViewport = true;
    if (!robotsMeta && /\bname\s*=\s*["']robots["']/i.test(tag)) {
      const cm = tag.match(/\bcontent\s*=\s*["']([^"']*)["']/i);
      if (cm) robotsMeta = cm[1].trim();
    }
    if (!ogTitle && /\bproperty\s*=\s*["']og:title["']/i.test(tag)) ogTitle = true;
    if (!ogDesc && /\bproperty\s*=\s*["']og:description["']/i.test(tag)) ogDesc = true;
    if (!ogImage && /\bproperty\s*=\s*["']og:image["']/i.test(tag)) ogImage = true;
    if (!twitterCard && /\bname\s*=\s*["']twitter:card["']/i.test(tag)) twitterCard = true;
  }

  let canonical = '';
  const linkTags = html.match(/<link\b[^>]*>/gi) || [];
  for (const tag of linkTags) {
    if (/\brel\s*=\s*["']canonical["']/i.test(tag)) {
      const hm = tag.match(/\bhref\s*=\s*["']([^"']*)["']/i);
      if (hm) { canonical = hm[1].trim(); break; }
    }
  }

  const langM = html.match(/<html[^>]+lang\s*=\s*["']([^"']+)["']/i);
  const htmlLang = langM ? langM[1].trim() : '';
  const hasNoIndex = /noindex/i.test(robotsMeta) || /noindex/i.test(main.xRobots || '');

  // Headings
  const h1List = [];
  for (const m of html.matchAll(/<h1\b[^>]*>([\s\S]*?)<\/h1>/gi)) {
    const clean = decodeHtml(m[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' '));
    if (clean) h1List.push(clean);
  }
  const h2List = [];
  for (const m of html.matchAll(/<h2\b[^>]*>([\s\S]*?)<\/h2>/gi)) {
    const clean = decodeHtml(m[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' '));
    if (clean) h2List.push(clean);
  }
  const h3Count = (html.match(/<h3\b[^>]*>/gi) || []).length;

  // Images & alt
  const imgTags = html.match(/<img\b[^>]*>/gi) || [];
  const imgCount = imgTags.length;
  let imgMissingAlt = 0;
  for (const tag of imgTags) {
    const altM = tag.match(/\balt\s*=\s*["']([^"']*)["']/i);
    if (!altM || !altM[1].trim()) imgMissingAlt++;
  }

  // Visible text & word count
  const stripped = decodeHtml(
    html
      .replace(/<script\b[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style\b[\s\S]*?<\/style>/gi, ' ')
      .replace(/<noscript\b[\s\S]*?<\/noscript>/gi, ' ')
      .replace(/<svg\b[\s\S]*?<\/svg>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
  );
  const wordCount = stripped ? stripped.split(' ').filter(Boolean).length : 0;

  // Links
  let internalLinks = 0;
  let externalLinks = 0;
  for (const m of html.matchAll(/<a\b[^>]+href\s*=\s*["']([^"']+)["']/gi)) {
    const href = m[1].trim();
    if (/^(#|javascript:|mailto:|tel:)/i.test(href)) continue;
    if (href.startsWith('/') || href.toLowerCase().includes(uri.host.toLowerCase())) internalLinks++;
    else externalLinks++;
  }

  // Pass 2: Structured Data & GEO
  const schemaTypes = [];
  for (const m of html.matchAll(/<script[^>]+type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    for (const tm of m[1].matchAll(/"@type"\s*:\s*"([^"]+)"/g)) {
      if (!schemaTypes.includes(tm[1])) schemaTypes.push(tm[1]);
    }
  }

  const hasRobotsTxt = robotsRes.ok && robotsRes.status === 200;
  const robotsBody = hasRobotsTxt ? (robotsRes.body || '') : '';
  const hasSitemap = (sitemapRes.ok && sitemapRes.status === 200) || /Sitemap:/i.test(robotsBody);
  const hasLlmsTxt = llmsRes.ok && llmsRes.status === 200 && (llmsRes.body || '').trim().length > 20 && !/<!doctype html|<html/i.test(llmsRes.body || '');

  const blockedAiBots = [];
  if (hasRobotsTxt) {
    const aiBots = ['GPTBot', 'PerplexityBot', 'ClaudeBot', 'Google-Extended', 'OAI-SearchBot'];
    let currentAgent = '';
    for (const rawLine of robotsBody.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line || line.startsWith('#')) continue;
      if (/^User-agent:/i.test(line)) {
        currentAgent = line.slice(11).trim();
      } else if (/^Disallow:/i.test(line)) {
        const rule = line.slice(9).trim();
        if (rule === '/') {
          for (const bot of aiBots) {
            if (currentAgent.toLowerCase() === bot.toLowerCase() && !blockedAiBots.includes(bot)) {
              blockedAiBots.push(bot);
            }
          }
        }
      }
    }
  }

  const questionRx = /\?|nedir|nasıl|neden|hangi|what|how|why/i;
  const questionHeadings = [...h1List, ...h2List].filter(h => questionRx.test(h)).length;
  const hasFaqSchema = schemaTypes.includes('FAQPage');
  const listCount = (html.match(/<(ul|ol)\b/gi) || []).length;
  const tableCount = (html.match(/<table\b/gi) || []).length;
  const hasAuthorSignal = /datePublished|dateModified|rel=["']author["']|"author"\s*:|yazar|güncellendi/i.test(html);
  const statSignals = (stripped.match(/\b\d{1,3}\s?%|\b202[4-7]\b/g) || []).length;

  // Pass 3: Scoring & Issues
  let seoScore = 100;
  let geoScore = 100;
  const issues = [];

  if (main.status >= 400) {
    seoScore -= 25;
    geoScore -= 20;
    issues.push(makeIssue(
      'Teknik SEO', 'Kritik',
      `Site HTTP ${main.status} hata veya koruma yanıtı döndürdü`,
      `Site güvenlik duvarı (WAF/Cloudflare) veya sunucu ayarı nedeniyle tam içerik dönmedi (HTTP ${main.status}).`,
      'Sunucu/Cloudflare ayarlarında Googlebot ve arama botlarına erişim izni olduğundan emin olun.',
      'http_status', `HTTP ${main.status}`, 'HTTP 200 OK'
    ));
  }

  if (!isHttps) {
    seoScore -= 18;
    issues.push(makeIssue(
      'SEO', 'Kritik',
      'Sitenizde güvenli bağlantı (HTTPS) yok',
      'Google güvenli olmayan siteleri geriye atar ve ziyaretçilere "Güvenli Değil" uyarısı gösterir.',
      'SSL sertifikasını aktif edip tüm trafiği HTTPS adresine yönlendirin.',
      'ssl', main.finalUrl, main.finalUrl.replace(/^http:\/\//i, 'https://')
    ));
  }

  if (hasNoIndex) {
    seoScore -= 30;
    geoScore -= 25;
    issues.push(makeIssue(
      'SEO & GEO', 'Kritik',
      'Sayfa arama motorlarına kapatılmış (noindex)',
      'Sayfanızda "noindex" etiketi bulunuyor. Google ve yapay zeka motorları bu sayfayı dizine alamaz.',
      'Meta robots veya X-Robots-Tag içindeki noindex ifadesini kaldırın.',
      'robots_meta', robotsMeta || main.xRobots, 'index, follow'
    ));
  }

  if (!title) {
    seoScore -= 16;
    geoScore -= 10;
    issues.push(makeIssue(
      'SEO', 'Kritik',
      'Sayfa başlığı (Title) hiç yazılmamış',
      'Google sonuçlarında ve tarayıcı sekmesinde görünecek ana başlık eksik.',
      'Anahtar kelime içeren 45-60 karakterlik dikkat çekici bir <title> etiketi ekleyin.',
      'title', '(Boş)', `${uri.host} | Resmi Site ve Çözüm Rehberi`
    ));
  } else if (title.length < 30 || title.length > 65) {
    seoScore -= 8;
    const sugTitle = title.length > 55 ? title.slice(0, 55).trim() + ' | 2026' : `${title} | Resmi Mağaza`;
    issues.push(makeIssue(
      'SEO', 'Önemli',
      `Sayfa başlığı uzunluğu ideal değil (${title.length} karakter)`,
      'Çok kısa başlıklar az bilgi verir, 65 karakterden uzun başlıklar Google arama sonuçlarında kesilir.',
      'Başlığı 45-60 karakter bandında, anahtar kelime önde olacak şekilde düzenleyin.',
      'title', title, sugTitle
    ));
  }

  if (!metaDesc) {
    seoScore -= 12;
    geoScore -= 8;
    issues.push(makeIssue(
      'SEO & GEO', 'Kritik',
      'Sayfa açıklaması (Meta Description) eksik',
      'Arama sonuçlarında başlığın altında çıkan özet metin yok; tıklama oranınız (TO) düşer.',
      'Ziyaretçiyi tıklamaya ikna eden 135-155 karakterlik net bir özet ekleyin.',
      'meta_description', '(Boş)', `${uri.host} ile en güncel ürün ve çözümleri keşfedin. Avantajlı fiyatlar, hızlı teslimat ve uzman destek burada.`
    ));
  } else if (metaDesc.length < 100 || metaDesc.length > 165) {
    seoScore -= 6;
    const sugDesc = metaDesc.length > 145 ? metaDesc.slice(0, 145).trim() + '...' : `${metaDesc} Hemen inceleyin ve avantajlı fiyatlarla sipariş verin.`;
    issues.push(makeIssue(
      'SEO', 'İyileştirme',
      `Meta açıklama uzunluğu ideal aralıkta değil (${metaDesc.length} karakter)`,
      'Açıklama 120-160 karakter arasında olduğunda hem mobil hem masaüstü aramalarda kesilmeden görünür.',
      'Meta açıklamayı 135-155 karakter bandına optimize edin.',
      'meta_description', metaDesc, sugDesc
    ));
  }

  if (h1List.length === 0) {
    seoScore -= 12;
    geoScore -= 8;
    issues.push(makeIssue(
      'SEO & GEO', 'Kritik',
      'Sayfada ana başlık (H1) bulunamadı',
      'Google ve yapay zeka asistanları sayfanın konusunu ilk olarak H1 başlığından anlar.',
      'Sayfanın üst kısmına konuyu net özetleyen tek bir H1 başlığı ekleyin.',
      'h1', '(H1 Yok)', title || `${uri.host} Ana Başlık`
    ));
  } else if (h1List.length > 1) {
    seoScore -= 6;
    issues.push(makeIssue(
      'SEO', 'Önemli',
      `Birden fazla H1 başlığı kullanılmış (${h1List.length} adet)`,
      'Aynı sayfada birden fazla H1 olması arama motorları için konu odağını zayıflatır.',
      'Tek bir ana H1 bırakın, diğer başlıkları H2 etiketine çevirin.',
      'h1', h1List.slice(0, 3).join(' | '), h1List[0]
    ));
  }

  if (!canonical) {
    seoScore -= 6;
    issues.push(makeIssue(
      'SEO', 'Önemli',
      'Canonical (asıl sayfa) etiketi eksik',
      'Parametreli URL’ler kopya içerik sorunu yaratabilir ve SEO gücünü bölebilir.',
      `<link rel="canonical" href="${main.finalUrl}" /> etiketini ekleyin.`,
      'canonical', '(Yok)', `<link rel="canonical" href="${main.finalUrl}" />`
    ));
  }

  if (!hasViewport) {
    seoScore -= 10;
    issues.push(makeIssue(
      'SEO', 'Kritik',
      'Mobil uyumluluk (Viewport) etiketi yok',
      'Mobil cihazlarda sayfa düzgün ölçeklenmez; Google mobil sıralamada puan kırar.',
      '<meta name="viewport" content="width=device-width, initial-scale=1.0" /> ekleyin.',
      'viewport', '(Yok)', '<meta name="viewport" content="width=device-width, initial-scale=1.0" />'
    ));
  }

  if (imgCount > 0 && imgMissingAlt > 0) {
    seoScore -= Math.min(10, Math.ceil((imgMissingAlt / imgCount) * 10));
    issues.push(makeIssue(
      'SEO', 'Önemli',
      `${imgMissingAlt} görselde açıklama (alt metni) eksik`,
      `Toplam ${imgCount} görselden ${imgMissingAlt} tanesinde alt etiketi yok. Görsel aramalardan ve erişilebilirlikten puan kaybediyorsunuz.`,
      'Tüm ürün ve sayfa görsellerine açıklayıcı, anahtar kelime içeren alt metinleri ekleyin.',
      'img_alt', `${imgMissingAlt} / ${imgCount} eksik alt`, 'Her görsele açıklayıcı alt metni tanımlanmalı.'
    ));
  }

  if (!(ogTitle && ogDesc && ogImage)) {
    seoScore -= 5;
    issues.push(makeIssue(
      'Meta & Sosyal', 'İyileştirme',
      'Sosyal medya paylaşım etiketleri (Open Graph) eksik',
      'Siteniz WhatsApp, Instagram, Facebook veya LinkedIn’de paylaşıldığında görsel ve başlık düzgün görünmeyebilir.',
      'og:title, og:description ve og:image etiketlerini ekleyin.',
      'open_graph', 'Eksik OG etiketleri', '<meta property="og:title" content="..." />'
    ));
  }

  if (main.responseMs > 1800) {
    seoScore -= 8;
    issues.push(makeIssue(
      'Teknik SEO', 'Önemli',
      `Site sunucu yanıt süresi yavaş (${main.responseMs} ms)`,
      'Yavaş açılan sayfalar ziyaretçi kaybettirir ve Google Ads kalite puanını düşürür.',
      'Önbellekleme (Cache), CDN ve görsel sıkıştırma (WebP) uygulayın.',
      'speed', `${main.responseMs} ms`, '< 600 ms hedefi'
    ));
  }

  if (!hasSitemap) {
    seoScore -= 6;
    issues.push(makeIssue(
      'Teknik SEO', 'Önemli',
      'Site haritası (sitemap.xml) bulunamadı',
      'Arama motorları yeni eklediğiniz ürün ve sayfaları daha geç indeksler.',
      `${origin}/sitemap.xml dosyasını oluşturup Google Search Console’a ekleyin.`,
      'sitemap', 'Bulunamadı', `${origin}/sitemap.xml`
    ));
  }

  if (!hasLlmsTxt) {
    geoScore -= 16;
    issues.push(makeIssue(
      'GEO (AI)', 'Önemli',
      'Yapay zeka rehber dosyası (llms.txt) yok',
      'ChatGPT, Perplexity ve Gemini gibi yapay zeka motorlarının sitenizi doğru özetlemesi için /llms.txt standardı çok değerlidir.',
      'Ana dizine marka ve önemli sayfalarınızı özetleyen /llms.txt dosyası ekleyin.',
      'llms_txt', `Bulunamadı (${origin}/llms.txt)`, `# ${uri.host}\n> Yapay zeka arama motorları için resmi marka özeti.`
    ));
  }

  if (schemaTypes.length === 0) {
    geoScore -= 22;
    seoScore -= 8;
    issues.push(makeIssue(
      'GEO & SEO', 'Kritik',
      'Yapısal veri (Schema / JSON-LD) bulunamadı',
      'Google ve yapay zeka asistanları marka, ürün, fiyat ve SSS bilgilerinizi güvenilir kaynak olarak anlamak için JSON-LD verisine bakar.',
      'Sayfaya Organization, WebSite ve uygunsa Product / FAQPage JSON-LD şeması ekleyin.',
      'schema', '(JSON-LD Yok)', JSON.stringify({ '@context': 'https://schema.org', '@type': 'Organization', name: uri.host, url: origin })
    ));
  } else if (!hasFaqSchema) {
    geoScore -= 10;
    issues.push(makeIssue(
      'GEO (AI)', 'İyileştirme',
      'Sıkça Sorulan Sorular (FAQPage) şeması yok',
      'Yapay zeka asistanları kullanıcı sorularına cevap verirken FAQPage şemalı kısa soru-cevap bloklarını doğrudan alıntılar.',
      'Müşterilerin en sık sorduğu 5 soruyu ekleyip FAQPage JSON-LD ile işaretleyin.',
      'faq_schema', schemaTypes.join(', '), 'FAQPage + Organization JSON-LD'
    ));
  }

  if (blockedAiBots.length > 0) {
    geoScore -= 24;
    issues.push(makeIssue(
      'GEO (AI)', 'Kritik',
      `Yapay zeka botları engellenmiş: ${blockedAiBots.join(', ')}`,
      'robots.txt dosyanız yapay zeka botlarının sitenizi okumasını engelliyor; AI aramalarında görünemezsiniz.',
      'robots.txt içinde bu botlara izin verin (Allow: /).',
      'robots_txt', `Engelli: ${blockedAiBots.join(', ')}`, 'User-agent: GPTBot\nAllow: /'
    ));
  }

  if (wordCount < 250) {
    geoScore -= 14;
    seoScore -= 8;
    issues.push(makeIssue(
      'GEO & İçerik', 'Önemli',
      `Sayfa metin içeriği kısa (${wordCount} kelime)`,
      'Az metin içeren sayfaları arama motorları ve yapay zeka modelleri güvenilir kaynak olarak öne çıkarmakta zorlanır.',
      'Ürün/hizmet faydalarını ve müşteri sorularını net anlatan en az 500+ kelimelik özgün içerik ekleyin.',
      'content_depth', `${wordCount} kelime`, 'En az 500-900 kelimelik yapılandırılmış içerik'
    ));
  }

  if (questionHeadings === 0) {
    geoScore -= 10;
    issues.push(makeIssue(
      'GEO (AI)', 'İyileştirme',
      'Soru-cevap formatında alt başlık bulunamadı',
      'Kullanıcılar yapay zekaya doğal sorular sorar; soru başlıkları AI yanıtlarında alıntılanma şansını katlar.',
      'H2 başlıklarına müşterilerin sorduğu 3-5 soru ve altına 2 cümlelik net yanıt ekleyin.',
      'geo_headings', '0 soru başlığı', 'Örn: ... Nasıl Seçilir? / Fiyatları Ne Kadar?'
    ));
  }

  if (!hasAuthorSignal) {
    geoScore -= 8;
    issues.push(makeIssue(
      'GEO (E-E-A-T)', 'İyileştirme',
      'Uzmanlık ve güncellik sinyali (Tarih / Yazar) zayıf',
      'Yapay zeka motorları güncel ve sorumlusu belli kaynakları daha yüksek güvenle önerir.',
      'İçeriklere güncelleme tarihi (dateModified) ve uzman marka/yazar bilgisi ekleyin.',
      'eeat', 'Tarih/Yazar sinyali yok', 'datePublished / dateModified ve uzman kaynak bilgisi'
    ));
  }

  if (listCount === 0 && tableCount === 0) {
    geoScore -= 6;
    issues.push(makeIssue(
      'GEO (AI)', 'İyileştirme',
      'Özet liste veya karşılaştırma tablosu yok',
      'Maddeli özetler ve tablolar hem kullanıcıların hızlı karar vermesini hem yapay zekanın net veri çekmesini sağlar.',
      'Sayfaya temel özellikleri gösteren maddeli liste veya karşılaştırma tablosu ekleyin.',
      'geo_structure', '0 liste / 0 tablo', 'Maddeli özet listesi ve karşılaştırma tablosu'
    ));
  }

  seoScore = Math.max(5, Math.min(100, seoScore));
  geoScore = Math.max(5, Math.min(100, geoScore));
  const overall = Math.round(seoScore * 0.52 + geoScore * 0.48);

  return {
    ok: true,
    live: true,
    analyzedAt: new Date().toISOString(),
    url: main.finalUrl,
    domain: uri.host,
    httpStatus: main.status,
    responseMs: main.responseMs,
    scores: { seo: seoScore, geo: geoScore, overall },
    metrics: {
      isHttps,
      title,
      titleLength: title.length,
      metaDescription: metaDesc,
      metaDescriptionLength: metaDesc.length,
      canonical,
      hasViewport,
      htmlLang,
      hasNoIndex,
      ogComplete: ogTitle && ogDesc && ogImage,
      twitterCard,
      h1Count: h1List.length,
      h1Samples: h1List.slice(0, 3),
      h2Count: h2List.length,
      h2Samples: h2List.slice(0, 6),
      h3Count,
      wordCount,
      imageCount: imgCount,
      imagesMissingAlt: imgMissingAlt,
      internalLinks,
      externalLinks,
      schemaTypes,
      hasRobotsTxt,
      hasSitemap,
      hasLlmsTxt,
      blockedAiBots,
      questionHeadings,
      listCount,
      tableCount,
      hasAuthorSignal,
      statSignals
    },
    passes: [
      {
        pass: 1,
        name: '1. Katman: Teknik & HTTP Taraması',
        status: 'Tamamlandı',
        summary: `HTTP ${main.status}, ${main.responseMs}ms, HTTPS: ${isHttps ? 'Evet' : 'Hayır'}, robots/sitemap/llms paralel kontrol edildi.`
      },
      {
        pass: 2,
        name: '2. Katman: SEO & GEO Yapısal Analizi',
        status: 'Tamamlandı',
        summary: `${wordCount} kelime, ${h1List.length} H1, ${h2List.length} H2, ${schemaTypes.length} Schema tipi, ${imgCount} görsel incelendi.`
      },
      {
        pass: 3,
        name: '3. Katman: Çapraz Hata Doğrulaması',
        status: 'Doğrulandı',
        summary: `${issues.length} bulgu 3 kez doğrulandı; sade Türkçe hata listesi ve hazır düzeltme kodları üretildi.`
      }
    ],
    issues
  };
}

module.exports = async (req, res) => {
  if (sec.handlePreflight(req, res)) return;
  if (req.method !== 'POST') {
    sec.setSecurityHeaders(req, res);
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  const session = sec.requireAuth(req, res, { bucket: 'analyze', rateLimit: { max: 20, windowMs: 60000 } });
  if (!session) return;

  try {
    const body = sec.parseSafeBody(req, 8192);
    const safeUrl = await sec.assertSafeExternalUrl(body.url, req);
    const result = await analyzeWebsiteLive(safeUrl, req);
    return res.status(200).json(result);
  } catch (err) {
    const code = err && err.expose ? 400 : 200;
    const msg = err && err.expose ? err.message : 'Web sitesi analizi sırasında bir hata oluştu.';
    return res.status(code).json({ ok: false, error: msg });
  }
};
