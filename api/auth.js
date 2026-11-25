// ═══════════════════════════════════════════════════════════
// AUTH — ورود / ثبت‌نام کاربران چت‌بات (جدا از ورود ادمین)
// POST /api/auth  { action: 'register' | 'login' | 'logout' | 'me', ... }
//  • ثبت‌نام: نام کاربری + ایمیل + رمز عبور
//  • ورود: (نام کاربری یا ایمیل) + رمز عبور
//  • رمز با scrypt هش می‌شود؛ نشست = توکن تصادفی در کوکی HttpOnly (۳۰ روز)
//  • ذخیره: همان KV پروژه (Redis / MySQL / حافظه)
// ═══════════════════════════════════════════════════════════
const crypto = require('crypto');
const { kv, ipHash, originAllowed, rateLimited, baseHeaders } = require('../lib/common');

const COOKIE = 'nooka_user';
const TTL = 30 * 24 * 3600;
const clean = (s, n) => String(s || '').replace(/[\u0000-\u001F<>]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, n);

const USER_RE = /^[A-Za-z0-9_.\-]{3,30}$/;
const EMAIL_RE = /^[^\s@<>()]+@[^\s@<>()]+\.[^\s@<>()]{2,}$/;
const PHONE_RE = /^09\d{9}$/;
const toEnDigits = s => String(s || '').replace(/[۰-۹]/g, c => String(c.charCodeAt(0) - 1776)).replace(/[٠-٩]/g, c => String(c.charCodeAt(0) - 1632));
const normUser = u => String(u || '').trim().toLowerCase();
const normEmail = e => String(e || '').trim().toLowerCase().slice(0, 100);
const normPhone = p => toEnDigits(p).replace(/[\s\-()]/g, '').replace(/^(?:\+98|0098)/, '0').slice(0, 15);
function hashPw(pw, saltHex) {
  const salt = Buffer.from(saltHex, 'hex');
  return crypto.scryptSync(pw, salt, 64).toString('hex');
}
function cookies(req) {
  const out = {};
  for (const part of String((req.headers && req.headers.cookie) || '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = part.slice(i + 1).trim();
  }
  return out;
}
const sessKey = tok => 'chat:sess:' + crypto.createHash('sha256').update(tok).digest('hex');
const isHttps = req => process.env.NODE_ENV === 'production' || (req.headers && req.headers['x-forwarded-proto'] === 'https');
function setCookie(req, res, tok, maxAge) {
  res.setHeader('Set-Cookie', `${COOKIE}=${tok}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${isHttps(req) ? '; Secure' : ''}`);
}
const publicUser = u => ({ username: u.username, email: u.email, phone: u.phone || '' });

// استفاده در api/lead.js: کاربر واردشده را از کوکی پیدا کن (یا null = مهمان)
async function currentUser(req) {
  const tok = cookies(req)[COOKIE];
  if (!tok || !/^[a-f0-9]{48}$/.test(tok)) return null;
  const r = await kv.exec([['GET', sessKey(tok)]]);
  const username = r && r[0];
  if (!username) return null;
  const u = await kv.exec([['HGET', 'chat:users', username]]);
  try { return u && u[0] ? JSON.parse(u[0]) : null; } catch { return null; }
}

async function handler(req, res) {
  baseHeaders(res);
  res.setHeader('Vary', 'Cookie');
  if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); return res.status(405).end(); }
  if (!originAllowed(req)) return res.status(403).json({ error: 'forbidden' });
  const b = (req.body && typeof req.body === 'object') ? req.body : {};
  const action = String(b.action || '');

  if (action === 'me') {
    const u = await currentUser(req);
    return res.status(200).json({ ok: true, user: u ? publicUser(u) : null });
  }
  if (action === 'logout') {
    const tok = cookies(req)[COOKIE];
    if (tok && /^[a-f0-9]{48}$/.test(tok)) await kv.exec([['DEL', sessKey(tok)]]);
    setCookie(req, res, '', 0);
    return res.status(200).json({ ok: true });
  }
  if (action !== 'register' && action !== 'login') return res.status(400).json({ error: 'bad_action' });

  if (await rateLimited(req, 'auth', 8, 40)) {
    return res.status(429).json({ error: 'rate_limited', message: 'تلاش‌های زیاد؛ چند دقیقه بعد دوباره امتحان کنید.' });
  }
  if (!kv.remote && !require('../config').leadAllowMemory) {
    return res.status(503).json({ error: 'auth_unavailable', message: 'ورود و ثبت‌نام فعلاً فعال نیست.' });
  }
  const password = typeof b.password === 'string' ? b.password : '';
  if (password.length < 8 || password.length > 100) return res.status(400).json({ error: 'bad_password', message: 'رمز عبور باید حداقل ۸ نویسه باشد.' });

  let user;
  if (action === 'register') {
    const username = normUser(b.username);
    const email = normEmail(b.email);
    const phone = b.phone ? normPhone(b.phone) : '';
    if (!USER_RE.test(username)) return res.status(400).json({ error: 'bad_username', message: 'نام کاربری باید ۳ تا ۳۰ نویسه و فقط شامل حروف انگلیسی، عدد، نقطه، خط تیره یا زیرخط باشد.' });
    if (!EMAIL_RE.test(email)) return res.status(400).json({ error: 'bad_email', message: 'ایمیل معتبر نیست.' });
    if (phone && !PHONE_RE.test(phone)) return res.status(400).json({ error: 'bad_phone', message: 'شماره همراه باید ۱۱ رقم و با ۰۹ شروع شود.' });
    const salt = crypto.randomBytes(16).toString('hex');
    user = { username, email, phone, salt, hash: hashPw(password, salt), at: new Date().toISOString() };
    const rU = await kv.exec([['HSETNX', 'chat:users', username, JSON.stringify(user)]]);
    if (!rU) return res.status(503).json({ error: 'auth_unavailable', message: 'خطا در ذخیره‌سازی؛ دوباره امتحان کنید.' });
    if (!rU[0]) return res.status(409).json({ error: 'username_exists', message: 'این نام کاربری قبلاً گرفته شده است.' });
    const rE = await kv.exec([['HSETNX', 'chat:emails', email, username]]);
    if (!rE || !rE[0]) {
      await kv.exec([['HDEL', 'chat:users', username]]);
      if (!rE) return res.status(503).json({ error: 'auth_unavailable', message: 'خطا در ذخیره‌سازی؛ دوباره امتحان کنید.' });
      return res.status(409).json({ error: 'email_exists', message: 'با این ایمیل قبلاً ثبت‌نام شده است؛ وارد شوید.' });
    }
    if (phone) {
      const rP = await kv.exec([['HSETNX', 'chat:phones', phone, username]]);
      if (!rP || !rP[0]) {
        await kv.exec([['HDEL', 'chat:users', username], ['HDEL', 'chat:emails', email]]);
        if (!rP) return res.status(503).json({ error: 'auth_unavailable', message: 'خطا در ذخیره‌سازی؛ دوباره امتحان کنید.' });
        return res.status(409).json({ error: 'phone_exists', message: 'با این شماره همراه قبلاً ثبت‌نام شده است؛ وارد شوید.' });
      }
    }
  } else {
    // شناسه = نام کاربری، ایمیل یا شماره همراه
    const ident = String(b.identifier || '').trim().toLowerCase().slice(0, 100);
    const maybePhone = normPhone(ident);
    let username = ident;
    if (ident.includes('@')) {
      const m = await kv.exec([['HGET', 'chat:emails', ident]]);
      if (!m) return res.status(503).json({ error: 'auth_unavailable', message: 'سرویس ورود موقتاً در دسترس نیست.' });
      username = m[0] || '';
    } else if (PHONE_RE.test(maybePhone)) {
      const m = await kv.exec([['HGET', 'chat:phones', maybePhone]]);
      if (!m) return res.status(503).json({ error: 'auth_unavailable', message: 'سرویس ورود موقتاً در دسترس نیست.' });
      username = m[0] || '';
    }
    let r = null;
    if (username && USER_RE.test(username)) {
      r = await kv.exec([['HGET', 'chat:users', username]]);
      if (!r) return res.status(503).json({ error: 'auth_unavailable', message: 'سرویس ورود موقتاً در دسترس نیست.' });
    }
    try { user = r && r[0] ? JSON.parse(r[0]) : null; } catch { user = null; }
    // زمان‌سنجی یکسان برای کاربر موجود/ناموجود
    const salt = user ? user.salt : '00'.repeat(16);
    const got = Buffer.from(hashPw(password, salt), 'hex');
    const want = Buffer.from(user ? user.hash : '00'.repeat(64), 'hex');
    if (!user || got.length !== want.length || !crypto.timingSafeEqual(got, want)) {
      return res.status(401).json({ error: 'bad_credentials', message: 'نام کاربری/ایمیل/شماره همراه یا رمز عبور اشتباه است.' });
    }
  }
  const tok = crypto.randomBytes(24).toString('hex');
  const saved = await kv.exec([['SET', sessKey(tok), user.username, 'EX', TTL]]);
  if (!saved || saved[0] !== 'OK') return res.status(503).json({ error: 'auth_unavailable', message: 'خطا در ایجاد نشست؛ دوباره امتحان کنید.' });
  setCookie(req, res, tok, TTL);
  return res.status(200).json({ ok: true, user: publicUser(user) });
}

module.exports = handler;
module.exports.currentUser = currentUser;
