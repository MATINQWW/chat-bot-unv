'use strict';
// گزارش فعالیت‌ها (فقط‌خواندنی) از audit_logs — مجوز audit.view
//   GET /api/admin-audit?limit=100&before=<id>&category=auth|admins|knowledge|...&q=متن
const { getPool, enabled, tehranIso } = require('../lib/db');
const { requireAdmin, deny, query } = require('../lib/admin-guard');

module.exports = async function adminAudit(req, res) {
  if (!enabled()) return res.status(503).json({ error: 'admin_db_not_configured' });
  if (req.method !== 'GET') { res.setHeader('Allow', 'GET'); return res.status(405).end(); }
  const ctx = await requireAdmin(req, res);
  if (!ctx) return;
  if (!ctx.can('audit.view')) return deny(res, ctx, 'audit.view', 'audit.view');
  try {
    const q = query(req);
    const limit = Math.min(200, Math.max(1, parseInt(q.get('limit'), 10) || 100));
    const before = parseInt(q.get('before'), 10) || 0;
    const category = (q.get('category') || '').replace(/[^a-z_]/g, '').slice(0, 30);
    const text = String(q.get('q') || '').slice(0, 80);
    const where = []; const params = [];
    if (before) { where.push('l.id < ?'); params.push(before); }
    if (category) { where.push('a.category = ?'); params.push(category); }
    if (text) { where.push('(l.actor_label LIKE ? OR l.action_code LIKE ? OR a.description LIKE ?)'); const like = `%${text.replace(/[%_\\]/g, '\\$&')}%`; params.push(like, like, like); }
    const [rows] = await getPool().query(
      `SELECT l.id, l.occurred_at, l.actor_label, l.action_code, a.description, a.category, l.outcome, l.target_type, l.target_id, HEX(l.event_hash) AS h
         FROM audit_logs l JOIN audit_actions a ON a.code = l.action_code
        ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
        ORDER BY l.id DESC LIMIT ?`, [...params, limit]);
    const [cats] = await getPool().query('SELECT DISTINCT category FROM audit_actions ORDER BY category');
    if (!before && !category && !text) await ctx.audit({ action: 'audit.view' }).catch(() => {});   // فقط بازکردن صفحه، نه هر صفحه‌بندی
    return res.status(200).json({
      categories: cats.map((c) => c.category),
      rows: rows.map((r) => ({
        id: Number(r.id), at: tehranIso(r.occurred_at), actor: r.actor_label || '—', action: r.action_code,
        description: r.description, category: r.category, outcome: r.outcome,
        target: r.target_type ? `${r.target_type}:${r.target_id}` : '', hash: String(r.h || '').slice(0, 12).toLowerCase(),
      })),
    });
  } catch (e) {
    if (process.env.NODE_ENV !== 'test') console.error('admin-audit:', e && e.code || e && e.message);
    return res.status(503).json({ error: 'db_unavailable' });
  }
};
