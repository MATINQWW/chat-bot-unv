const { ipHash, originAllowed, rateLimited, baseHeaders, verifyCid } = require('../lib/common');
const { getLearner } = require('../lib/prompt');

// 👍/👎 کاربران: دو 👎 از کاربران مستقل، پاسخ را از حافظه حذف و مدتی بلاک می‌کند
module.exports = async (req, res) => {
  baseHeaders(res);
  if (req.method !== 'POST') return res.status(405).end();
  if (!originAllowed(req)) return res.status(403).json({ error: 'forbidden' });
  if (await rateLimited(req, 'fb', 10, 60)) return res.status(429).json({ error: 'rate_limited' });
  const b = (req.body && typeof req.body === 'object') ? req.body : {};
  const key = verifyCid(b.cid);
  if (!key || (b.vote !== 'up' && b.vote !== 'down')) return res.status(400).json({ error: 'bad_request' });
  try {
    const r = await getLearner().feedback(key, b.vote, ipHash(req));
    return res.status(r === 'bad' ? 400 : 200).json({ ok: r !== 'bad', result: r });
  } catch (e) { console.error('feedback', e && e.message); return res.status(500).json({ error: 'server_error' }); }
};
