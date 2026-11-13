const crypto = require('crypto');
const { createKV } = require('./kv');

const kv = createKV();

// کلید امضا: ترجیحاً CHAT_SIGNING_SECRET (حداقل ۱۶ نویسه)؛ در غیر این صورت از کلید API مشتق می‌شود.
// هرگز با کلید خالی امضا نمی‌کنیم (قبلاً HMAC با کلید خالی قابل جعل بود).
function secret() {
  const s = process.env.CHAT_SIGNING_SECRET;
  if (s && s.length >= 16) return s;
  const k = require('./llm').activeKey();
  if (k) return crypto.createHmac('sha256', 'chat-signing-v1').update(k).digest('hex');
  return null;
}
function sign(content) {
  const s = secret();
  if (!s) throw new Error('signing secret is not configured');
  return crypto.createHmac('sha256', s).update(String(content)).digest('hex').slice(0, 40);
}
function validSig(content, sig) {
  if (typeof sig !== 'string' || !/^[a-f0-9]{40}$/i.test(sig) || !secret()) return false;
  const a = Buffer.from(sign(content)), b = Buffer.from(sig);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
// شناسهٔ امضاشدهٔ پاسخ حافظه: «key.sig» — جلوگیری از ساختن 👎 جعلی برای کلیدهای دلخواه
function signCid(key) { return key + '.' + sign('\u0000cid:' + key).slice(0, 16); }
function verifyCid(cid) {
  if (typeof cid !== 'string') return null;
  const m = /^([a-f0-9]{16})\.([a-f0-9]{16})$/.exec(cid);
  if (!m || !secret()) return null;
  const want = Buffer.from(sign('\u0000cid:' + m[1]).slice(0, 16)), got = Buffer.from(m[2]);
  return want.length === got.length && crypto.timingSafeEqual(want, got) ? m[1] : null;
}
// تنظیمات مدل: lib/llm.js
function isLoopback(address) {
  const ip = String(address || '').toLowerCase().replace(/^::ffff:/, '');
  return ip === '127.0.0.1' || ip === '::1' || ip === 'localhost';
}

function ipOf(req) {
  const h = req.headers || {};
  const remote = (req.socket && req.socket.remoteAddress) || 'unknown';

  // Vercel supplies this platform-specific header. Do not trust arbitrary X-Forwarded-For.
  if (process.env.VERCEL === '1' && h['x-vercel-forwarded-for']) {
    return String(h['x-vercel-forwarded-for']).split(',')[0].trim().slice(0, 64);
  }

  // On a self-hosted VPS, trust forwarded IP headers only from the local Nginx proxy.
  if (process.env.TRUST_PROXY === '1' && isLoopback(remote)) {
    const forwarded = h['x-forwarded-for'] || h['x-real-ip'];
    if (forwarded) return String(forwarded).split(',')[0].trim().slice(0, 64);
  }

  return String(remote).replace(/^::ffff:/i, '').slice(0, 64);
}
function ipHash(req) { return crypto.createHash('sha256').update(ipOf(req) + '|' + (secret() || 'no-secret')).digest('hex').slice(0, 16); }

function originAllowed(req) {
  const origin = req.headers && req.headers.origin;
  if (!origin) return true;
  try {
    if (new URL(origin).host === req.headers.host) return true;
    return (require('../config').allowedOrigins || []).includes(origin);
  } catch { return false; }
}

// ─── Rate limit: اول KV مشترک (Redis)، در صورت خطا شمارندهٔ محلی ───
const local = new Map();
function localLimited(id, perMin, perHour) {
  const now = Date.now();
  if (local.size > 5000) for (const [k, v] of local) if (!v.length || now - v[v.length - 1] > 3600e3) local.delete(k);
  const arr = (local.get(id) || []).filter(t => now - t < 3600e3);
  const lim = arr.filter(t => now - t < 60e3).length >= perMin || arr.length >= perHour;
  if (!lim) arr.push(now);
  local.set(id, arr);
  return lim;
}
async function rateLimited(req, bucket, perMin, perHour) {
  const id = bucket + ':' + ipHash(req);
  const strict = process.env.RATE_LIMIT_FAIL_CLOSED === '1';
  // Production VPS must not silently fall back to per-process counters when shared storage is absent.
  if (strict && !kv.remote) return true;

  const minute = Math.floor(Date.now() / 60000);
  const hour = Math.floor(Date.now() / 3600000);
  const r = await kv.exec([
    ['INCR', `rl:${id}:m${minute}`], ['EXPIRE', `rl:${id}:m${minute}`, 90],
    ['INCR', `rl:${id}:h${hour}`], ['EXPIRE', `rl:${id}:h${hour}`, 4000],
  ]);
  if (!r || typeof r[0] !== 'number' || typeof r[2] !== 'number') {
    // Safer to reject traffic than to let every clustered process create its own limit.
    return strict ? true : localLimited(id, perMin, perHour);
  }
  return r[0] > perMin || r[2] > perHour;
}

function baseHeaders(res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
}

module.exports = { kv, sign, validSig, signCid, verifyCid, ipOf, ipHash, originAllowed, rateLimited, baseHeaders };
