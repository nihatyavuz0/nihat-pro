const sec = require('../_security');

const MODEL_ID_REGEX = /^[a-zA-Z0-9._-]{2,64}$/;

module.exports = async (req, res) => {
  if (sec.handlePreflight(req, res)) return;
  if (req.method !== 'POST') {
    sec.setSecurityHeaders(req, res);
    return res.status(405).json({ ok: false, fallback: true, message: 'Method not allowed' });
  }

  const session = sec.requireAuth(req, res, { bucket: 'ai-gen', rateLimit: { max: 20, windowMs: 60000 } });
  if (!session) return;

  try {
    const payload = sec.parseSafeBody(req, 24576);
    const prompt = String(payload.prompt || '').trim().slice(0, 4000);
    const systemPrompt = String(payload.systemPrompt || '').trim().slice(0, 2000);
    let provider = String(payload.provider || '').trim().toLowerCase();

    if (!prompt) {
      return res.status(400).json({ ok: false, fallback: true, message: 'İçerik istemi (prompt) boş olamaz.' });
    }

    // Never accept API keys from client request body; resolve exclusively from server vault / server env!
    const geminiCreds = sec.getServerPlatformCredentials('gemini');
    const openaiCreds = sec.getServerPlatformCredentials('openai');

    if (!provider) {
      if (geminiCreds.apiKey) provider = 'gemini';
      else if (openaiCreds.apiKey) provider = 'openai';
    }

    if (provider === 'gemini') {
      const apiKey = geminiCreds.apiKey;
      if (!apiKey) {
        return res.status(200).json({ ok: false, fallback: true, message: 'Sunucuda Gemini API anahtarı tanımlı değil.' });
      }
      const rawModel = String(payload.model || geminiCreds.model || 'gemini-2.5-flash').trim();
      const m = MODEL_ID_REGEX.test(rawModel) ? rawModel : 'gemini-2.5-flash';

      const resp = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(m)}:generateContent`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
          'x-goog-api-key': apiKey
        },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: `${systemPrompt}\n\n${prompt}` }] }]
        })
      });
      if (resp.ok) {
        const data = await resp.json();
        const text = data && data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts && data.candidates[0].content.parts[0] && data.candidates[0].content.parts[0].text;
        if (text) return res.status(200).json({ ok: true, provider: 'gemini', text });
      }
      return res.status(200).json({ ok: false, fallback: true, message: `Gemini servis yanıtı başarısız (HTTP ${resp.status}).` });
    }

    if (provider === 'openai') {
      const apiKey = openaiCreds.apiKey;
      if (!apiKey) {
        return res.status(200).json({ ok: false, fallback: true, message: 'Sunucuda OpenAI API anahtarı tanımlı değil.' });
      }
      const rawModel = String(payload.model || openaiCreds.model || 'gpt-4o-mini').trim();
      const m = MODEL_ID_REGEX.test(rawModel) ? rawModel : 'gpt-4o-mini';

      const resp = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
          Authorization: `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model: m,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: prompt }
          ]
        })
      });
      if (resp.ok) {
        const data = await resp.json();
        const text = data && data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
        if (text) return res.status(200).json({ ok: true, provider: 'openai', text });
      }
      return res.status(200).json({ ok: false, fallback: true, message: `OpenAI servis yanıtı başarısız (HTTP ${resp.status}).` });
    }

    return res.status(200).json({ ok: false, fallback: true, message: 'Canlı yapay zeka anahtarı tanımlı değil, yerel motor kullanılıyor.' });
  } catch (err) {
    const code = (err && err.statusCode) || 200;
    return res.status(code).json({ ok: false, fallback: true, message: 'Yapay zeka isteği işlenemedi.' });
  }
};
