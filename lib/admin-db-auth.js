'use strict';
// احراز هویت ادمین‌ها از MySQL (جایگزین حساب‌های NOOKA_*_EMAIL در Environment).
// رمز: Argon2id · نشست: فقط هش SHA-256 در admin_sessions · هر رویداد: audit_logs (فقط‌افزودنی)
const crypto = require('node:crypto');
const { getPool } = require('./db');
const { verifyPassword, hashPassword, dummyHash, checkPolicy } = require('./password');
const S = require('./admin-store');
const { requireAdmin, parseBody, sameOrigin, baseHeaders } = require('./admin-guard');

const identHash = (v) => crypto.createHash('sha256').update(String(v).toLowerCase()).digest('hex').slice(0, 24);

function createDbHandler(deps = {}) {
  const ipOf = deps.ipHash || ((req) => { try { return require('./common').ipHash(req); } catch { return null; } });
  const pool = () => deps.db || getPool();

  async function failed(db, req, { user, ident, reason }) {
    await S.audit(db, {
      actorId: user ? user.id : null, actorLabel: user ? user.username : null,
      attempted: user ? null : identHash(ident), action: 'admin.login.failed', outcome: 'failure',
      ipHash: ipOf(req), ua: req.headers['user-agent'], details: reason ? { reason } : null,
    });
  }

  async function login(req, res, body) {
    const db = pool();
    const ip = ipOf(req);
    // محدودیت هر آی‌پی از روی خود ممیزی (بین چند پروسهٔ pm2 هم‌خوان است): ۲۰ شکست در ۱۵ دقیقه
    const [[{ n }]] = await db.query(
      "SELECT COUNT(*) n FROM audit_logs WHERE action_code = 'admin.login.failed' AND ip_hash = ? AND occurred_at > DATE_SUB(NOW(3), INTERVAL 15 MINUTE)", [ip]);
    if (Number(n) >= 20) return res.status(429).json({ error: 'rate_limited' });

    const ident = String(body.email || body.identifier || '').trim().toLowerCase().slice(0, 254);
    const password = typeof body.password === 'string' ? body.password : '';
    if (!ident || !password || password.length > 1024) {
      await failed(db, req, { ident, reason: 'bad_input' });
      return res.status(401).json({ error: 'invalid_credentials' });
    }

    const [rows] = await db.execute(
      `SELECT id, username, email, display_name, password_hash, status, must_change_password,
              (locked_until IS NOT NULL AND locked_until <= NOW(3)) AS lock_expired
         FROM admin_users WHERE username = ? OR email = ? LIMIT 1`, [ident, ident]);
    const user = rows[0];
    const ok = await verifyPassword(user ? user.password_hash : await dummyHash(), password);

    if (!user || !ok) {
      if (user && user.status === 'active') {
        await db.execute('UPDATE admin_users SET failed_login_count = failed_login_count + 1 WHERE id = ?', [user.id]);
        const max = Number(await S.setting('admin.max_failed_logins', 5, db));
        const mins = Number(await S.setting('admin.lockout_minutes', 15, db));
        const [r] = await db.execute(
          `UPDATE admin_users SET status = 'locked', locked_reason = 'too_many_failed_logins', locked_at = NOW(3),
                  locked_until = DATE_ADD(NOW(3), INTERVAL ? MINUTE)
            WHERE id = ? AND status = 'active' AND failed_login_count >= ?`, [mins, user.id, max]);
        if (r.affectedRows) {
          await S.audit(db, { actorLabel: 'system', action: 'admin.user.lock', targetType: 'admin_user', targetId: user.id,
            ipHash: ip, details: { reason: 'too_many_failed_logins', minutes: mins } });
          await db.execute("UPDATE admin_sessions SET revoked_at = NOW(3), revoke_reason = 'account_locked' WHERE admin_user_id = ? AND revoked_at IS NULL", [user.id]);
        }
      }
      await failed(db, req, { user, ident, reason: !user ? 'unknown_user' : 'bad_password' });
      return res.status(401).json({ error: 'invalid_credentials' });
    }

    // رمز درست است
    if (user.status === 'locked') {
      if (Number(user.lock_expired) === 1) {
        await db.execute("UPDATE admin_users SET status = 'active', failed_login_count = 0, locked_reason = NULL, locked_at = NULL, locked_until = NULL WHERE id = ? AND status = 'locked'", [user.id]);
        await S.audit(db, { actorLabel: 'system', action: 'admin.user.unlock', targetType: 'admin_user', targetId: user.id, ipHash: ip, details: { reason: 'lock_expired' } });
      } else {
        await failed(db, req, { user, ident, reason: 'account_locked' });
        return res.status(423).json({ error: 'account_locked' });
      }
    }

    const token = crypto.randomBytes(32).toString('base64url');
    const ttlHours = Number(await S.setting('admin.session_ttl_hours', 6, db));
    const conn = await db.getConnection();
    try {
      await conn.beginTransaction();
      const [ins] = await conn.execute(
        `INSERT INTO admin_sessions (admin_user_id, session_hash, expires_at, ip_hash, user_agent, device_label)
         VALUES (?, ?, DATE_ADD(NOW(3), INTERVAL ? SECOND), ?, ?, ?)`,
        [user.id, S.sha256(token), ttlHours * 3600, ip, String(req.headers['user-agent'] || '').slice(0, 255) || null, S.deviceLabel(req.headers['user-agent'])]);
      await conn.execute('UPDATE admin_users SET last_login_at = NOW(3), last_login_ip_hash = ?, failed_login_count = 0 WHERE id = ?', [ip, user.id]);
      await S.audit(conn, { actorId: user.id, actorLabel: user.username, action: 'admin.login.success', sessionId: ins.insertId, ipHash: ip, ua: req.headers['user-agent'] });
      await conn.commit();
    } catch (e) {
      await conn.rollback().catch(() => {});
      return res.status(503).json({ error: 'audit_store_unavailable' });   // بدون ممیزی، ورود ممکن نیست
    } finally { conn.release(); }

    const ctx = await S.sessionContext(token, db);
    res.setHeader('Set-Cookie', S.cookieHeader(token, ttlHours * 3600));
    return res.status(200).json({ ok: true, admin: ctx.admin });
  }

  async function changePassword(req, res, body) {
    const ctx = await requireAdmin(req, res, { write: true, allowMustChange: true });
    if (!ctx) return;
    const db = pool();
    const [[{ n }]] = await db.query(
      "SELECT COUNT(*) n FROM audit_logs WHERE action_code = 'admin.password.change' AND outcome = 'failure' AND actor_admin_id = ? AND occurred_at > DATE_SUB(NOW(3), INTERVAL 15 MINUTE)", [ctx.admin.id]);
    if (Number(n) >= 5) return res.status(429).json({ error: 'rate_limited' });

    const current = typeof body.currentPassword === 'string' ? body.currentPassword : '';
    const next = typeof body.newPassword === 'string' ? body.newPassword : '';
    const [[u]] = await db.execute('SELECT password_hash, username, email FROM admin_users WHERE id = ?', [ctx.admin.id]);
    if (!(await verifyPassword(u.password_hash, current))) {
      await ctx.audit({ action: 'admin.password.change', outcome: 'failure', details: { reason: 'bad_current_password' } });
      return res.status(401).json({ error: 'invalid_credentials' });
    }
    const minLength = Number(await S.setting('admin.password_min_length', 12, db));
    const problem = checkPolicy(next, { username: u.username, email: u.email, minLength });
    if (problem) return res.status(400).json({ error: 'weak_password', reason: problem, minLength });
    if (next === current) return res.status(400).json({ error: 'weak_password', reason: 'same_as_current', minLength });

    const hash = await hashPassword(next);
    const conn = await db.getConnection();
    try {
      await conn.beginTransaction();
      await conn.execute('UPDATE admin_users SET password_hash = ?, password_changed_at = NOW(3), must_change_password = 0 WHERE id = ?', [hash, ctx.admin.id]);
      await conn.execute("UPDATE admin_sessions SET revoked_at = NOW(3), revoke_reason = 'password_changed' WHERE admin_user_id = ? AND id <> ? AND revoked_at IS NULL", [ctx.admin.id, ctx.sessionId]);
      await S.audit(conn, { actorId: ctx.admin.id, actorLabel: ctx.admin.username, action: 'admin.password.change', targetType: 'admin_user', targetId: ctx.admin.id, sessionId: ctx.sessionId, ipHash: ctx.ipHash, ua: ctx.ua, details: { by: 'self' } });
      await conn.commit();
    } catch {
      await conn.rollback().catch(() => {});
      return res.status(503).json({ error: 'audit_store_unavailable' });
    } finally { conn.release(); }
    const fresh = await S.sessionContext(ctx.token, db);
    return res.status(200).json({ ok: true, admin: fresh.admin });
  }

  return async function adminAuthDb(req, res) {
    baseHeaders(res);
    try {
      if (req.method === 'GET') {
        const ctx = await S.sessionContext(S.readToken(req), pool());
        if (!ctx) return res.status(401).json({ authenticated: false });
        return res.status(200).json({ authenticated: true, admin: ctx.admin });
      }
      if (req.method !== 'POST') { res.setHeader('Allow', 'GET, POST'); return res.status(405).end(); }
      if (!sameOrigin(req)) return res.status(403).json({ error: 'origin_not_allowed' });
      const body = parseBody(req, 8192);
      if (body === null) return res.status(413).json({ error: 'payload_too_large' });

      if (body.action === 'login') return await login(req, res, body);
      if (body.action === 'change_password') return await changePassword(req, res, body);
      if (body.action === 'logout') {
        const token = S.readToken(req);
        const ctx = S.TOKEN_RE.test(token) ? await S.sessionContext(token, pool()).catch(() => null) : null;
        if (ctx) {
          const db = pool();
          await db.execute("UPDATE admin_sessions SET revoked_at = NOW(3), revoke_reason = 'logout' WHERE id = ? AND revoked_at IS NULL", [ctx.sessionId]);
          await S.audit(db, { actorId: ctx.admin.id, actorLabel: ctx.admin.username, action: 'admin.logout', sessionId: ctx.sessionId, ipHash: ipOf(req), ua: req.headers['user-agent'] });
        }
        res.setHeader('Set-Cookie', S.cookieHeader('', 0));
        return res.status(200).json({ ok: true });
      }
      return res.status(400).json({ error: 'invalid_action' });
    } catch (e) {
      if (process.env.NODE_ENV !== 'test') console.error('admin-auth(db):', e && e.code || e && e.message);
      return res.status(503).json({ error: 'db_unavailable' });
    }
  };
}

module.exports = { createDbHandler };
