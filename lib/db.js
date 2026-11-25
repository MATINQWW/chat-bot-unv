'use strict';
// اتصال دیتابیس پنل و چت‌بات (MySQL 8 / Aiven / TiDB Cloud / Liara)
//   NOOKA_DB_URL=mysql://nooka_app:رمز@127.0.0.1:3306/nooka
//   NOOKA_DB_SSL=1  (برای MySQL ابری روی Vercel؛ به‌طور خودکار برای Aiven هم فعال می‌شود)
let pool = null;

const enabled = () => !!process.env.NOOKA_DB_URL;

function parseDbConfig(rawUrl) {
  let cleanUri = String(rawUrl || '').trim();
  let hadSslParam = false;
  let host = '';
  let database = '';
  try {
    const u = new URL(cleanUri);
    host = u.hostname || '';
    database = (u.pathname || '').replace(/^\/+/, '');
    if (u.searchParams.has('ssl-mode') || u.searchParams.has('sslmode') || u.searchParams.has('ssl')) {
      hadSslParam = true;
      u.searchParams.delete('ssl-mode');
      u.searchParams.delete('sslmode');
      cleanUri = u.toString();
    }
  } catch { /* keep raw */ }
  const isCloud = /aivencloud\.com|tidbcloud\.com|planetscale|railway|psdb\.cloud/i.test(host);
  const needSsl = process.env.NOOKA_DB_SSL === '1' || hadSslParam || isCloud;
  const rejectUnauth = process.env.NOOKA_DB_SSL_REJECT_UNAUTH === '1'
    ? true
    : (process.env.NOOKA_DB_SSL_REJECT_UNAUTH === '0' || isCloud ? false : true);
  return { cleanUri, host, database, needSsl, rejectUnauth };
}

function getPool() {
  if (pool) return pool;
  const url = process.env.NOOKA_DB_URL;
  if (!url) throw Object.assign(new Error('NOOKA_DB_URL is not set'), { code: 'NO_DB' });
  const mysql = require('mysql2/promise');
  const isServerless = process.env.VERCEL === '1';
  const cfg = parseDbConfig(url);
  const opts = {
    uri: cfg.cleanUri,
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
  if (cfg.needSsl) opts.ssl = { rejectUnauthorized: cfg.rejectUnauth };
  pool = mysql.createPool(opts);
  return pool;
}

async function ping() {
  if (!enabled()) return { configured: false, ok: false, status: 'not_configured' };
  const t0 = Date.now();
  try {
    const [[row]] = await getPool().query('SELECT DATABASE() AS db, VERSION() AS ver');
    return {
      configured: true,
      ok: true,
      status: 'connected',
      latencyMs: Date.now() - t0,
      database: (row && row.db) || '',
      version: (row && row.ver) || '',
    };
  } catch (e) {
    return {
      configured: true,
      ok: false,
      status: 'error',
      latencyMs: Date.now() - t0,
      error: (e && (e.code || e.message)) || 'connection_failed',
    };
  }
}

function setPool(p) { pool = p; }
async function closePool() { if (pool) { const p = pool; pool = null; await p.end().catch(() => {}); } }

// '2026-11-13 10:48:57.285' (تهران) → ISO با آفست
const tehranIso = (s) => (s ? String(s).replace(' ', 'T') + '+03:30' : null);

module.exports = { enabled, getPool, setPool, closePool, tehranIso, ping, parseDbConfig };
