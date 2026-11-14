'use strict';
// نوشتن امن در knowledge/chunks.json از پنل ادمین (فقط VPS؛ روی Vercel سیستم فایل فقط‌خواندنی است).
//  • قفل (فایل قفل + صف درون‌پروسه) → چند پروسهٔ pm2 یا دو ادمین هم‌زمان روی هم نمی‌نویسند
//  • قفل خوش‌بینانه با baseSha (SHA-256 فایل) → ویرایش روی نسخهٔ قدیمی رد می‌شود (409)
//  • نوشتن اتمیک (فایل موقت + fsync + rename) → کرش وسط کار فایل را خراب نمی‌کند
//  • پشتیبان کامل از نسخهٔ قبل و بعد در knowledge/backups/ (بدون Git هم قابل بازگردانی)
//  • اگر afterWrite (ثبت در دیتابیس/ممیزی) شکست بخورد، فایل به حالت قبل برمی‌گردد
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const TYPES = ['general', 'major', 'faculty', 'faq', 'list'];
const ID_RE = /^[a-z0-9][a-z0-9_-]{2,63}$/;
const MAX = { title: 200, text: 20000, answer: 5000, keyword: 60, keywords: 30, question: 200, questions: 30 };
const MAX_BACKUPS = 500;

class StoreError extends Error {
  constructor(status, code, extra) { super(code); this.status = status; this.code = code; Object.assign(this, extra || {}); }
}

const sha256hex = (s) => crypto.createHash('sha256').update(s).digest('hex');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── پاک‌سازی و اعتبارسنجی ورودی ──
const CTRL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F\u202A-\u202E\u2066-\u2069]/g;   // کنترلی + بازنویسی جهت متن
function cleanText(v) { return String(v == null ? '' : v).replace(/\r\n?/g, '\n').replace(CTRL, '').trim(); }
const oneLine = (v) => cleanText(v).replace(/\s*\n\s*/g, ' ');

function toList(v, splitRe) {
  const arr = Array.isArray(v) ? v : (typeof v === 'string' ? v.split(splitRe) : []);
  const out = [];
  for (const x of arr) {
    const t = oneLine(x);
    if (t && !out.includes(t)) out.push(t);
  }
  return out;
}

function normalize(input, { id } = {}) {
  const errors = {};
  const src = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
  const allowed = new Set(['id', 'type', 'title', 'text', 'keywords', 'questions', 'answer']);
  for (const k of Object.keys(src)) if (!allowed.has(k)) errors[k] = 'فیلد ناشناخته';

  const type = src.type;
  if (!TYPES.includes(type)) errors.type = 'نوع محتوا نامعتبر است';

  const title = oneLine(src.title);
  if (title.length < 2 || title.length > MAX.title) errors.title = `عنوان باید بین ۲ تا ${MAX.title} نویسه باشد`;

  const keywords = toList(src.keywords, /[\n,،;؛]+/);
  if (keywords.length > MAX.keywords) errors.keywords = `حداکثر ${MAX.keywords} کلیدواژه`;
  else if (keywords.some((k) => k.length > MAX.keyword)) errors.keywords = `هر کلیدواژه حداکثر ${MAX.keyword} نویسه`;

  let chunkId = id !== undefined ? id : (src.id === undefined || src.id === '' ? null : String(src.id).trim());
  if (id !== undefined && src.id !== undefined && src.id !== '' && String(src.id).trim() !== id) errors.id = 'شناسه قابل تغییر نیست';
  if (chunkId === null && TYPES.includes(type)) chunkId = `${type}-${crypto.randomBytes(3).toString('hex')}`;
  if (chunkId !== null && !ID_RE.test(chunkId)) errors.id = 'شناسه فقط حروف کوچک لاتین، عدد، - و _ (۳ تا ۶۴ نویسه) و با حرف/عدد شروع شود';

  const chunk = { id: chunkId, type, title };
  if (type === 'faq') {
    const answer = cleanText(src.answer);
    if (!answer || answer.length > MAX.answer) errors.answer = `پاسخ الزامی است (حداکثر ${MAX.answer} نویسه)`;
    const questions = [title, ...toList(src.questions, /\n+/)].filter((q, i, a) => a.indexOf(q) === i);
    if (questions.length > MAX.questions) errors.questions = `حداکثر ${MAX.questions} سؤال`;
    else if (questions.some((q) => q.length > MAX.question)) errors.questions = `هر سؤال حداکثر ${MAX.question} نویسه`;
    if (src.text && cleanText(src.text) !== `سؤال: ${title}\nپاسخ: ${answer}`) errors.text = 'متن FAQ خودکار ساخته می‌شود؛ پاسخ را در فیلد پاسخ بنویسید';
    chunk.text = `سؤال: ${title}\nپاسخ: ${answer}`;
    chunk.keywords = keywords;
    chunk.questions = questions;
    chunk.answer = answer;
  } else {
    const text = cleanText(src.text);
    if (!text || text.length > MAX.text) errors.text = `متن الزامی است (حداکثر ${MAX.text} نویسه)`;
    if (src.answer && String(src.answer).trim()) errors.answer = 'پاسخ فقط برای نوع FAQ است';
    if (Array.isArray(src.questions) ? src.questions.length : (src.questions && String(src.questions).trim())) errors.questions = 'سؤال‌ها فقط برای نوع FAQ است';
    chunk.text = text;
    chunk.keywords = keywords;
  }
  if (Object.keys(errors).length) throw new StoreError(400, 'validation', { fields: errors });
  return chunk;
}

function summarize(c) { return { id: c.id, type: c.type, title: c.title, keywords: c.keywords || [], chars: String(c.text || '').length }; }

function createStore(opts = {}) {
  const file = () => opts.file || path.join(process.cwd(), 'knowledge', 'chunks.json');
  const dir = () => path.dirname(file());
  const backupDir = () => opts.backupDir || path.join(dir(), 'backups');
  const lockPath = () => path.join(dir(), '.chunks.lock');
  let chain = Promise.resolve();

  function read() {
    const raw = fs.readFileSync(file(), 'utf8');
    const data = JSON.parse(raw);
    if (!data || !Array.isArray(data.chunks)) throw new StoreError(500, 'bad_knowledge_file');
    return { raw, data, sha: sha256hex(raw) };
  }

  function snapshot() {
    const { data, sha } = read();
    const types = {};
    for (const c of data.chunks) types[c.type] = (types[c.type] || 0) + 1;
    return { sha, count: data.chunks.length, types, chunks: data.chunks.map(summarize) };
  }

  function get(id) {
    const { data, sha } = read();
    const chunk = data.chunks.find((c) => c.id === id);
    if (!chunk) throw new StoreError(404, 'not_found');
    return { chunk, sha };
  }

  async function withLock(fn) {
    const prev = chain;
    let release;
    chain = new Promise((r) => { release = r; });
    await prev;
    const lp = lockPath();
    let fd;
    try {
      const deadline = Date.now() + 5000;
      for (;;) {
        try { fd = fs.openSync(lp, 'wx', 0o640); fs.writeSync(fd, JSON.stringify({ pid: process.pid, at: Date.now() })); break; }
        catch (e) {
          if (e.code !== 'EEXIST') throw e;
          try { if (Date.now() - fs.statSync(lp).mtimeMs > 30000) { fs.unlinkSync(lp); continue; } } catch { /* قفل همان لحظه آزاد شد */ }
          if (Date.now() > deadline) throw new StoreError(503, 'locked');
          await sleep(50);
        }
      }
      return await fn();
    } finally {
      if (fd !== undefined) { try { fs.closeSync(fd); } catch { /* */ } try { fs.unlinkSync(lp); } catch { /* */ } }
      release();
    }
  }

  function atomicWrite(raw) {
    const target = file();
    let mode = 0o640;
    try { mode = fs.statSync(target).mode & 0o777; } catch { /* */ }
    const tmp = `${target}.tmp-${process.pid}-${Date.now()}`;
    const fd = fs.openSync(tmp, 'w', mode);
    try { fs.writeSync(fd, raw); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
    fs.renameSync(tmp, target);
  }

  function backup(raw, sha) {
    const d = backupDir();
    fs.mkdirSync(d, { recursive: true, mode: 0o750 });
    const stamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14);
    const p = path.join(d, `chunks-${stamp}-${sha.slice(0, 8)}.json`);
    try { fs.writeFileSync(p, raw, { flag: 'wx', mode: 0o640 }); } catch (e) { if (e.code !== 'EEXIST') throw e; }
    return p;
  }

  function prune() {
    try {
      const d = backupDir();
      const files = fs.readdirSync(d).filter((f) => /^chunks-\d{14}-[a-f0-9]{8}\.json$/.test(f)).sort();
      for (const f of files.slice(0, Math.max(0, files.length - MAX_BACKUPS))) fs.unlinkSync(path.join(d, f));
    } catch { /* پاک‌سازی اختیاری است */ }
  }

  function serialize(data, oldRaw) {
    const m = /^\{\r?\n( +|\t)"/.exec(oldRaw);
    const indent = m ? m[1] : 1;
    return JSON.stringify(data, null, indent) + (oldRaw.endsWith('\n') ? '\n' : '');
  }

  async function mutate({ baseSha, apply, afterWrite }) {
    if (!/^[a-f0-9]{64}$/.test(String(baseSha || ''))) throw new StoreError(400, 'base_sha_required');
    return withLock(async () => {
      const cur = read();
      if (baseSha !== cur.sha) throw new StoreError(409, 'conflict', { currentSha: cur.sha });
      const data = JSON.parse(cur.raw);
      const change = apply(data);
      const raw = serialize(data, cur.raw);
      JSON.parse(raw);                                   // دفاع نهایی: خروجی حتماً JSON معتبر باشد
      const sha = sha256hex(raw);
      const baselinePath = backup(cur.raw, cur.sha);
      const backupPath = backup(raw, sha);
      atomicWrite(raw);
      const result = {
        change, sha, previousSha: cur.sha, count: data.chunks.length, size: Buffer.byteLength(raw),
        previousCount: cur.data.chunks.length, previousSize: Buffer.byteLength(cur.raw), backupPath, baselinePath,
      };
      try { if (afterWrite) await afterWrite(result); }
      catch (e) { atomicWrite(cur.raw); throw e; }       // شکست ثبت/ممیزی ⇒ بازگرداندن فایل
      prune();
      return result;
    });
  }

  const create = (input, { baseSha, afterWrite } = {}) => mutate({
    baseSha, afterWrite,
    apply(data) {
      const chunk = normalize(input);
      if (data.chunks.some((c) => c.id === chunk.id)) throw new StoreError(409, 'duplicate_id', { fields: { id: 'این شناسه قبلاً وجود دارد' } });
      if (data.chunks.some((c) => c.type === chunk.type && c.title === chunk.title)) throw new StoreError(409, 'duplicate_title', { fields: { title: 'برای این نوع، عنوان تکراری است' } });
      data.chunks.push(chunk);
      return { action: 'create', chunk };
    },
  });

  const update = (id, input, { baseSha, afterWrite } = {}) => mutate({
    baseSha, afterWrite,
    apply(data) {
      const i = data.chunks.findIndex((c) => c.id === id);
      if (i < 0) throw new StoreError(404, 'not_found');
      const old = data.chunks[i];
      const chunk = normalize(input, { id });
      if (chunk.type !== old.type) throw new StoreError(400, 'validation', { fields: { type: 'تغییر نوع محتوا مجاز نیست' } });
      if (data.chunks.some((c, j) => j !== i && c.type === chunk.type && c.title === chunk.title)) throw new StoreError(409, 'duplicate_title', { fields: { title: 'برای این نوع، عنوان تکراری است' } });
      if (JSON.stringify(chunk) === JSON.stringify(old)) throw new StoreError(400, 'no_change');
      data.chunks[i] = chunk;
      return { action: 'update', chunk };
    },
  });

  return { snapshot, get, create, update, read };
}

module.exports = { createStore, normalize, StoreError, TYPES };
