'use strict';
const assert = require('node:assert');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const { MemKV } = require('../lib/kv');
const { ipOf, validSig, sign } = require('../lib/common');
const adminAuth = require('../api/admin-auth');

(async () => {
  // 1. MemKV HSETNX + negative-index ZREMRANGEBYRANK data-loss regression
  const kv = new MemKV();
  assert.strictEqual(kv.run(['HSETNX', 'h1', 'a', '1']), 1, 'HSETNX inserts new field');
  assert.strictEqual(kv.run(['HSETNX', 'h1', 'a', '2']), 0, 'HSETNX rejects existing field');
  assert.strictEqual(kv.run(['HGET', 'h1', 'a']), '1', 'HSETNX preserves original value');

  for (let i = 1; i <= 499; i++) kv.run(['ZINCRBY', 'z1', '1', 'm' + i]);
  const removed = kv.run(['ZREMRANGEBYRANK', 'z1', '0', '-501']);
  assert.strictEqual(removed, 0, 'ZREMRANGEBYRANK 0 -501 on 499 items must remove 0 items');
  assert.strictEqual(kv.run(['ZREVRANGE', 'z1', '0', '-1']).length, 499, 'all 499 items preserved');

  kv.run(['ZINCRBY', 'z1', '1', 'm500']);
  kv.run(['ZINCRBY', 'z1', '1', 'm501']);
  assert.strictEqual(kv.run(['ZREMRANGEBYRANK', 'z1', '0', '-501']), 1, 'ZREMRANGEBYRANK trims only overflow');

  // 2. Proxy IP spoofing regression (prefer X-Real-IP or rightmost X-Forwarded-For)
  const prevTrust = process.env.TRUST_PROXY;
  process.env.TRUST_PROXY = '1';
  const reqXff = {
    socket: { remoteAddress: '127.0.0.1' },
    headers: { 'x-forwarded-for': '1.2.3.4, 203.0.113.9' },
  };
  assert.strictEqual(ipOf(reqXff), '203.0.113.9', 'ipOf uses rightmost X-Forwarded-For hop');
  const reqReal = {
    socket: { remoteAddress: '127.0.0.1' },
    headers: { 'x-forwarded-for': '1.2.3.4', 'x-real-ip': '198.51.100.7' },
  };
  assert.strictEqual(ipOf(reqReal), '198.51.100.7', 'ipOf prefers X-Real-IP');
  if (prevTrust === undefined) delete process.env.TRUST_PROXY; else process.env.TRUST_PROXY = prevTrust;

  // 3. validSig case-insensitive hex
  const prevSec = process.env.CHAT_SIGNING_SECRET;
  process.env.CHAT_SIGNING_SECRET = '0123456789abcdef0123456789abcdef';
  const sig = sign('hello');
  assert.strictEqual(validSig('hello', sig.toUpperCase()), true, 'validSig accepts uppercase hex');
  if (prevSec === undefined) delete process.env.CHAT_SIGNING_SECRET; else process.env.CHAT_SIGNING_SECRET = prevSec;

  // 4. admin-auth sessionVersion preserved in allAccounts
  const salt = '00'.repeat(16);
  const hash = 'scrypt$' + salt + '$' + crypto.scryptSync('SuperSecretPass123!', Buffer.from(salt, 'hex'), 64).toString('hex');
  const mockStore = {
    remote: true,
    async exec(cmds) {
      return cmds.map(([op]) => op === 'HGETALL' ? ['a@ex.com', JSON.stringify({
        key: 'adm1', email: 'a@ex.com', name: 'Test', passwordHash: hash, views: ['dashboard'], active: true, sessionVersion: 3,
      })] : null);
    },
  };
  const accounts = await adminAuth.allAccounts(mockStore, {});
  assert.strictEqual(accounts[0].sessionVersion, 3, 'allAccounts preserves sessionVersion');

  // 5. vercel.json blocks db/*
  const vcfg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'vercel.json'), 'utf8'));
  const blockRe = new RegExp('^' + vcfg.redirects[0].source + '$');
  assert.strictEqual(blockRe.test('/db/01_schema.sql'), true, 'vercel.json blocks /db/*');

  // 6. admin/app.js modal backdrop click fix
  const adminJs = fs.readFileSync(path.join(__dirname, '..', 'admin', 'app.js'), 'utf8');
  assert.ok(adminJs.includes("e.target.matches('.modal-backdrop[data-close-modal]')"), 'modal backdrop only closes on exact target');

  console.log('✓ regressions.js: all 6 regression groups passed');
})().catch(e => { console.error(e); process.exit(1); });
