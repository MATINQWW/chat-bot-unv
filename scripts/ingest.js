#!/usr/bin/env node
// همگام‌سازی knowledge/chunks.json با Upstash Vector
//   npm run ingest            → فقط تکه‌های جدید/تغییرکرده upsert و تکه‌های حذف‌شده delete می‌شوند
//   npm run ingest -- --dry   → فقط گزارش، بدون تغییر
//   npm run ingest -- --reset → پاک کردن کامل ایندکس (namespace) و بارگذاری دوباره
// env لازم: UPSTASH_VECTOR_REST_URL و UPSTASH_VECTOR_REST_TOKEN (مثلاً: node --env-file=.env scripts/ingest.js)
try { process.loadEnvFile(); } catch { /* .env اختیاری است */ }
const crypto = require('crypto');
const { load, embedText } = require('../lib/knowledge');
const { index } = require('../lib/vector');

const DRY = process.argv.includes('--dry');
const RESET = process.argv.includes('--reset');

async function existing(idx) {
  const out = new Map();
  let cursor = '0';
  do {
    const r = await idx.range({ cursor, limit: 100, includeMetadata: true });
    for (const v of r.vectors) out.set(String(v.id), (v.metadata && v.metadata.h) || '');
    cursor = r.nextCursor;
  } while (cursor && cursor !== '0' && cursor !== '');
  return out;
}

(async () => {
  const idx = index();
  if (!idx) { console.error('✗ UPSTASH_VECTOR_REST_URL / UPSTASH_VECTOR_REST_TOKEN تنظیم نشده'); process.exit(1); }
  const { chunks } = load();

  if (RESET && !DRY) { await idx.reset(); console.log('ایندکس پاک شد'); }
  const have = RESET ? new Map() : await existing(idx);

  const docs = chunks.map(c => {
    const data = embedText(c);
    const h = crypto.createHash('sha1').update(data).digest('hex').slice(0, 12);
    return { id: c.id, data, metadata: { h, type: c.type, title: c.title } };
  });
  const changed = docs.filter(d => have.get(d.id) !== d.metadata.h);
  const wanted = new Set(docs.map(d => d.id));
  const stale = [...have.keys()].filter(id => !wanted.has(id));

  console.log(`تکه‌ها: ${docs.length} · موجود در ایندکس: ${have.size} · جدید/تغییرکرده: ${changed.length} · حذفی: ${stale.length}`);
  if (DRY) { changed.forEach(d => console.log('  + ' + d.id + '  ' + d.metadata.title)); stale.forEach(id => console.log('  - ' + id)); return; }

  for (let i = 0; i < changed.length; i += 50) {
    await idx.upsert(changed.slice(i, i + 50));
    console.log(`  upsert ${Math.min(i + 50, changed.length)}/${changed.length}`);
  }
  if (stale.length) await idx.delete(stale);
  const info = typeof idx.info === 'function' ? await idx.info().catch(() => null) : null;
  console.log('✓ تمام' + (info ? ` — تعداد بردارها: ${info.vectorCount} (ممکن است چند ثانیه طول بکشد تا به‌روز شود)` : ''));
})().catch(e => { console.error('✗', e && e.message || e); process.exit(1); });
