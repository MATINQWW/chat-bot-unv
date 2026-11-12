// ═══════════════════════════════════════════════════════════
// REPORT — گزارش پرسش‌های کاربران برای پنل مدیر
//
// برای هر پرسش ثبت می‌شود: متن (فقط اگر اطلاعات شخصی نداشت)، چند بار پرسیده شد،
// پاسخ از کجا آمد، و کدام تکه‌های دانش استفاده شدند. پرسش‌های هم‌معنی با کلمه‌های
// متفاوت هنگام ساخت گزارش در یک گروه جمع می‌شوند.
//
// منبع پاسخ (source):
//   smalltalk  احوالپرسی/تشکر (بدون مدل)
//   faq        پاسخ آماده از پایگاه دانش (بدون مدل)
//   memory     پاسخ ذخیره‌شدهٔ پرسش تکراری (بدون مدل)
//   knowledge  مدل با دانش پیداشده با جست‌وجوی کلمه‌ای
//   vector     مدل با دانش پیداشده از پایگاه داده وکتور (Upstash Vector)
//   general    پاسخ در حالت راهنمایی عمومی با دانش عمومی مدل تولید شد
//   no_info    در پایگاه دانش نبود؛ بات گفت «این اطلاعات را ندارم»
//   off_topic  خارج از حوزهٔ هدایت تحصیلی
//   error      مدل خطا داد یا شلوغ بود
//   web        جست‌وجوی اینترنت (رزرو؛ بات فعلاً در اینترنت جست‌وجو نمی‌کند)
// ═══════════════════════════════════════════════════════════
const { sim } = require('./learn');

const SOURCES = ['smalltalk', 'faq', 'memory', 'knowledge', 'vector', 'general', 'no_info', 'off_topic', 'error', 'web'];
const LABELS = {
  smalltalk: 'احوالپرسی', faq: 'پاسخ آمادهٔ پایگاه دانش', memory: 'حافظهٔ پرسش‌های تکراری',
  knowledge: 'پایگاه دانش (جست‌وجوی کلمه‌ای)', vector: 'پایگاه دادهٔ وکتور', general: 'راهنمایی عمومی با دانش مدل',
  no_info: 'بی‌پاسخ (اطلاعات نبود)', off_topic: 'خارج از حوزه', error: 'خطا/شلوغی', web: 'جست‌وجوی اینترنت',
};
const PRIVATE = '_private';
const MAX_GROUPS = 3000, MAX_VARIANTS = 3000;

function sourceOfReply(reply, base, intentMode) {
  const r = String(reply || '').trim();
  if (/خارج از حوزه/.test(r)) return 'off_topic';
  if (/اطلاعات (این رشته )?(رو|را) (در حال حاضر )?ندارم/.test(r)) return 'no_info';
  if (/^\*/.test(r)) return 'general'; // سازگاری با پاسخ‌های نسخه‌های قدیمی
  if (intentMode === 'general' || (intentMode === 'mixed' && base === 'no_info')) return 'general';
  return base;
}

function day(ts = Date.now()) { return new Date(ts).toISOString().slice(0, 10); }

// ثبت؛ هیچ‌وقت خطا پرتاب نمی‌کند (گزارش نباید پاسخ‌دادن را خراب کند)
async function record(kv, { info, source, chunks = [] }) {
  try {
    if (!SOURCES.includes(source)) source = 'error';
    const now = Date.now();
    const cmds = [['HINCRBY', 'rep:day', `${day(now)}|${source}`, 1]];
    if (source !== 'smalltalk') {
      const key = info && info.ok && info.text ? info.key : PRIVATE;
      cmds.push(['HINCRBY', 'rep:cnt', `${key}|${source}`, 1]);
      if (key !== PRIVATE) {
        cmds.push(['HSET', 'rep:last', key, JSON.stringify({ t: now, k: info.tokens.join(' ') })],
                  ['ZINCRBY', 'rep:var', 1, `${key}\t${info.text}`],
                  ['ZREMRANGEBYRANK', 'rep:var', 0, -(MAX_VARIANTS + 1)]);
        for (const c of chunks.slice(0, 5)) cmds.push(['HINCRBY', 'rep:chunk', `${key}|${c}`, 1]);
      }
    }
    await kv.exec(cmds);
  } catch (e) { console.warn('report record failed', e && e.message); }
}

const toMap = f => { const m = {}; for (let i = 0; i < (f || []).length; i += 2) m[f[i]] = f[i + 1]; return m; };

async function build(kv, { simThreshold = 0.5, limit = 500 } = {}) {
  const r = await kv.exec([['HGETALL', 'rep:cnt'], ['HGETALL', 'rep:last'], ['ZREVRANGE', 'rep:var', 0, -1, 'WITHSCORES'],
                           ['HGETALL', 'rep:day'], ['HGETALL', 'rep:chunk']]);
  if (!r) return null;
  const cnt = toMap(r[0]), last = toMap(r[1]), days = toMap(r[3]), chunkMap = toMap(r[4]);

  const groups = new Map(); // key → گروه خام
  const g = k => groups.get(k) || groups.set(k, { key: k, count: 0, sources: {}, variants: [], chunks: {}, last: 0, tokens: [] }).get(k);
  for (const [f, v] of Object.entries(cnt)) {
    const i = f.lastIndexOf('|'), k = f.slice(0, i), s = f.slice(i + 1), n = +v || 0;
    const x = g(k); x.count += n; x.sources[s] = (x.sources[s] || 0) + n;
  }
  const vr = r[2] || [];
  for (let i = 0; i < vr.length; i += 2) {
    const t = vr[i].indexOf('\t'); const k = vr[i].slice(0, t);
    if (groups.has(k)) groups.get(k).variants.push({ q: vr[i].slice(t + 1), n: +vr[i + 1] || 0 });
  }
  for (const [k, v] of Object.entries(last)) {
    if (!groups.has(k)) continue;
    try { const o = JSON.parse(v); groups.get(k).last = o.t || 0; groups.get(k).tokens = String(o.k || '').split(' ').filter(Boolean); } catch {}
  }
  for (const [f, v] of Object.entries(chunkMap)) {
    const i = f.lastIndexOf('|'), k = f.slice(0, i);
    if (groups.has(k)) { const c = groups.get(k).chunks; c[f.slice(i + 1)] = (c[f.slice(i + 1)] || 0) + (+v || 0); }
  }

  // ادغام گروه‌های مشابه (پرتکرارترها اول، هر گروه به نزدیک‌ترین گروه بزرگ‌تر)
  const sorted = [...groups.values()].filter(x => x.key !== PRIVATE).sort((a, b) => b.count - a.count);
  const merged = [];
  for (const x of sorted) {
    const set = new Set(x.tokens);
    let best = null, bs = 0;
    for (const m of merged) { const s = sim(set, m.set); if (s > bs) { bs = s; best = m; } }
    if (best && bs >= simThreshold) {
      best.count += x.count; best.last = Math.max(best.last, x.last); best.variants.push(...x.variants);
      for (const [s, n] of Object.entries(x.sources)) best.sources[s] = (best.sources[s] || 0) + n;
      for (const [c, n] of Object.entries(x.chunks)) best.chunks[c] = (best.chunks[c] || 0) + n;
    } else merged.push({ ...x, set, variants: [...x.variants], sources: { ...x.sources }, chunks: { ...x.chunks } });
  }

  const questions = merged.sort((a, b) => b.count - a.count).slice(0, limit).map(m => {
    const variants = m.variants.sort((a, b) => b.n - a.n);
    const main = Object.entries(m.sources).sort((a, b) => b[1] - a[1])[0];
    const answered = ['faq', 'memory', 'knowledge', 'vector'].reduce((n, s) => n + (m.sources[s] || 0), 0);
    return {
      question: variants.length ? variants[0].q : '',
      count: m.count,
      similarPhrasings: variants.length,
      variants: variants.slice(0, 10),
      sources: m.sources,
      mainSource: main ? main[0] : '',
      fromKnowledgeRate: m.count ? +(answered / m.count).toFixed(2) : 0,
      knowledgeChunks: Object.entries(m.chunks).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([id, n]) => ({ id, n })),
      lastAskedAt: m.last ? new Date(m.last).toISOString() : '',
    };
  });

  const totals = {}; const byDay = {};
  for (const [f, v] of Object.entries(days)) {
    const [d, s] = f.split('|'); const n = +v || 0;
    totals[s] = (totals[s] || 0) + n;
    (byDay[d] = byDay[d] || { date: d, total: 0 }); byDay[d][s] = (byDay[d][s] || 0) + n; byDay[d].total += n;
  }
  const total = Object.values(totals).reduce((a, b) => a + b, 0);
  return {
    generatedAt: new Date().toISOString(),
    labels: LABELS,
    summary: {
      total, totals,
      distinctQuestions: questions.length,
      privateQuestions: groups.has(PRIVATE) ? groups.get(PRIVATE).count : 0,
      webSearchEnabled: false,
    },
    byDay: Object.values(byDay).sort((a, b) => a.date < b.date ? 1 : -1),
    questions,
    unanswered: questions.filter(q => (q.sources.no_info || 0) + (q.sources.general || 0) + (q.sources.error || 0) > 0)
      .sort((a, b) => ((b.sources.no_info || 0) + (b.sources.general || 0)) - ((a.sources.no_info || 0) + (a.sources.general || 0))).slice(0, 50),
  };
}

function csv(rep) {
  // CSV Formula Injection: question text and variants are user-controlled.
  // Excel-oriented protection: put a TAB inside a quoted cell before formula triggers.
  // TAB remains part of the exported text; validate against the spreadsheet app in use.
  const esc = v => {
    const original = String(v == null ? '' : v);
    if (typeof v === 'number' && Number.isFinite(v)) return String(v);
    let s = original;
    let forceQuote = false;
    const withoutLeadingControls = s.replace(/^[\u0000-\u0020]+/u, '');
    if (/^[=+\-@＝＋－＠]/u.test(withoutLeadingControls)) {
      s = '\t' + withoutLeadingControls;
      forceQuote = true;
    } else if (/^[\t\r\n]/u.test(s)) {
      s = "'" + s.replace(/^[\t\r\n]+/u, '');
      forceQuote = true;
    }
    if (forceQuote || /[\",\n\r]/.test(s)) return '\"' + s.replace(/\"/g, '\"\"') + '\"';
    return s;
  };
  const head = ['پرسش', 'تعداد', 'تعداد عبارت‌های مشابه', 'منبع اصلی پاسخ', 'درصد پاسخ از پایگاه دانش',
    ...SOURCES.map(s => LABELS[s]), 'تکه‌های دانش استفاده‌شده', 'عبارت‌های مشابه', 'آخرین بار'];
  const rows = rep.questions.map(q => [q.question, q.count, q.similarPhrasings, LABELS[q.mainSource] || q.mainSource,
    Math.round(q.fromKnowledgeRate * 100) + '%', ...SOURCES.map(s => q.sources[s] || 0),
    q.knowledgeChunks.map(c => c.id).join(' '), q.variants.map(v => `${v.q} (${v.n})`).join(' | '), q.lastAskedAt]);
  return '﻿' + [head, ...rows].map(r => r.map(esc).join(',')).join('\r\n') + '\r\n'; // BOM: فارسی درست در Excel
}

// پاک کردن گروه‌های کم‌تکرار وقتی تعدادشان از سقف گذشت
async function prune(kv) {
  const r = await kv.exec([['HGETALL', 'rep:last']]);
  const keys = Object.keys(toMap(r && r[0]));
  if (keys.length <= MAX_GROUPS) return 0;
  const lm = toMap(r[0]);
  const old = keys.sort((a, b) => { try { return JSON.parse(lm[a]).t - JSON.parse(lm[b]).t; } catch { return 0; } })
    .slice(0, keys.length - MAX_GROUPS);
  const c = await kv.exec([['HGETALL', 'rep:cnt'], ['HGETALL', 'rep:chunk']]);
  const drop = new Set(old), cmds = [['HDEL', 'rep:last', ...old]];
  for (const h of ['rep:cnt', 'rep:chunk']) {
    const fs = Object.keys(toMap(c[h === 'rep:cnt' ? 0 : 1])).filter(f => drop.has(f.slice(0, f.lastIndexOf('|'))));
    if (fs.length) cmds.push(['HDEL', h, ...fs]);
  }
  await kv.exec(cmds);
  return old.length;
}

async function reset(kv) { await kv.exec([['DEL', 'rep:cnt', 'rep:last', 'rep:var', 'rep:day', 'rep:chunk']]); }

module.exports = { record, build, csv, prune, reset, sourceOfReply, SOURCES, LABELS };
