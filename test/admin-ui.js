'use strict';
// رابط پنل مدیریت اکنون فایل استاتیک در admin/ است (دیگر تابع Serverless نیست).
// این تست از مسیر server.js آن را بررسی می‌کند؛ ورود و نقش‌ها در test/admin-auth.js تست می‌شوند.
const assert = require('node:assert/strict');
const server = require('../server');

(async () => {
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const get = (p, method = 'GET') => fetch(base + p, { method, headers: { Connection: 'close' }, redirect: 'manual' });

  try {
    let r = await get('/admin');
    assert.equal(r.status, 302, '/admin must redirect to /admin/ so relative asset paths resolve');
    assert.equal(r.headers.get('location'), '/admin/');
    r = await get('/admin/');
    assert.equal(r.status, 200, 'admin login page must be available');
    assert.match(r.headers.get('content-type'), /text\/html/);
    assert.match(r.headers.get('cache-control'), /no-store/);
    assert.match(r.headers.get('x-robots-tag'), /noindex/);
    const html = await r.text();
    assert.match(html, /id="loginForm"/);
    assert.match(html, /ورود امن و نقش‌محور/);
    assert.doesNotMatch(html, /data-demo-account/);

    r = await get('/admin/style.css');
    assert.equal(r.status, 200);
    assert.match(r.headers.get('content-type'), /text\/css/);

    r = await get('/admin/app.js');
    assert.equal(r.status, 200);
    assert.match(r.headers.get('content-type'), /javascript/);
    const js = await r.text();
    assert.match(js, /fetch\('\/api\/admin-auth'/);
    assert.doesNotMatch(js, /owner@nooka\.demo|nooka-preview-super|data-demo-account/);

    assert.equal((await get('/admin', 'POST')).status, 405);
    assert.equal((await get('/admin/unknown.js')).status, 404);
    // نقاط پایانی قدیمی دیگر وجود ندارند
    for (const gone of ['/api/admin-ui', '/api/admin-preview']) assert.equal((await get(gone)).status, 404, gone);

    console.log('✓ admin UI: صفحهٔ استاتیک /admin، هدرهای no-store، اتصال به /api/admin-auth، بدون حساب نمایشی، نقاط پایانی قدیمی حذف‌شده');
  } finally {
    await new Promise(resolve => server.close(resolve));
    if (typeof server.closeAllConnections === 'function') server.closeAllConnections();
  }
})().catch(e => { console.error(e); process.exit(1); });
