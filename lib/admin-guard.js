'use strict';
// نگهبان مشترک APIهای پنل: نشست از دیتابیس، الزام تغییر رمز، بررسی Origin برای نوشتن، مجوزها.
const { getPool } = require('./db');
const { readToken, sessionContext, audit } = require('./admin-store');

function baseHeaders(res) {
  res.setHeader('Cache-Control', 'private, no-store, max-age=0');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Vary', 'Cookie');
}

function sameOrigin(req) {
  const origin = req.headers && req.headers.origin;
  const host = req.headers && req.headers.host;
  if (!origin || !host) return false;
  try {
    const parsed = new URL(origin);
    if (parsed.host.toLowerCase() !== String(host).toLowerCase()) return false;
    const proto = String((req.headers && req.headers['x-forwarded-proto']) || '').toLowerCase();
    if (proto === 'https' && parsed.protocol !== 'https:') return false;
    return true;
  } catch { return false; }
}

function clientIpHash(req) {
  try { return require('./common').ipHash(req); } catch { return null; }
}

// برمی‌گرداند ctx یا null (پاسخ خطا همین‌جا فرستاده شده). write=true → Origin هم‌مبدأ لازم است.
async function requireAdmin(req, res, { write = false, allowMustChange = false } = {}) {
  baseHeaders(res);
  if (write && !sameOrigin(req)) { res.status(403).json({ error: 'origin_not_allowed' }); return null; }
  let ctx;
  try { ctx = await sessionContext(readToken(req)); }
  catch { res.status(503).json({ error: 'db_unavailable' }); return null; }
  if (!ctx) { res.status(401).json({ authenticated: false }); return null; }
  if (ctx.admin.mustChangePassword && !allowMustChange) {
    res.status(403).json({ error: 'password_change_required' });
    return null;
  }
  ctx.ipHash = clientIpHash(req);
  ctx.ua = req.headers && req.headers['user-agent'];
  ctx.can = (p) => ctx.perms.has(p);
  ctx.isSuper = () => ctx.roles.some((r) => r.code === 'super_admin');
  ctx.audit = (e) => audit(getPool(), { actorId: ctx.admin.id, actorLabel: ctx.admin.username, sessionId: ctx.sessionId, ipHash: ctx.ipHash, ua: ctx.ua, ...e });
  return ctx;
}

// ردّ دسترسی + ثبت در ممیزی (outcome=denied)
async function deny(res, ctx, action, perm) {
  await ctx.audit({ action, outcome: 'denied', details: { permission: perm } }).catch(() => {});
  return res.status(403).json({ error: 'forbidden' });
}

function parseBody(req, max = 65536) {
  if (Number((req.headers && req.headers['content-length']) || 0) > max) return null;
  const b = req.body;
  if (b && typeof b === 'object') {
    try { if (Buffer.byteLength(JSON.stringify(b)) > max) return null; } catch { return null; }
    return b;
  }
  if (typeof b === 'string') {
    if (Buffer.byteLength(b) > max) return null;
    try { return JSON.parse(b); } catch { return {}; }
  }
  return {};
}

const query = (req) => { try { return new URL(req.url, 'http://x').searchParams; } catch { return new URLSearchParams(); } };

module.exports = { requireAdmin, deny, parseBody, query, sameOrigin, baseHeaders };
