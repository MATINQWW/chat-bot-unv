const OpenAI = require('openai');
const crypto = require('crypto');
const { sign, validSig, ipHash, originAllowed, rateLimited, baseHeaders } = require('../lib/common');
const { describe } = require('../lib/learn');
const { retrieveKnowledge, RULES, REMINDER, getLearner } = require('../lib/prompt');
const { parseAttachment, AttError } = require('../lib/attachments');

const client = new OpenAI({
  apiKey: process.env.ICP_API_KEY,
  baseURL: 'https://irancopilot.com/studio/pro/v1/',
});

const LIMITS = {
  maxBodyBytes: 60 * 1024,
  maxBodyBytesWithAttachment: 4 * 1024 * 1024,
  maxRawMessages: 12,
  maxContentChars: 20000,
  sendHistory: 2,
  sendChars: 500,
  perMinute: 8, perHour: 60,
  attPerMinute: 3, attPerHour: 15,
};

// بودجهٔ توکن: اگر سرویس بالادستی 413 (جا نشدن ورودی + خروجی) داد، با بودجهٔ کوچک‌تر دوباره تلاش می‌کنیم
const BUDGETS = [
  { knowledge: parseInt(process.env.ICP_KNOWLEDGE_CHARS || '1800', 10), maxTokens: parseInt(process.env.ICP_MAX_TOKENS || '800', 10) },
  { knowledge: 1000, maxTokens: 600 },
  { knowledge: 500,  maxTokens: 450 },
];

async function retryWithBackoff(fn, maxRetries = 2) {
  let lastError;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      const status = err.status || (err.response && err.response.status);
      const retryable = status === 429 || status === 502 || status === 503 || status === 504;
      if (!retryable || attempt === maxRetries) throw err;
      const base = Math.pow(2, attempt) * 1000;
      const waitMs = Math.min(base + Math.random() * 500, 4000);
      console.warn(`upstream ${status} — retry ${attempt + 1}/${maxRetries} after ${Math.round(waitMs)}ms`);
      await new Promise(r => setTimeout(r, waitMs));
    }
  }
  throw lastError;
}

module.exports = async (req, res) => {
  baseHeaders(res);
  if (req.method !== 'POST') return res.status(405).end();
  if (!originAllowed(req)) return res.status(403).json({ error: 'forbidden' });

  const body = (req.body && typeof req.body === 'object') ? req.body : {};
  const hasAtt = !!body.attachment;
  const len = parseInt((req.headers && req.headers['content-length']) || '0', 10);
  if (len > (hasAtt ? LIMITS.maxBodyBytesWithAttachment : LIMITS.maxBodyBytes)) {
    return res.status(413).json({ error: 'payload_too_large', message: 'پیام ارسالی بیش از حد بزرگ است.' });
  }
  const limited = hasAtt
    ? await rateLimited(req, 'att', LIMITS.attPerMinute, LIMITS.attPerHour)
    : await rateLimited(req, 'chat', LIMITS.perMinute, LIMITS.perHour);
  if (limited) {
    res.setHeader('Retry-After', '60');
    return res.status(429).json({ error: 'rate_limited', message: 'تعداد درخواست‌ها زیاد است. لطفاً کمی بعد دوباره تلاش کنید.' });
  }

  try {
    if (!process.env.ICP_API_KEY) {
      console.error('ICP_API_KEY is not set');
      return res.status(500).json({ error: 'server_error', message: 'سرویس در حال حاضر در دسترس نیست.' });
    }

    // ─── کلید یکتا برای هر درخواست کاربر (بین retryها ثابت می‌ماند) ───
    const idempotencyKey = crypto.randomUUID();

    const input = Array.isArray(body.messages) ? body.messages.slice(-LIMITS.maxRawMessages) : [];
    let messages = input.filter(m =>
      m && typeof m.content === 'string' && m.content.length > 0 && m.content.length <= LIMITS.maxContentChars &&
      (m.role === 'user' || (m.role === 'assistant' && validSig(m.content, m.sig)))
    ).map(m => ({ role: m.role, content: m.content }));
    messages = messages.slice(-LIMITS.sendHistory);
    while (messages.length && messages[0].role !== 'user') messages.shift();
    if (!messages.length || messages[messages.length - 1].role !== 'user') {
      return res.status(400).json({ error: 'bad_request', message: 'پیام نامعتبر است.' });
    }
    messages = messages.map(m => ({ role: m.role, content: m.content.slice(0, LIMITS.sendChars) }));

    let att = null;
    try { att = await parseAttachment(body.attachment); }
    catch (e) {
      if (e instanceof AttError) return res.status(e.status).json({ error: 'attachment', message: e.message });
      throw e;
    }

    const question = messages[messages.length - 1].content;
    const firstTurn = messages.length === 1;
    const L = getLearner();
    const info = describe(question);

    // ─── ۱) حافظه ───
    if (!att && info.ok && (firstTurn || !info.deictic)) {
      const hit = await L.lookup(info);
      if (hit) {
        await L.recordHit(info, hit);
        return res.status(200).json({ reply: hit.answer, sig: sign(hit.answer), cid: hit.key, cached: true });
      }
    }

    // ─── ۲) پاسخ مدل ───
    let knowledge = '', topScore = 0, knowledgeSources = [], verifiedSourceCount = 0;
    const model = att && att.kind === 'image'
      ? (process.env.ICP_VISION_MODEL || 'icp-chat')
      : (process.env.ICP_MODEL || 'icp-chat');
    const last = messages.length - 1;
    if (att && att.kind === 'text') {
      messages[last].content += `\n\n<attachment name="${att.name}">\n${att.text}\n</attachment>`;
    } else if (att && att.kind === 'image') {
      messages[last].content = [
        { type: 'text', text: messages[last].content },
        { type: 'image_url', image_url: { url: `data:${att.mime};base64,${att.b64}` } },
      ];
    }

    let completion;
    const baseMessages = messages;
    try {
      for (let b = 0; b < BUDGETS.length; b++) {
        const r = await retrieveKnowledge(question, BUDGETS[b].knowledge);
        knowledge = r.text; topScore = r.topScore;
        knowledgeSources = r.sources || [];
        verifiedSourceCount = r.verifiedCount || 0;
        try {
          completion = await retryWithBackoff(() =>
            client.chat.completions.create(
              {
                model,
                messages: [
                  { role: 'system', content: RULES },
                  { role: 'system', content: 'اطلاعات مرجع:\n' + knowledge },
                ].concat(baseMessages, [{ role: 'system', content: REMINDER }]),
                temperature: 0.2,
                max_tokens: BUDGETS[b].maxTokens,
                stream: false,
              },
              { headers: { 'Idempotency-Key': idempotencyKey } }
            )
          );
          break;
        } catch (e) {
          const st = e && (e.status || (e.response && e.response.status));
          const tooBig = st === 413 || /context|413/i.test(String(e && e.message));
          if (tooBig && b < BUDGETS.length - 1) {
            console.warn(`upstream 413 — retry with smaller budget #${b + 1}`);
            continue;
          }
          throw e;
        }
      }
    } catch (apiErr) {
      console.error('upstream error', apiErr && apiErr.status, apiErr && apiErr.message);
      const status = apiErr && apiErr.status;
      if (status === 429 || status === 503) {
        return res.status(503).json({ error: 'model_overloaded', message: 'سرویس هوش مصنوعی در این لحظه شلوغ است. لطفاً چند لحظه دیگر دوباره تلاش کنید.' });
      }
      if (status === 413) {
        return res.status(413).json({ error: 'context_too_large', message: 'پیام یا پیوست برای مدل بیش از حد بزرگ است. لطفاً کوتاه‌تر بنویسید یا پیوست را کوچک‌تر کنید.' });
      }
      if (att && att.kind === 'image' && (status === 400 || status === 422)) {
        return res.status(422).json({ error: 'vision_unsupported', message: 'مدل فعلی تحلیل تصویر را پشتیبانی نمی‌کند. متن تصویر را تایپ کنید.' });
      }
      return res.status(502).json({ error: 'model_error', message: 'خطایی در دریافت پاسخ رخ داد. لطفاً دوباره تلاش کنید.' });
    }

    const choice = completion.choices && completion.choices[0];
    const reply = (choice && choice.message && choice.message.content) || '';
    const u = completion.usage || {};
    const used = (u.prompt_tokens || 0) + (u.completion_tokens || 0) ||
      Math.ceil((RULES.length + knowledge.length + question.length + reply.length) / 3);

    // ─── ۳) یادگیری ───
    let cid = '';
    if (reply && !att) {
      try {
        const state = await L.observe({
          info, answer: reply, ipHash: ipHash(req), usedTokens: used,
          // Automatic answer promotion stays disabled until cache invalidation is tied to live knowledge revisions.
          retrievalScore: topScore, eligibleToStore: false,
        });
        if (info.ok && firstTurn && state !== 'banned') cid = info.key;
      } catch (e) { console.warn('learn failed', e && e.message); }
    }
    return res.status(200).json({ reply, sig: reply ? sign(reply) : '', cid, sources: knowledgeSources, knowledgeStatus: verifiedSourceCount > 0 ? 'verified_sources_found' : 'no_verified_official_sources' });
  } catch (e) {
    console.error('server error', e);
    return res.status(500).json({ error: 'server_error', message: 'خطای داخلی سرور.' });
  }
};
