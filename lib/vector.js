// ═══════════════════════════════════════════════════════════
// VECTOR — Upstash Vector (ایندکس Hybrid با embedding داخلی؛ نیازی به کلید embedding جدا نیست)
// env: UPSTASH_VECTOR_REST_URL · UPSTASH_VECTOR_REST_TOKEN · تنظیمات: بخش search در config.js
// همه‌چیز best-effort است: خطا/کندی → null و چت با جست‌وجوی کلمه‌ای محلی ادامه می‌دهد.
// ═══════════════════════════════════════════════════════════
const S = () => require('../config').search || {};
const TMO = () => S().vectorTimeoutMs || 2500;
let _root, _index, _qcache;
function root() {
  if (_root !== undefined) return _root;
  const url = process.env.UPSTASH_VECTOR_REST_URL, token = process.env.UPSTASH_VECTOR_REST_TOKEN;
  if (!url || !token) return (_root = null);
  const { Index } = require('@upstash/vector');
  return (_root = new Index({ url, token, retry: false, signal: () => AbortSignal.timeout(TMO()) }));
}
// namespace دانش
function index() {
  if (_index !== undefined) return _index;
  const r = root(), ns = S().vectorNamespace;
  return (_index = r ? (ns ? r.namespace(ns) : r) : null);
}
// namespace کش معنایی سؤال‌ها (جدا از دانش، تا ingest به آن دست نزند)
function qcacheIndex() {
  if (_qcache !== undefined) return _qcache;
  const r = root(), ns = S().vectorNamespace;
  return (_qcache = r ? r.namespace((ns ? ns + '-' : '') + 'qcache') : null);
}

function withTimeout(p, ms) {
  let t;
  return Promise.race([p, new Promise((_, rej) => { t = setTimeout(() => rej(new Error('vector timeout')), ms); })])
    .finally(() => clearTimeout(t));
}

// کش کوتاه‌مدت داخل instance: سؤال تکراری در چند دقیقه = بدون درخواست دوباره
const cache = new Map();
const CACHE_MS = 5 * 60e3;

async function search(query, topK = 6) {
  const idx = index();
  if (!idx) return null;
  const q = String(query || '').trim().slice(0, 500);
  if (!q) return [];
  const ck = topK + '|' + q;
  const hit = cache.get(ck);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.v;
  try {
    const r = await withTimeout(idx.query({ data: q, topK, includeMetadata: false }),
      TMO());
    const v = (r || []).map(x => ({ id: String(x.id), score: x.score }));
    if (cache.size > 500) cache.clear();
    cache.set(ck, { at: Date.now(), v });
    return v;
  } catch (e) {
    console.warn('vector search failed', e && e.message);
    return null;
  }
}

// ═══ کش معنایی ═══
// هر سؤالی که لایهٔ یادگیری به حافظه ارتقا داد، اینجا هم embed می‌شود. سؤال جدید اگر از نظر معنایی
// بسیار نزدیک بود (فقط بخش dense) و همان اعداد و همان رشته/دانشکده را داشت → کلید همان پاسخ.
// شرط «همان رشته» با فیلتر metadata اعمال می‌شود؛ پس «شهریه کامپیوتر» هرگز پاسخ «شهریه معماری» را نمی‌گیرد.
const SEM_SIM = () => S().semanticCacheSim || 0.92;
const SEM_ON = () => S().semanticCache !== false;
const lit = s => "'" + String(s).replace(/'/g, '') + "'";
const semCache = {
  enabled() { return SEM_ON() && !!qcacheIndex(); },
  async lookup({ text, ver, nums, ents }) {
    const idx = qcacheIndex();
    if (!idx || !SEM_ON() || !text) return null;
    try {
      const { QueryMode } = require('@upstash/vector');
      const r = await withTimeout(idx.query({
        data: text, topK: 1, includeMetadata: true, queryMode: QueryMode.DENSE,
        filter: `ver = ${lit(ver)} AND nums = ${lit(nums || '-')} AND ents = ${lit(ents || '-')}`,
      }), TMO());
      const top = r && r[0];
      if (!top || top.score < SEM_SIM() || !top.metadata) return null;
      return { key: String(top.metadata.key), score: top.score };
    } catch (e) { console.warn('semcache lookup failed', e && e.message); return null; }
  },
  async add({ key, text, ver, nums, ents }) {
    const idx = qcacheIndex();
    if (!idx || !SEM_ON() || !text) return;
    try { await idx.upsert({ id: ver + ':' + key, data: text, metadata: { key, ver, nums: nums || '-', ents: ents || '-' } }); }
    catch (e) { console.warn('semcache add failed', e && e.message); }
  },
  async remove({ key, ver }) {
    const idx = qcacheIndex();
    if (!idx) return;
    try { await idx.delete(ver + ':' + key); } catch (e) { console.warn('semcache remove failed', e && e.message); }
  },
};

function _reset() { _root = _index = _qcache = undefined; cache.clear(); }
module.exports = { search, index, qcacheIndex, semCache, _reset };
