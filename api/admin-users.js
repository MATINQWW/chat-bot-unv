'use strict';
// مدیریت ادمین‌ها و نقش‌ها (فقط با مجوز)
//   GET  → { admins:[…], roles:[…] }                                 (admins.view)
//   POST { action:'create', username, email, name, role }             (admins.create + admins.manage_roles)
//   POST { action:'set_roles', id, roles:[کد نقش]}                     (admins.manage_roles)
//   POST { action:'lock'|'unlock', id }                               (admins.lock)
//   POST { action:'reset_password', id }                              (admins.manage_roles)
// رمز موقت فقط یک‌بار در پاسخ برمی‌گردد؛ در دیتابیس فقط هش Argon2id می‌ماند و کاربر باید در اولین ورود عوضش کند.
const { getPool, enabled, tehranIso } = require('../lib/db');
const { audit } = require('../lib/admin-store');
const { hashPassword, temporaryPassword } = require('../lib/password');
const { requireAdmin, deny, parseBody } = require('../lib/admin-guard');

const USERNAME_RE = /^[a-z0-9_.-]{3,40}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const fail = (res, status, error, extra) => res.status(status).json({ error, ...(extra || {}) });

async function activeSuperCount(db, exceptId = 0) {
  const [[r]] = await db.query(
    `SELECT COUNT(DISTINCT u.id) n FROM admin_users u
       JOIN admin_user_roles ur ON ur.admin_user_id = u.id JOIN roles r ON r.id = ur.role_id AND r.code = 'super_admin'
      WHERE u.status = 'active' AND u.id <> ?`, [exceptId]);
  return Number(r.n);
}
const isSuperUser = async (db, id) => {
  const [r] = await db.query("SELECT 1 FROM admin_user_roles ur JOIN roles r ON r.id = ur.role_id WHERE ur.admin_user_id = ? AND r.code = 'super_admin'", [id]);
  return r.length > 0;
};

async function listAll(db) {
  const [admins] = await db.query(
    `SELECT u.id, u.username, u.email, u.display_name, u.status, u.locked_reason, u.must_change_password, u.last_login_at,
            GROUP_CONCAT(r.code ORDER BY r.id) AS roles
       FROM admin_users u LEFT JOIN admin_user_roles ur ON ur.admin_user_id = u.id LEFT JOIN roles r ON r.id = ur.role_id
      GROUP BY u.id ORDER BY u.id`);
  const [roles] = await db.query(
    `SELECT r.code, r.name_fa, r.description, COUNT(rp.permission_id) AS permissions
       FROM roles r LEFT JOIN role_permissions rp ON rp.role_id = r.id GROUP BY r.id ORDER BY r.id`);
  return {
    admins: admins.map((a) => ({
      id: Number(a.id), username: a.username, email: a.email, name: a.display_name || a.username, status: a.status,
      lockedReason: a.locked_reason, mustChangePassword: !!a.must_change_password, lastLoginAt: tehranIso(a.last_login_at),
      roles: a.roles ? String(a.roles).split(',') : [],
    })),
    roles: roles.map((r) => ({ code: r.code, name: r.name_fa, description: r.description, permissions: Number(r.permissions) })),
  };
}

async function tx(db, fn) {
  const conn = await db.getConnection();
  try { await conn.beginTransaction(); const out = await fn(conn); await conn.commit(); return out; }
  catch (e) { await conn.rollback().catch(() => {}); throw e; }
  finally { conn.release(); }
}

module.exports = async function adminUsers(req, res) {
  if (!enabled()) return fail(res, 503, 'admin_db_not_configured');
  const db = getPool();

  if (req.method === 'GET') {
    const ctx = await requireAdmin(req, res);
    if (!ctx) return;
    if (!ctx.can('admins.view')) return deny(res, ctx, 'admin.user.update', 'admins.view');
    try { return res.status(200).json(await listAll(db)); } catch { return fail(res, 503, 'db_unavailable'); }
  }
  if (req.method !== 'POST') { res.setHeader('Allow', 'GET, POST'); return res.status(405).end(); }

  const ctx = await requireAdmin(req, res, { write: true });
  if (!ctx) return;
  const body = parseBody(req, 8192);
  if (body === null) return fail(res, 413, 'payload_too_large');
  const base = { actorId: ctx.admin.id, actorLabel: ctx.admin.username, sessionId: ctx.sessionId, ipHash: ctx.ipHash, ua: ctx.ua };

  try {
    // ───────── ساخت ادمین ─────────
    if (body.action === 'create') {
      if (!ctx.can('admins.create')) return deny(res, ctx, 'admin.user.create', 'admins.create');
      const username = String(body.username || '').trim().toLowerCase();
      const email = String(body.email || '').trim().toLowerCase();
      const name = String(body.name || '').trim().slice(0, 80) || null;
      const role = String(body.role || '').trim();
      const fields = {};
      if (!USERNAME_RE.test(username)) fields.username = 'نام کاربری: ۳ تا ۴۰ نویسه از a-z، 0-9، نقطه، خط تیره و زیرخط';
      if (!EMAIL_RE.test(email) || email.length > 254) fields.email = 'ایمیل معتبر نیست';
      if (!role) fields.role = 'نقش را انتخاب کنید';
      if (Object.keys(fields).length) return fail(res, 400, 'validation', { fields });
      if (!ctx.can('admins.manage_roles')) return deny(res, ctx, 'admin.role.assign', 'admins.manage_roles');
      const [[r]] = await db.query('SELECT id, code FROM roles WHERE code = ?', [role]);
      if (!r) return fail(res, 400, 'validation', { fields: { role: 'نقش نامعتبر است' } });
      if (r.code === 'super_admin' && !ctx.isSuper()) return deny(res, ctx, 'admin.role.assign', 'super_admin');
      const temp = temporaryPassword();
      const hash = await hashPassword(temp);
      let id;
      try {
        id = await tx(db, async (c) => {
          const [ins] = await c.execute(
            'INSERT INTO admin_users (username, email, display_name, password_hash, must_change_password, created_by) VALUES (?,?,?,?,1,?)',
            [username, email, name, hash, ctx.admin.id]);
          await c.execute('INSERT INTO admin_user_roles (admin_user_id, role_id, granted_by) VALUES (?,?,?)', [ins.insertId, r.id, ctx.admin.id]);
          await audit(c, { ...base, action: 'admin.user.create', targetType: 'admin_user', targetId: ins.insertId, details: { role } });
          await audit(c, { ...base, action: 'admin.role.assign', targetType: 'admin_user', targetId: ins.insertId, details: { role } });
          return ins.insertId;
        });
      } catch (e) {
        if (e && e.code === 'ER_DUP_ENTRY') return fail(res, 409, 'duplicate', { fields: { username: 'نام کاربری یا ایمیل قبلاً ثبت شده' } });
        throw e;
      }
      return res.status(200).json({ ok: true, id: Number(id), username, temporaryPassword: temp });
    }

    const id = Number(body.id);
    if (!Number.isInteger(id) || id <= 0) return fail(res, 400, 'invalid_id');
    const [[target]] = await db.query('SELECT id, username, status FROM admin_users WHERE id = ?', [id]);
    if (!target) return fail(res, 404, 'not_found');

    // ───────── تعیین نقش‌ها ─────────
    if (body.action === 'set_roles') {
      if (!ctx.can('admins.manage_roles')) return deny(res, ctx, 'admin.role.assign', 'admins.manage_roles');
      if (id === ctx.admin.id) return fail(res, 409, 'cannot_change_own_roles');
      const wanted = [...new Set((Array.isArray(body.roles) ? body.roles : []).map(String))];
      if (wanted.length > 10) return fail(res, 400, 'validation');
      const [known] = wanted.length ? await db.query('SELECT id, code FROM roles WHERE code IN (?)', [wanted]) : [[]];
      if (known.length !== wanted.length) return fail(res, 400, 'validation', { fields: { roles: 'نقش نامعتبر' } });
      const [cur] = await db.query('SELECT r.id, r.code FROM admin_user_roles ur JOIN roles r ON r.id = ur.role_id WHERE ur.admin_user_id = ?', [id]);
      const had = new Set(cur.map((x) => x.code));
      const add = known.filter((k) => !had.has(k.code));
      const remove = cur.filter((c) => !wanted.includes(c.code));
      if ((add.some((x) => x.code === 'super_admin') || remove.some((x) => x.code === 'super_admin')) && !ctx.isSuper()) return deny(res, ctx, 'admin.role.assign', 'super_admin');
      if (remove.some((x) => x.code === 'super_admin') && target.status === 'active' && (await activeSuperCount(db, id)) < 1) return fail(res, 409, 'last_super_admin');
      await tx(db, async (c) => {
        for (const r of remove) {
          await c.execute('DELETE FROM admin_user_roles WHERE admin_user_id = ? AND role_id = ?', [id, r.id]);
          await audit(c, { ...base, action: 'admin.role.revoke', targetType: 'admin_user', targetId: id, details: { role: r.code } });
        }
        for (const r of add) {
          await c.execute('INSERT INTO admin_user_roles (admin_user_id, role_id, granted_by) VALUES (?,?,?)', [id, r.id, ctx.admin.id]);
          await audit(c, { ...base, action: 'admin.role.assign', targetType: 'admin_user', targetId: id, details: { role: r.code } });
        }
      });
      return res.status(200).json({ ok: true });
    }

    // ───────── قفل / بازکردن ─────────
    if (body.action === 'lock' || body.action === 'unlock') {
      if (!ctx.can('admins.lock')) return deny(res, ctx, body.action === 'lock' ? 'admin.user.lock' : 'admin.user.unlock', 'admins.lock');
      if (body.action === 'lock') {
        if (id === ctx.admin.id) return fail(res, 409, 'cannot_lock_self');
        if ((await isSuperUser(db, id)) && !ctx.isSuper()) return deny(res, ctx, 'admin.user.lock', 'super_admin');
        if (target.status === 'active' && (await isSuperUser(db, id)) && (await activeSuperCount(db, id)) < 1) return fail(res, 409, 'last_super_admin');
        await tx(db, async (c) => {
          await c.execute("UPDATE admin_users SET status = 'locked', locked_reason = 'manual', locked_at = NOW(3), locked_until = NULL WHERE id = ?", [id]);
          await c.execute("UPDATE admin_sessions SET revoked_at = NOW(3), revoked_by = ?, revoke_reason = 'account_locked' WHERE admin_user_id = ? AND revoked_at IS NULL", [ctx.admin.id, id]);
          await audit(c, { ...base, action: 'admin.user.lock', targetType: 'admin_user', targetId: id, details: { reason: 'manual' } });
        });
      } else {
        await tx(db, async (c) => {
          await c.execute("UPDATE admin_users SET status = 'active', failed_login_count = 0, locked_reason = NULL, locked_at = NULL, locked_until = NULL WHERE id = ?", [id]);
          await audit(c, { ...base, action: 'admin.user.unlock', targetType: 'admin_user', targetId: id });
        });
      }
      return res.status(200).json({ ok: true });
    }

    // ───────── بازنشانی رمز ─────────
    if (body.action === 'reset_password') {
      if (!ctx.can('admins.manage_roles')) return deny(res, ctx, 'admin.password.change', 'admins.manage_roles');
      if (id === ctx.admin.id) return fail(res, 409, 'use_change_password');
      if ((await isSuperUser(db, id)) && !ctx.isSuper()) return deny(res, ctx, 'admin.password.change', 'super_admin');
      const temp = temporaryPassword();
      const hash = await hashPassword(temp);
      await tx(db, async (c) => {
        await c.execute('UPDATE admin_users SET password_hash = ?, password_changed_at = NOW(3), must_change_password = 1 WHERE id = ?', [hash, id]);
        await c.execute("UPDATE admin_sessions SET revoked_at = NOW(3), revoked_by = ?, revoke_reason = 'password_reset' WHERE admin_user_id = ? AND revoked_at IS NULL", [ctx.admin.id, id]);
        await audit(c, { ...base, action: 'admin.password.change', targetType: 'admin_user', targetId: id, details: { by: 'admin_reset' } });
      });
      return res.status(200).json({ ok: true, temporaryPassword: temp });
    }

    return fail(res, 400, 'invalid_action');
  } catch (e) {
    if (process.env.NODE_ENV !== 'test') console.error('admin-users:', e && e.code || e && e.message);
    return fail(res, 503, 'db_unavailable');
  }
};
