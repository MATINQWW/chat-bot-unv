const crypto = require('crypto');
const { createKV } = require('./kv');

const kv = createKV();

// کلید امضا: ترجیحاً CHAT_SIGNING_SECRET (حداقل ۱۶ نویسه)؛ در غیر این صورت از کلید API مشتق می‌شود.
// هرگز با کلید خالی امضا نمی‌کنیم (قبلاً HMAC با کلید خالی قابل جعل بود).
function secret() {
  const s = process.env.CHAT_SIGNING_SECRET;
  if (s && s.length >= 16) return s;
  const k = process.env.ICP_API_KEY;
  if (k) return crypto.createHmac('sha256', 'chat-signing-v1').update(k).digest('hex');
  return null;
}
function sign(content) {
  const s = secret();
  if (!s) throw new Error('signing secret is not configured');
  return crypto.createHmac('sha256', s).update(String(content)).digest('hex').slice(0, 40);
}
function validSig(content, sig) {
  if (typeof sig !== 'string' || sig.length !== 40 || !secret()) return false;
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
// تنظیمات مدل (همه از env؛ پیش‌فرض: IranCopilot). برای سرویس سازگار دیگر (مثلاً Ollama):
//   ICP_BASE_URL=https://ollama.com/v1  ICP_API_KEY=<کلید آن سرویس>  ICP_MODEL=gemma4:31b
function llmConfig() {
  const model = process.env.ICP_MODEL || 'icp-chat';
  return {
    key: process.env.ICP_API_KEY || '',
    baseURL: (process.env.ICP_BASE_URL || 'https://irancopilot.com/studio/pro/v1').replace(/\/+$/, '') + '/',
    model,
    visionModel: process.env.ICP_VISION_MODEL || model,
  };
}
function ipOf(req) {
  const h = req.headers || {};
  const raw = h['x-vercel-forwarded-for'] || h['x-real-ip'] || h['x-forwarded-for'] || (req.socket && req.socket.remoteAddress) || 'unknown';
  return String(raw).split(',')[0].trim().slice(0, 64);
}
function ipHash(req) { return crypto.createHash('sha256').update(ipOf(req) + '|' + (secret() || 'no-secret')).digest('hex').slice(0, 16); }

function originAllowed(req) {
  const origin = req.headers && req.headers.origin;
  if (!origin) return true;
  try {
    if (new URL(origin).host === req.headers.host) return true;
    return (process.env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean).includes(origin);
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
  const m = Math.floor(Date.now() / 60000), h = Math.floor(Date.now() / 3600000);
  const r = await kv.exec([['INCR', `rl:${id}:m${m}`], ['EXPIRE', `rl:${id}:m${m}`, 90], ['INCR', `rl:${id}:h${h}`], ['EXPIRE', `rl:${id}:h${h}`, 4000]]);
  if (!r || typeof r[0] !== 'number') return localLimited(id, perMin, perHour);
  return r[0] > perMin || r[2] > perHour;
}

function baseHeaders(res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
}

module.exports = { llmConfig, kv, sign, validSig, signCid, verifyCid, ipHash, originAllowed, rateLimited, baseHeaders };
