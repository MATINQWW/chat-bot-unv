const crypto = require('crypto');
const { createKV } = require('./kv');

const kv = createKV();

function secret() { return process.env.CHAT_SIGNING_SECRET || process.env.ICP_API_KEY || ''; }
function sign(content) { return crypto.createHmac('sha256', secret()).update(String(content)).digest('hex').slice(0, 40); }
function validSig(content, sig) {
  if (typeof sig !== 'string' || sig.length !== 40) return false;
  const a = Buffer.from(sign(content)), b = Buffer.from(sig);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
function ipOf(req) {
  const h = req.headers || {};
  const raw = h['x-vercel-forwarded-for'] || h['x-real-ip'] || h['x-forwarded-for'] || (req.socket && req.socket.remoteAddress) || 'unknown';
  return String(raw).split(',')[0].trim().slice(0, 64);
}
function ipHash(req) { return crypto.createHash('sha256').update(ipOf(req) + '|' + secret()).digest('hex').slice(0, 16); }

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

module.exports = { kv, sign, validSig, ipHash, originAllowed, rateLimited, baseHeaders };
