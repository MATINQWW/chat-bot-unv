'use strict';
// مدیریت دانش از پنل: فهرست، دیدن یک تکه، افزودن، ویرایش، حذف (آرشیو)
// روی Vercel و VPS با MySQL مستقیم روی جدول knowledge_chunks + همگام‌سازی فوری با Upstash Vector
const crypto = require('node:crypto');
const { getPool, enabled } = require('../lib/db');
const { audit } = require('../lib/admin-store');
const { requireAdmin, deny, parseBody, query } = require('../lib/admin-guard');
const { normalize, StoreError, TYPES } = require('../lib/knowledge-store');

function sha256(s) {
  return crypto.createHash('sha256').update(String(s)).digest('hex');
}

function canonicalHash(c) {
  return sha256(JSON.stringify({
    type: c.type,
    title: c.title,
    text: c.text || '',
    answer: c.answer || '',
    questions: c.questions || [],
    keywords: c.keywords || [],
  }));
}

function parseJsonCol(v, fallback) {
  if (v == null) return fallback;
  if (typeof v === 'object') return v;
  try { return JSON.parse(v); } catch { return fallback; }
}

function rowToChunk(r) {
  const c = {
    id: r.id,
    type: r.chunk_type,
    title: r.title,
    text: r.body_text || '',
    keywords: parseJsonCol(r.keywords_json, []),
    version: Number(r.current_version) || 1,
    sha: r.content_sha256 || '',
    vectorSyncStatus: r.vector_sync_status || 'pending',
    updatedAt: r.updated_at || null,
  };
  if (c.type === 'faq') {
    c.answer = r.faq_answer || '';
    c.questions = parseJsonCol(r.faq_questions_json, [c.title]);
  }
  return c;
}

async function syncVector(chunk, remove = false) {
  try {
    const { index } = require('../lib/vector');
    const idx = index();
    if (!idx) return 'skipped';
    let timer;
    try {
      const op = remove
        ? idx.delete([chunk.id])
        : (() => {
            const { embedText } = require('../lib/knowledge');
            const data = embedText(chunk);
            const h = crypto.createHash('sha1').update(data).digest('hex').slice(0, 12);
            return idx.upsert([{ id: chunk.id, data, metadata: { h, type: chunk.type, title: chunk.title } }]);
          })();
      await Promise.race([
        op,
        new Promise((_, rej) => { timer = setTimeout(() => rej(new Error('timeout')), 6000); }),
      ]);
      return 'synced';
    } finally { clearTimeout(timer); }
  } catch { return 'failed'; }
}

function sendErr(res, e) {
  if (e instanceof StoreError) {
    const body = { error: e.code };
    if (e.fields) body.fields = e.fields;
    if (e.currentSha) body.currentSha = e.currentSha;
    return res.status(e.status).json(body);
  }
  if (process.env.NODE_ENV !== 'test') console.error('admin-knowledge:', e && (e.code || e.message));
  return res.status(e && e.code && String(e.code).startsWith('ER_') ? 503 : 500).json({ error: 'server_error' });
}

module.exports = async function adminKnowledge(req, res) {
  if (!enabled()) return res.status(503).json({ error: 'admin_db_not_configured' });

  const db = getPool();

  if (req.method === 'GET') {
    const ctx = await requireAdmin(req, res);
    if (!ctx) return;
    if (!ctx.can('knowledge.view')) return deny(res, ctx, 'knowledge.view', 'knowledge.view');
    try {
      const id = query(req).get('id');
      if (id) {
        const [rows] = await db.execute(
          `SELECT id, chunk_type, title, body_text, faq_answer, faq_questions_json, keywords_json,
                  content_sha256, vector_sync_status, current_version, updated_at
             FROM knowledge_chunks WHERE id = ? AND status <> 'archived' LIMIT 1`,
          [id]
        );
        if (!rows.length) return res.status(404).json({ error: 'not_found' });
        const chunk = rowToChunk(rows[0]);
        return res.status(200).json({ chunk, sha: chunk.sha });
      }
      const [rows] = await db.query(
        `SELECT id, chunk_type, title, body_text, faq_answer, faq_questions_json, keywords_json,
                content_sha256, vector_sync_status, current_version, updated_at
           FROM knowledge_chunks WHERE status <> 'archived'
          ORDER BY FIELD(chunk_type,'general','faculty','major','list','faq'), title ASC`
      );
      const chunks = rows.map(rowToChunk);
      const types = {};
      for (const c of chunks) types[c.type] = (types[c.type] || 0) + 1;
      return res.status(200).json({ count: chunks.length, types, validTypes: TYPES, chunks });
    } catch (e) { return sendErr(res, e); }
  }

  if (req.method !== 'POST') { res.setHeader('Allow', 'GET, POST'); return res.status(405).end(); }
  const ctx = await requireAdmin(req, res, { write: true });
  if (!ctx) return;
  const body = parseBody(req, 100 * 1024);
  if (body === null) return res.status(413).json({ error: 'payload_too_large' });

  const action = String(body.action || '');
  if (!['create', 'update', 'delete'].includes(action)) {
    return res.status(400).json({ error: 'invalid_action' });
  }

  const perm = action === 'create' ? 'knowledge.create' : 'knowledge.edit';
  const auditCode = action === 'create' ? 'knowledge.create' : (action === 'delete' ? 'knowledge.delete' : 'knowledge.update');
  if (!ctx.can(perm)) return deny(res, ctx, auditCode, perm);

  const conn = await db.getConnection();
  try {
    if (action === 'delete') {
      const id = String(body.id || '').trim();
      if (!id) return res.status(400).json({ error: 'bad_request' });
      await conn.beginTransaction();
      const [rows] = await conn.execute("SELECT id, chunk_type, title FROM knowledge_chunks WHERE id = ? AND status <> 'archived' LIMIT 1", [id]);
      if (!rows.length) { await conn.rollback(); return res.status(404).json({ error: 'not_found' }); }
      await conn.execute("UPDATE knowledge_chunks SET status = 'archived', updated_by_admin_id = ? WHERE id = ?", [ctx.admin.id, id]);
      await audit(conn, {
        actorId: ctx.admin.id, actorLabel: ctx.admin.username, sessionId: ctx.sessionId, ipHash: ctx.ipHash, ua: ctx.ua,
        action: 'knowledge.delete', targetType: 'chunk', targetId: id,
        details: { title: rows[0].title, type: rows[0].chunk_type },
      });
      await conn.commit();
      const vector = await syncVector({ id }, true);
      return res.status(200).json({ ok: true, id, vector });
    }

    if (action === 'create') {
      const chunk = normalize(body.chunk);
      const h = canonicalHash(chunk);
      await conn.beginTransaction();
      const [dup] = await conn.execute('SELECT id FROM knowledge_chunks WHERE id = ? LIMIT 1', [chunk.id]);
      if (dup.length) {
        await conn.rollback();
        return res.status(409).json({ error: 'duplicate_id', fields: { id: 'این شناسه قبلاً وجود دارد' } });
      }
      await conn.execute(
        `INSERT INTO knowledge_chunks
          (id, chunk_type, title, body_text, faq_answer, faq_questions_json, keywords_json, status, content_sha256, vector_sync_status, current_version, created_by_admin_id, updated_by_admin_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'published', ?, 'pending', 1, ?, ?)`,
        [
          chunk.id, chunk.type, chunk.title, chunk.text,
          chunk.type === 'faq' ? chunk.answer : null,
          chunk.type === 'faq' ? JSON.stringify(chunk.questions) : null,
          JSON.stringify(chunk.keywords || []),
          h, ctx.admin.id, ctx.admin.id,
        ]
      );
      await conn.execute(
        `INSERT INTO knowledge_chunk_versions (chunk_id, version_no, snapshot_json, content_sha256, change_note, changed_by_admin_id)
         VALUES (?, 1, ?, ?, 'created', ?)`,
        [chunk.id, JSON.stringify(chunk), h, ctx.admin.id]
      );
      await audit(conn, {
        actorId: ctx.admin.id, actorLabel: ctx.admin.username, sessionId: ctx.sessionId, ipHash: ctx.ipHash, ua: ctx.ua,
        action: 'knowledge.create', targetType: 'chunk', targetId: chunk.id,
        details: { title: chunk.title, type: chunk.type, sha: h.slice(0, 12) },
      });
      await conn.commit();

      const vector = await syncVector(chunk, false);
      if (vector === 'synced') {
        await db.execute(
          "UPDATE knowledge_chunks SET vector_sync_status = 'synced', vector_synced_hash = ?, vector_synced_at = NOW(3), vector_last_error = NULL WHERE id = ?",
          [h, chunk.id]
        ).catch(() => {});
      }
      return res.status(200).json({ ok: true, chunk, sha: h, vector });
    }

    // action === 'update'
    const id = String(body.id || '').trim();
    if (!id) return res.status(400).json({ error: 'bad_request' });
    await conn.beginTransaction();
    const [rows] = await conn.execute(
      `SELECT id, chunk_type, title, body_text, faq_answer, faq_questions_json, keywords_json, content_sha256, current_version
         FROM knowledge_chunks WHERE id = ? AND status <> 'archived' LIMIT 1`,
      [id]
    );
    if (!rows.length) { await conn.rollback(); return res.status(404).json({ error: 'not_found' }); }
    const old = rows[0];
    const chunk = normalize({ ...body.chunk, type: body.chunk && body.chunk.type || old.chunk_type }, { id });
    const h = canonicalHash(chunk);
    const nextVer = (Number(old.current_version) || 1) + 1;

    await conn.execute(
      `UPDATE knowledge_chunks
          SET chunk_type = ?, title = ?, body_text = ?, faq_answer = ?, faq_questions_json = ?, keywords_json = ?,
              content_sha256 = ?, vector_sync_status = 'pending', current_version = ?, updated_by_admin_id = ?
        WHERE id = ?`,
      [
        chunk.type, chunk.title, chunk.text,
        chunk.type === 'faq' ? chunk.answer : null,
        chunk.type === 'faq' ? JSON.stringify(chunk.questions) : null,
        JSON.stringify(chunk.keywords || []),
        h, nextVer, ctx.admin.id, id,
      ]
    );
    await conn.execute(
      `INSERT INTO knowledge_chunk_versions (chunk_id, version_no, snapshot_json, content_sha256, change_note, changed_by_admin_id)
       VALUES (?, ?, ?, ?, 'updated', ?)`,
      [id, nextVer, JSON.stringify(chunk), h, ctx.admin.id]
    );
    await audit(conn, {
      actorId: ctx.admin.id, actorLabel: ctx.admin.username, sessionId: ctx.sessionId, ipHash: ctx.ipHash, ua: ctx.ua,
      action: 'knowledge.update', targetType: 'chunk', targetId: id,
      details: { title: chunk.title, type: chunk.type, version: nextVer, sha: h.slice(0, 12) },
    });
    await conn.commit();

    const vector = await syncVector(chunk, false);
    if (vector === 'synced') {
      await db.execute(
        "UPDATE knowledge_chunks SET vector_sync_status = 'synced', vector_synced_hash = ?, vector_synced_at = NOW(3), vector_last_error = NULL WHERE id = ?",
        [h, id]
      ).catch(() => {});
    }
    return res.status(200).json({ ok: true, chunk, sha: h, version: nextVer, vector });
  } catch (e) {
    await conn.rollback().catch(() => {});
    return sendErr(res, e);
  } finally {
    conn.release();
  }
};
