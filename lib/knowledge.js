// ═══════════════════════════════════════════════════════════
// KNOWLEDGE — بارگذاری knowledge/chunks.json و بازیابی ترکیبی
//
//  ۱) FAQ: اگر سؤال تقریباً همان یکی از سؤالات آماده بود → پاسخ مستقیم، صفر توکن و بدون شبکه
//  ۲) Vector (Upstash، hybrid: معنایی + BM25) → رتبهٔ معنایی
//  ۳) Keyword محلی (همیشه، بدون شبکه) → رتبهٔ کلمه‌ای + topScore برای لایهٔ یادگیری
//  رتبهٔ نهایی = RRF(vector, keyword). اگر Vector در دسترس نبود، فقط keyword (رفتار قبلی).
// ═══════════════════════════════════════════════════════════
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { norm, describe, sim } = require('./learn');
const vector = require('./vector');

const FILE = path.join(process.cwd(), 'knowledge', 'chunks.json');
const FAQ_SIM = parseFloat(process.env.FAQ_SIM || '0.6');
const VECTOR_TOPK = parseInt(process.env.VECTOR_TOPK || '5', 10);
const VECTOR_KEEP = parseInt(process.env.VECTOR_KEEP || '3', 10); // چند نتیجهٔ برتر معنایی وارد پرامپت شوند

const STOPWORDS = new Set([
  'از','در','به','با','را','که','هم','یا','تا','بر','من','تو','او','ما','شما','این','آن','اون','ان',
  'یه','یک','هر','می','هست','است','بود','باشه','باشد','چه','چی','چرا','کی','کجا','چقدر','چطور','چگونه',
  'برای','براي','هستن','کنم','کنید','کنه','میشه','شود','شده','دارم','داره','دارد','ولی','اما','اگه','اگر',
  'رشته','دانشگاه','دارید','چیه','چیست','بازار','چطوره','هایی','های','داری','میخوام','بدونم',
  'سلام','ممنون','مرسی','خوبی','لطفا','لطفاً','خسته','نباشید','درود',
  'the','a','an','of','to','in','is','are','and','or','for','on','what','how','do','i'
]);

let DB = null;
function load() {
  if (DB) return DB;
  const raw = fs.readFileSync(FILE, 'utf8');
  const chunks = JSON.parse(raw).chunks;
  const byId = new Map();
  for (const c of chunks) {
    c.textWords = toWords(c.text);
    c.headWords = toWords([c.title, ...(c.keywords || [])].join(' '));
    if (c.type === 'faq') c.qsets = (c.questions || []).map(q => new Set(describe(q).tokens));
    byId.set(c.id, c);
  }
  // واژگان «موجودیت» (نام رشته‌ها و دانشکده‌ها) برای امضای کش معنایی
  const GENERIC = new Set(['رشته','رشته‌ها','مهندسی','علوم','مدیریت','دانشکده','زبان','ادبیات','صنایع','طراحی','فناوری',
    'تکنولوژی','کاردانی','کارشناسی','پیوسته','ناپیوسته','فهرست','رشته ها','سایر','تولید','امور','منابع','طبیعی','و','کار','بازار','مشاغل']);
  const vocab = new Set();
  for (const c of chunks) {
    if (!['major', 'faculty', 'list'].includes(c.type)) continue;
    const names = [c.title, ...(c.keywords || []), ...c.text.split('\n').filter(l => /^- /.test(l) && l.length < 60).map(l => l.slice(2))];
    for (const w of toWords(names.join(' '))) if (w.length >= 3 && !GENERIC.has(w) && !STOPWORDS.has(w) && !/\d/.test(w)) vocab.add(w);
  }
  DB = { raw, chunks, byId, vocab: [...vocab].sort((a, b) => b.length - a.length), hash: crypto.createHash('sha1').update(raw).digest('hex').slice(0, 8) };
  return DB;
}

// متنی که embed می‌شود (در ingest هم همین استفاده می‌شود تا ایندکس و کد هم‌خوان باشند)
function embedText(c) {
  return [c.title, (c.keywords || []).join('، '), (c.questions || []).join('\n'), c.text].filter(Boolean).join('\n');
}

function toWords(t) { return Array.from(new Set(norm(t).split(/[^\p{L}\p{N}]+/u).filter(Boolean))); }
// تطبیق «ابتدای کلمه»: «کار» با «کاری/کارها» جور است ولی «درس» با «آدرس» نه
// (کلمه‌های ۳حرفی فقط تطبیق کامل؛ وگرنه «کار» با «کاردانی» و «سلام» با «سلامت» جور می‌شود)
const hasPrefix = (arr, w) => w.length <= 3 ? arr.includes(w) : arr.some(x => x.startsWith(w));

function words(q) {
  // «بازار کار» در همهٔ رشته‌ها هست و تمایزی ایجاد نمی‌کند
  return Array.from(new Set(norm(q).replace(/بازار\s*(?:کار|کاری)/g, ' ').split(/[^\p{L}\p{N}]+/u).filter(w => w.length >= 3 && !STOPWORDS.has(w))));
}

function keywordRank(query) {
  const qw = words(query);
  const all = load().chunks.map(c => {
    let s = 0;
    for (const w of qw) { if (hasPrefix(c.headWords, w)) s += 2; else if (hasPrefix(c.textWords, w)) s += 1; }
    return { c, s };
  }).filter(x => x.s > 0).sort((a, b) => b.s - a.s);
  // فقط تکه‌هایی که نزدیک به بهترین هستند؛ پر کردن بودجه با تکه‌های ضعیف = توکن هدر رفته
  const top = all.length ? all[0].s : 0;
  return all.filter(x => x.s >= Math.max(1, Math.ceil(top * 0.5)));
}

// پاسخ مستقیم FAQ (فقط وقتی شباهت بالا است)
function faqAnswer(query) {
  const set = new Set(describe(query).tokens);
  let best = null, bs = 0;
  for (const c of load().chunks) {
    if (c.type !== 'faq') continue;
    for (const qs of c.qsets) {
      let s = sim(set, qs);
      // پوشش: همهٔ کلمه‌های سؤال آماده در پیام هست و حداکثر ۲ کلمهٔ اضافه («... پرداخت کرد»)
      let inter = 0; for (const x of qs) if (set.has(x)) inter++;
      if (inter >= 2 && inter / qs.size >= 0.8 && set.size - inter <= 2) s = Math.max(s, FAQ_SIM);
      if (s > bs) { bs = s; best = c; }
    }
  }
  return best && bs >= FAQ_SIM ? { id: best.id, answer: best.answer, score: bs } : null;
}

// امضای موجودیت‌های یک سؤال: «هزینه رشته کامپیوتری» → «کامپیوتر»
function entities(query) {
  const { vocab } = load();
  const out = new Set();
  for (const w of toWords(query)) {
    const v = vocab.find(x => w === x || (x.length >= 4 && w.startsWith(x)));
    if (v) out.add(v);
  }
  return [...out].sort().join(',');
}

// احوالپرسی/تشکر خالص → پاسخ آماده، صفر توکن
const GREET = new Set(['سلام','درود','وقت','بخیر','به','خیر','صبح','عصر','ظهر','شب','روز','خوش','خسته','نباشید','نباشی',
  'ممنون','مرسی','متشکرم','تشکر','سپاس','سپاسگزارم','خیلی','عالی','خداحافظ','خدانگهدار','خوبی','خوبید','چطوری','علیکم','و','هم',
  'hi','hello','hey','thanks','thank','you','bye','از','تون','شما','واقعا','لطفتون']);
const THANKS = /ممنون|مرسی|متشکر|تشکر|سپاس|thank/i;
function smallTalk(query) {
  const w = norm(query).split(/[^\p{L}]+/u).filter(Boolean);
  if (!w.length || w.length > 8 || /[?؟]/.test(query)) return null;
  // «وقتتون»، «ممنونم» ← پسوند روی کلمهٔ احوالپرسی
  const isGreet = x => GREET.has(x) || [...GREET].some(g => g.length >= 3 && x.startsWith(g) && x.length - g.length <= 3);
  const rest = w.filter(x => !isGreet(x));
  // تشکر با حداکثر یک کلمهٔ دیگر و بدون واژهٔ پرسشی: «ممنون از راهنماییتون»
  const thanksOnly = THANKS.test(query) && rest.length <= 1 && !rest.some(x => /^(چی|چه|کی|کجا|چند|چطور|آیا|چرا)/.test(x));
  if (rest.length && !thanksOnly) return null;
  if (THANKS.test(query)) return 'خواهش می‌کنم 🌱 اگر سؤال دیگری دربارهٔ رشته‌ها، پذیرش یا خدمات دانشگاه داشتید، در خدمتم.';
  if (/خداحافظ|خدانگهدار|bye/i.test(query)) return 'موفق باشید! هر وقت سؤالی داشتید برگردید.';
  return 'سلام! 👋 من مشاور هدایت تحصیلی دانشگاه آزاد اسلامی اصفهان (خوراسگان) هستم. دربارهٔ رشته‌ها و بازار کار، پذیرش بدون کنکور، شهریه و وام، طرح پویش یا زمان کلاس‌ها بپرسید.';
}

async function retrieve(query, maxChars = 1800) {
  const db = load();
  const kw = keywordRank(query);
  const topScore = kw.length ? kw[0].s : 0;
  if (!words(query).length) return { text: '', ids: [], topScore: 0, source: 'none' }; // «سلام» → بدون دانش

  const vec = await vector.search(query, VECTOR_TOPK); // null اگر تنظیم نشده یا خطا
  const rrf = new Map();
  const bump = (id, rank) => rrf.set(id, (rrf.get(id) || 0) + 1 / (60 + rank));
  kw.slice(0, 5).forEach((x, i) => bump(x.c.id, i));
  if (vec) vec.slice(0, VECTOR_KEEP).forEach((v, i) => { if (db.byId.has(v.id)) bump(v.id, i); });

  const ranked = [...rrf.entries()].sort((a, b) => b[1] - a[1]).map(([id]) => db.byId.get(id));
  const picked = [];
  let used = 0;
  for (const c of ranked) {
    const t = c.text.length;
    if (used + t > maxChars && picked.length) continue; // تکهٔ بزرگ را رد کن، شاید کوچک‌تری جا شود
    picked.push(c); used += t;
    if (used >= maxChars) break;
  }
  return {
    text: picked.map(c => c.text).join('\n\n---\n\n'),
    ids: picked.map(c => c.id),
    topScore, // فقط امتیاز کلمه‌ای: دروازهٔ «مستند بودن» لایهٔ یادگیری عمداً سخت‌گیر می‌ماند
    source: vec ? 'hybrid' : 'keyword',
  };
}

module.exports = { load, retrieve, faqAnswer, smallTalk, entities, embedText, keywordRank };
