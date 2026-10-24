// Structured university knowledge retrieval (Persian-first, dependency-free).
// Records are bundled with the Vercel function. All records are treated as unverified
// until an administrator validates them; this module never upgrades their authority.
const fs = require('fs');
const path = require('path');

const DATA_FILE = path.join(process.cwd(), 'data', 'knowledge_records_v1.jsonl');
let cache = null;

const STOPWORDS = new Set([
  'از','در','به','با','را','که','هم','یا','تا','بر','من','تو','او','ما','شما','این','آن','اون','ان',
  'یه','یک','هر','می','هست','است','بود','باشه','باشد','چه','چی','چرا','کی','کجا','چقدر','چطور','چگونه',
  'برای','براي','هستن','کنم','کنید','کنه','میشه','می‌شه','شود','شده','دارم','داره','دارد','ولی','اما','اگه','اگر',
  'لطفا','سلام','ممنون','توضیح','بده','بگید','بگو','بهم','میشه','میخوام','می‌خوام',
  'the','a','an','of','to','in','is','are','and','or','for','on','what','how','do','i'
]);

function normalize(text) {
  return String(text || '')
    .replace(/[ًٌٍَُِّْـ]/g, '')
    .replace(/ي/g, 'ی').replace(/ك/g, 'ک')
    .replace(/[٠-٩]/g, c => String(c.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, c => String(c.charCodeAt(0) - 0x06F0))
    .replace(/\u200c/g, ' ')
    .toLowerCase();
}
function tokens(text) {
  return normalize(text).split(/[^\p{L}\p{N}]+/u)
    .filter(w => w.length >= 2 && !STOPWORDS.has(w));
}
function loadRecords() {
  if (cache) return cache;
  const raw = fs.readFileSync(DATA_FILE, 'utf8');
  cache = raw.split(/\r?\n/).filter(Boolean).map(line => {
    const r = JSON.parse(line);
    const content = String(r.content || '').trim();
    return {
      ...r,
      title: String(r.title || '').trim(),
      content,
      normTitle: normalize(r.title || ''),
      normContent: normalize(content),
      tokenSet: new Set(tokens(`${r.title || ''} ${content} ${r.category || ''}`)),
    };
  }).filter(r => r.content);
  return cache;
}
function scoreRecord(record, query, qTokens) {
  if (!qTokens.length) return 0;
  const qSet = new Set(qTokens);
  let score = 0;
  for (const t of qSet) {
    if (record.normTitle.includes(t)) score += 3;
    else if (record.normContent.includes(t)) score += 1;
    if (record.category && normalize(record.category).includes(t)) score += 0.5;
  }
  const qNorm = normalize(query).trim();
  if (qNorm.length >= 5 && record.normContent.includes(qNorm)) score += 5;
  const overlap = [...qSet].filter(t => record.tokenSet.has(t)).length;
  const ratio = overlap / Math.max(qSet.size, 1);
  // Prefer records that cover a larger fraction of the question, not only long posts.
  score += ratio * 2;
  return score;
}
function formatRecord(r, score) {
  const status = r.authority_status === 'verified' && r.use_for_official_claims === true
    ? 'تأییدشده برای ادعای رسمی'
    : 'تأییدنشده؛ برای اثبات مقررات رسمی کافی نیست';
  const date = r.published_at ? ` | تاریخ انتشار: ${r.published_at}` : '';
  const validity = r.valid_until ? ` | معتبر تا: ${r.valid_until}` : '';
  return `[شناسه منبع: ${r.id} | دسته: ${r.category} | وضعیت: ${status}${date}${validity} | ارجاع: ${r.source_reference || r.source_file || 'نامشخص'}]\nعنوان: ${r.title || 'بدون عنوان'}\nمحتوا: ${r.content}`;
}
async function retrieveKnowledge(query, maxChars = 2800, maxRecords = 6) {
  const qTokens = tokens(query);
  let records = loadRecords();
  let remoteUsed = false;
  if (process.env.KNOWLEDGE_BACKEND === 'supabase' && process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) {
    try {
      const response = await fetch(process.env.SUPABASE_URL.replace(/\/$/, '') + '/rest/v1/rpc/search_knowledge_records', {
        method: 'POST',
        headers: { apikey: process.env.SUPABASE_SERVICE_ROLE_KEY, Authorization: 'Bearer ' + process.env.SUPABASE_SERVICE_ROLE_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({ query_text: String(query || ''), result_limit: maxRecords }),
        signal: AbortSignal.timeout(1800),
      });
      if (!response.ok) throw new Error('Supabase search returned ' + response.status);
      const remoteRecords = await response.json();
      if (Array.isArray(remoteRecords)) {
        records = remoteRecords.map(r => ({ ...r, content: String(r.content || ''), title: String(r.title || ''), normTitle: normalize(r.title || ''), normContent: normalize(r.content || ''), tokenSet: new Set(tokens(`${r.title || ''} ${r.content || ''} ${r.category || ''}`)), remoteScore: Number(r.score || 0) }));
        remoteUsed = true;
      }
    } catch (e) { console.warn('Supabase knowledge search failed; using bundled records:', e && e.message); }
  }
  const scored = records.map(r => ({ record: r, score: r.remoteScore || scoreRecord(r, query, qTokens) }))
    .filter(x => x.score > 0)
    .sort((a, b) => b.score - a.score || String(a.record.id).localeCompare(String(b.record.id)));
  // If Supabase is explicitly selected and returns no matches, do not silently serve a potentially stale local copy.
  if (remoteUsed && records.length === 0) return { text: '', topScore: 0, sources: [], verifiedCount: 0, recordCount: 0, backend: 'supabase' };

  const picked = [];
  let used = 0;
  for (const item of scored) {
    if (picked.length >= maxRecords) break;
    const formatted = formatRecord(item.record, item.score);
    if (used + formatted.length > maxChars && picked.length > 0) continue;
    if (formatted.length > maxChars && picked.length === 0) {
      const clipped = { ...item, formatted: formatted.slice(0, maxChars) };
      picked.push(clipped); used += clipped.formatted.length; break;
    }
    picked.push({ ...item, formatted });
    used += formatted.length;
  }
  const sources = picked.map(({ record, score }) => ({
    id: record.id,
    title: record.title,
    category: record.category,
    authority_status: record.authority_status || 'unverified',
    temporal_status: record.temporal_status || 'needs_review',
    use_for_official_claims: record.use_for_official_claims === true,
    score: Number(score.toFixed(2)),
    source_reference: record.source_reference || record.source_file || null,
  }));
  const verifiedCount = sources.filter(s => s.authority_status === 'verified' && s.use_for_official_claims).length;
  return {
    text: picked.map(x => x.formatted).join('\n\n---\n\n'),
    topScore: picked.length ? picked[0].score : 0,
    sources,
    verifiedCount,
    recordCount: records.length,
    backend: remoteUsed ? 'supabase' : 'bundled-jsonl',
  };
}
function getKnowledgeSummary() {
  const records = loadRecords();
  const byCategory = {};
  for (const r of records) byCategory[r.category || 'بدون دسته'] = (byCategory[r.category || 'بدون دسته'] || 0) + 1;
  return {
    total: records.length,
    verifiedForOfficialClaims: records.filter(r => r.authority_status === 'verified' && r.use_for_official_claims === true).length,
    needsReview: records.filter(r => r.authority_status !== 'verified' || r.temporal_status === 'needs_review').length,
    byCategory,
  };
}
function getKnowledgeRaw() {
  return loadRecords().map(r => `${r.title}\n${r.content}`).join('\n\n---\n\n');
}
module.exports = { retrieveKnowledge, getKnowledgeSummary, getKnowledgeRaw, loadRecords, normalize, tokens };
