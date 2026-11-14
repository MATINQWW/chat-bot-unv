'use strict';

const crypto = require('node:crypto');
const { createKV } = require('../lib/kv');
const defaultStore = createKV();

const COOKIE = '__Host-nooka_admin';
const SESSION_TTL = 6 * 60 * 60;
const SESSION_PREFIX = 'nooka:admin:session:';
const AUDIT_KEY = 'nooka:admin:auth-audit';
const DUMMY_PASSWORD_HASH = 'scrypt$00000000000000000000000000000000$' + '00'.repeat(64);
const ROLE_VIEWS = {
  super: ['dashboard', 'requests', 'tokens', 'knowledge', 'admins', 'audit', 'settings'],
  admin: ['dashboard', 'requests', 'tokens', 'knowledge'],
};

function parseBody(body) {
  if (body && typeof body === 'object') return body;
  if (typeof body === 'string' && body.length <= 8192) {
    try { return JSON.parse(body); } catch { return {}; }
  }
  return {};
}

function parseCookies(header) {
  const out = {};
  for (const part of String(header || '').split(';')) {
    const i = part.indexOf('=');
    if (i <= 0) continue;
    const key = part.slice(0, i).trim();
    const value = part.slice(i + 1).trim();
    if (key) out[key] = value;
  }
  return out;
}

function passwordMatches(password, encoded) {
  if (typeof password !== 'string' || typeof encoded !== 'string') return false;
  const m = /^scrypt\$([a-f0-9]{32})\$([a-f0-9]{128})$/i.exec(encoded);
  if (!m) return false;
  try {
    const salt = Buffer.from(m[1], 'hex');
    const expected = Buffer.from(m[2], 'hex');
    const actual = crypto.scryptSync(password, salt, expected.length);
    return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
  } catch { return false; }
}

function configuredAccounts(env) {
  const accounts = [];
  const definitions = [
    { key: 'super', role: 'Super Admin', email: env.NOOKA_SUPERADMIN_EMAIL, hash: env.NOOKA_SUPERADMIN_PASSWORD_HASH, name: env.NOOKA_SUPERADMIN_NAME || 'مدیر اصلی' },
    { key: 'admin', role: 'Admin', email: env.NOOKA_ADMIN_EMAIL, hash: env.NOOKA_ADMIN_PASSWORD_HASH, name: env.NOOKA_ADMIN_NAME || 'ادمین نوکا' },
  ];
  const seenEmails = new Set();
  for (const item of definitions) {
    if (!item.email && !item.hash) continue;
    if (!item.email || !item.hash || !/^scrypt\$[a-f0-9]{32}\$[a-f0-9]{128}$/i.test(item.hash)) continue;
    const email = String(item.email).trim().toLowerCase();
    if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || seenEmails.has(email)) continue;
    seenEmails.add(email);
    accounts.push({
      key: item.key,
      role: item.role,
      email,
      name: String(item.name).trim().slice(0, 80),
      passwordHash: item.hash,
      views: ROLE_VIEWS[item.key],
    });
  }
  return accounts;
}

function safeAdmin(account) {
  return { key: account.key, role: account.role, email: account.email, name: account.name, views: account.views };
}

function sessionKey(token) {
  return SESSION_PREFIX + crypto.createHash('sha256').update(token).digest('hex');
}

function cookieHeader(token, maxAge = SESSION_TTL) {
  return `${COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${maxAge}`;
}

function readToken(req) {
  return parseCookies(req.headers && req.headers.cookie)[COOKIE] || '';
}

function ipHash(req) {
  const headers = req.headers || {};
  const remote = process.env.VERCEL === '1' && headers['x-vercel-forwarded-for']
    ? String(headers['x-vercel-forwarded-for']).split(',')[0].trim()
    : String((req.socket && req.socket.remoteAddress) || 'unknown');
  const pepper = process.env.CHAT_SIGNING_SECRET || process.env.KV_REST_API_TOKEN || 'nooka-admin-ip-v1';
  return crypto.createHmac('sha256', pepper).update(remote).digest('hex').slice(0, 24);
}

function sameOrigin(req) {
  const origin = req.headers && req.headers.origin;
  const host = req.headers && req.headers.host;
  if (!origin || !host) return false;
  try { return new URL(origin).host.toLowerCase() === String(host).toLowerCase(); } catch { return false; }
}

async function auditRecord(store, action, req, email, role, hashIp = ipHash) {
  const entry = JSON.stringify({
    at: new Date().toISOString(),
    action,
    emailHash: email ? crypto.createHash('sha256').update(String(email).toLowerCase()).digest('hex').slice(0, 24) : null,
    role: role || null,
    ipHash: hashIp(req),
  });
  try {
    const result = await store.exec([['LPUSH', AUDIT_KEY, entry], ['LTRIM', AUDIT_KEY, 0, 4999]]);
    return !!(result && typeof result[0] === 'number' && result[1] === 'OK');
  } catch { return false; }
}

function createHandler(deps = {}) {
  const store = deps.kv || defaultStore;
  const checkRate = deps.rateLimited || null;
  const isOriginAllowed = deps.originAllowed || sameOrigin;
  const hashIp = deps.ipHash || ipHash;
  const env = deps.env || process.env;

  async function getSession(req) {
    const token = readToken(req);
    if (!token || !/^[A-Za-z0-9_-]{40,60}$/.test(token)) return null;
    const result = await store.exec([['GET', sessionKey(token)]]);
    if (!result) throw new Error('session store unavailable');
    if (typeof result[0] !== 'string') return null;
    let session;
    try { session = JSON.parse(result[0]); } catch { return null; }
    const account = configuredAccounts(env).find(a => a.email === session.email && a.key === session.key);
    if (!account) {
      await store.exec([['DEL', sessionKey(token)]]).catch(() => null);
      return null;
    }
    return { token, account };
  }

  return async function adminAuth(req, res) {
    res.setHeader('Cache-Control', 'private, no-store, max-age=0');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Vary', 'Cookie');

    if (req.method === 'GET') {
      if (!store.remote) return res.status(503).json({ error: 'session_store_unavailable' });
      try {
        const session = await getSession(req);
        if (!session) return res.status(401).json({ authenticated: false });
        return res.status(200).json({ authenticated: true, admin: safeAdmin(session.account) });
      } catch {
        return res.status(503).json({ error: 'session_store_unavailable' });
      }
    }

    if (req.method !== 'POST') {
      res.setHeader('Allow', 'GET, POST');
      return res.status(405).end();
    }

    if (!req.headers || !req.headers.origin || !isOriginAllowed(req)) {
      return res.status(403).json({ error: 'origin_not_allowed' });
    }
    if (Number(req.headers['content-length'] || 0) > 8192) return res.status(413).json({ error: 'payload_too_large' });
    if (!store.remote) return res.status(503).json({ error: 'session_store_unavailable' });

    const body = parseBody(req.body);
    if (body.action === 'logout') {
      const token = readToken(req);
      if (token && /^[A-Za-z0-9_-]{40,60}$/.test(token)) {
        let session;
        try { session = await getSession(req); } catch { return res.status(503).json({ error: 'session_store_unavailable' }); }
        let removed;
        try { removed = await store.exec([['DEL', sessionKey(token)]]); } catch { removed = null; }
        if (!removed || typeof removed[0] !== 'number') return res.status(503).json({ error: 'session_store_unavailable' });
        if (session && !(await auditRecord(store, 'admin.logout', req, session.account.email, session.account.role, hashIp))) {
          res.setHeader('Set-Cookie', cookieHeader('', 0));
          return res.status(503).json({ error: 'audit_store_unavailable' });
        }
      }
      res.setHeader('Set-Cookie', cookieHeader('', 0));
      return res.status(200).json({ ok: true });
    }

    if (body.action !== 'login') return res.status(400).json({ error: 'invalid_action' });
    const accounts = configuredAccounts(env);
    if (!accounts.some(a => a.key === 'super')) return res.status(503).json({ error: 'admin_auth_not_configured' });

    let limited = false;
    if (checkRate) {
      try { limited = await checkRate(req, 'admin-login', 5, 30); } catch { return res.status(503).json({ error: 'rate_limit_unavailable' }); }
    } else {
      const ip = hashIp(req);
      const minute = Math.floor(Date.now() / 60000);
      const hour = Math.floor(Date.now() / 3600000);
      const minuteKey = `nooka:admin:login:m:${ip}:${minute}`;
      const hourKey = `nooka:admin:login:h:${ip}:${hour}`;
      let limits;
      try {
        limits = await store.exec([
          ['INCR', minuteKey], ['EXPIRE', minuteKey, 90],
          ['INCR', hourKey], ['EXPIRE', hourKey, 4000],
        ]);
      } catch { limits = null; }
      if (!limits || typeof limits[0] !== 'number' || typeof limits[2] !== 'number') {
        return res.status(503).json({ error: 'rate_limit_unavailable' });
      }
      limited = limits[0] > 5 || limits[2] > 30;
    }
    if (limited) return res.status(429).json({ error: 'rate_limited' });

    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase().slice(0, 254) : '';
    const password = typeof body.password === 'string' ? body.password : '';
    if (!email || password.length < 12 || password.length > 1024) {
      const logged = await auditRecord(store, 'admin.login.failed', req, email, null, hashIp);
      if (!logged) return res.status(503).json({ error: 'audit_store_unavailable' });
      return res.status(401).json({ error: 'invalid_credentials' });
    }

    const account = accounts.find(a => a.email === email);
    const passwordOk = passwordMatches(password, account ? account.passwordHash : DUMMY_PASSWORD_HASH);
    if (!account || !passwordOk) {
      const logged = await auditRecord(store, 'admin.login.failed', req, email, account && account.role, hashIp);
      if (!logged) return res.status(503).json({ error: 'audit_store_unavailable' });
      return res.status(401).json({ error: 'invalid_credentials' });
    }

    const token = crypto.randomBytes(32).toString('base64url');
    const session = JSON.stringify({ email: account.email, key: account.key, createdAt: Date.now() });
    let saved;
    try { saved = await store.exec([['SET', sessionKey(token), session, 'EX', SESSION_TTL]]); }
    catch { saved = null; }
    if (!saved || saved[0] !== 'OK') return res.status(503).json({ error: 'session_store_unavailable' });

    if (!(await auditRecord(store, 'admin.login.success', req, account.email, account.role, hashIp))) {
      await store.exec([['DEL', sessionKey(token)]]).catch(() => null);
      return res.status(503).json({ error: 'audit_store_unavailable' });
    }
    res.setHeader('Set-Cookie', cookieHeader(token));
    return res.status(200).json({ ok: true, admin: safeAdmin(account) });
  };
}

// با تنظیم NOOKA_DB_URL حساب‌ها و نشست‌ها از MySQL می‌آیند (lib/admin-db-auth.js)؛ وگرنه حالت قدیمی Environment+KV.
const legacy = createHandler();
let dbHandler = null;
const handler = (req, res) => {
  if (!process.env.NOOKA_DB_URL) return legacy(req, res);
  if (!dbHandler) dbHandler = require('../lib/admin-db-auth').createDbHandler();
  return dbHandler(req, res);
};
handler.createHandler = createHandler;
handler.passwordMatches = passwordMatches;
handler.configuredAccounts = configuredAccounts;
module.exports = handler;
