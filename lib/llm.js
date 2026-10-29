// ═══════════════════════════════════════════════════════════
// LLM — اتصال به مدل زبانی (هر سرویس سازگار با OpenAI)
//
// تنظیمات: فقط فایل llm.config.js در ریشهٔ پروژه (سرویس فعال، آدرس، مدل، اسم متغیر کلید).
// کلیدها فقط در Environment Variables. سرویس فعال را می‌شود با متغیر LLM_USE هم عوض کرد.
//
// رفتار: اگر سرویس فعال 429/5xx/timeout/خطای شبکه داد یا پر بود (maxConcurrent) → سرویس‌های fallback.
//   سرویسی که پشت سر هم خطا داد، BREAK_MS کنار گذاشته می‌شود. 401/403/404 هم سرویس را کنار می‌گذارد
//   (کلید/مدل اشتباه)، ولی خطای ۴۰۰/۴۱۳ (مشکل خود درخواست) مستقیم بالا می‌رود.
// شمارنده‌ها داخل هر instance هستند؛ روی Vercel هر instance سقف خودش را دارد (تقریبی ولی کافی).
// ═══════════════════════════════════════════════════════════
const OpenAI = require('openai');

const BREAK_AFTER = 3;                                  // چند خطای پیاپی تا قطع موقت
const BREAK_MS = parseInt(process.env.LLM_BREAK_MS || '60000', 10);
const TIMEOUT_MS = parseInt(process.env.LLM_TIMEOUT_MS || '40000', 10);

let _providers = null, _sig = '', _override = null;
function source() { return _override || require('../llm.config'); }
function config() {
  const cfg = source();
  const names = [process.env.LLM_USE || cfg.use, ...(cfg.fallback || [])].filter((n, i, a) => n && a.indexOf(n) === i);
  const defs = names.map(n => ({ n, d: (cfg.providers || {})[n] }));
  const sig = JSON.stringify(defs) + '|' + defs.map(x => x.d && process.env[x.d.key] || '').join('|') + '|' + process.env.LLM_STREAM;
  if (_providers && sig === _sig) return _providers;
  _providers = defs.map(({ n, d }) => {
    if (!d) { console.error(`llm.config.js: سرویس «${n}» تعریف نشده`); return null; }
    const key = process.env[d.key] || '';
    if (!key) console.error(`llm: کلید سرویس «${n}» تنظیم نشده (متغیر ${d.key} در Environment Variables)`);
    return {
      name: n,
      baseURL: String(d.url || '').replace(/\/+$/, '') + '/',
      key, keyName: d.key,
      model: d.model,
      visionModel: d.vision ? (d.visionModel || d.model) : null,
      stream: d.stream !== false && process.env.LLM_STREAM !== '0',
      extra: d.extra || null,
      maxConcurrent: Math.max(1, parseInt(d.maxConcurrent || process.env.LLM_MAX_CONCURRENT || '50', 10)),
      active: 0, fails: 0, brokenUntil: 0, client: null,
    };
  }).filter(p => p && p.key && p.model && p.baseURL !== '/');
  _sig = sig;
  return _providers;
}
function client(p) {
  return p.client || (p.client = new OpenAI({ apiKey: p.key, baseURL: p.baseURL, maxRetries: 0, timeout: TIMEOUT_MS }));
}
const configured = () => config().length > 0;
// اسم مدل فعال (برای نسخهٔ حافظهٔ یادگیری) و کلید فعال (جایگزین کلید امضا اگر CHAT_SIGNING_SECRET نباشد)
const activeModel = () => { const p = config()[0]; return p ? p.name + ':' + p.model : 'none'; };
const activeKey = () => { const p = config()[0]; return p ? p.key : ''; };

const statusOf = e => e && (e.status || (e.response && e.response.status));
function kind(e) {
  const st = statusOf(e);
  if (st === 413 || (st === 400 && /context|too (long|large)|token/i.test(String(e && e.message)))) return 'too_big';
  if (st === 429 || st === 502 || st === 503 || st === 504 || (st >= 500 && st < 600)) return 'retry';
  if (st === 401 || st === 403 || st === 404) return 'config';
  if (!st || /timeout|timed out|ECONN|ENOTFOUND|fetch failed|network|socket/i.test(`${e && e.name} ${e && e.message}`)) return 'retry';
  return 'fatal';  // 400/422 و...: مشکل خود درخواست؛ سرویس دیگر هم همان را می‌گوید
}

class BusyError extends Error { constructor(m) { super(m || 'all providers busy'); this.status = 503; this.busy = true; } }

// اجرای یک درخواست chat.completions روی اولین سرویس سالم.
// opts.stream: سرویس‌هایی که stream=false دارند پاسخ کامل می‌دهند (فراخوان باید هر دو را بپذیرد)
// خروجی: { result, provider, streamed, release }  ← فراخوان بعد از اتمام کار release() را صدا بزند
async function complete({ messages, maxTokens, temperature = 0.2, stream = false, vision = false, idempotencyKey }) {
  const now = Date.now();
  const list = config().filter(p => !(vision && !p.visionModel));
  if (!list.length) { const e = new Error(vision ? 'no vision-capable provider' : 'no LLM provider configured'); e.status = vision ? 422 : 500; e.noProvider = true; throw e; }
  let lastErr = null, sawCapacity = false;
  const healthy = list.filter(p => p.brokenUntil <= now);
  // اگر همه قطع موقت بودند، باز هم امتحان کن (بهتر از جواب ندادن)
  const pool = healthy.length ? healthy : list;
  // فقط یک سرویس: مثل قبل تا ۲ بار با فاصله دوباره تلاش کن. چند سرویس: به‌جای صبر، سراغ بعدی برو.
  const tries = pool.length === 1 ? 3 : 1;
  for (const p of pool) {
    for (let t = 0; t < tries; t++) {
      if (p.active >= p.maxConcurrent) { sawCapacity = true; break; }
      if (t > 0) await new Promise(r => setTimeout(r, Math.min(1000 * 2 ** (t - 1) + Math.random() * 300, 3000)));
      p.active++;
      let released = false;
      const release = () => { if (!released) { released = true; p.active--; } };
      try {
        const streamed = stream && p.stream;
        const result = await client(p).chat.completions.create({
          ...(p.extra || {}),
          model: vision ? p.visionModel : p.model, messages, temperature, max_tokens: maxTokens, stream: streamed,
        }, idempotencyKey ? { headers: { 'Idempotency-Key': `${idempotencyKey}-${p.name}-${t}` } } : undefined);
        p.fails = 0;
        return { result, provider: p.name, streamed, release };
      } catch (e) {
        release();
        const k = kind(e);
        console.warn(`llm ${p.name} failed (${statusOf(e) || e.name}) → ${k}`);
        if (k === 'too_big' || k === 'fatal') throw e;
        lastErr = e;
        if (k === 'config') { p.brokenUntil = Date.now() + BREAK_MS * 5; break; }
        if (++p.fails >= BREAK_AFTER) { p.brokenUntil = Date.now() + BREAK_MS; p.fails = 0; break; }
      }
    }
  }
  if (lastErr && !sawCapacity) throw lastErr;
  throw new BusyError();
}

function stats() { return config().map(p => ({ name: p.name, active: p.active, max: p.maxConcurrent, broken: p.brokenUntil > Date.now() })); }
// فقط برای تست: جایگزینی موقت llm.config.js
function _setConfig(c) { _override = c; _providers = null; _sig = ''; }
function _reset() { _providers = null; _sig = ''; }
module.exports = { complete, configured, activeModel, activeKey, kind, stats, BusyError, _reset, _setConfig };
