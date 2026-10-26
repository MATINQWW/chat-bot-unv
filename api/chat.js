const OpenAI = require('openai');
const crypto = require('crypto');
const { sign, signCid, validSig, ipHash, originAllowed, rateLimited, baseHeaders, llmConfig } = require('../lib/common');
const { describe } = require('../lib/learn');
const { retrieveKnowledge, RULES, REMINDER, getLearner } = require('../lib/prompt');
const { parseAttachment, AttError } = require('../lib/attachments');

// ─── IranCopilot (OpenAI-compatible) ───
// env: ICP_API_KEY (الزامی) · ICP_MODEL (پیش‌فرض icp-chat) · ICP_VISION_MODEL · ICP_BASE_URL
// (برای سرویس دیگر، مثلاً Ollama: ICP_BASE_URL=https://ollama.com/v1 و ICP_MODEL=gemma4:31b)
let _client = null;
function getClient() {
  if (_client) return _client;
  const c = llmConfig();
  // ساخت lazy: اگر کلید نباشد، SDK هنگام import خطا می‌دهد و تابع کلاً می‌خوابید
  _client = new OpenAI({
    apiKey: c.key,
    baseURL: c.baseURL,
    maxRetries: 0,      // retry را خودمان کنترل می‌کنیم (SDK پیش‌فرض ۲ بار تکرار می‌کرد)
    timeout: 40000,     // کمتر از maxDuration تابع (۶۰ ثانیه)
  });
  return _client;
}

const LIMITS = {
  maxBodyBytes: 60 * 1024,
  maxBodyBytesWithAttachment: 4 * 1024 * 1024,
  maxRawMessages: 12,
  maxContentChars: 20000,
  perMinute: 8, perHour: 60,
  attPerMinute: 3, attPerHour: 15,
};

// سرویس بالادستی context کوچکی دارد و گاهی 413 می‌دهد (ورودی + خروجی جا نمی‌شود).
// پس از هر 413 با بودجهٔ کوچک‌تر (دانش، تاریخچه، خروجی) دوباره تلاش می‌کنیم.
const BUDGETS = [
  { knowledge: parseInt(process.env.ICP_KNOWLEDGE_CHARS || '1800', 10), maxTokens: parseInt(process.env.ICP_MAX_TOKENS || '800', 10), history: 4, chars: 800 },
  { knowledge: 1000, maxTokens: 600, history: 2, chars: 500 },
  { knowledge: 500,  maxTokens: 450, history: 1, chars: 500 },
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
  if (!llmConfig().key) {
    console.error('ICP_API_KEY is not set');
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
    const fullMessages = messages;
    // آخرین پیام کاربر برای سؤال/کش: با سقف هم‌اندازهٔ ورودی (نه سقف کوچک بودجه)
    const question = fullMessages[fullMessages.length - 1].content.slice(0, 500);
    const shape = (b) => {
      let m = fullMessages.slice(-BUDGETS[b].history);
      while (m.length && m[0].role !== 'user') m.shift();
      return m.map(x => ({ role: x.role, content: x.content.slice(0, BUDGETS[b].chars) }));
    };

    let att = null;
    try { att = await parseAttachment(body.attachment); }
    catch (e) {
      if (e instanceof AttError) return res.status(e.status).json({ error: 'attachment', message: e.message });
      throw e;
    }

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
    const cfg = llmConfig();
    const model = att && att.kind === 'image' ? cfg.visionModel : cfg.model;
    const withAtt = (msgs) => {
      const m = msgs.map(x => ({ ...x })), last = m.length - 1;
      if (att && att.kind === 'text') {
        m[last].content += `\n\n<attachment name="${att.name}">\n${att.text}\n</attachment>`;
      } else if (att && att.kind === 'image') {
        m[last].content = [
          { type: 'text', text: m[last].content },
          { type: 'image_url', image_url: { url: `data:${att.mime};base64,${att.b64}` } },
        ];
      }
      return m;
    };
    const idempotencyKey = crypto.randomUUID();
    const langName = LANG_NAMES[String(body.lang || '')];
    const langHint = langName
      ? `زبان رابط کاربر: ${langName}. اگر کاربر به زبان دیگری نوشت، به همان زبان پاسخ بده.`
      : 'به زبانی که کاربر نوشته پاسخ بده.';

    let completion;
    try {
      for (let b = 0; b < BUDGETS.length; b++) {
        const r = retrieveKnowledge(question, BUDGETS[b].knowledge);
        knowledge = r.text; topScore = r.topScore;
        // یک پیام system واحد در ابتدا (چند پیام system و system در انتها روی همهٔ مدل‌ها مطمئن نیست)
        const system = [RULES, langHint, 'اطلاعات مرجع:\n' + knowledge, REMINDER].join('\n\n');
        try {
          completion = await retryWithBackoff(() =>
            getClient().chat.completions.create({
              model,
              messages: [{ role: 'system', content: system }].concat(withAtt(shape(b))),
              temperature: 0.2,
              max_tokens: BUDGETS[b].maxTokens,
              stream: false,
            }, { headers: { 'Idempotency-Key': `${idempotencyKey}-${b}` } })
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
        console.error('Upstream rejected the API key (check ICP_API_KEY)');
        return res.status(500).json({ error: 'server_error', message: 'سرویس در حال حاضر در دسترس نیست.' });
      }
      if (status === 404) console.error('Model not found — check ICP_MODEL:', model);
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
