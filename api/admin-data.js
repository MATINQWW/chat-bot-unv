'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { createKV } = require('../lib/kv');
const auth = require('./admin-auth');
const report = require('../lib/report');
const { getLearner } = require('../lib/prompt');
const defaultStore = createKV();
function noStore(res) {
  res.setHeader('Cache-Control', 'private, no-store, max-age=0');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Vary', 'Cookie');
}
function createHandler(deps = {}) {
  const store = deps.kv || defaultStore;
  const env = deps.env || process.env;
  const reports = deps.report || report;
  const learnerFactory = deps.getLearner || getLearner;
  const chunksPath = deps.chunksPath || path.join(__dirname, '..', 'knowledge', 'chunks.json');
  function parseList() {
    if (!deps.chunksPath) {
      try { return require('../lib/knowledge').load().chunks || []; } catch { /* fallback */ }
    }
    try { return JSON.parse(fs.readFileSync(chunksPath, 'utf8')).chunks || []; }
    catch { return []; }
  }
  return async function adminData(req, res) {
    noStore(res);
    if (req.method !== 'GET') { res.setHeader('Allow', 'GET'); return res.status(405).end(); }
    const dbEnabled = !deps.kv && require('../lib/db').enabled();
    if (!store.remote && !dbEnabled) return res.status(503).json({ error: 'store_unavailable' });
    if (!deps.kv) {
      try {
        if (await require('../lib/common').rateLimited(req, 'admin-data', 60, 600)) {
          return res.status(429).json({ error: 'rate_limited' });
        }
      } catch { /* best effort */ }
    }
    let session;
    try { session = await auth.resolveSession(req, store, env); } catch { return res.status(503).json({ error: 'store_unavailable' }); }
    if (!session) return res.status(401).json({ error: 'unauthorized' });
    const admin = session.account;
    const allowed = new Set(admin.views || []);
    const isRedis = store.driver === 'upstash' || (!store.driver && store.remote && !env.MYSQL_URL);
    const isMysqlKv = store.driver === 'mysql';
    const out = {
      generatedAt: new Date().toISOString(),
      admin: { email: admin.email, name: admin.name, role: admin.role, key: admin.key, views: admin.views, mustChangePassword: !!admin.mustChangePassword },
      capabilities: { dbMode: dbEnabled, knowledgeEdit: dbEnabled && env.VERCEL !== '1', auditDb: dbEnabled },
      health: {
        redis: { configured: isRedis || !!(env.UPSTASH_REDIS_REST_URL || env.KV_REST_API_URL), status: isRedis ? 'connected' : ((env.UPSTASH_REDIS_REST_URL || env.KV_REST_API_URL) ? 'configured_not_checked' : 'not_configured') },
        mysql: { configured: !!(env.MYSQL_URL || env.NOOKA_DB_URL), status: (isMysqlKv || dbEnabled) ? 'connected' : (env.MYSQL_URL ? 'configured_not_checked' : 'not_configured') },
        vector: { configured: !!(env.UPSTASH_VECTOR_REST_URL && env.UPSTASH_VECTOR_REST_TOKEN), status: env.UPSTASH_VECTOR_REST_URL && env.UPSTASH_VECTOR_REST_TOKEN ? 'configured_not_checked' : 'not_configured' },
      },
    };
    try {
      if (allowed.has('dashboard') || allowed.has('requests')) {
        await reports.prune(store).catch(() => {});
        out.report = await reports.build(store, { limit: 500 });
        out.learner = await learnerFactory().dashboard();
        const lr = await store.exec([['LRANGE', 'leads', 0, 99]]).catch(() => null);
        out.leads = ((lr && lr[0]) || []).map(x => { try { const o = JSON.parse(x); delete o.ip; return o; } catch { return null; } }).filter(Boolean);
      }
      if (allowed.has('tokens')) {
        const r = await store.exec([['HGETALL', 'stats']]);
        const a = r && r[0] || []; const stats = {};
        for (let i = 0; i < a.length; i += 2) stats[a[i]] = Number(a[i + 1]) || 0;
        out.tokens = { used: stats.tokens_used || 0, saved: stats.tokens_saved || 0, trackedFields: ['tokens_used', 'tokens_saved'] };
      }
      if (allowed.has('knowledge')) {
        const chunks = parseList();
        out.knowledge = { count: chunks.length, chunks: chunks.map(c => ({ id: c.id, type: c.type, title: c.title, text: c.text, keywords: c.keywords || [] })) };
      }
      if (allowed.has('admins')) {
        out.admins = (await auth.allAccounts(store, env)).map(a => ({ key: a.key, name: a.name, email: a.email, role: a.role, views: a.views, managed: a.key !== 'super' }));
      }
      if (allowed.has('audit')) {
        const r = await store.exec([['LRANGE', 'nooka:admin:auth-audit', 0, 199]]);
        out.audit = ((r && r[0]) || []).map(s => { try { return JSON.parse(s); } catch { return null; } }).filter(Boolean);
      }
    } catch {
      return res.status(503).json({ error: 'data_unavailable' });
    }
    return res.status(200).json(out);
  };
}
const handler = createHandler();
handler.createHandler = createHandler;
module.exports = handler;
