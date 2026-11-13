// Proxy address trust, allow-list parsing and fail-closed rate-limit tests.
const assert = require('node:assert/strict');
const common = require('../lib/common');

(async () => {
  const previous = {
    trust: process.env.TRUST_PROXY,
    vercel: process.env.VERCEL,
    origins: process.env.ALLOWED_ORIGINS,
    secret: process.env.CHAT_SIGNING_SECRET,
    failClosed: process.env.RATE_LIMIT_FAIL_CLOSED,
  };

  try {
    delete process.env.VERCEL;
    process.env.TRUST_PROXY = '1';

    assert.equal(common.ipOf({
      socket: { remoteAddress: '198.51.100.20' },
      headers: { 'x-forwarded-for': '203.0.113.9', 'x-real-ip': '203.0.113.9' },
    }), '198.51.100.20', 'forwarded headers from an untrusted peer must be ignored');

    assert.equal(common.ipOf({
      socket: { remoteAddress: '127.0.0.1' },
      headers: { 'x-forwarded-for': '203.0.113.9, 10.0.0.2' },
    }), '203.0.113.9', 'the first forwarded address is trusted only from loopback proxy');

    assert.equal(common.ipOf({
      socket: { remoteAddress: '::ffff:127.0.0.1' },
      headers: { 'x-real-ip': '198.51.100.7' },
    }), '198.51.100.7');

    process.env.VERCEL = '1';
    assert.equal(common.ipOf({
      socket: { remoteAddress: '10.0.0.1' },
      headers: { 'x-vercel-forwarded-for': '192.0.2.10, 10.0.0.1' },
    }), '192.0.2.10');

    process.env.ALLOWED_ORIGINS = 'https://app.example.test, https://mobile.example.test';
    delete require.cache[require.resolve('../config')];
    const allowed = common.originAllowed({ headers: { origin: 'https://app.example.test', host: 'api.example.test' } });
    assert.equal(allowed, true, 'comma-separated ALLOWED_ORIGINS must be applied');

    process.env.CHAT_SIGNING_SECRET = 'unit-test-signing-secret-0123456789';
    process.env.RATE_LIMIT_FAIL_CLOSED = '1';
    const rejected = await common.rateLimited({ headers: { host: 'localhost' }, socket: { remoteAddress: '127.0.0.1' } }, 'test', 99, 999);
    assert.equal(rejected, true, 'a production process without shared KV must reject rate-limited requests');

    console.log('✓ client-supplied forwarded headers are ignored without a trusted proxy');
    console.log('✓ local Nginx forwarded IP is accepted');
    console.log('✓ IPv4-mapped loopback is recognized');
    console.log('✓ Vercel platform IP header remains supported');
    console.log('✓ ALLOWED_ORIGINS comma-separated environment setting is applied');
    console.log('✓ rate limiting fails closed when shared storage is unavailable');
  } finally {
    if (previous.trust === undefined) delete process.env.TRUST_PROXY; else process.env.TRUST_PROXY = previous.trust;
    if (previous.vercel === undefined) delete process.env.VERCEL; else process.env.VERCEL = previous.vercel;
    if (previous.origins === undefined) delete process.env.ALLOWED_ORIGINS; else process.env.ALLOWED_ORIGINS = previous.origins;
    if (previous.secret === undefined) delete process.env.CHAT_SIGNING_SECRET; else process.env.CHAT_SIGNING_SECRET = previous.secret;
    if (previous.failClosed === undefined) delete process.env.RATE_LIMIT_FAIL_CLOSED; else process.env.RATE_LIMIT_FAIL_CLOSED = previous.failClosed;
  }
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
