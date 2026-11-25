'use strict';
// اتصال دیتابیس پنل و چت‌بات (MySQL 8 / TiDB Cloud / Aiven / Liara)
//   NOOKA_DB_URL=mysql://nooka_app:رمز@127.0.0.1:3306/nooka
//   NOOKA_DB_SSL=1  (برای MySQL ابری روی Vercel مثل TiDB Cloud یا Aiven)
let pool = null;

const enabled = () => !!process.env.NOOKA_DB_URL;

function getPool() {
  if (pool) return pool;
  const url = process.env.NOOKA_DB_URL;
  if (!url) throw Object.assign(new Error('NOOKA_DB_URL is not set'), { code: 'NO_DB' });
  const mysql = require('mysql2/promise');
  const isServerless = process.env.VERCEL === '1';
  const needSsl = process.env.NOOKA_DB_SSL === '1' || /[?&]ssl=/i.test(url);
  const opts = {
    uri: url,
    timezone: '+03:30',
    charset: 'utf8mb4',
    dateStrings: true,
    waitForConnections: true,
    connectionLimit: Number(process.env.NOOKA_DB_POOL_LIMIT) || (isServerless ? 2 : 10),
    queueLimit: 100,
    connectTimeout: 5000,
    enableKeepAlive: true,
    keepAliveInitialDelay: 10000,
  };
  if (needSsl) opts.ssl = { rejectUnauthorized: process.env.NOOKA_DB_SSL_REJECT_UNAUTH !== '0' };
  pool = mysql.createPool(opts);
  return pool;
}

function setPool(p) { pool = p; }
async function closePool() { if (pool) { const p = pool; pool = null; await p.end().catch(() => {}); } }

// '2026-11-13 10:48:57.285' (تهران) → ISO با آفست؛ مرورگر هر منطقه‌ای که باشد درست نمایش می‌دهد
const tehranIso = (s) => (s ? String(s).replace(' ', 'T') + '+03:30' : null);

module.exports = { enabled, getPool, setPool, closePool, tehranIso };
