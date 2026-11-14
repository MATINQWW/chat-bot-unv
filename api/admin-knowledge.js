'use strict';
// مدیریت دانش از پنل: فهرست، دیدن یک تکه، افزودن، ویرایش — مستقیم روی knowledge/chunks.json (فقط VPS)
//   GET  /api/admin-knowledge            → { sha, count, types, chunks:[…] }          (knowledge.view)
//   GET  /api/admin-knowledge?id=…       → { chunk, sha }                             (knowledge.view)
//   POST { action:'create', chunk, baseSha }                                          (knowledge.create)
//   POST { action:'update', id, chunk, baseSha }                                      (knowledge.edit)
const crypto = require('node:crypto');
const { getPool, enabled } = require('../lib/db');
const { audit } = require('../lib/admin-store');
const { requireAdmin, deny, parseBody, query } = require('../lib/admin-guard');
const { createStore, StoreError } = require('../lib/knowledge-store');

const store = createStore();

// همگام‌سازی همان تکه با Upstash Vector (بهترین تلاش؛ منطق همان scripts/ingest.js)
async function syncVector(chunk) {
  try {
    const { index } = require('../lib/vector');
    const idx = index();
    if (!idx) return 'skipped';
    const { embedText } = require('../lib/knowledge');
    const data = embedText(chunk);
    const h = crypto.createHash('sha1').update(data).digest('hex').slice(0, 12);
    await Promise.race([
      idx.upsert([{ id: chunk.id, data, metadata: { h, type: chunk.type, title: chunk.title } }]),
      new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 6000)),
    ]);
    return 'synced';
  } catch { return 'failed'; }
}

function sendStoreError(res, e) {
  if (e instanceof StoreError) {
    const body = { error: e.code };
    if (e.fields) body.fields = e.fields;
    if (e.currentSha) body.currentSha = e.currentSha;
    return res.status(e.status).json(body);
  }
  if (process.env.NODE_ENV !== 'test') console.error('admin-knowledge:', e && e.code || e && e.message);
  return res.status(e && e.code && String(e.code).startsWith('ER_') ? 503 : 500).json({ error: 'server_error' });
}

module.exports = async function adminKnowledge(req, res) {
  if (!enabled()) return res.status(503).json({ error: 'admin_db_not_configured' });
  if (process.env.VERCEL === '1') return res.status(501).json({ error: 'not_supported_on_vercel' });

  if (req.method === 'GET') {
    const ctx = await requireAdmin(req, res);
    if (!ctx) return;
    if (!ctx.can('knowledge.view')) return deny(res, ctx, 'knowledge.update', 'knowledge.view');
    try {
      const id = query(req).get('id');
      return res.status(200).json(id ? store.get(id) : store.snapshot());
    } catch (e) { return sendStoreError(res, e); }
  }

  if (req.method !== 'POST') { res.setHeader('Allow', 'GET, POST'); return res.status(405).end(); }
  const ctx = await requireAdmin(req, res, { write: true });
  if (!ctx) return;
  const body = parseBody(req, 100 * 1024);
  if (body === null) return res.status(413).json({ error: 'payload_too_large' });

  const isCreate = body.action === 'create';
  if (!isCreate && body.action !== 'update') return res.status(400).json({ error: 'invalid_action' });
  const perm = isCreate ? 'knowledge.create' : 'knowledge.edit';
  const code = isCreate ? 'knowledge.create' : 'knowledge.update';
  if (!ctx.can(perm)) return deny(res, ctx, code, perm);

  let revisionId = null;
  const afterWrite = async (r) => {
    const chunk = r.change.chunk;
    const conn = await getPool().getConnection();
    try {
      await conn.beginTransaction();
      const prev = Buffer.from(r.previousSha, 'hex');
      const [known] = await conn.execute('SELECT 1 FROM knowledge_revisions WHERE content_sha256 = ? LIMIT 1', [prev]);
      if (!known.length) {
        await conn.execute(
          `INSERT INTO knowledge_revisions (content_sha256, chunk_count, size_bytes, backup_path, change_summary, changed_by_admin_id)
           VALUES (?,?,?,?,?,NULL)`, [prev, r.previousCount, r.previousSize, r.baselinePath, 'baseline (before first panel edit)']);
      }
      const summary = (isCreate ? `added: ${chunk.id} (${chunk.type})` : `edited: ${chunk.id}`).slice(0, 500);
      const [ins] = await conn.execute(
        `INSERT INTO knowledge_revisions (content_sha256, chunk_count, size_bytes, backup_path, change_summary, changed_by_admin_id)
         VALUES (?,?,?,?,?,?)`, [Buffer.from(r.sha, 'hex'), r.count, r.size, r.backupPath, summary, ctx.admin.id]);
      revisionId = Number(ins.insertId);
      await audit(conn, {
        actorId: ctx.admin.id, actorLabel: ctx.admin.username, sessionId: ctx.sessionId, ipHash: ctx.ipHash, ua: ctx.ua,
        action: code, targetType: 'chunk', targetId: chunk.id,
        details: { revision: revisionId, sha: r.sha.slice(0, 12), count: r.count, type: chunk.type },   // هرگز متن دانش در لاگ نمی‌آید
      });
      await conn.commit();
    } catch (e) { await conn.rollback().catch(() => {}); throw e; }
    finally { conn.release(); }
  };

  try {
    const result = isCreate
      ? await store.create(body.chunk, { baseSha: body.baseSha, afterWrite })
      : await store.update(String(body.id || ''), body.chunk, { baseSha: body.baseSha, afterWrite });
    require('../lib/knowledge').invalidate();              // این پروسه فوراً؛ بقیهٔ پروسه‌ها ظرف ~۱ ثانیه از روی mtime
    const vector = await syncVector(result.change.chunk);
    return res.status(200).json({ ok: true, chunk: result.change.chunk, sha: result.sha, count: result.count, revisionId, vector });
  } catch (e) { return sendStoreError(res, e); }
};
