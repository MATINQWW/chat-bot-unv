const crypto = require('crypto');
const { kv, originAllowed, rateLimited, baseHeaders } = require('../lib/common');
const { getLearner } = require('../lib/prompt');

// پنل مدیریت: GET → آمار، پرسش‌های پرتکرار، پرسش‌های بی‌پاسخ (کاندید افزودن به knowledge/chunks.json)، ۱۰۰ درخواست تماس آخر
//              POST {"delete":"<key>"} → حذف یک پاسخ از حافظه
// نیاز: ADMIN_TOKEN در env و هدر Authorization: Bearer <token>
function tokenOk(req) {
  const want = process.env.ADMIN_TOKEN || '';
  const got = String((req.headers && req.headers.authorization) || '').replace(/^Bearer\s+/i, '');
  if (want.length < 16) return false;
  const a = crypto.createHash('sha256').update(want).digest(), b = crypto.createHash('sha256').update(got).digest();
  return crypto.timingSafeEqual(a, b);
}
module.exports = async (req, res) => {
  baseHeaders(res);
  if (!process.env.ADMIN_TOKEN) return res.status(404).end();
  if (!originAllowed(req)) return res.status(403).end();
  if (await rateLimited(req, 'admin', 10, 60)) return res.status(429).json({ error: 'rate_limited' });
  if (!tokenOk(req)) return res.status(401).json({ error: 'unauthorized' });
  const L = getLearner();
  if (req.method === 'GET') {
    const d = await L.dashboard();
    if (!d) return res.status(200).json({ error: 'store_unavailable' });
    const lr = await kv.exec([['LRANGE', 'leads', 0, 99]]);
    d.leads = ((lr && lr[0]) || []).map(x => { try { const o = JSON.parse(x); delete o.ip; return o; } catch { return null; } }).filter(Boolean);
    return res.status(200).json(d);
  }
  if (req.method === 'POST') {
    const k = req.body && req.body.delete;
    if (typeof k !== 'string' || !/^[a-f0-9]{16}$/.test(k)) return res.status(400).json({ error: 'bad_request' });
    await L.remove(k);
    return res.status(200).json({ ok: true });
  }
  return res.status(405).end();
};
