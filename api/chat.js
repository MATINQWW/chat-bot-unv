const OpenAI = require('openai');
const { sign, signCid, validSig, ipHash, originAllowed, rateLimited, baseHeaders } = require('../lib/common');
const { describe } = require('../lib/learn');
const { retrieveKnowledge, RULES, REMINDER, getLearner } = require('../lib/prompt');
const { parseAttachment, AttError } = require('../lib/attachments');

// ─── Ollama Cloud (OpenAI-compatible) ───
// env: OLLAMA_API_KEY (الزامی) · OLLAMA_MODEL (پیش‌فرض gemma4:31b) · OLLAMA_BASE_URL (پیش‌فرض https://ollama.com/v1)
const MODEL = () => process.env.OLLAMA_MODEL || 'gemma4:31b';
const VISION_MODEL = () => process.env.OLLAMA_VISION_MODEL || MODEL();

// ساخت کلاینت به‌صورت lazy: اگر کلید تنظیم نباشد، SDK هنگام import خطا می‌دهد و تابع کلاً می‌خوابید.
let _client = null;
function getClient() {
  if (_client) return _client;
  _client = new OpenAI({
    apiKey: process.env.OLLAMA_API_KEY,
    baseURL: (process.env.OLLAMA_BASE_URL || 'https://ollama.com/v1').replace(/\/+$/, '') + '/',
    maxRetries: 0,      // retry را خودمان کنترل می‌کنیم (SDK پیش‌فرض ۲ بار تکرار می‌کرد و با retry دستی ضرب می‌شد)
    timeout: 40000,     // سقف انتظار برای مدل؛ باید کمتر از maxDuration تابع (۶۰ ثانیه) باشد
  });
  return _client;
}

const LIMITS = {
  maxBodyBytes: 60 * 1024,
  maxBodyBytesWithAttachment: 4 * 1024 * 1024,
  maxRawMessages: 12,
  maxContentChars: 20000,
  sendHistory: 8,          // آخرین ۸ پیام به مدل می‌رود (قبلاً فقط ۲)
  sendCharsUser: 4000,     // هم‌سقف با maxlength فیلد ورودی
  sendCharsAssistant: 3000,
  perMinute: 8, perHour: 60,
  attPerMinute: 3, attPerHour: 15,
};

// اگر سرویس بالادستی ورودی را زیادی بزرگ دانست، با دانش کمتر دوباره تلاش می‌کنیم
const BUDGETS = [
  { knowledge: parseInt(process.env.OLLAMA_KNOWLEDGE_CHARS || '6000', 10), maxTokens: parseInt(process.env.OLLAMA_MAX_TOKENS || '2048', 10) },
  { knowledge: 2500, maxTokens: 1200 },
];

const LANG_NAMES = { fa: 'فارسی', en: 'English', ar: 'العربية' };

async function retryWithBackoff(fn, maxRetries = 2) {
  for (let attempt = 0; ; attempt++) {
    try {
      return await fn();
    } catch (err) {
      const status = err && (err.status || (err.response && err.response.status));
      const retryable = status === 429 || status === 502 || status === 503 || status === 504;
      if (!retryable || attempt >= maxRetries) throw err;
      const waitMs = Math.min(Math.pow(2, attempt) * 1000 + Math.random() * 500, 3000);
      console.warn(`upstream ${status} — retry ${attempt + 1}/${maxRetries} after ${Math.round(waitMs)}ms`);
      await new Promise(r => setTimeout(r, waitMs));
    }
  }
}

function isTooBig(e) {
  const st = e && (e.status || (e.response && e.response.status));
  return st === 413 || (st === 400 && /context|too (long|large)|token/i.test(String(e && e.message)));
}

module.exports = async (req, res) => {
  baseHeaders(res);
  if (req.method !== 'POST') return res.status(405).end();
  if (!originAllowed(req)) return res.status(403).json({ error: 'forbidden' });

  const body = (req.body && typeof req.body === 'object') ? req.body : {};
  const hasAtt = !!body.attachment;
  // اگر Content-Length نبود (chunked)، اندازهٔ واقعی را از روی بدنهٔ parse‌شده حساب می‌کنیم
  let len = parseInt((req.headers && req.headers['content-length']) || '0', 10);
  if (!len) { try { len = Buffer.byteLength(JSON.stringify(body)); } catch { len = 0; } }
  if (len > (hasAtt ? LIMITS.maxBodyBytesWithAttachment : LIMITS.maxBodyBytes)) {
    return res.status(413).json({ error: 'payload_too_large', message: 'پیام ارسالی بیش از حد بزرگ است.' });
  }

  // پیش از هر کاری: کلید API و کلید امضا
  if (!process.env.OLLAMA_API_KEY) {
    console.error('OLLAMA_API_KEY is not set');
    return res.status(500).json({ error: 'server_error', message: 'سرویس در حال حاضر در دسترس نیست.' });
  }

  const limited = hasAtt
    ? await rateLimited(req, 'att', LIMITS.attPerMinute, LIMITS.attPerHour)
    : await rateLimited(req, 'chat', LIMITS.perMinute, LIMITS.perHour);
  if (limited) {
    res.setHeader('Retry-After', '60');
    return res.status(429).json({ error: 'rate_limited', message: 'تعداد درخواست‌ها زیاد است. لطفاً کمی بعد دوباره تلاش کنید.' });
  }

  try {
    const input = Array.isArray(body.messages) ? body.messages.slice(-LIMITS.maxRawMessages) : [];
    let messages = input.filter(m =>
      m && typeof m.content === 'string' && m.content.length > 0 && m.content.length <= LIMITS.maxContentChars &&
      (m.role === 'user' || (m.role === 'assistant' && validSig(m.content, m.sig)))
    ).map(m => ({ role: m.role, content: m.content }));
    while (messages.length && messages[0].role !== 'user') messages.shift();
    if (!messages.length || messages[messages.length - 1].role !== 'user') {
      return res.status(400).json({ error: 'bad_request', message: 'پیام نامعتبر است.' });
    }
    // «نوبت اول» را باید قبل از بریدن تاریخچه تعیین کرد؛ قبلاً بعد از برش به ۲ پیام محاسبه می‌شد
    // و از نوبت سوم به بعد هر سؤال اشتباهاً «اولین سؤال» حساب می‌شد (آلودگی حافظه + پاسخ کش‌شدهٔ نامربوط).
    const firstTurn = messages.length === 1;
    messages = messages.slice(-LIMITS.sendHistory);
    while (messages.length && messages[0].role !== 'user') messages.shift();
    messages = messages.map(m => ({
      role: m.role,
      content: m.content.slice(0, m.role === 'user' ? LIMITS.sendCharsUser : LIMITS.sendCharsAssistant),
    }));

    let att = null;
    try { att = await parseAttachment(body.attachment); }
    catch (e) {
      if (e instanceof AttError) return res.status(e.status).json({ error: 'attachment', message: e.message });
      throw e;
    }

    const question = messages[messages.length - 1].content;
    const L = getLearner();
    const info = describe(question);

    // ─── ۱) حافظه ───
    if (!att && info.ok && (firstTurn || !info.deictic)) {
      const hit = await L.lookup(info);
      if (hit) {
        await L.recordHit(info, hit);
        return res.status(200).json({ reply: hit.answer, sig: sign(hit.answer), cid: signCid(hit.key), cached: true });
      }
    }

    // ─── ۲) پاسخ مدل ───
    let knowledge = '', topScore = 0;
    const model = att && att.kind === 'image' ? VISION_MODEL() : MODEL();
    const last = messages.length - 1;
    if (att && att.kind === 'text') {
      messages[last].content += `\n\n<attachment name="${att.name}">\n${att.text}\n</attachment>`;
    } else if (att && att.kind === 'image') {
      messages[last].content = [
        { type: 'text', text: messages[last].content },
        { type: 'image_url', image_url: { url: `data:${att.mime};base64,${att.b64}` } },
      ];
    }
    const langName = LANG_NAMES[String(body.lang || '')];
    const langHint = langName
      ? `زبان رابط کاربر: ${langName}. اگر کاربر به زبان دیگری نوشت، به همان زبان پاسخ بده.`
      : 'به زبانی که کاربر نوشته پاسخ بده.';

    let completion;
    try {
      for (let b = 0; b < BUDGETS.length; b++) {
        const r = retrieveKnowledge(question, BUDGETS[b].knowledge);
        knowledge = r.text; topScore = r.topScore;
        // یک پیام system واحد در ابتدا (چند پیام system و system در انتها روی قالب‌های Gemma/Ollama مطمئن نیست)
        const system = [RULES, langHint, 'اطلاعات مرجع:\n' + knowledge, REMINDER].join('\n\n');
        try {
          completion = await retryWithBackoff(() =>
            getClient().chat.completions.create({
              model,
              messages: [{ role: 'system', content: system }].concat(messages),
              temperature: 0.2,
              max_tokens: BUDGETS[b].maxTokens,
              stream: false,
            })
          );
          break;
        } catch (e) {
          if (isTooBig(e) && b < BUDGETS.length - 1) {
            console.warn(`upstream too big — retry with smaller budget #${b + 1}`);
            continue;
          }
          throw e;
        }
      }
    } catch (apiErr) {
      const status = apiErr && apiErr.status;
      console.error('upstream error', status, apiErr && apiErr.name, apiErr && apiErr.message);
      if (apiErr && /timeout|timed out/i.test(`${apiErr.name} ${apiErr.message}`)) {
        return res.status(504).json({ error: 'model_timeout', message: 'پاسخ مدل بیش از حد طول کشید. لطفاً دوباره تلاش کنید.' });
      }
      if (status === 429 || status === 503) {
        return res.status(503).json({ error: 'model_overloaded', message: 'سرویس هوش مصنوعی در این لحظه شلوغ است. لطفاً چند لحظه دیگر دوباره تلاش کنید.' });
      }
      if (status === 401 || status === 403) {
        console.error('Ollama rejected the API key (check OLLAMA_API_KEY)');
        return res.status(500).json({ error: 'server_error', message: 'سرویس در حال حاضر در دسترس نیست.' });
      }
      if (status === 404) console.error('Model not found — check OLLAMA_MODEL:', model);
      if (status === 413) {
        return res.status(413).json({ error: 'context_too_large', message: 'پیام یا پیوست برای مدل بیش از حد بزرگ است. لطفاً کوتاه‌تر بنویسید یا پیوست را کوچک‌تر کنید.' });
      }
      if (att && att.kind === 'image' && (status === 400 || status === 422)) {
        return res.status(422).json({ error: 'vision_unsupported', message: 'مدل فعلی تحلیل تصویر را پشتیبانی نمی‌کند. متن تصویر را تایپ کنید.' });
      }
      return res.status(502).json({ error: 'model_error', message: 'خطایی در دریافت پاسخ رخ داد. لطفاً دوباره تلاش کنید.' });
    }

    const choice = completion.choices && completion.choices[0];
    const reply = ((choice && choice.message && choice.message.content) || '').trim();
    if (!reply) {
      // مدل‌های «thinking» اگر توکن را صرف استدلال کنند ممکن است محتوای خالی بدهند
      console.error('empty reply from model', choice && choice.finish_reason);
      return res.status(502).json({ error: 'empty_reply', message: 'پاسخی دریافت نشد. لطفاً دوباره تلاش کنید.' });
    }
    const u = completion.usage || {};
    const used = (u.prompt_tokens || 0) + (u.completion_tokens || 0) ||
      Math.ceil((RULES.length + knowledge.length + question.length + reply.length) / 3);

    // ─── ۳) یادگیری ───
    let cid = '';
    if (!att) {
      try {
        const state = await L.observe({
          info, answer: reply, ipHash: ipHash(req), usedTokens: used,
          retrievalScore: topScore, eligibleToStore: firstTurn && !(choice && choice.finish_reason === 'length'),
        });
        if (info.ok && firstTurn && state !== 'banned') cid = signCid(info.key);
      } catch (e) { console.warn('learn failed', e && e.message); }
    }
    return res.status(200).json({ reply, sig: sign(reply), cid });
  } catch (e) {
    console.error('server error', e);
    return res.status(500).json({ error: 'server_error', message: 'خطای داخلی سرور.' });
  }
};
