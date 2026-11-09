// ═══════════════════════════════════════════════════════════
// KV روی MySQL / MariaDB — برای هاست cPanel یا VPS (روی Vercel استفاده نکنید؛ README را ببینید)
//
// همان رابط lib/kv.js: exec([[ 'CMD', ...args ], ...]) → آرایهٔ نتایج، یا null در صورت خطا.
// فقط دستورهایی که پروژه استفاده می‌کند پیاده شده‌اند (رشته، هش، مجموعه، مجموعهٔ مرتب، لیست، انقضا).
// جدول‌ها خودکار ساخته می‌شوند. سازگار با MySQL 5.7.7+ / 8 و MariaDB 10.2+.
//
// اتصال: متغیر MYSQL_URL (رمز دارد، پس در Environment Variables نه در config.js)، مثلاً:
//   mysql://cpaneluser_bot:PASSWORD@localhost:3306/cpaneluser_chatbot
// ═══════════════════════════════════════════════════════════
const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS kv_meta (
     k VARCHAR(191) NOT NULL PRIMARY KEY, exp BIGINT NULL, KEY (exp)
   ) ENGINE=InnoDB ROW_FORMAT=DYNAMIC DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin`,
  `CREATE TABLE IF NOT EXISTS kv_str (
     k VARCHAR(191) NOT NULL PRIMARY KEY, v MEDIUMTEXT NOT NULL
   ) ENGINE=InnoDB ROW_FORMAT=DYNAMIC DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin`,
  // هش (m=فیلد، v=مقدار) · مجموعه (m=عضو) · مجموعهٔ مرتب (m=عضو، score)
  `CREATE TABLE IF NOT EXISTS kv_member (
     k VARCHAR(191) NOT NULL, m VARCHAR(191) NOT NULL, v MEDIUMTEXT NULL, score DOUBLE NOT NULL DEFAULT 0,
     PRIMARY KEY (k, m), KEY ks (k, score)
   ) ENGINE=InnoDB ROW_FORMAT=DYNAMIC DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin`,
  `CREATE TABLE IF NOT EXISTS kv_list (
     id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY, k VARCHAR(191) NOT NULL, v MEDIUMTEXT NOT NULL, KEY (k, id)
   ) ENGINE=InnoDB ROW_FORMAT=DYNAMIC DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin`,
];
const TABLES = ['kv_str', 'kv_member', 'kv_list', 'kv_meta'];
const MAXLEN = 191;
const cut = (s) => String(s).slice(0, MAXLEN);

function createMysqlKV(url, opts = {}) {
  const mysql = require('mysql2/promise');
  const pool = mysql.createPool({
    uri: url, waitForConnections: true, connectionLimit: opts.connectionLimit || ((require('../config').mysql || {}).connectionLimit) || 5,
    queueLimit: 200, connectTimeout: 5000, charset: 'utf8mb4', enableKeepAlive: true,
  });
  let ready = null;
  const init = () => ready || (ready = (async () => { for (const q of SCHEMA) await pool.query(q); })()
    .catch(e => { ready = null; throw e; }));

  async function run(c, cmd) {
    const [op, ...a] = cmd.map(String);
    const now = Date.now();
    const q = async (sql, p) => (await c.query(sql, p))[0];
    const purge = async (k) => { for (const t of TABLES) await q(`DELETE FROM ${t} WHERE k=?`, [k]); };
    // انقضای تنبل: قبل از هر دسترسی، کلید منقضی پاک می‌شود
    const live = async (k) => {
      const r = await q('SELECT exp FROM kv_meta WHERE k=?', [k]);
      if (r.length && r[0].exp !== null && Number(r[0].exp) <= now) { await purge(k); }
    };
    const exists = async (k) => {
      await live(k);
      for (const t of ['kv_str', 'kv_member', 'kv_list']) if ((await q(`SELECT 1 FROM ${t} WHERE k=? LIMIT 1`, [k])).length) return true;
      return false;
    };
    const rank = (len, i) => (i < 0 ? len + i : i);
    const k = a[0] !== undefined ? cut(a[0]) : '';

    switch (op.toUpperCase()) {
      case 'GET': { await live(k); const r = await q('SELECT v FROM kv_str WHERE k=?', [k]); return r.length ? r[0].v : null; }
      case 'SET': {
        const v = a[1]; let ex = 0, nx = false;
        for (let i = 2; i < a.length; i++) { const u = a[i].toUpperCase(); if (u === 'EX') ex = +a[++i]; else if (u === 'NX') nx = true; }
        await live(k);
        if (nx) { const r = await q('INSERT IGNORE INTO kv_str (k, v) VALUES (?, ?)', [k, v]); if (!r.affectedRows) return null; }
        else await q('INSERT INTO kv_str (k, v) VALUES (?, ?) ON DUPLICATE KEY UPDATE v=VALUES(v)', [k, v]);
        if (ex) await q('INSERT INTO kv_meta (k, exp) VALUES (?, ?) ON DUPLICATE KEY UPDATE exp=VALUES(exp)', [k, now + ex * 1000]);
        else await q('DELETE FROM kv_meta WHERE k=?', [k]); // مثل Redis: SET بدون EX، TTL را پاک می‌کند
        return 'OK';
      }
      case 'DEL': { let n = 0; for (const x of a.map(cut)) { if (await exists(x)) n++; await purge(x); } return n; }
      case 'EXISTS': { let n = 0; for (const x of a.map(cut)) if (await exists(x)) n++; return n; }
      case 'EXPIRE': {
        if (!(await exists(k))) return 0;
        await q('INSERT INTO kv_meta (k, exp) VALUES (?, ?) ON DUPLICATE KEY UPDATE exp=VALUES(exp)', [k, now + (+a[1]) * 1000]);
        return 1;
      }
      case 'INCR': {
        await live(k);
        await q("INSERT INTO kv_str (k, v) VALUES (?, '1') ON DUPLICATE KEY UPDATE v=CAST(CAST(v AS SIGNED) + 1 AS CHAR)", [k]);
        return +(await q('SELECT v FROM kv_str WHERE k=?', [k]))[0].v;
      }
      case 'HSET': {
        await live(k); let n = 0;
        for (let i = 1; i < a.length; i += 2) {
          const r = await q('INSERT INTO kv_member (k, m, v) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE v=VALUES(v)', [k, cut(a[i]), a[i + 1]]);
          if (r.affectedRows === 1) n++;
        }
        return n;
      }
      case 'HGET': { await live(k); const r = await q('SELECT v FROM kv_member WHERE k=? AND m=?', [k, cut(a[1])]); return r.length ? r[0].v : null; }
      case 'HGETALL': { await live(k); return [].concat(...(await q('SELECT m, v FROM kv_member WHERE k=?', [k])).map(r => [r.m, r.v])); }
      case 'HDEL': { await live(k); let n = 0; for (const f of a.slice(1)) n += (await q('DELETE FROM kv_member WHERE k=? AND m=?', [k, cut(f)])).affectedRows; return n; }
      case 'HLEN': { await live(k); return +(await q('SELECT COUNT(*) n FROM kv_member WHERE k=?', [k]))[0].n; }
      case 'HINCRBY': {
        await live(k); const by = parseInt(a[2], 10) || 0;
        await q('INSERT INTO kv_member (k, m, v) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE v=CAST(CAST(COALESCE(v, 0) AS SIGNED) + ? AS CHAR)', [k, cut(a[1]), String(by), by]);
        return +(await q('SELECT v FROM kv_member WHERE k=? AND m=?', [k, cut(a[1])]))[0].v;
      }
      case 'SADD': { await live(k); let n = 0; for (const m of a.slice(1)) n += (await q('INSERT IGNORE INTO kv_member (k, m) VALUES (?, ?)', [k, cut(m)])).affectedRows; return n; }
      case 'SCARD': { await live(k); return +(await q('SELECT COUNT(*) n FROM kv_member WHERE k=?', [k]))[0].n; }
      case 'ZINCRBY': {
        await live(k); const by = parseFloat(a[1]) || 0, m = cut(a[2]);
        await q('INSERT INTO kv_member (k, m, score) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE score=score + ?', [k, m, by, by]);
        return String((await q('SELECT score FROM kv_member WHERE k=? AND m=?', [k, m]))[0].score);
      }
      case 'ZREVRANGE': {
        await live(k);
        const all = await q('SELECT m, score FROM kv_member WHERE k=? ORDER BY score DESC, m ASC', [k]);
        const sl = all.slice(rank(all.length, +a[1]), rank(all.length, +a[2]) + 1);
        return a[3] && a[3].toUpperCase() === 'WITHSCORES' ? [].concat(...sl.map(r => [r.m, String(r.score)])) : sl.map(r => r.m);
      }
      case 'ZREMRANGEBYRANK': {
        await live(k);
        const all = await q('SELECT m FROM kv_member WHERE k=? ORDER BY score ASC, m DESC', [k]);
        const rm = all.slice(rank(all.length, +a[1]), rank(all.length, +a[2]) + 1).map(r => r.m);
        for (let i = 0; i < rm.length; i += 200) await q('DELETE FROM kv_member WHERE k=? AND m IN (?)', [k, rm.slice(i, i + 200)]);
        return rm.length;
      }
      case 'LPUSH': {
        await live(k);
        for (const v of a.slice(1)) await q('INSERT INTO kv_list (k, v) VALUES (?, ?)', [k, v]);
        return +(await q('SELECT COUNT(*) n FROM kv_list WHERE k=?', [k]))[0].n;
      }
      case 'LRANGE': case 'LTRIM': {
        await live(k);
        const all = await q('SELECT id, v FROM kv_list WHERE k=? ORDER BY id DESC', [k]); // جدیدترین اول، مثل LPUSH
        const s = rank(all.length, +a[1]), t = rank(all.length, +a[2]);
        const keep = all.slice(Math.max(0, s), t + 1);
        if (op.toUpperCase() === 'LRANGE') return keep.map(r => r.v);
        const keepIds = new Set(keep.map(r => r.id));
        const drop = all.filter(r => !keepIds.has(r.id)).map(r => r.id);
        for (let i = 0; i < drop.length; i += 500) await q('DELETE FROM kv_list WHERE id IN (?)', [drop.slice(i, i + 500)]);
        return 'OK';
      }
      case 'LLEN': { await live(k); return +(await q('SELECT COUNT(*) n FROM kv_list WHERE k=?', [k]))[0].n; }
      default: throw new Error('unsupported command ' + op);
    }
  }

  // گاهی کلیدهای منقضی‌شده را یک‌جا پاک کن تا جدول‌ها بزرگ نشوند
  async function sweep(c) {
    const r = (await c.query('SELECT k FROM kv_meta WHERE exp IS NOT NULL AND exp <= ? LIMIT 500', [Date.now()]))[0];
    if (!r.length) return;
    const keys = r.map(x => x.k);
    for (const t of TABLES) await c.query(`DELETE FROM ${t} WHERE k IN (?)`, [keys]);
  }

  return {
    remote: true,     // ماندگار و مشترک بین پروسه‌ها
    driver: 'mysql',
    async exec(cmds) {
      let c;
      try {
        await init();
        c = await pool.getConnection();
        const out = [];
        for (const cmd of cmds) out.push(await run(c, cmd));
        if (Math.random() < 0.01) await sweep(c).catch(() => {});
        return out;
      } catch (e) {
        console.warn('mysql kv failed', e && (e.code || e.message));
        return null;
      } finally { if (c) c.release(); }
    },
    end: () => pool.end(),
  };
}

module.exports = { createMysqlKV, SCHEMA };
