// تست درایور MySQL (به سرور MySQL/MariaDB واقعی نیاز دارد؛ در npm test اجرا نمی‌شود)
//   TEST_MYSQL_URL=mysql://user:pass@127.0.0.1:3306/db npm run test:mysql
// همهٔ دستورها روی MemKV (مرجع، همان رفتار Redis) و MySQL اجرا و نتیجه‌ها مقایسه می‌شوند.
const assert = require('assert');
const { MemKV } = require('../lib/kv');
const { createMysqlKV } = require('../lib/kv-mysql');

const URL = process.env.TEST_MYSQL_URL;
if (!URL) { console.log('TEST_MYSQL_URL تنظیم نشده؛ تست MySQL رد شد.'); process.exit(0); }

(async () => {
  const db = createMysqlKV(URL);
  const mysql = require('mysql2/promise');
  const raw = await mysql.createConnection(URL);
  await db.exec([['GET', 'warmup']]); // ساخت جدول‌ها
  for (const t of ['kv_str', 'kv_member', 'kv_list', 'kv_meta']) await raw.query(`DELETE FROM ${t}`);

  const mem = new MemKV();
  const same = async (label, cmds) => {
    const want = cmds.map(c => { try { return mem.run(c); } catch (e) { return 'ERR'; } });
    const got = await db.exec(cmds);
    assert.ok(got, label + ': exec returned null');
    assert.deepStrictEqual(got.map(x => (typeof x === 'number' ? x : x)), want, label);
  };

  await same('string', [['GET', 'a'], ['SET', 'a', 'سلام'], ['GET', 'a'], ['SET', 'a', 'x', 'NX'], ['SET', 'b', 'y', 'NX'], ['EXISTS', 'a', 'b', 'c'], ['DEL', 'a', 'zz'], ['GET', 'a']]);
  await same('incr', [['INCR', 'n'], ['INCR', 'n'], ['INCR', 'n'], ['GET', 'n']]);
  await same('hash', [['HSET', 'h', 'f1', 'v1', 'f2', 'v2'], ['HSET', 'h', 'f1', 'v1b'], ['HGET', 'h', 'f1'], ['HLEN', 'h'],
    ['HINCRBY', 'h', 'c', 5], ['HINCRBY', 'h', 'c', -2], ['HDEL', 'h', 'f2', 'nope'], ['HLEN', 'h']]);
  const hg = await db.exec([['HGETALL', 'h']]), hm = mem.run(['HGETALL', 'h']);
  const toObj = f => { const o = {}; for (let i = 0; i < f.length; i += 2) o[f[i]] = f[i + 1]; return o; };
  assert.deepStrictEqual(toObj(hg[0]), toObj(hm)); // ترتیب فیلدها مهم نیست
  await same('set', [['SADD', 's', 'ip1', 'ip2'], ['SADD', 's', 'ip2', 'ip3'], ['SCARD', 's']]);
  await same('zset', [['ZINCRBY', 'z', 1, 'شهریه'], ['ZINCRBY', 'z', 3, 'وام'], ['ZINCRBY', 'z', 1, 'شهریه'], ['ZINCRBY', 'z', 5, 'پویش'],
    ['ZREVRANGE', 'z', 0, 1, 'WITHSCORES'], ['ZREVRANGE', 'z', 0, -1], ['ZREMRANGEBYRANK', 'z', 0, -3], ['ZREVRANGE', 'z', 0, -1, 'WITHSCORES']]);
  await same('list', [['LPUSH', 'l', 'a'], ['LPUSH', 'l', 'b'], ['LPUSH', 'l', 'c'], ['LRANGE', 'l', 0, -1], ['LTRIM', 'l', 0, 1], ['LRANGE', 'l', 0, 99], ['LLEN', 'l']]);
  console.log('✓ همهٔ دستورها با رفتار مرجع (Redis/MemKV) یکسان‌اند');

  // انقضا
  assert.deepStrictEqual(await db.exec([['SET', 'e', 'v', 'EX', 1], ['SADD', 'es', 'm'], ['EXPIRE', 'es', 1], ['EXPIRE', 'missing', 5]]), ['OK', 1, 1, 0]);
  await new Promise(r => setTimeout(r, 1200));
  assert.deepStrictEqual(await db.exec([['GET', 'e'], ['SCARD', 'es'], ['EXISTS', 'e', 'es']]), [null, 0, 0]);
  await db.exec([['SET', 'p', '1', 'EX', 100], ['SET', 'p', '2']]);
  const [[meta]] = await raw.query("SELECT COUNT(*) n FROM kv_meta WHERE k='p'");
  assert.strictEqual(meta.n, 0, 'SET بدون EX باید TTL را پاک کند');
  console.log('✓ انقضا (EX، EXPIRE، پاک‌شدن TTL با SET)');

  // هم‌زمانی: ۵۰ INCR موازی از ۵۰ درخواست
  await Promise.all(Array.from({ length: 50 }, () => db.exec([['INCR', 'cnt']])));
  assert.strictEqual(+(await db.exec([['GET', 'cnt']]))[0], 50);
  console.log('✓ ۵۰ INCR هم‌زمان → ۵۰ (بدون گم‌شدن شمارش)');

  // کلید/عضو بلند و فارسی
  const longQ = 'سؤال '.repeat(80);
  assert.deepStrictEqual(await db.exec([['ZINCRBY', 'asked', 1, longQ], ['ZREVRANGE', 'asked', 0, 0]]), ['1', [longQ.slice(0, 191)]]);
  console.log('✓ متن فارسی و عضو بلندتر از ۱۹۱ نویسه (بریده می‌شود، خطا نمی‌دهد)');

  // خطای اتصال → null (بات از کار نمی‌افتد)
  const bad = createMysqlKV('mysql://nobody:wrong@127.0.0.1:1/none');
  assert.strictEqual(await bad.exec([['GET', 'x']]), null);
  await bad.end().catch(() => {});
  console.log('✓ اتصال ناموفق → null، بدون crash');

  // جریان کامل بات روی MySQL: یادگیری پس از ۲ پرسندهٔ مستقل، rate-limit، درخواست تماس، پنل مدیر
  await raw.end(); await db.end();
  process.env.MYSQL_URL = URL;
  delete process.env.KV_REST_API_URL; delete process.env.UPSTASH_REDIS_REST_URL;
  const http = require('http');
  const llmSrv = http.createServer((q, s) => { let b = ''; q.on('data', c => b += c); q.on('end', () => {
    s.setHeader('content-type', 'application/json');
    s.end(JSON.stringify({ choices: [{ message: { content: 'ترمیم معدل در خرداد هر سال انجام می‌شود؛ برای جزئیات با ۰۳۱-۳۵۳۵۴۰۴۹ تماس بگیرید.' }, finish_reason: 'stop' }] }));
  }); });
  await new Promise(r => llmSrv.listen(0, r));
  process.chdir(require('path').join(__dirname, '..'));
  process.env.T_KEY = 'k'.repeat(20); process.env.CHAT_SIGNING_SECRET = 's'.repeat(32); process.env.ADMIN_TOKEN = 'a'.repeat(20);
  require('../lib/llm')._setConfig({ use: 't', providers: { t: { url: `http://127.0.0.1:${llmSrv.address().port}/v1`, model: 'm', key: 'T_KEY' } } });
  const { kv } = require('../lib/common');
  assert.strictEqual(kv.driver, 'mysql');
  const chat = require('../api/chat.js'), lead = require('../api/lead.js'), admin = require('../api/admin.js');
  const call = (h, { body, headers = {}, method = 'POST', ip }) => new Promise(resolve => {
    const res = { code: 200, setHeader() {}, status(c) { this.code = c; return this; }, json(o) { resolve({ code: this.code, json: o }); }, end() { resolve({ code: this.code }); }, write() {} };
    h({ method, body, headers: { host: 'x', 'content-length': '100', 'x-real-ip': ip || '10.1.1.1', ...headers }, socket: {} }, res);
  });
  const Q = 'ترمیم معدل در کدام ماه انجام میشه';
  let r = await call(chat, { body: { messages: [{ role: 'user', content: Q }] }, ip: '10.9.0.1' });
  assert.ok(!r.json.cached);
  r = await call(chat, { body: { messages: [{ role: 'user', content: Q }] }, ip: '10.9.0.2' });
  r = await call(chat, { body: { messages: [{ role: 'user', content: Q }] }, ip: '10.9.0.3' });
  assert.strictEqual(r.json.cached, 'tokens', 'پس از ۲ پرسندهٔ مستقل، سؤال سوم باید از حافظه بیاید');
  let limited = 0;
  for (let i = 0; i < 10; i++) { const x = await call(chat, { body: { messages: [{ role: 'user', content: 'سؤال شمارهٔ ' + i + ' دربارهٔ رشته عمران' }] }, ip: '10.9.9.9' }); if (x.code === 429) limited++; }
  assert.ok(limited >= 2, 'rate-limit مشترک (۸ در دقیقه) باید اعمال شود: ' + limited);
  r = await call(lead, { body: { phone: '09121112233', consent: true, major: 'عمران' }, ip: '10.9.0.7' });
  assert.strictEqual(r.code, 200, JSON.stringify(r.json));
  r = await call(admin, { method: 'GET', headers: { authorization: 'Bearer ' + 'a'.repeat(20) } });
  assert.strictEqual(r.json.leads[0].phone, '09121112233');
  assert.ok(r.json.stats && +r.json.stats.hit >= 1 && r.json.entries.length >= 1);
  console.log('✓ جریان کامل بات روی MySQL: یادگیری، rate-limit مشترک، درخواست تماس، پنل مدیر');

  llmSrv.close(); await kv.end();
  console.log('\nتست‌های MySQL گذشت.'); process.exit(0);
})().catch(e => { console.error('✗ FAIL', e); process.exit(1); });
