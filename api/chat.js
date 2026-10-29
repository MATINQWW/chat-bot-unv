const crypto = require('crypto');
const { sign, signCid, validSig, ipHash, originAllowed, rateLimited, baseHeaders, kv } = require('../lib/common');
const { describe } = require('../lib/learn');
const { retrieveKnowledge, RULES, REMINDER, getLearner } = require('../lib/prompt');
const { faqAnswer, smallTalk } = require('../lib/knowledge');
const { parseAttachment, AttError } = require('../lib/attachments');
const llm = require('../lib/llm');   // یک یا چند سرویس مدل (OpenAI-compatible) — تنظیمات در lib/llm.js

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
// تاریخچه: فقط سؤال‌های قبلی کاربر (prevQ تا، هرکدام qChars) + آخرین پاسخ بات بریده‌شده (aChars).
// پاسخ‌های بلند قبلی بات بیشترین سهم توکن تاریخچه را داشتند و برای فهم سؤال بعدی لازم نیستند.
const C = require('../config');
const BUDGETS = [
  { knowledge: 0, maxTokens: 0, prevQ: 3, qChars: 200, aChars: 300, chars: 800 },   // ← از config.js (llm.maxTokens، llm.knowledgeChars)
  { knowledge: 1000, maxTokens: 600, prevQ: 2, qChars: 150, aChars: 200, chars: 500 },
  { knowledge: 500,  maxTokens: 450, prevQ: 1, qChars: 150, aChars: 0,   chars: 500 },
];

// پیشنهاد «درخواست تماس» وقتی پاسخ به مرکز هدایت تحصیلی ارجاع می‌دهد —
// فقط اگر جای ماندگاری برای ثبت هست (Redis یا webhook)؛ وگرنه درخواست‌ها گم می‌شوند و دکمه نشان داده نمی‌شود
const leadAvailable = () => !!(kv.remote || process.env.LEAD_WEBHOOK_URL);
const offerLead = (t) => leadAvailable() && /35354049|۳۵۳۵۴۰۴۹|ندارم/.test(String(t || ''));

const LANG_NAMES = { fa: 'فارسی', en: 'English', ar: 'العربية' };

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
  if (!llm.configured()) {
    console.error('no LLM provider configured — check config.js (llm) and its key variable in Environment Variables');
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
    const question0 = fullMessages[fullMessages.length - 1].content;
    const question = question0.slice(0, 500);
    const wantStream = body.stream === true && C.llm.stream !== false;
    BUDGETS[0].knowledge = C.llm.knowledgeChars || 1800; BUDGETS[0].maxTokens = C.llm.maxTokens || 800;
    const shape = (b) => {
      const B = BUDGETS[b];
      const prior = fullMessages.slice(0, -1);
      const prevQs = prior.filter(m => m.role === 'user').slice(-B.prevQ).map(m => m.content.slice(0, B.qChars).replace(/\s+/g, ' '));
      const last = prior[prior.length - 1];
      const out = [];
      if (prevQs.length) {
        out.push({ role: 'user', content: 'سؤال‌های قبلی من در این گفتگو:\n' + prevQs.map(q => '- ' + q).join('\n') });
        const a = last && last.role === 'assistant' && B.aChars ? last.content.slice(0, B.aChars) : '';
        out.push({ role: 'assistant', content: a ? a + (last.content.length > B.aChars ? ' …' : '') : '(پاسخ داده شد)' });
      }
      out.push({ role: 'user', content: question0.slice(0, B.chars) });
      return out;
    };

    let att = null;
    try { att = await parseAttachment(body.attachment); }
    catch (e) {
      if (e instanceof AttError) return res.status(e.status).json({ error: 'attachment', message: e.message });
      throw e;
    }

    const L = getLearner();
    const info = describe(question);

    // ─── ۰) FAQ آماده: صفر توکن، بدون شبکه ───
    if (!att) {
      const st = smallTalk(question);
      if (st) return res.status(200).json({ reply: st, sig: sign(st), cid: '', cached: 'smalltalk', lead: false });
    }
    if (!att && (firstTurn || !info.deictic)) {
      const faq = faqAnswer(question);
      if (faq) return res.status(200).json({ reply: faq.answer, sig: sign(faq.answer), cid: '', cached: 'faq', lead: offerLead(faq.answer) });
    }

    // ─── ۱) حافظه ───
    if (!att && info.ok && (firstTurn || !info.deictic)) {
      const hit = await L.lookup(info);
      if (hit) {
        await L.recordHit(info, hit);
        return res.status(200).json({ reply: hit.answer, sig: sign(hit.answer), cid: signCid(hit.key), cached: hit.via || true, lead: offerLead(hit.answer) });
      }
    }

    // ─── ۲) پاسخ مدل ───
    let knowledge = '', topScore = 0;
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

    // بازیابی یک‌بار (Vector یک درخواست شبکه است)؛ در بودجه‌های کوچک‌تر فقط برش داده می‌شود
    // برای سؤال‌های پیگیری کوتاه («بازار کارش چطوره؟») سؤال قبلی کاربر هم به جست‌وجو اضافه می‌شود
    const prevUser = fullMessages.length > 2 ? fullMessages[fullMessages.length - 3].content.slice(0, 200) : '';
    const searchQ = (prevUser && (info.deictic || question.length < 40)) ? prevUser + '\n' + question : question;
    const r0 = await retrieveKnowledge(searchQ, BUDGETS[0].knowledge);
    topScore = r0.topScore;
    const cut = (limit) => {
      const parts = r0.text ? r0.text.split('\n\n---\n\n') : [];
      const out = []; let n = 0;
      for (const p of parts) { if (n + p.length > limit && out.length) break; out.push(p); n += p.length; }
      return out.join('\n\n---\n\n');
    };

    let completion, streamed = false, release = () => {};
    try {
      for (let b = 0; b < BUDGETS.length; b++) {
        knowledge = b === 0 ? r0.text : cut(BUDGETS[b].knowledge);
        // یک پیام system واحد در ابتدا (چند پیام system و system در انتها روی همهٔ مدل‌ها مطمئن نیست)
        const system = [RULES, langHint, 'اطلاعات مرجع:\n' + (knowledge || '(موردی یافت نشد)'), REMINDER].join('\n\n');
        try {
          const r = await llm.complete({
            messages: [{ role: 'system', content: system }].concat(withAtt(shape(b))),
            maxTokens: BUDGETS[b].maxTokens, stream: wantStream, vision: !!(att && att.kind === 'image'),
            idempotencyKey: `${idempotencyKey}-${b}`,
          });
          completion = r.result; streamed = r.streamed; release = r.release;
          break;
        } catch (e) {
          if (llm.kind(e) === 'too_big' && b < BUDGETS.length - 1) {
            console.warn(`upstream too big — retry with smaller budget #${b + 1}`);
            continue;
          }
          throw e;
        }
      }
    } catch (apiErr) {
      const status = apiErr && apiErr.status;
      console.error('upstream error', status, apiErr && apiErr.name, apiErr && apiErr.message);
      if (apiErr && apiErr.busy) {
        // همهٔ سرویس‌ها پر/خراب: به‌جای خطای خشک، پیشنهاد تماس
        res.setHeader('Retry-After', '20');
        return res.status(503).json({ error: 'busy', lead: leadAvailable(), message: 'الان تعداد پرسش‌ها خیلی زیاد است. چند لحظهٔ دیگر دوباره بپرسید' + (leadAvailable() ? ' یا شماره‌تان را بگذارید تا مشاور با شما تماس بگیرد.' : ' یا با ۰۳۱-۳۵۳۵۴۰۴۹ تماس بگیرید.') });
      }
      if (apiErr && /timeout|timed out/i.test(`${apiErr.name} ${apiErr.message}`)) {
        return res.status(504).json({ error: 'model_timeout', message: 'پاسخ مدل بیش از حد طول کشید. لطفاً دوباره تلاش کنید.' });
      }
      if (status === 429 || status === 503) {
        return res.status(503).json({ error: 'model_overloaded', message: 'سرویس هوش مصنوعی در این لحظه شلوغ است. لطفاً چند لحظه دیگر دوباره تلاش کنید.' });
      }
      if (status === 401 || status === 403) {
        console.error('Upstream rejected the API key');
        return res.status(500).json({ error: 'server_error', message: 'سرویس در حال حاضر در دسترس نیست.' });
      }
      if (status === 404) console.error('Model not found — check model name');
      if (status === 413) {
        return res.status(413).json({ error: 'context_too_large', message: 'پیام یا پیوست برای مدل بیش از حد بزرگ است. لطفاً کوتاه‌تر بنویسید یا پیوست را کوچک‌تر کنید.' });
      }
      if (att && att.kind === 'image' && (status === 400 || status === 422)) {
        return res.status(422).json({ error: 'vision_unsupported', message: 'مدل فعلی تحلیل تصویر را پشتیبانی نمی‌کند. متن تصویر را تایپ کنید.' });
      }
      return res.status(502).json({ error: 'model_error', message: 'خطایی در دریافت پاسخ رخ داد. لطفاً دوباره تلاش کنید.' });
    }

    let reply = '', finish = null, usage = null;
    const EMPTY = 'پاسخی دریافت نشد. لطفاً دوباره تلاش کنید.';
    // SSE: «data: {"d":"تکه"}» … و در پایان «data: {"done":true,reply,sig,cid,lead}» یا «data: {"error":..}»
    const sse = (o) => res.write('data: ' + JSON.stringify(o) + '\n\n');
    if (wantStream) {
      res.statusCode = 200;
      res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
      res.setHeader('X-Accel-Buffering', 'no');
      if (res.flushHeaders) res.flushHeaders();
      try {
        // سرویسی که stream ندارد: پاسخ کامل را یک‌جا به‌عنوان یک تکه بفرست
        const chunks = streamed ? completion : [{ choices: [{ delta: { content: completion.choices && completion.choices[0] && completion.choices[0].message && completion.choices[0].message.content }, finish_reason: completion.choices && completion.choices[0] && completion.choices[0].finish_reason }], usage: completion.usage }];
        for await (const ch of chunks) {
          const c = ch && ch.choices && ch.choices[0];
          const d = c && c.delta && c.delta.content;
          if (d) { reply += d; sse({ d }); }
          if (c && c.finish_reason) finish = c.finish_reason;
          if (ch && ch.usage) usage = ch.usage;
        }
      } catch (e) {
        console.error('stream broke', e && e.message);
        if (!reply) { sse({ error: 'model_error', message: 'خطایی در دریافت پاسخ رخ داد. لطفاً دوباره تلاش کنید.' }); return res.end(); }
        finish = 'length'; // پاسخ ناقص: نمایش داده می‌شود ولی در حافظه ذخیره نمی‌شود
      } finally { release(); }
      reply = reply.trim();
      if (!reply) { console.error('empty reply from model (stream)', finish); sse({ error: 'empty_reply', message: EMPTY }); return res.end(); }
    } else {
      release();
      const choice = completion.choices && completion.choices[0];
      reply = ((choice && choice.message && choice.message.content) || '').trim();
      finish = choice && choice.finish_reason;
      usage = completion.usage;
      if (!reply) {
        // مدل‌های «thinking» اگر توکن را صرف استدلال کنند ممکن است محتوای خالی بدهند
        console.error('empty reply from model', finish);
        return res.status(502).json({ error: 'empty_reply', message: EMPTY });
      }
    }
    const u = usage || {};
    const used = (u.prompt_tokens || 0) + (u.completion_tokens || 0) ||
      Math.ceil((RULES.length + knowledge.length + question.length + reply.length) / 3);

    // ─── ۳) یادگیری ───
    let cid = '';
    if (!att) {
      try {
        const state = await L.observe({
          info, answer: reply, ipHash: ipHash(req), usedTokens: used,
          retrievalScore: topScore, eligibleToStore: firstTurn && finish !== 'length',
        });
        if (info.ok && firstTurn && state !== 'banned') cid = signCid(info.key);
      } catch (e) { console.warn('learn failed', e && e.message); }
    }
    const out = { reply, sig: sign(reply), cid, lead: offerLead(reply) };
    if (wantStream) { sse({ done: true, ...out }); return res.end(); }
    return res.status(200).json(out);
  } catch (e) {
    console.error('server error', e);
    if (res.headersSent) { try { res.write('data: ' + JSON.stringify({ error: 'server_error', message: 'خطای داخلی سرور.' }) + '\n\n'); } catch {} return res.end(); }
    return res.status(500).json({ error: 'server_error', message: 'خطای داخلی سرور.' });
  }
};
