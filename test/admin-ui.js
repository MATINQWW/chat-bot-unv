'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const handler = require('../api/admin-ui');
const retiredPreviewHandler = require('../api/admin-preview');
const assets = require('../lib/admin-panel/assets');

for (const name of ['html', 'css', 'js']) {
  const file = name === 'html' ? 'index.html' : name === 'css' ? 'style.css' : 'app.js';
  assert.equal(assets[name], fs.readFileSync(path.join(__dirname, '..', 'lib', 'admin-panel', file), 'utf8'));
}

function invoke({ method = 'GET', url = '/' } = {}) {
  const headers = {};
  const res = {
    statusCode: 200,
    body: undefined,
    setHeader(k, v) { headers[k.toLowerCase()] = v; return this; },
    status(code) { this.statusCode = code; return this; },
    end(body) { this.body = body; return this; },
  };
  handler({ method, url }, res);
  return { status: res.statusCode, body: res.body, headers };
}

let r = invoke({ url: '/admin' });
assert.equal(r.status, 200, 'admin login page must be available on main and preview deployments');
assert.match(r.headers['content-type'], /text\/html/);
assert.match(r.body, /id="loginForm"/);
assert.match(r.body, /ورود امن و نقش‌محور/);
assert.doesNotMatch(r.body, /data-demo-account/);
assert.doesNotMatch(r.body, /data-demo-account/);

r = invoke({ url: '/admin?asset=css' });
assert.equal(r.status, 200);
assert.match(r.headers['content-type'], /text\/css/);

r = invoke({ url: '/admin?asset=js' });
assert.equal(r.status, 200);
assert.match(r.headers['content-type'], /javascript/);
assert.match(r.body, /fetch\('\/api\/admin-auth'/);
assert.doesNotMatch(r.body, /owner@nooka\.demo|nooka-preview-super|data-demo-account/);

assert.equal(invoke({ method: 'POST' }).status, 405);
assert.equal(invoke({ url: '/admin?asset=unknown' }).status, 404);
const retiredRes = { statusCode: 200, setHeader() { return this; }, status(code) { this.statusCode = code; return this; }, end() { return this; } };
retiredPreviewHandler({ method: 'GET' }, retiredRes);
assert.equal(retiredRes.statusCode, 404, 'legacy demo endpoint must stay disabled');
console.log('✓ admin UI: production-safe login page, assets, server auth integration, no client-side demo accounts, legacy demo endpoint retired');
