#!/usr/bin/env node
// ساخت ادمین در دیتابیس (اولین مدیر کل یا هر ادمین دیگر) با رمز Argon2id
//
//   npm i argon2            (mysql2 از قبل در پروژه هست)
//   MYSQL_URL='mysql://nooka_app:رمز@127.0.0.1:3306/nooka' \
//     node db/create-admin.js --username owner --email owner@example.com --role super_admin [--generate] [--name 'نام']
//
// رمز را از ترمینال (بدون نمایش) می‌پرسد؛ یا برای اتوماسیون: NOOKA_NEW_ADMIN_PASSWORD
// یا با --generate یک رمز موقت تصادفی می‌سازد و فقط همین یک بار چاپ می‌کند.
// رمز خام ذخیره نمی‌شود (فقط هش Argon2id). حساب با must_change_password=1 ساخته می‌شود.
const readline = require('node:readline');
const crypto = require('node:crypto');
const argon2 = require('argon2');
const mysql = require('mysql2/promise');

function arg(name, def) {
  const i = process.argv.indexOf('--' + name);
  return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : def;
}

function askHidden(prompt) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    rl._writeToOutput = (s) => { if (s.includes(prompt)) rl.output.write(s); };
    rl.question(prompt, (v) => { rl.output.write('\n'); rl.close(); resolve(v); });
  });
}

(async () => {
  const username = String(arg('username', '')).trim().toLowerCase();
  const email = String(arg('email', '')).trim().toLowerCase();
  const role = arg('role', 'super_admin');
  const name = arg('name', null);
  if (!/^[a-z0-9_.-]{3,40}$/.test(username)) throw new Error('--username باید ۳ تا ۴۰ نویسهٔ a-z 0-9 _ . - باشد');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) throw new Error('--email معتبر نیست');
  if (!process.env.MYSQL_URL) throw new Error('MYSQL_URL تنظیم نشده');

  const generated = process.argv.includes('--generate');
  const password = generated
    ? crypto.randomBytes(18).toString('base64url')           // ۲۴ نویسه
    : (process.env.NOOKA_NEW_ADMIN_PASSWORD || await askHidden('رمز عبور (حداقل ۱۲ نویسه): '));
  if (typeof password !== 'string' || password.length < 12 || password.length > 1024) {
    throw new Error('رمز باید بین ۱۲ تا ۱۰۲۴ نویسه باشد');
  }
  const hash = await argon2.hash(password, { type: argon2.argon2id, memoryCost: 65536, timeCost: 3, parallelism: 1 });

  const db = await mysql.createConnection(process.env.MYSQL_URL);
  try {
    await db.beginTransaction();
    const [r] = await db.execute(
      `INSERT INTO admin_users (username, email, display_name, password_hash, must_change_password)
       VALUES (?, ?, ?, ?, 1)`, [username, email, name, hash]);
    const [ro] = await db.execute(
      `INSERT INTO admin_user_roles (admin_user_id, role_id)
       SELECT ?, id FROM roles WHERE code = ?`, [r.insertId, role]);
    if (!ro.affectedRows) throw new Error('نقش «' + role + '» وجود ندارد');
    await db.execute(
      `INSERT INTO audit_logs (actor_label, action_code, target_type, target_id, details)
       VALUES ('bootstrap', 'admin.user.create', 'admin_user', ?, JSON_OBJECT('role', ?, 'via', 'create-admin.js'))`,
      [String(r.insertId), role]);
    await db.commit();
    console.log(`✓ ادمین «${username}» با نقش ${role} ساخته شد (شناسه ${r.insertId}). در اولین ورود باید رمز را عوض کند.`);
    if (generated) console.log(`  رمز موقت (فقط همین یک بار نمایش داده می‌شود): ${password}`);
  } catch (e) {
    await db.rollback().catch(() => {});
    throw e;
  } finally { await db.end(); }
})().catch((e) => { console.error('✗', e && e.message || e); process.exit(1); });
