'use strict';
const fs = require('node:fs');
const path = require('node:path');
const mysql = require('mysql2/promise');
const { parseDbConfig } = require('../lib/db');

function splitSql(sql) {
  const stmts = [];
  let delim = ';', buf = '';
  for (const rawLine of sql.replace(/\r\n/g, '\n').split('\n')) {
    const line = rawLine.trim();
    if (!line || line.startsWith('--')) continue;
    const m = /^DELIMITER\s+(\S+)$/i.exec(line);
    if (m) { delim = m[1]; continue; }
    buf += rawLine + '\n';
    if (buf.trimEnd().endsWith(delim)) {
      const stmt = buf.trimEnd().slice(0, -delim.length).trim();
      if (stmt) stmts.push(stmt);
      buf = '';
    }
  }
  if (buf.trim()) stmts.push(buf.trim());
  return stmts;
}

(async () => {
  const url = process.env.NOOKA_DB_URL;
  if (!url) throw new Error('NOOKA_DB_URL تنظیم نشده است');
  const cfg = parseDbConfig(url);
  const connOpts = { uri: cfg.cleanUri, charset: 'utf8mb4' };
  if (cfg.needSsl) connOpts.ssl = { rejectUnauthorized: cfg.rejectUnauth };
  const conn = await mysql.createConnection(connOpts);
  const files = process.argv.slice(2);
  const list = files.length ? files : ['01_schema_serverless.sql', '03_chatbot_full_schema_serverless.sql', '04_add_cached_tokens.sql'];
  try {
    for (const file of list) {
      const full = path.join(__dirname, file);
      if (!fs.existsSync(full)) continue;
      const stmts = splitSql(fs.readFileSync(full, 'utf8'));
      console.log(`▶ اجرای ${file} (${stmts.length} دستور)...`);
      for (const s of stmts) await conn.query(s);
      console.log(`✓ ${file} با موفقیت اجرا شد.`);
    }
  } finally {
    await conn.end();
  }
})().catch((e) => {
  console.error('✗ خطا:', e.sqlMessage || e.message);
  process.exit(1);
});
