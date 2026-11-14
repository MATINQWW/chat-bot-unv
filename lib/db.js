'use strict';
// اتصال دیتابیس پنل ادمین (MySQL 8). جدا از MYSQL_URL است که KV قدیمی (lib/kv-mysql.js) از آن استفاده می‌کند:
// کاربر nooka_app عمداً اجازهٔ CREATE/ALTER ندارد، پس KV و پنل باید دو اتصال جدا باشند.
//   NOOKA_DB_URL=mysql://nooka_app:رمز@127.0.0.1:3306/nooka
let pool = null;

const enabled = () => !!process.env.NOOKA_DB_URL;

function getPool() {
  if (pool) return pool;
  const url = process.env.NOOKA_DB_URL;
  if (!url) throw Object.assign(new Error('NOOKA_DB_URL is not set'), { code: 'NO_DB' });
  const mysql = require('mysql2/promise');
  pool = mysql.createPool({
    uri: url,
    timezone: '+03:30',       // وقت تهران؛ باید با default-time-zone سرور یکی باشد (CALL sp_assert_time_zone())
    charset: 'utf8mb4',
    dateStrings: true,        // تاریخ‌ها رشتهٔ 'YYYY-MM-DD HH:mm:ss.SSS' (به وقت تهران) برمی‌گردند
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 100,
    connectTimeout: 5000,
  });
  return pool;
}

function setPool(p) { pool = p; }
async function closePool() { if (pool) { const p = pool; pool = null; await p.end().catch(() => {}); } }

// '2026-11-13 10:48:57.285' (تهران) → ISO با آفست؛ مرورگر هر منطقه‌ای که باشد درست نمایش می‌دهد
const tehranIso = (s) => (s ? String(s).replace(' ', 'T') + '+03:30' : null);

module.exports = { enabled, getPool, setPool, closePool, tehranIso };
