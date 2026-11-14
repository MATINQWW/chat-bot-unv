'use strict';
// هش رمز با Argon2id (پکیج argon2). رمز خام هرگز ذخیره یا لاگ نمی‌شود.
const crypto = require('node:crypto');

let argon2 = null;
const lib = () => argon2 || (argon2 = require('argon2'));

const OPTS = () => ({ type: lib().argon2id, memoryCost: 65536, timeCost: 3, parallelism: 1 });

async function hashPassword(password) { return lib().hash(String(password), OPTS()); }

// فقط هش‌های Argon2 را تأیید می‌کند (قید دیتابیس هم bcrypt را می‌پذیرد، ولی ورود با bcrypt پشتیبانی نمی‌شود)
async function verifyPassword(hash, password) {
  if (typeof hash !== 'string' || !hash.startsWith('$argon2') || typeof password !== 'string') return false;
  try { return await lib().verify(hash, password); } catch { return false; }
}

// برای یکسان‌سازی زمان پاسخ وقتی کاربر وجود ندارد (جلوگیری از شمارش حساب‌ها با زمان‌سنجی)
let dummy = null;
async function dummyHash() { return dummy || (dummy = hashPassword(crypto.randomBytes(24).toString('base64url'))); }

// سیاست رمز: حداقل طول از تنظیمات (پیش‌فرض ۱۲)، بدون نام کاربری/ایمیل، نه یک نویسهٔ تکراری
function checkPolicy(password, { username = '', email = '', minLength = 12 } = {}) {
  if (typeof password !== 'string' || password.length < minLength) return 'too_short';
  if (password.length > 1024) return 'too_long';
  const p = password.toLowerCase();
  const local = String(email).toLowerCase().split('@')[0];
  if ((username && username.length >= 3 && p.includes(username.toLowerCase())) || (local.length >= 3 && p.includes(local))) return 'contains_identity';
  if (/^(.)\1+$/u.test(password)) return 'too_simple';
  return null;
}

// رمز موقت تصادفی بدون نویسه‌های مبهم (۲۰ نویسه ≈ ۱۱۶ بیت)
function temporaryPassword(len = 20) {
  const A = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
  let out = '';
  for (let i = 0; i < len; i++) out += A[crypto.randomInt(A.length)];
  return out;
}

module.exports = { hashPassword, verifyPassword, dummyHash, checkPolicy, temporaryPassword };
