const crypto = require('crypto');
const { originAllowed, rateLimited, baseHeaders } = require('../lib/common');
const { getLearner } = require('../lib/prompt');
const { getKnowledgeSummary } = require('../lib/knowledge');

// پنل مدیریت: GET → آمار، پرسش‌های پرتکرار، پرسش‌های بی‌پاسخ (کاندید افزودن به knowledge.txt)
//              POST {"delete":"<key>"} → حذف یک پاسخ از حافظه
// نیاز: ADMIN_TOKEN در env و هدر Authorization: Bearer <token>
async function supabaseRequest(path, options = {}) {
  const url = (process.env.SUPABASE_URL || '').replace(/\/$/, '');
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  if (!url || !key) return { configured: false };
  const response = await fetch(url + path, {
    ...options,
    headers: { apikey: key, Authorization: 'Bearer ' + key, 'Content-Type': 'application/json', ...(options.headers || {}) },
    signal: AbortSignal.timeout(3500),
  });
  const body = response.status === 204 ? null : await response.json().catch(() => null);
  return { configured: true, ok: response.ok, status: response.status, body };
}

function tokenOk(req) {
  const want = process.env.ADMIN_TOKEN || '';
  const got = String((req.headers && req.headers.authorization) || '').replace(/^Bearer\s+/i, '');
  if (want.length < 16) return false;
  const a = crypto.createHash('sha256').update(want).digest(), b = crypto.createHash('sha256').update(got).digest();
  return crypto.timingSafeEqual(a, b);
}
module.exports = async (req, res) => {
  baseHeaders(res);
  if (!process.env.ADMIN_TOKEN) return res.status(404).end();
  if (!originAllowed(req)) return res.status(403).end();
  if (await rateLimited(req, 'admin', 10, 60)) return res.status(429).json({ error: 'rate_limited' });
  if (!tokenOk(req)) return res.status(401).json({ error: 'unauthorized' });
  const L = getLearner();
  if (req.method === 'GET') {
    if (req.query && req.query.knowledge === 'review') {
      if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) return res.status(503).json({ error: 'supabase_not_configured', message: 'برای مدیریت زنده رکوردها، Supabase را پیکربندی کنید.' });
      const limit = Math.max(1, Math.min(100, parseInt(req.query.limit || '30', 10) || 30));
      const offset = Math.max(0, Math.min(10000, parseInt(req.query.offset || '0', 10) || 0));
      const path = '/rest/v1/knowledge_records?select=id,title,category,content,authority_status,temporal_status,published_at,valid_until,use_for_official_claims,source_reference,source_file,notes&authority_status=eq.unverified&order=category.asc,id.asc&limit=' + limit + '&offset=' + offset;
      const result = await supabaseRequest(path);
      if (!result.ok) return res.status(502).json({ error: 'knowledge_query_failed' });
      return res.status(200).json({ records: result.body || [], limit, offset, hasMore: (result.body || []).length === limit });
    }
    const dashboard = await L.dashboard();
    let knowledge = getKnowledgeSummary();
    if (process.env.KNOWLEDGE_BACKEND === 'supabase' && process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) {
      const remoteSummary = await supabaseRequest('/rest/v1/knowledge_records?select=category,authority_status,temporal_status,use_for_official_claims&limit=1000');
      if (remoteSummary.ok && Array.isArray(remoteSummary.body)) {
        const byCategory = {};
        for (const r of remoteSummary.body) byCategory[r.category || 'بدون دسته'] = (byCategory[r.category || 'بدون دسته'] || 0) + 1;
        knowledge = { total: remoteSummary.body.length, verifiedForOfficialClaims: remoteSummary.body.filter(r => r.authority_status === 'verified' && r.use_for_official_claims === true).length, needsReview: remoteSummary.body.filter(r => r.authority_status !== 'verified' || r.temporal_status === 'needs_review').length, byCategory };
      }
    }
    return res.status(200).json({ ...(dashboard || { error: 'store_unavailable' }), knowledge, storage: { redisConfigured: !!((process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL) && (process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN)), knowledgeBackend: process.env.KNOWLEDGE_BACKEND === 'supabase' ? 'supabase' : 'bundled-jsonl' } });
  }
  if (req.method === 'POST') {
    const body = req.body && typeof req.body === 'object' ? req.body : {};
    if (body.review && typeof body.review === 'object') {
      if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) return res.status(503).json({ error: 'supabase_not_configured' });
      const r = body.review;
      if (typeof r.id !== 'string' || !/^[A-Z0-9-]{3,40}$/.test(r.id)) return res.status(400).json({ error: 'bad_record_id' });
      const authority = r.authority_status || 'unverified';
      const temporal = r.temporal_status || 'needs_review';
      const official = r.use_for_official_claims === true;
      if (!['verified','unverified','rejected'].includes(authority) || !['needs_review','valid','expired','not_applicable'].includes(temporal)) return res.status(400).json({ error: 'bad_review_status' });
      if (authority === 'verified' && !['valid','not_applicable'].includes(temporal)) return res.status(400).json({ error: 'verified_source_requires_temporal_review' });
      if (official && !(authority === 'verified' && ['valid','not_applicable'].includes(temporal))) return res.status(400).json({ error: 'official_claims_require_verified_valid_source' });
      const patch = { authority_status: authority, temporal_status: temporal, use_for_official_claims: official, notes: typeof r.notes === 'string' ? r.notes.slice(0, 2000) : null, updated_at: new Date().toISOString() };
      for (const field of ['published_at','valid_until']) {
        if (Object.prototype.hasOwnProperty.call(r, field)) {
          if (r[field] === null || r[field] === '') patch[field] = null;
          else if (typeof r[field] === 'string' && !Number.isNaN(Date.parse(r[field]))) patch[field] = new Date(r[field]).toISOString();
          else return res.status(400).json({ error: 'bad_' + field });
        }
      }
      const result = await supabaseRequest('/rest/v1/knowledge_records?id=eq.' + encodeURIComponent(r.id), { method: 'PATCH', headers: { Prefer: 'return=representation' }, body: JSON.stringify(patch) });
      if (!result.configured) return res.status(503).json({ error: 'supabase_not_configured' });
      if (!result.ok) return res.status(502).json({ error: 'knowledge_review_failed' });
      if (!Array.isArray(result.body) || !result.body.length) return res.status(404).json({ error: 'record_not_found' });
      return res.status(200).json({ ok: true, record: result.body[0] });
    }
    const k = body.delete;
    if (typeof k !== 'string' || !/^[a-f0-9]{16}$/.test(k)) return res.status(400).json({ error: 'bad_request' });
    await L.remove(k);
    return res.status(200).json({ ok: true });
  }
  return res.status(405).end();
};
