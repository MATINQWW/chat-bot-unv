const { originAllowed, rateLimited, baseHeaders } = require('../lib/common');

// تبدیل گفتار به متن برای مرورگرهایی که SpeechRecognition ندارند (مثل iOS Safari).
// به یک سرویس سازگار با OpenAI (/audio/transcriptions) وصل می‌شود؛ تنظیم env:
//   آدرس و مدل: بخش transcribe در config.js
//                       یا https://api.openai.com/v1/audio/transcriptions
//   TRANSCRIBE_API_KEY  کلید همان سرویس
const MAX_BYTES = 2.5 * 1024 * 1024;
const LANGS = new Set(['fa', 'ar', 'en']);

function kindOf(b) {
  if (b.length > 4 && b[0] === 0x1A && b[1] === 0x45 && b[2] === 0xDF && b[3] === 0xA3) return ['webm', 'audio/webm'];
  if (b.slice(0, 4).toString('latin1') === 'OggS') return ['ogg', 'audio/ogg'];
  if (b.length > 12 && b.slice(4, 8).toString('latin1') === 'ftyp') return ['m4a', 'audio/mp4'];
  return null;
}
async function readBody(req) {
  if (Buffer.isBuffer(req.body)) return req.body;
  const chunks = []; let n = 0;
  for await (const c of req) { n += c.length; if (n > MAX_BYTES) return null; chunks.push(c); }
  return Buffer.concat(chunks);
}

module.exports = async (req, res) => {
  baseHeaders(res);
  if (req.method !== 'POST') return res.status(405).end();
  if (!originAllowed(req)) return res.status(403).json({ error: 'forbidden' });
  const T = require('../config').transcribe || {};
  if (!T.url || !process.env.TRANSCRIBE_API_KEY) {
    return res.status(501).json({ error: 'not_configured', message: 'تبدیل گفتار به متن روی سرور تنظیم نشده است.' });
  }
  if (await rateLimited(req, 'stt', 6, 30)) return res.status(429).json({ error: 'rate_limited', message: 'تعداد درخواست‌ها زیاد است.' });
  const len = parseInt(req.headers['content-length'] || '0', 10);
  if (len > MAX_BYTES) return res.status(413).json({ error: 'too_large' });
  try {
    const buf = await readBody(req);
    if (!buf || !buf.length || buf.length > MAX_BYTES) return res.status(413).json({ error: 'too_large' });
    const kind = kindOf(buf);
    if (!kind) return res.status(415).json({ error: 'unsupported_audio' });
    const lang = String((req.query && req.query.lang) || 'fa').slice(0, 2);
    const fd = new FormData();
    fd.append('file', new Blob([buf], { type: kind[1] }), `voice.${kind[0]}`);
    fd.append('model', T.model || 'whisper-1');
    if (LANGS.has(lang)) fd.append('language', lang);
    fd.append('response_format', 'json');
    const r = await fetch(T.url, {
      method: 'POST', headers: { Authorization: 'Bearer ' + process.env.TRANSCRIBE_API_KEY },
      body: fd, signal: AbortSignal.timeout(20000),
    });
    if (!r.ok) { console.error('stt upstream', r.status); return res.status(502).json({ error: 'stt_failed' }); }
    const j = await r.json();
    return res.status(200).json({ text: String(j.text || '').slice(0, 1000) });
  } catch (e) { console.error('stt', e && e.message); return res.status(500).json({ error: 'server_error' }); }
};
