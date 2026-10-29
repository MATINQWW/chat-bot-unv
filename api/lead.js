// ═══════════════════════════════════════════════════════════
// LEAD — «درخواست تماس با مشاور»
// وقتی بات اطلاعات را ندارد (شهریه، ظرفیت، ...) کاربر به‌جای تماس خودش، شماره می‌گذارد و مرکز
// هدایت تحصیلی تماس می‌گیرد. ذخیره: Redis (لیست leads، ۱۰۰۰ مورد آخر) · مشاهده: GET /api/admin
// اختیاری: LEAD_WEBHOOK_URL → هر درخواست به‌صورت JSON به آن آدرس POST می‌شود (مثلاً بات بله/ایتا/تلگرام)
// ═══════════════════════════════════════════════════════════
const crypto = require('crypto');
const { kv, ipHash, originAllowed, rateLimited, baseHeaders } = require('../lib/common');
const { digits } = require('../lib/learn');

const clean = (s, n) => String(s || '').replace(/[\u0000-\u001F<>]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, n);

function normPhone(p) {
  const d = digits(String(p || '')).replace(/[\s\-()]/g, '').replace(/^\+98|^0098/, '0');
  if (/^09\d{9}$/.test(d)) return d;          // موبایل
  if (/^0[1-8]\d{9}$/.test(d)) return d;      // ثابت با کد شهر
  if (/^9\d{9}$/.test(d)) return '0' + d;
  return null;
}

module.exports = async (req, res) => {
  baseHeaders(res);
  if (req.method !== 'POST') return res.status(405).end();
  if (!originAllowed(req)) return res.status(403).json({ error: 'forbidden' });
  if (await rateLimited(req, 'lead', 2, 5)) return res.status(429).json({ error: 'rate_limited', message: 'درخواست شما قبلاً ثبت شده است.' });
  const hook = process.env.LEAD_WEBHOOK_URL;
  // بدون Redis یا webhook، درخواست فقط در حافظهٔ همین instance می‌ماند و گم می‌شود → قبول نکن
  if (!kv.remote && !hook && process.env.LEAD_ALLOW_MEMORY !== '1') {
    return res.status(503).json({ error: 'lead_unavailable', message: 'ثبت درخواست تماس فعلاً فعال نیست؛ لطفاً با ۰۳۱-۳۵۳۵۴۰۴۹ تماس بگیرید.' });
  }
  const b = (req.body && typeof req.body === 'object') ? req.body : {};
  const phone = normPhone(b.phone);
  if (!phone) return res.status(400).json({ error: 'bad_phone', message: 'شمارهٔ تماس معتبر نیست.' });
  if (b.consent !== true) return res.status(400).json({ error: 'no_consent', message: 'برای ثبت، رضایت تماس لازم است.' });
  const lead = {
    id: crypto.randomUUID().slice(0, 8),
    at: new Date().toISOString(),
    name: clean(b.name, 60),
    phone,
    major: clean(b.major, 80),
    question: clean(b.question, 300),   // آخرین سؤالی که بات جوابش را نداشت
    lang: clean(b.lang, 4),
    ip: ipHash(req),
  };
  const r = await kv.exec([['LPUSH', 'leads', JSON.stringify(lead)], ['LTRIM', 'leads', 0, 999], ['HINCRBY', 'stats', 'leads', 1]]);
  let hooked = false;
  if (hook) {
    try {
      const hr = await fetch(hook, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'lead', ...lead, ip: undefined }), signal: AbortSignal.timeout(3000) });
      hooked = hr.ok;
    } catch (e) { console.warn('lead webhook failed', e && e.message); }
  }
  // حداقل یکی از دو مقصد ماندگار باید موفق شده باشد
  if (!((r && kv.remote) || hooked || (r && process.env.LEAD_ALLOW_MEMORY === '1'))) {
    return res.status(503).json({ error: 'store_unavailable', message: 'ثبت درخواست ممکن نشد؛ لطفاً با ۰۳۱-۳۵۳۵۴۰۴۹ تماس بگیرید.' });
  }
  return res.status(200).json({ ok: true, id: lead.id, message: 'درخواست شما ثبت شد؛ همکاران مرکز هدایت تحصیلی با شما تماس می‌گیرند.' });
};
