'use strict';
// دسترسی به دیتابیس پنل: تنظیمات، ممیزی، نشست‌ها، مجوزها. همهٔ توکن‌ها فقط به‌صورت هش SHA-256 ذخیره می‌شوند.
const crypto = require('node:crypto');
const { getPool, tehranIso } = require('./db');

const COOKIE = '__Host-nooka_admin';
const TOKEN_RE = /^[A-Za-z0-9_-]{40,60}$/;
// بخش‌های پنل ← مجوز لازم برای دیدنشان
const VIEW_PERMS = {
  dashboard: 'dashboard.view', requests: 'requests.view', tokens: 'usage.view', knowledge: 'knowledge.view',
  admins: 'admins.view', audit: 'audit.view', settings: 'settings.view',
};

const sha256 = (v) => crypto.createHash('sha256').update(v).digest();
const viewsFor = (perms) => Object.keys(VIEW_PERMS).filter((v) => perms.has(VIEW_PERMS[v]));

function parseCookies(header) {
  const out = {};
  for (const part of String(header || '').split(';')) {
    const i = part.indexOf('=');
    if (i <= 0) continue;
    out[part.slice(0, i).trim()] = part.slice(i + 1).trim();
  }
  return out;
}
const readToken = (req) => parseCookies(req.headers && req.headers.cookie)[COOKIE] || '';

function cookieHeader(token, maxAgeSec) {
  return `${COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${maxAgeSec}`;
}

// ── تنظیمات admin.* (کش ۳۰ ثانیه‌ای؛ تغییر از پنل ظرف حداکثر ۳۰ ثانیه اعمال می‌شود)
let cache = { at: 0, map: new Map() };
async function setting(key, fallback, db = getPool()) {
  if (Date.now() - cache.at > 30000) {
    const [rows] = await db.query("SELECT setting_key k, value_json v FROM settings WHERE setting_key LIKE 'admin.%'");
    cache = { at: Date.now(), map: new Map(rows.map((r) => [r.k, r.v])) };
  }
  const v = cache.map.get(key);
  return v === undefined || v === null ? fallback : v;
}
const clearSettingsCache = () => { cache = { at: 0, map: new Map() }; };

// ── ممیزی: db می‌تواند pool یا connection (داخل تراکنش) باشد
async function audit(db, e) {
  await db.execute(
    `INSERT INTO audit_logs (actor_admin_id, actor_label, attempted_identifier_hash, action_code, outcome,
                             target_type, target_id, session_id, ip_hash, user_agent, details)
     VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
    [e.actorId ?? null, e.actorLabel ?? null, e.attempted ?? null, e.action, e.outcome || 'success',
      e.targetType ?? null, e.targetId == null ? null : String(e.targetId), e.sessionId ?? null,
      e.ipHash ?? null, e.ua ? String(e.ua).slice(0, 255) : null, e.details ? JSON.stringify(e.details) : null]);
}

function deviceLabel(ua) {
  const s = String(ua || '');
  const b = /Edg\//.test(s) ? 'Edge' : /OPR\//.test(s) ? 'Opera' : /Firefox\//.test(s) ? 'Firefox'
    : /Chrome\//.test(s) ? 'Chrome' : /Safari\//.test(s) ? 'Safari' : 'مرورگر نامشخص';
  const o = /Windows/.test(s) ? 'Windows' : /Android/.test(s) ? 'Android' : /iPhone|iPad/.test(s) ? 'iOS'
    : /Mac OS X/.test(s) ? 'macOS' : /Linux/.test(s) ? 'Linux' : '';
  return (o ? `${b} روی ${o}` : b).slice(0, 80);
}

function publicAdmin(u, roles, perms) {
  return {
    id: Number(u.id), username: u.username, email: u.email, name: u.display_name || u.username,
    key: roles.some((r) => r.code === 'super_admin') ? 'super' : 'admin',
    role: roles.map((r) => r.name_fa).join(' · ') || 'بدون نقش',
    roles: roles.map((r) => r.code),
    permissions: [...perms].sort(),
    views: viewsFor(perms),
    mustChangePassword: !!u.must_change_password,
    live: true,
  };
}

async function loadRolesAndPerms(userId, db) {
  const [pr] = await db.execute('SELECT permission_code c FROM v_admin_effective_permissions WHERE admin_user_id = ?', [userId]);
  const [rr] = await db.execute(
    'SELECT ro.code, ro.name_fa FROM admin_user_roles ur JOIN roles ro ON ro.id = ur.role_id WHERE ur.admin_user_id = ? ORDER BY ro.id', [userId]);
  return { perms: new Set(pr.map((x) => x.c)), roles: rr };
}

// نشست معتبر = ردیف ابطال‌نشده و منقضی‌نشده، با کاربر فعال
async function sessionContext(token, db = getPool()) {
  if (!TOKEN_RE.test(token || '')) return null;
  const [rows] = await db.execute(
    `SELECT s.id AS sid, u.id, u.username, u.email, u.display_name, u.status, u.must_change_password
       FROM admin_sessions s JOIN admin_users u ON u.id = s.admin_user_id
      WHERE s.session_hash = ? AND s.revoked_at IS NULL AND s.expires_at > NOW(3)`, [sha256(token)]);
  const u = rows[0];
  if (!u || u.status !== 'active') return null;
  const { perms, roles } = await loadRolesAndPerms(u.id, db);
  db.execute('UPDATE admin_sessions SET last_seen_at = NOW(3) WHERE id = ? AND last_seen_at < DATE_SUB(NOW(3), INTERVAL 1 MINUTE)', [u.sid]).catch(() => {});
  return { sessionId: Number(u.sid), token, admin: publicAdmin(u, roles, perms), perms, roles };
}

module.exports = {
  COOKIE, TOKEN_RE, VIEW_PERMS, sha256, viewsFor, parseCookies, readToken, cookieHeader, setting, clearSettingsCache,
  audit, deviceLabel, publicAdmin, loadRolesAndPerms, sessionContext, tehranIso,
};
