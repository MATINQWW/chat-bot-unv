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

function parseJsonSafe(v, fallback) {
  if (v == null) return fallback;
  if (typeof v === 'object') return v;
  try { return JSON.parse(v); } catch { return fallback; }
}

function createHandler(deps = {}) {
  const store = deps.kv || defaultStore;
  const env = deps.env || process.env;
  const reports = deps.report || report;
  const learnerFactory = deps.getLearner || getLearner;
  const chunksPath = deps.chunksPath || path.join(__dirname, '..', 'knowledge', 'chunks.json');

  function parseFileChunks() {
    if (!deps.chunksPath) {
      try { return require('../lib/knowledge').load().chunks || []; } catch { /* fallback */ }
    }
    try { return JSON.parse(fs.readFileSync(chunksPath, 'utf8')).chunks || []; }
    catch { return []; }
  }

  return async function adminData(req, res) {
    noStore(res);
    if (req.method !== 'GET') { res.setHeader('Allow', 'GET'); return res.status(405).end(); }
    const dbMod = require('../lib/db');
    const dbEnabled = !deps.kv && dbMod.enabled();
    if (!store.remote && !dbEnabled) return res.status(503).json({ error: 'store_unavailable' });

    if (!deps.kv) {
      try {
        if (await require('../lib/common').rateLimited(req, 'admin-data', 60, 600)) {
          return res.status(429).json({ error: 'rate_limited' });
        }
      } catch { /* best effort */ }
    }

    let session;
    try { session = await auth.resolveSession(req, deps.kv ? store : undefined, env); }
    catch { return res.status(503).json({ error: 'store_unavailable' }); }
    if (!session) return res.status(401).json({ error: 'unauthorized' });

    const admin = session.account;
    const allowed = new Set(admin.views || []);
    const isRedis = store.driver === 'upstash' || (!store.driver && store.remote && !env.MYSQL_URL);
    const mysqlHealth = dbEnabled
      ? await dbMod.ping()
      : { configured: !!env.MYSQL_URL, status: store.driver === 'mysql' ? 'connected' : (env.MYSQL_URL ? 'configured_not_checked' : 'not_configured') };

    const out = {
      generatedAt: new Date().toISOString(),
      admin: {
        id: admin.id,
        username: admin.username,
        email: admin.email,
        name: admin.name,
        role: admin.role,
        key: admin.key,
        views: admin.views,
        mustChangePassword: !!admin.mustChangePassword,
      },
      capabilities: {
        dbMode: dbEnabled,
        knowledgeEdit: dbEnabled,
        auditDb: dbEnabled,
      },
      health: {
        redis: {
          configured: isRedis || !!(env.UPSTASH_REDIS_REST_URL || env.KV_REST_API_URL),
          status: isRedis ? 'connected' : ((env.UPSTASH_REDIS_REST_URL || env.KV_REST_API_URL) ? 'configured_not_checked' : 'not_configured'),
        },
        mysql: mysqlHealth,
        vector: {
          configured: !!(env.UPSTASH_VECTOR_REST_URL && env.UPSTASH_VECTOR_REST_TOKEN),
          status: env.UPSTASH_VECTOR_REST_URL && env.UPSTASH_VECTOR_REST_TOKEN ? 'configured_not_checked' : 'not_configured',
        },
      },
    };

    try {
      if (allowed.has('dashboard') || allowed.has('requests')) {
        await reports.prune(store).catch(() => {});
        const rep = await reports.build(store, { limit: 500 });
        if (rep && Array.isArray(rep.byDay)) {
          // حذف روزهای خالی/پوچ با مجموع صفر
          rep.byDay = rep.byDay.filter(d => d && Number(d.total) > 0);
        }
        out.report = rep;
        out.learner = await learnerFactory().dashboard();
        const lr = await store.exec([['LRANGE', 'leads', 0, 99]]).catch(() => null);
        out.leads = ((lr && lr[0]) || []).map(x => { try { const o = JSON.parse(x); delete o.ip; return o; } catch { return null; } }).filter(Boolean);
      }

      if (allowed.has('tokens')) {
        let tok = { input: 0, output: 0, cached: 0, used: 0, saved: 0, byDay: [], byProvider: [], source: 'kv' };
        const r = await store.exec([['HGETALL', 'stats']]).catch(() => null);
        const a = (r && r[0]) || [];
        const stats = {};
        for (let i = 0; i < a.length; i += 2) stats[a[i]] = Number(a[i + 1]) || 0;
        tok.input = stats.tokens_input || 0;
        tok.output = stats.tokens_output || 0;
        tok.cached = stats.tokens_cached || 0;
        tok.used = stats.tokens_used || (tok.input + tok.output);
        tok.saved = stats.tokens_saved || tok.cached;

        if (dbEnabled) {
          try {
            const db = dbMod.getPool();
            let totRow, dayRows, provRows;
            try {
              [[totRow]] = await db.query(
                `SELECT COALESCE(SUM(prompt_tokens),0) AS inp, COALESCE(SUM(completion_tokens),0) AS outp,
                        COALESCE(SUM(cached_tokens),0) AS cached, COUNT(*) AS calls
                   FROM llm_provider_usage`
              );
              [dayRows] = await db.query(
                `SELECT DATE_FORMAT(created_at, '%Y-%m-%d') AS date,
                        COALESCE(SUM(prompt_tokens),0) AS input,
                        COALESCE(SUM(completion_tokens),0) AS output,
                        COALESCE(SUM(cached_tokens),0) AS cached,
                        COUNT(*) AS calls
                   FROM llm_provider_usage
                  GROUP BY DATE_FORMAT(created_at, '%Y-%m-%d')
                 HAVING (input + output + cached) > 0
                  ORDER BY date DESC LIMIT 14`
              );
              [provRows] = await db.query(
                `SELECT provider, model, COUNT(*) AS calls,
                        COALESCE(SUM(prompt_tokens),0) AS input,
                        COALESCE(SUM(completion_tokens),0) AS output,
                        COALESCE(SUM(cached_tokens),0) AS cached,
                        ROUND(AVG(latency_ms)) AS avgLatencyMs
                   FROM llm_provider_usage
                  GROUP BY provider, model
                  ORDER BY (input + output + cached) DESC LIMIT 20`
              );
            } catch {
              // سازگار با دیتابیسی که هنوز ستون cached_tokens ندارد
              [[totRow]] = await db.query(
                `SELECT COALESCE(SUM(prompt_tokens),0) AS inp, COALESCE(SUM(completion_tokens),0) AS outp,
                        0 AS cached, COUNT(*) AS calls
                   FROM llm_provider_usage`
              );
              [dayRows] = await db.query(
                `SELECT DATE_FORMAT(created_at, '%Y-%m-%d') AS date,
                        COALESCE(SUM(prompt_tokens),0) AS input,
                        COALESCE(SUM(completion_tokens),0) AS output,
                        0 AS cached,
                        COUNT(*) AS calls
                   FROM llm_provider_usage
                  GROUP BY DATE_FORMAT(created_at, '%Y-%m-%d')
                 HAVING (input + output) > 0
                  ORDER BY date DESC LIMIT 14`
              );
              [provRows] = await db.query(
                `SELECT provider, model, COUNT(*) AS calls,
                        COALESCE(SUM(prompt_tokens),0) AS input,
                        COALESCE(SUM(completion_tokens),0) AS output,
                        0 AS cached,
                        ROUND(AVG(latency_ms)) AS avgLatencyMs
                   FROM llm_provider_usage
                  GROUP BY provider, model
                  ORDER BY (input + output) DESC LIMIT 20`
              );
            }
            if (Number(totRow.calls) > 0) {
              tok.source = 'mysql';
              tok.input = Number(totRow.inp) || 0;
              tok.output = Number(totRow.outp) || 0;
              tok.cached = Number(totRow.cached) || 0;
              tok.used = tok.input + tok.output;
              tok.saved = Math.max(tok.saved, tok.cached);
              tok.byDay = dayRows.map(d => ({
                date: d.date,
                input: Number(d.input) || 0,
                output: Number(d.output) || 0,
                cached: Number(d.cached) || 0,
                total: (Number(d.input) || 0) + (Number(d.output) || 0) + (Number(d.cached) || 0),
                calls: Number(d.calls) || 0,
              }));
              tok.byProvider = provRows.map(p => ({
                provider: p.provider,
                model: p.model,
                calls: Number(p.calls) || 0,
                input: Number(p.input) || 0,
                output: Number(p.output) || 0,
                cached: Number(p.cached) || 0,
                avgLatencyMs: Number(p.avgLatencyMs) || 0,
              }));
            }
          } catch { /* fallback to kv stats */ }
        }
        out.tokens = tok;
      }

      if (allowed.has('knowledge')) {
        let chunks = null;
        if (dbEnabled) {
          try {
            const [rows] = await dbMod.getPool().query(
              `SELECT id, chunk_type, title, body_text, faq_answer, keywords_json, vector_sync_status, updated_at
                 FROM knowledge_chunks WHERE status <> 'archived'
                ORDER BY FIELD(chunk_type,'general','faculty','major','list','faq'), title ASC`
            );
            if (rows.length) {
              chunks = rows.map(r => ({
                id: r.id,
                type: r.chunk_type,
                title: r.title,
                text: r.body_text || '',
                answer: r.faq_answer || undefined,
                keywords: parseJsonSafe(r.keywords_json, []),
                vectorSyncStatus: r.vector_sync_status || 'pending',
                updatedAt: r.updated_at ? dbMod.tehranIso(r.updated_at) : null,
              }));
            }
          } catch { /* fallback to file */ }
        }
        if (!chunks) {
          const order = { general: 1, faculty: 2, major: 3, list: 4, faq: 5 };
          chunks = parseFileChunks()
            .map(c => ({ id: c.id, type: c.type, title: c.title, text: c.text, answer: c.answer, keywords: c.keywords || [] }))
            .sort((a, b) => (order[a.type] || 9) - (order[b.type] || 9) || String(a.title).localeCompare(String(b.title), 'fa'));
        }
        out.knowledge = { count: chunks.length, chunks };
      }

      if (allowed.has('admins')) {
        if (!dbEnabled) {
          out.admins = (await auth.allAccounts(store, env)).map(a => ({
            key: a.key, name: a.name, email: a.email, role: a.role, views: a.views, managed: a.key !== 'super',
          }));
        }
      }

      if (allowed.has('audit')) {
        if (dbEnabled) {
          const db = dbMod.getPool();
          const [rows] = await db.query(
            `SELECT l.id, l.occurred_at, l.action_code, l.outcome, l.actor_label, l.target_type, l.target_id, l.ip_hash, l.details,
                    u.display_name, u.username, a.category, a.description
               FROM audit_logs l
               LEFT JOIN admin_users u ON u.id = l.actor_admin_id
               LEFT JOIN audit_actions a ON a.code = l.action_code
              ORDER BY l.id DESC LIMIT 300`
          );
          const mapped = rows.map(r => ({
            id: Number(r.id),
            at: dbMod.tehranIso(r.occurred_at),
            action: r.action_code,
            category: r.category || (String(r.action_code || '').startsWith('knowledge.') || String(r.action_code || '').startsWith('settings.') ? 'knowledge' : 'auth'),
            description: r.description || r.action_code,
            outcome: r.outcome || 'success',
            actorName: r.display_name || r.username || r.actor_label || 'ناشناس',
            actorUsername: r.username || r.actor_label || '—',
            emailHash: r.display_name || r.username || r.actor_label || '—',
            role: r.outcome || '—',
            target: r.target_type ? `${r.target_type}:${r.target_id || ''}` : '',
            targetId: r.target_id || '',
            details: parseJsonSafe(r.details, null),
            ipHash: r.ip_hash || '—',
          }));
          const isFileAct = (x) => x.category === 'knowledge' || x.category === 'settings' || x.category === 'vector' ||
            /^(knowledge|settings|answer|vector)\./.test(x.action);
          out.audit = mapped;
          out.auditAuth = mapped.filter(x => !isFileAct(x));
          out.auditFiles = mapped.filter(isFileAct);
        } else {
          const r = await store.exec([['LRANGE', 'nooka:admin:auth-audit', 0, 199]]);
          const list = ((r && r[0]) || []).map(s => { try { return JSON.parse(s); } catch { return null; } }).filter(Boolean);
          out.audit = list;
          out.auditAuth = list;
          out.auditFiles = [];
        }
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
