// ═══════════════════════════════════════════════════════════
// LEARN — حافظهٔ یادگیرندهٔ پرسش‌های تکراری (بدون هزینهٔ توکن در بازدیدهای بعدی)
//
// چرخه:  پرسش → نرمال‌سازی → جست‌وجوی شباهت در حافظه
//   ‣ پیدا شد  → پاسخ ذخیره‌شده، صفر توکن
//   ‣ پیدا نشد → مدل پاسخ می‌دهد؛ اگر پاسخ «مستند» بود و پرسش از چند کاربر مستقل
//                (IP متفاوت) تکرار شد، به حافظه ارتقا می‌یابد
//
// ضدآلودگی (poisoning): فقط پرسش‌های تک‌نوبتی، فقط پاسخ‌های مستند به knowledge،
// هر URL/شماره در پاسخ باید در knowledge باشد، حداقل N کاربر مستقل، 👎 دو کاربر = حذف،
// و با تغییر knowledge/prompt/مدل کل حافظه خودکار باطل می‌شود.
// ═══════════════════════════════════════════════════════════
const crypto = require('crypto');

const { learn: LC = {} } = require('../config');
const MIN_ASKERS = Math.max(1, LC.minAskers || 2);
const MAX_ENTRIES = LC.maxEntries || 300;
const SIM_THRESHOLD = LC.sim || 0.75;
const ASK_TTL = 7 * 86400;      // پنجرهٔ شمارش پرسندگان
const ENTRY_TTL = 30 * 86400;   // عمر هر پاسخ حافظه
const BAN_TTL = 7 * 86400;      // پس از حذف با 👎، تا این مدت دوباره ذخیره نمی‌شود

const STOP = new Set([
  'از','در','به','با','را','که','هم','یا','تا','بر','من','تو','او','ما','شما','این','آن','اون','ان','یه','یک','هر',
  'می','هست','است','بود','باشه','باشد','چه','چی','چرا','کی','کجا','چقدر','چطور','چگونه','برای','براي','هستن',
  'کنم','کنید','کنه','میشه','شود','شده','دارم','داره','دارد','ولی','اما','اگه','اگر','چیه','چیست','چطوره','هستش',
  'رو','کرد','بشه','لطفا','سلام','ممنون','خیلی','هستند','باید','میخوام','می خوام','میخواستم','بگید','بگو','بگین','توضیح','بدید','بده',
  'the','a','an','of','to','in','is','are','and','or','for','on','what','how','do','i','me','my','please'
]);
const DEICTIC = new Set(['این','آن','اون','همون','همین','قبلی','بالا','ادامه','دوباره','بعدی','اولی','دومی','سومی','آخری']);

function digits(s) {
  return String(s).replace(/[۰-۹]/g, c => String(c.charCodeAt(0) - 0x06F0)).replace(/[٠-٩]/g, c => String(c.charCodeAt(0) - 0x0660));
}
function norm(text) {
  return digits(String(text || ''))
    .replace(/[ًٌٍَُِّْ]/g, '').replace(/ي/g, 'ی').replace(/ك/g, 'ک')
    .replace(/\u200c/g, ' ').toLowerCase();
}
function stem(w) { return w.length > 4 && /(ها|های)$/.test(w) ? w.replace(/(ها|های)$/, '') : w; }

function describe(question) {
  const raw = String(question || '');
  const words = norm(raw).split(/[^\p{L}\p{N}]+/u).filter(Boolean);
  const tokens = Array.from(new Set(words.filter(w => !STOP.has(w) && w.length >= 2).map(stem))).sort();
  const sensitive = /\d{7,}/.test(digits(raw).replace(/[\s-]/g, '')) || /@|https?:\/\//i.test(raw);
  const deictic = words.some(w => DEICTIC.has(w));
  const ok = !sensitive && tokens.length >= 2 && tokens.length <= 14 && raw.length <= 300;
  const text = norm(raw).replace(/[^\p{L}\p{N}\s]+/gu, ' ').replace(/\s+/g, ' ').trim().slice(0, 120);
  return { tokens, key: crypto.createHash('sha1').update(tokens.join(' ')).digest('hex').slice(0, 16), ok, deictic, text };
}

function sim(a, b) {
  let inter = 0;
  for (const x of a) if (b.has(x)) inter++;
  if (inter < 2) return 0;
  const numA = [...a].filter(x => /\d/.test(x)).sort().join(','), numB = [...b].filter(x => /\d/.test(x)).sort().join(',');
  if (numA !== numB) return 0; // اعداد (مثلاً سال/ترم) باید دقیقاً یکی باشند
  return inter / (a.size + b.size - inter);
}

// بررسی «مستند بودن» پاسخ: هر URL/دامنه/شمارهٔ تلفن/ایدی باید در knowledge باشد
function answerIsGrounded(answer, knowledgeNorm) {
  const a = digits(answer);
  if (a.length < 40 || a.length > 3500) return false;
  if (/^\s*\*/.test(answer)) return false; // پاسخ با * = از دانش عمومی مدل، نه مرجع
  if (/خارج از حوزه|منابع من نبود|اطلاعات رو ندارم|اطلاعات را ندارم|ندارم/.test(answer)) return false;
  const urls = a.match(/https?:\/\/[^\s)\]»"'،]+/g) || [];
  const domains = a.match(/\b[a-z0-9-]+(?:\.[a-z0-9-]+)*\.(?:ir|com|org|net|ac\.ir)\b/gi) || [];
  const phones = (a.match(/\d[\d\s-]{6,}\d/g) || []).map(s => s.replace(/[\s-]/g, '')).filter(s => s.length >= 7);
  const handles = a.match(/@[a-z0-9_]{3,}/gi) || [];
  const k = knowledgeNorm.replace(/[\s-]/g, '');
  const kRaw = knowledgeNorm;
  return [...urls, ...domains, ...handles].every(x => kRaw.includes(x.toLowerCase().replace(/[.,;:!؟]+$/, '')))
      && phones.every(p => k.includes(p));
}

// opts.semantic: { lookup, add, remove } (کش معنایی Vector؛ اختیاری)
// opts.entities: text → امضای رشته/دانشکده‌های نام‌برده (برای جلوگیری از جابه‌جایی پاسخ رشته‌ها)
function createLearner(kv, ver, knowledgeRaw, opts = {}) {
  const semantic = opts.semantic || null;
  const entities = opts.entities || (() => '');
  const sig = (info) => ({ ver, text: info.text, nums: info.tokens.filter(t => /\d/.test(t)).sort().join(',') || '-', ents: entities(info.text) || '-' });
  const knowledgeNorm = norm(knowledgeRaw);
  let idxCache = { at: 0, map: {} };

  async function getIndex() {
    if (Date.now() - idxCache.at < 15000) return idxCache.map;
    const r = await kv.exec([['HGETALL', `idx:${ver}`]]);
    const flat = (r && r[0]) || [];
    const map = {};
    for (let i = 0; i < flat.length; i += 2) map[flat[i]] = flat[i + 1];
    idxCache = { at: Date.now(), map };
    return map;
  }

  return {
    knowledgeNorm,

    async lookup(info) {
      const idx = await getIndex();
      const set = new Set(info.tokens);
      let best = null, bs = 0;
      for (const [k, v] of Object.entries(idx)) {
        if (k === info.key) { best = k; bs = 1; break; }
        const s = sim(set, new Set(String(v).split(' ')));
        if (s > bs) { bs = s; best = k; }
      }
      let via = 'tokens';
      if (!best || bs < SIM_THRESHOLD) {
        // کلمه‌ها فرق دارند؛ شاید معنی یکی باشد («شهریه چنده» ≈ «هزینه ترم چقدره»)
        const sem = semantic ? await semantic.lookup(sig(info)) : null;
        if (!sem || !idx[sem.key]) return null;
        best = sem.key; via = 'semantic';
      }
      const r = await kv.exec([['GET', `ans:${ver}:${best}`]]);
      if (!r || !r[0]) { idxCache.at = 0; await kv.exec([['HDEL', `idx:${ver}`, best]]); return null; }
      try { const o = JSON.parse(r[0]); return { key: best, answer: o.a, tokens: o.t || 0, via }; } catch { return null; }
    },

    async recordHit(info, hit) {
      await kv.exec([
        ['HINCRBY', `hits:${ver}`, hit.key, 1],
        ['HINCRBY', 'stats', 'hit', 1],
        ['HINCRBY', 'stats', 'tokens_saved', hit.tokens || 0],
        ['HINCRBY', 'stats', hit.via === 'semantic' ? 'hit_semantic' : 'hit_tokens', 1],
        ['ZINCRBY', 'asked', 1, info.text],
        ['ZREMRANGEBYRANK', 'asked', 0, -501],
      ]);
    },

    // پس از پاسخ مدل: شمارش پرسنده، و در صورت لزوم ارتقا به حافظه
    async observe({ info, answer, ipHash, usedTokens, retrievalScore, eligibleToStore }) {
      const cmds = [
        ['HINCRBY', 'stats', 'miss', 1],
        ['HINCRBY', 'stats', 'tokens_used', usedTokens || 0],
      ];
      // متن پرسش فقط وقتی لاگ می‌شود که حاوی اطلاعات شخصی (شماره، ایمیل، لینک) نباشد
      if (info.ok) cmds.push(['ZINCRBY', 'asked', 1, info.text], ['ZREMRANGEBYRANK', 'asked', 0, -501]);
      const grounded = eligibleToStore && retrievalScore >= 2 && answerIsGrounded(answer, knowledgeNorm);
      if (!grounded && info.ok) {
        cmds.push(['ZINCRBY', 'unans', 1, info.text], ['ZREMRANGEBYRANK', 'unans', 0, -501]);
      }
      if (!eligibleToStore || !info.ok) { await kv.exec(cmds); return 'skipped'; }
      cmds.push(['EXISTS', `ban:${ver}:${info.key}`],
                ['SADD', `ask:${ver}:${info.key}`, ipHash],
                ['EXPIRE', `ask:${ver}:${info.key}`, ASK_TTL],
                ['SCARD', `ask:${ver}:${info.key}`]);
      const r = await kv.exec(cmds);
      if (!r) return 'error';
      const n = r.length;
      const banned = r[n - 4], askers = r[n - 1];
      if (banned) return 'banned';
      if (!grounded) return 'ungrounded';
      if (askers < MIN_ASKERS) return 'pending';
      await this._promote(info, answer, usedTokens);
      return 'learned';
    },

    async _promote(info, answer, usedTokens) {
      const len = await kv.exec([['HLEN', `idx:${ver}`]]);
      if (len && len[0] >= MAX_ENTRIES) await this._evict();
      await kv.exec([
        ['SET', `ans:${ver}:${info.key}`, JSON.stringify({ a: answer, t: usedTokens || 0 }), 'EX', ENTRY_TTL],
        ['HSET', `idx:${ver}`, info.key, info.tokens.join(' ')],
        ['HSET', `created:${ver}`, info.key, Date.now()],
        ['HINCRBY', 'stats', 'learned', 1],
      ]);
      idxCache.at = 0;
      if (semantic) await semantic.add({ key: info.key, ...sig(info) });
    },

    async _evict() {
      const r = await kv.exec([['HGETALL', `hits:${ver}`], ['HGETALL', `created:${ver}`], ['HGETALL', `idx:${ver}`]]);
      if (!r) return;
      const toMap = f => { const m = {}; for (let i = 0; i < (f || []).length; i += 2) m[f[i]] = f[i + 1]; return m; };
      const hits = toMap(r[0]), created = toMap(r[1]), idx = toMap(r[2]);
      const victim = Object.keys(idx).sort((a, b) =>
        ((+hits[a] || 0) - (+hits[b] || 0)) || ((+created[a] || 0) - (+created[b] || 0)))[0];
      if (victim) await this.remove(victim);
    },

    async remove(key) {
      await kv.exec([['DEL', `ans:${ver}:${key}`], ['HDEL', `idx:${ver}`, key], ['HDEL', `created:${ver}`, key], ['HDEL', `hits:${ver}`, key]]);
      idxCache.at = 0;
      if (semantic) await semantic.remove({ key, ver });
    },

    async feedback(key, vote, ipHash) {
      if (!/^[a-f0-9]{16}$/.test(key)) return 'bad';
      if (vote === 'up') {
        await kv.exec([['SADD', `up:${ver}:${key}`, ipHash], ['EXPIRE', `up:${ver}:${key}`, ENTRY_TTL], ['HINCRBY', 'stats', 'up', 1]]);
        return 'ok';
      }
      const r = await kv.exec([['SADD', `down:${ver}:${key}`, ipHash], ['EXPIRE', `down:${ver}:${key}`, ASK_TTL],
                               ['SCARD', `down:${ver}:${key}`], ['HINCRBY', 'stats', 'down', 1]]);
      if (r && r[2] >= 2) {
        await this.remove(key);
        await kv.exec([['SET', `ban:${ver}:${key}`, '1', 'EX', BAN_TTL], ['HINCRBY', 'stats', 'removed', 1]]);
        return 'removed';
      }
      return 'ok';
    },

    async dashboard() {
      const r = await kv.exec([['HGETALL', 'stats'], ['ZREVRANGE', 'asked', 0, 49, 'WITHSCORES'],
                               ['ZREVRANGE', 'unans', 0, 49, 'WITHSCORES'], ['HGETALL', `idx:${ver}`],
                               ['HGETALL', `hits:${ver}`], ['HGETALL', `created:${ver}`]]);
      if (!r) return null;
      const toMap = f => { const m = {}; for (let i = 0; i < (f || []).length; i += 2) m[f[i]] = f[i + 1]; return m; };
      const pairs = f => { const o = []; for (let i = 0; i < (f || []).length; i += 2) o.push({ q: f[i], count: +f[i + 1] }); return o; };
      const stats = toMap(r[0]); const idx = toMap(r[3]); const hits = toMap(r[4]); const created = toMap(r[5]);
      const hit = +stats.hit || 0, miss = +stats.miss || 0;
      return {
        version: ver, stats: { ...stats, hit_rate: hit + miss ? +(hit / (hit + miss)).toFixed(3) : 0 },
        topAsked: pairs(r[1]), topUnanswered: pairs(r[2]),
        entries: Object.keys(idx).map(k => ({ key: k, tokens: idx[k], hits: +hits[k] || 0, created: +created[k] || 0 })),
      };
    },
  };
}

module.exports = { createLearner, describe, sim, answerIsGrounded, norm, digits, MIN_ASKERS };
