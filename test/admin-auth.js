'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { createHandler, passwordMatches } = require('../api/admin-auth');

function makeHash(password) {
  const salt = crypto.randomBytes(16);
  return `scrypt$${salt.toString('hex')}$${crypto.scryptSync(password, salt, 64).toString('hex')}`;
}

class FakeKV {
  constructor() { this.remote = true; this.data = new Map(); this.lists = new Map(); this.expiries = new Map(); }
  async exec(commands) {
    return commands.map(cmd => {
      const [op, key, ...args] = cmd.map(String);
      if (op === 'SET') { this.data.set(key, args[0]); return 'OK'; }
      if (op === 'GET') return this.data.has(key) ? this.data.get(key) : null;
      if (op === 'HSET') { let h=this.data.get(key); if (!(h instanceof Map)) h=new Map(); h.set(args[0], args[1]); this.data.set(key,h); return 1; }
      if (op === 'HGET') { const h=this.data.get(key); return h instanceof Map ? (h.get(args[0]) || null) : null; }
      if (op === 'HGETALL') { const h=this.data.get(key); return h instanceof Map ? [].concat(...Array.from(h.entries())) : []; }
      if (op === 'HDEL') { const h=this.data.get(key); return h instanceof Map && h.delete(args[0]) ? 1 : 0; }
      if (op === 'DEL') return this.data.delete(key) ? 1 : 0;
      if (op === 'INCR') { const n = (Number(this.data.get(key)) || 0) + 1; this.data.set(key, String(n)); return n; }
      if (op === 'EXPIRE') { this.expiries.set(key, Number(args[0])); return this.data.has(key) ? 1 : 0; }
      if (op === 'LPUSH') { const a = this.lists.get(key) || []; a.unshift(...args); this.lists.set(key, a); return a.length; }
      if (op === 'LTRIM') { const a = this.lists.get(key) || []; const start = Number(args[0]), stop = Number(args[1]); this.lists.set(key, a.slice(start, stop + 1)); return 'OK'; }
      throw new Error('unsupported fake command: ' + op);
    });
  }
}

function invoke(handler, { method = 'GET', url = '/', body, cookie = '', origin = 'https://nooka.test', host = 'nooka.test' } = {}) {
  const headers = { host, origin, cookie };
  const req = { method, url, body, headers, socket: { remoteAddress: '127.0.0.1' } };
  const outHeaders = {};
  const res = {
    statusCode: 200,
    body: undefined,
    setHeader(name, value) { outHeaders[name.toLowerCase()] = value; return this; },
    status(code) { this.statusCode = code; return this; },
    json(value) { this.body = value; return this; },
    end(value) { this.body = value; return this; },
  };
  return Promise.resolve(handler(req, res)).then(() => ({ status: res.statusCode, body: res.body, headers: outHeaders }));
}

(async () => {
  const superPassword = 'Super-Admin-Passphrase-2026!';
  const adminPassword = 'Limited-Admin-Passphrase-2026!';
  const env = {
    NOOKA_SUPERADMIN_EMAIL: 'owner@nooka.test',
    NOOKA_SUPERADMIN_PASSWORD_HASH: makeHash(superPassword),
    NOOKA_SUPERADMIN_NAME: 'مدیر اصلی',
    NOOKA_ADMIN_EMAIL: 'legacy@nooka.test',
    NOOKA_ADMIN_PASSWORD_HASH: makeHash('Legacy-Admin-Password-2026!'),
  };
  assert.equal(require('../api/admin-auth').configuredAccounts(env).length, 1, 'legacy environment Admin credentials are not accepted; Super Admin is the only bootstrap account');
  assert.equal(passwordMatches(superPassword, env.NOOKA_SUPERADMIN_PASSWORD_HASH), true);
  assert.equal(passwordMatches('wrong-password', env.NOOKA_SUPERADMIN_PASSWORD_HASH), false);
  assert.equal(passwordMatches(superPassword, 'plaintext-password'), false);

  const store = new FakeKV();
  store.exec([['HSET', 'nooka:admin:users', 'staff@nooka.test', JSON.stringify({ key: 'admin:test-staff', email: 'staff@nooka.test', name: 'ادمین پشتیبانی', passwordHash: makeHash(adminPassword), views: ['dashboard','requests'], active: true })]]);
  const handler = createHandler({
    kv: store,
    env,
    rateLimited: async () => false,
    originAllowed: req => req.headers.origin === `https://${req.headers.host}`,
  });

  let response = await invoke(handler, { method: 'GET' });
  assert.equal(response.status, 401, 'anonymous session lookup must be unauthorized');

  response = await invoke(handler, { method: 'POST', body: { action: 'login', email: 'staff@nooka.test', password: adminPassword } });
  assert.equal(response.status, 200, 'admin credentials should sign in');
  assert.equal(response.body.admin.role, 'Admin');
  assert.deepEqual(response.body.admin.views, ['dashboard', 'requests']);
  assert.match(response.headers['set-cookie'], /HttpOnly/);
  assert.match(response.headers['set-cookie'], /Secure/);
  assert.match(response.headers['set-cookie'], /SameSite=Strict/);
  assert.match(response.headers['set-cookie'], /Path=\//);
  const cookie = response.headers['set-cookie'].split(';')[0];

  response = await invoke(handler, { method: 'GET', cookie });
  assert.equal(response.status, 200, 'session cookie should restore the logged-in account');
  assert.equal(response.body.admin.email, 'staff@nooka.test');
  assert.equal(response.body.admin.key, 'admin:test-staff');

  response = await invoke(handler, { method: 'POST', body: { action: 'logout' }, cookie });
  assert.equal(response.status, 200);
  assert.match(response.headers['set-cookie'], /Max-Age=0/);
  response = await invoke(handler, { method: 'GET', cookie });
  assert.equal(response.status, 401, 'logged-out session must not be reusable');

  response = await invoke(handler, { method: 'POST', body: { action: 'login', email: 'owner@nooka.test', password: superPassword } });
  assert.equal(response.status, 200);
  assert.equal(response.body.admin.role, 'Super Admin');
  assert.equal(response.body.admin.views.includes('admins'), true);
  assert.equal(response.body.admin.views.includes('audit'), true);

  response = await invoke(handler, { method: 'POST', body: { action: 'login', email: 'owner@nooka.test', password: 'wrong-password-long' } });
  assert.equal(response.status, 401, 'wrong password must be rejected');

  response = await invoke(handler, { method: 'POST', body: { action: 'login', email: 'owner@nooka.test', password: superPassword }, origin: 'https://attacker.test' });
  assert.equal(response.status, 403, 'cross-origin login must be rejected');

  const unconfigured = createHandler({ kv: store, env: {}, rateLimited: async () => false, originAllowed: () => true });
  response = await invoke(unconfigured, { method: 'POST', body: { action: 'login', email: 'x@y.test', password: 'long-enough-password' } });
  assert.equal(response.status, 503, 'login must fail closed without a configured Super Admin');

  const noRemote = createHandler({ kv: { remote: false, exec: async () => null }, env, rateLimited: async () => false, originAllowed: () => true });
  response = await invoke(noRemote, { method: 'POST', body: { action: 'login', email: 'staff@nooka.test', password: adminPassword } });
  assert.equal(response.status, 503, 'login must fail closed without shared session storage');

  const rateStore = new FakeKV();
  rateStore.exec([['HSET', 'nooka:admin:users', 'staff@nooka.test', JSON.stringify({ key: 'admin:test-staff', email: 'staff@nooka.test', name: 'ادمین پشتیبانی', passwordHash: makeHash(adminPassword), views: ['dashboard','requests'], active: true })]]);
  const rateHandler = createHandler({ kv: rateStore, env, originAllowed: req => req.headers.origin === `https://${req.headers.host}`, ipHash: () => 'test-ip-hash' });
  for (let i = 0; i < 5; i++) {
    response = await invoke(rateHandler, { method: 'POST', body: { action: 'login', email: 'staff@nooka.test', password: adminPassword } });
    assert.equal(response.status, 200, 'first five login attempts should pass the configured per-minute threshold');
  }
  response = await invoke(rateHandler, { method: 'POST', body: { action: 'login', email: 'staff@nooka.test', password: adminPassword } });
  assert.equal(response.status, 429, 'sixth login attempt should be rate limited');

  console.log('✓ admin auth: hashed credentials, server-side roles, secure cookies, session restore/revoke, origin check, fail-closed storage, Redis rate limit');
})().catch(error => { console.error(error); process.exitCode = 1; });
