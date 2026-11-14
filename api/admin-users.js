'use strict';
const crypto = require('node:crypto');
const { createKV } = require('../lib/kv');
const auth = require('./admin-auth');
const kv = createKV();
const USER_KEY = 'nooka:admin:users';
const VIEWS = ['dashboard', 'requests', 'tokens', 'knowledge', 'audit', 'settings'];
function sameOrigin(req) {
  const origin = req.headers && req.headers.origin, host = req.headers && req.headers.host;
  if (!origin || !host) return false;
  try { return new URL(origin).host.toLowerCase() === String(host).toLowerCase(); } catch { return false; }
}
function bodyOf(body) { if (body && typeof body === 'object') return body; if (typeof body === 'string' && body.length <= 8192) { try { return JSON.parse(body); } catch {} } return {}; }
function emailOf(v) { return typeof v === 'string' ? v.trim().toLowerCase() : ''; }
function validEmail(v) { return v.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v); }
function hashPassword(password) { const salt = crypto.randomBytes(16); return 'scrypt$' + salt.toString('hex') + '$' + crypto.scryptSync(password, salt, 64).toString('hex'); }
function createHandler(deps = {}) {
 const store = deps.kv || kv; const env = deps.env || process.env;
 return async function adminUsers(req, res) {
  res.setHeader('Cache-Control', 'private, no-store, max-age=0');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  if (!['GET', 'POST', 'PUT', 'DELETE'].includes(req.method)) { res.setHeader('Allow', 'GET, POST, PUT, DELETE'); return res.status(405).end(); }
  if (req.method !== 'GET' && !sameOrigin(req)) return res.status(403).json({ error: 'origin_not_allowed' });
  if (Number(req.headers && req.headers['content-length'] || 0) > 8192) return res.status(413).json({ error: 'payload_too_large' });
  if (!store.remote) return res.status(503).json({ error: 'store_unavailable' });
  let session;
  try { session = await auth.resolveSession(req, store, env); } catch { return res.status(503).json({ error: 'store_unavailable' }); }
  if (!session) return res.status(401).json({ error: 'unauthorized' });
  if (session.account.key !== 'super') return res.status(403).json({ error: 'forbidden' });
  const b = bodyOf(req.body);
  if (Buffer.byteLength(JSON.stringify(b), 'utf8') > 8192) return res.status(413).json({ error: 'payload_too_large' });
  if (req.method === 'GET') {
    try { const base = auth.configuredAccounts(env).map(a => ({ key: a.key, email: a.email, name: a.name, role: a.role, views: a.views, protected: true, active: true })); const r = await store.exec([['HGETALL', USER_KEY]]); if (!r) throw new Error('store unavailable'); const flat = r[0] || []; for (let i = 0; i < flat.length; i += 2) { try { const u = JSON.parse(flat[i + 1]); base.push({ key: u.key, email: u.email, name: u.name, role: 'Admin', views: u.views || [], protected: false, active: u.active !== false }); } catch {} } return res.status(200).json({ admins: base }); }
    catch { return res.status(503).json({ error: 'store_unavailable' }); }
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
    if (!(await auth.auditRecord(store, 'admin.user.deleted', req, email, 'Admin', auth.ipHash))) { await store.exec([['HSET', USER_KEY, email, raw[0]]]).catch(() => null); return res.status(503).json({ error: 'audit_store_unavailable' }); }
    return res.status(200).json({ ok: true });
  }
  const previousPasswordHash = user.passwordHash;
  const previousActive = user.active !== false;
  const views = Array.isArray(b.views) ? [...new Set(b.views.filter(v => VIEWS.includes(v)))] : user.views;
  if (b.active === false) user.active = false;
  else if (b.active === true) user.active = true;
  if (Array.isArray(b.views)) user.views = views;
  if (typeof b.name === 'string' && b.name.trim()) user.name = b.name.trim().slice(0, 80);
  if (typeof b.password === 'string' && b.password) {
    if (b.password.length < 12 || b.password.length > 1024) return res.status(400).json({ error: 'invalid_password' });
    user.passwordHash = hashPassword(b.password);
  }
  if (user.passwordHash !== previousPasswordHash || (user.active !== false) !== previousActive) user.sessionVersion = (Number(user.sessionVersion) || 1) + 1;
  user.updatedAt = new Date().toISOString();
  const saved = await store.exec([['HSET', USER_KEY, email, JSON.stringify(user)]]);
  if (!saved) return res.status(503).json({ error: 'store_unavailable' });
  if (!(await auth.auditRecord(store, 'admin.user.updated', req, email, 'Admin', auth.ipHash))) { await store.exec([['HSET', USER_KEY, email, raw[0]]]).catch(() => null); return res.status(503).json({ error: 'audit_store_unavailable' }); }
  return res.status(200).json({ ok: true, admin: { key: user.key, email, name: user.name, role: 'Admin', views: user.views, active: user.active } });
};
}

module.exports = createHandler();
module.exports.createHandler = createHandler;
