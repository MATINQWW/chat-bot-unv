'use strict';
const crypto = require('node:crypto');
const { createKV } = require('../lib/kv');
const auth = require('./admin-auth');
const kv = createKV();
const USER_KEY = 'nooka:admin:users';
const VIEWS = ['dashboard', 'requests', 'tokens', 'knowledge', 'audit', 'settings'];
const DB_ROLES = ['admin', 'knowledge_editor', 'counselor', 'read_only'];

function sameOrigin(req) {
  const origin = req.headers && req.headers.origin, host = req.headers && req.headers.host;
  if (!origin || !host) return false;
  try {
    const parsed = new URL(origin);
    if (parsed.host.toLowerCase() !== String(host).toLowerCase()) return false;
    const proto = String((req.headers && req.headers['x-forwarded-proto']) || '').toLowerCase();
    if (proto === 'https' && parsed.protocol !== 'https:') return false;
    return true;
  } catch { return false; }
}
function bodyOf(body) { if (body && typeof body === 'object') return body; if (typeof body === 'string' && body.length <= 8192) { try { return JSON.parse(body); } catch {} } return {}; }
function emailOf(v) { return typeof v === 'string' ? v.trim().toLowerCase() : ''; }
function validEmail(v) { return v.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v); }
function hashPassword(password) { const salt = crypto.randomBytes(16); return 'scrypt$' + salt.toString('hex') + '$' + crypto.scryptSync(password, salt, 64).toString('hex'); }

function inferRoleCode(b) {
  if (typeof b.roleCode === 'string' && DB_ROLES.includes(b.roleCode)) return b.roleCode;
  const views = Array.isArray(b.views) ? b.views : [];
  if (views.includes('knowledge') && !views.includes('requests') && !views.includes('tokens')) return 'knowledge_editor';
  if (views.includes('requests') && !views.includes('tokens') && !views.includes('knowledge')) return 'counselor';
  return 'admin';
}

function makeUsername(email, rawUsername) {
  let base = String(rawUsername || email.split('@')[0] || 'admin')
    .toLowerCase().replace(/[^a-z0-9_.-]/g, '').slice(0, 32);
  if (base.length < 3) base = 'adm_' + crypto.randomBytes(3).toString('hex');
  return base;
}

function createHandler(deps = {}) {
  const store = deps.kv || kv;
  const env = deps.env || process.env;

  return async function adminUsers(req, res) {
    res.setHeader('Cache-Control', 'private, no-store, max-age=0');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Vary', 'Cookie');
    if (!['GET', 'POST', 'PUT', 'DELETE'].includes(req.method)) { res.setHeader('Allow', 'GET, POST, PUT, DELETE'); return res.status(405).end(); }
    if (req.method !== 'GET' && !sameOrigin(req)) return res.status(403).json({ error: 'origin_not_allowed' });
    if (Number(req.headers && req.headers['content-length'] || 0) > 8192) return res.status(413).json({ error: 'payload_too_large' });

    const dbEnabled = !deps.kv && require('../lib/db').enabled();
    if (!store.remote && !dbEnabled) return res.status(503).json({ error: 'store_unavailable' });
    if (!deps.kv) {
      try {
        if (await require('../lib/common').rateLimited(req, 'admin-users', 30, 200)) {
          return res.status(429).json({ error: 'rate_limited' });
        }
      } catch { /* best effort */ }
    }

    let session;
    try { session = await auth.resolveSession(req, deps.kv ? store : undefined, env); }
    catch { return res.status(503).json({ error: 'store_unavailable' }); }
    if (!session) return res.status(401).json({ error: 'unauthorized' });
    if (session.account.key !== 'super') return res.status(403).json({ error: 'forbidden' });

    const b = bodyOf(req.body);
    if (Buffer.byteLength(JSON.stringify(b), 'utf8') > 8192) return res.status(413).json({ error: 'payload_too_large' });

    // ─── حالت MySQL (وقتی NOOKA_DB_URL فعال است) ───
    if (dbEnabled) {
      const db = require('../lib/db').getPool();
      const { loadRolesAndPerms, viewsFor, audit } = require('../lib/admin-store');
      const { hashPassword: argonHash, checkPolicy } = require('../lib/password');
      const actorId = session.account.id || null;
      const actorLabel = session.account.username || session.account.email || 'super';
      const sessionId = session.dbCtx ? session.dbCtx.sessionId : null;
      const ipH = (() => { try { return require('../lib/common').ipHash(req); } catch { return null; } })();
      const ua = req.headers && req.headers['user-agent'];

      if (req.method === 'GET') {
        try {
          const [rows] = await db.query('SELECT id, username, email, display_name, status, last_login_at, created_at FROM admin_users ORDER BY id ASC');
          const admins = [];
          for (const u of rows) {
            const { perms, roles } = await loadRolesAndPerms(u.id, db);
            const isSuper = roles.some(r => r.code === 'super_admin');
            const primaryRole = roles[0] ? roles[0].code : 'admin';
            admins.push({
              id: Number(u.id),
              key: isSuper ? 'super' : ('admin:' + u.id),
              username: u.username,
              email: u.email,
              name: u.display_name || u.username,
              role: roles.map(r => r.name_fa).join(' · ') || 'ادمین',
              roleCode: primaryRole,
              views: viewsFor(perms),
              protected: isSuper,
              active: u.status === 'active',
              lastLoginAt: u.last_login_at || null,
            });
          }
          return res.status(200).json({ admins });
        } catch (e) {
          console.error('admin-users GET db:', e && (e.code || e.message));
          return res.status(503).json({ error: 'store_unavailable' });
        }
      }

      const email = emailOf(b.email);
      if (!validEmail(email)) return res.status(400).json({ error: 'invalid_email' });

      if (req.method === 'POST') {
        const name = typeof b.name === 'string' ? b.name.trim().slice(0, 80) : '';
        const password = typeof b.password === 'string' ? b.password : '';
        const roleCode = inferRoleCode(b);
        if (!name || password.length < 12 || password.length > 1024) {
          return res.status(400).json({ error: 'invalid_admin_data' });
        }
        let username = makeUsername(email, b.username);
        const pwErr = checkPolicy(password, { username, email, minLength: 12 });
        if (pwErr) return res.status(400).json({ error: 'invalid_password', reason: pwErr });

        const conn = await db.getConnection();
        try {
          await conn.beginTransaction();
          const [existsEmail] = await conn.execute('SELECT id FROM admin_users WHERE email = ? LIMIT 1', [email]);
          if (existsEmail.length) { await conn.rollback(); return res.status(409).json({ error: 'email_exists' }); }
          const [existsUser] = await conn.execute('SELECT id FROM admin_users WHERE username = ? LIMIT 1', [username]);
          if (existsUser.length) username = (username.slice(0, 32) + '_' + crypto.randomBytes(2).toString('hex')).slice(0, 40);

          const hash = await argonHash(password);
          const [ins] = await conn.execute(
            `INSERT INTO admin_users (username, email, display_name, password_hash, status, must_change_password)
             VALUES (?, ?, ?, ?, 'active', 0)`,
            [username, email, name, hash]
          );
          const newId = Number(ins.insertId);
          const [rIns] = await conn.execute(
            `INSERT INTO admin_user_roles (admin_user_id, role_id) SELECT ?, id FROM roles WHERE code = ?`,
            [newId, roleCode]
          );
          if (!rIns.affectedRows) { await conn.rollback(); return res.status(400).json({ error: 'invalid_admin_data' }); }
          await audit(conn, {
            actorId, actorLabel, sessionId, ipHash: ipH, ua,
            action: 'admin.user.create', targetType: 'admin_user', targetId: newId,
            details: { username, email, role: roleCode },
          });
          await conn.commit();
          return res.status(201).json({ ok: true, admin: { id: newId, key: 'admin:' + newId, username, email, name, roleCode, active: true } });
        } catch (e) {
          await conn.rollback().catch(() => {});
          if (e && e.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'email_exists' });
          console.error('admin-users POST db:', e && (e.code || e.message));
          return res.status(503).json({ error: 'store_unavailable' });
        } finally { conn.release(); }
      }

      // PUT or DELETE in DB mode
      const conn = await db.getConnection();
      try {
        await conn.beginTransaction();
        const [rows] = await conn.execute('SELECT id, username, email, display_name, status FROM admin_users WHERE email = ? LIMIT 1', [email]);
        if (!rows.length) { await conn.rollback(); return res.status(404).json({ error: 'admin_not_found' }); }
        const target = rows[0];
        const { roles } = await loadRolesAndPerms(target.id, conn);
        if (roles.some(r => r.code === 'super_admin')) {
          await conn.rollback();
          return res.status(403).json({ error: 'forbidden' });
        }

        if (req.method === 'DELETE') {
          if (target.email === session.account.email) { await conn.rollback(); return res.status(409).json({ error: 'cannot_delete_self' }); }
          await conn.execute("UPDATE admin_users SET status = 'locked', locked_reason = 'deleted_by_admin', locked_at = NOW(3), locked_until = NULL WHERE id = ?", [target.id]);
          await conn.execute("UPDATE admin_sessions SET revoked_at = NOW(3), revoke_reason = 'account_deleted' WHERE admin_user_id = ? AND revoked_at IS NULL", [target.id]);
          await audit(conn, {
            actorId, actorLabel, sessionId, ipHash: ipH, ua,
            action: 'admin.user.lock', targetType: 'admin_user', targetId: target.id,
            details: { username: target.username, reason: 'deleted_by_admin' },
          });
          await conn.commit();
          return res.status(200).json({ ok: true });
        }

        // PUT
        const nextName = (typeof b.name === 'string' && b.name.trim()) ? b.name.trim().slice(0, 80) : target.display_name;
        const nextStatus = b.active === false ? 'locked' : (b.active === true ? 'active' : target.status);
        let revoke = nextStatus !== 'active';

        if (typeof b.password === 'string' && b.password) {
          if (b.password.length < 12 || b.password.length > 1024) { await conn.rollback(); return res.status(400).json({ error: 'invalid_password' }); }
          const pwErr = checkPolicy(b.password, { username: target.username, email: target.email, minLength: 12 });
          if (pwErr) { await conn.rollback(); return res.status(400).json({ error: 'invalid_password', reason: pwErr }); }
          const hash = await argonHash(b.password);
          await conn.execute('UPDATE admin_users SET password_hash = ?, password_changed_at = NOW(3) WHERE id = ?', [hash, target.id]);
          revoke = true;
        }

        await conn.execute(
          `UPDATE admin_users
              SET display_name = ?, status = ?,
                  locked_reason = IF(? = 'active', NULL, COALESCE(locked_reason, 'disabled_by_admin')),
                  locked_at = IF(? = 'active', NULL, COALESCE(locked_at, NOW(3))),
                  locked_until = IF(? = 'active', NULL, locked_until),
                  failed_login_count = IF(? = 'active', 0, failed_login_count)
            WHERE id = ?`,
          [nextName, nextStatus, nextStatus, nextStatus, nextStatus, nextStatus, target.id]
        );

        if (typeof b.roleCode === 'string' && DB_ROLES.includes(b.roleCode)) {
          await conn.execute('DELETE FROM admin_user_roles WHERE admin_user_id = ?', [target.id]);
          await conn.execute('INSERT INTO admin_user_roles (admin_user_id, role_id) SELECT ?, id FROM roles WHERE code = ?', [target.id, b.roleCode]);
        }

        if (revoke) {
          await conn.execute("UPDATE admin_sessions SET revoked_at = NOW(3), revoke_reason = 'admin_updated' WHERE admin_user_id = ? AND revoked_at IS NULL", [target.id]);
        }

        const actCode = nextStatus === 'locked' && target.status === 'active'
          ? 'admin.user.lock'
          : (nextStatus === 'active' && target.status !== 'active' ? 'admin.user.unlock' : 'admin.user.update');
        await audit(conn, {
          actorId, actorLabel, sessionId, ipHash: ipH, ua,
          action: actCode, targetType: 'admin_user', targetId: target.id,
          details: { username: target.username, status: nextStatus, role: b.roleCode || undefined },
        });
        await conn.commit();
        return res.status(200).json({ ok: true, admin: { id: Number(target.id), email: target.email, name: nextName, active: nextStatus === 'active' } });
      } catch (e) {
        await conn.rollback().catch(() => {});
        console.error('admin-users PUT/DEL db:', e && (e.code || e.message));
        return res.status(503).json({ error: 'store_unavailable' });
      } finally { conn.release(); }
    }

    // ─── حالت KV/Redis (برای تست‌ها یا استقرار بدون NOOKA_DB_URL) ───
    if (req.method === 'GET') {
      try {
        const base = auth.configuredAccounts(env).map(a => ({ key: a.key, email: a.email, name: a.name, role: a.role, views: a.views, protected: true, active: true }));
        const r = await store.exec([['HGETALL', USER_KEY]]);
        if (!r) throw new Error('store unavailable');
        const flat = r[0] || [];
        for (let i = 0; i < flat.length; i += 2) {
          try {
            const u = JSON.parse(flat[i + 1]);
            base.push({ key: u.key, email: u.email, name: u.name, role: 'Admin', views: u.views || [], protected: false, active: u.active !== false });
          } catch {}
        }
        return res.status(200).json({ admins: base });
      } catch { return res.status(503).json({ error: 'store_unavailable' }); }
    }

    const email = emailOf(b.email);
    if (!validEmail(email)) return res.status(400).json({ error: 'invalid_email' });

    if (req.method === 'POST') {
      const name = typeof b.name === 'string' ? b.name.trim().slice(0, 80) : '';
      const password = typeof b.password === 'string' ? b.password : '';
      const views = Array.isArray(b.views) ? [...new Set(b.views.filter(v => VIEWS.includes(v)))] : [];
      if (!name || password.length < 12 || password.length > 1024 || !views.length) return res.status(400).json({ error: 'invalid_admin_data' });
      if (auth.configuredAccounts(env).some(a => a.email === email)) return res.status(409).json({ error: 'email_exists' });
      const user = { key: 'admin:' + crypto.randomUUID(), email, name, role: 'Admin', passwordHash: hashPassword(password), sessionVersion: 1, views, active: true, createdAt: new Date().toISOString() };
      let saved; try { saved = await store.exec([['HSETNX', USER_KEY, email, JSON.stringify(user)]]); } catch { saved = null; }
      if (!saved || saved[0] !== 1) return res.status(saved ? 409 : 503).json({ error: saved ? 'email_exists' : 'store_unavailable' });
      const logged = await auth.auditRecord(store, 'admin.user.created', req, email, 'Admin', auth.ipHash);
      if (!logged) { await store.exec([['HDEL', USER_KEY, email]]).catch(() => null); return res.status(503).json({ error: 'audit_store_unavailable' }); }
      return res.status(201).json({ ok: true, admin: { key: user.key, email, name, role: user.role, views } });
    }

    let raw;
    try { raw = await store.exec([['HGET', USER_KEY, email]]); } catch { raw = null; }
    if (!raw) return res.status(503).json({ error: 'store_unavailable' });
    if (typeof raw[0] !== 'string') return res.status(404).json({ error: 'admin_not_found' });
    let user; try { user = JSON.parse(raw[0]); } catch { return res.status(503).json({ error: 'invalid_admin_record' }); }

    if (req.method === 'DELETE') {
      if (user.email === session.account.email) return res.status(409).json({ error: 'cannot_delete_self' });
      const d = await store.exec([['HDEL', USER_KEY, email]]);
      if (!d) return res.status(503).json({ error: 'store_unavailable' });
      if (!d[0]) return res.status(404).json({ error: 'admin_not_found' });
      if (!(await auth.auditRecord(store, 'admin.user.deleted', req, email, 'Admin', auth.ipHash))) {
        await store.exec([['HSET', USER_KEY, email, raw[0]]]).catch(() => null);
        return res.status(503).json({ error: 'audit_store_unavailable' });
      }
      return res.status(200).json({ ok: true });
    }

    const previousPasswordHash = user.passwordHash;
    const previousActive = user.active !== false;
    const views = Array.isArray(b.views) ? [...new Set(b.views.filter(v => VIEWS.includes(v)))] : user.views;
    if (b.active === false) user.active = false;
    else if (b.active === true) user.active = true;
    if (Array.isArray(b.views)) {
      if (!views.length) return res.status(400).json({ error: 'invalid_admin_data' });
      user.views = views;
    }
    if (typeof b.name === 'string' && b.name.trim()) user.name = b.name.trim().slice(0, 80);
    if (typeof b.password === 'string' && b.password) {
      if (b.password.length < 12 || b.password.length > 1024) return res.status(400).json({ error: 'invalid_password' });
      user.passwordHash = hashPassword(b.password);
    }
    if (user.passwordHash !== previousPasswordHash || (user.active !== false) !== previousActive) user.sessionVersion = (Number(user.sessionVersion) || 1) + 1;
    user.updatedAt = new Date().toISOString();
    const saved = await store.exec([['HSET', USER_KEY, email, JSON.stringify(user)]]);
    if (!saved) return res.status(503).json({ error: 'store_unavailable' });
    if (!(await auth.auditRecord(store, 'admin.user.updated', req, email, 'Admin', auth.ipHash))) {
      await store.exec([['HSET', USER_KEY, email, raw[0]]]).catch(() => null);
      return res.status(503).json({ error: 'audit_store_unavailable' });
    }
    return res.status(200).json({ ok: true, admin: { key: user.key, email, name: user.name, role: 'Admin', views: user.views, active: user.active } });
  };
}

module.exports = createHandler();
module.exports.createHandler = createHandler;
