'use strict';
const assert = require('node:assert/strict');
const handler = require('../api/admin-preview');

function invoke({ env = {}, url = '/', method = 'GET' } = {}) {
  const keys = ['VERCEL_ENV', 'ADMIN_PREVIEW_ENABLED'];
  const previous = Object.fromEntries(keys.map(k => [k, process.env[k]]));
  for (const k of keys) delete process.env[k];
  Object.assign(process.env, env);
  const headers = {};
  const res = {
    statusCode: 200,
    body: undefined,
    setHeader(k, v) { headers[k.toLowerCase()] = v; return this; },
    status(code) { this.statusCode = code; return this; },
    end(body) { this.body = body; return this; },
  };
  try { handler({ method, url }, res); }
  finally {
    for (const k of keys) {
      if (previous[k] === undefined) delete process.env[k];
      else process.env[k] = previous[k];
    }
  }
  return { status: res.statusCode, body: res.body, headers };
}

const prod = invoke({ env: { VERCEL_ENV: 'production', ADMIN_PREVIEW_ENABLED: '1' } });
assert.equal(prod.status, 404, 'preview route must be hidden on production');
const disabled = invoke({ env: { VERCEL_ENV: 'preview' } });
assert.equal(disabled.status, 404, 'preview route must be opt-in');
const html = invoke({ env: { VERCEL_ENV: 'preview', ADMIN_PREVIEW_ENABLED: '1' } });
assert.equal(html.status, 200);
assert.match(html.headers['content-type'], /text\/html/);
assert.match(html.body, /نسخه نمایشی/);
assert.match(html.body, /\/api\/admin-preview\?asset=js/);
assert.equal(html.headers['cache-control'], 'private, no-store, max-age=0');
const css = invoke({ env: { VERCEL_ENV: 'preview', ADMIN_PREVIEW_ENABLED: '1' }, url: '/?asset=css' });
assert.equal(css.status, 200);
assert.match(css.headers['content-type'], /text\/css/);
assert.match(css.body, /\.app-shell/);
const js = invoke({ env: { VERCEL_ENV: 'preview', ADMIN_PREVIEW_ENABLED: '1' }, url: '/?asset=js' });
assert.equal(js.status, 200);
assert.match(js.headers['content-type'], /javascript/);
assert.match(js.body, /temporaryKnowledge/);
assert.equal(invoke({ env: { VERCEL_ENV: 'preview', ADMIN_PREVIEW_ENABLED: '1' }, url: '/?asset=other' }).status, 404);
assert.equal(invoke({ env: { VERCEL_ENV: 'preview', ADMIN_PREVIEW_ENABLED: '1' }, method: 'POST' }).status, 405);
console.log('✓ admin preview gating, assets, cache and method checks passed');
