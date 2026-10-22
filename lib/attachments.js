// اعتبارسنجی و استخراج محتوای پیوست‌ها (تصویر / متن / PDF) — همه‌چیز سمت سرور بررسی می‌شود
const IMG = { 'image/jpeg': [[0xFF, 0xD8, 0xFF]], 'image/png': [[0x89, 0x50, 0x4E, 0x47]], 'image/gif': [[0x47, 0x49, 0x46, 0x38]], 'image/webp': [[0x52, 0x49, 0x46, 0x46]] };
const MAX_IMG_B64 = 1_300_000;      // ≈ 950KB تصویر (کلاینت قبل از ارسال کوچک‌اش می‌کند)
const MAX_DOC_BYTES = 3_000_000;
const MAX_DOC_CHARS = 6000;         // سقف متن فایل که به مدل داده می‌شود (کنترل توکن)

class AttError extends Error { constructor(status, message) { super(message); this.status = status; } }

function cleanName(n) { return String(n || 'file').replace(/[<>"'`\r\n\\/]+/g, '_').slice(0, 80); }
function startsWith(buf, sig) { return sig.every((b, i) => buf[i] === b); }

async function parseAttachment(a) {
  if (!a || typeof a !== 'object') return null;
  const name = cleanName(a.name);
  const data = typeof a.data === 'string' ? a.data : '';
  if (!data || !/^[A-Za-z0-9+/]+={0,2}$/.test(data)) throw new AttError(400, 'فایل نامعتبر است.');

  if (a.type === 'image') {
    const mime = String(a.mime || '').toLowerCase();
    if (!IMG[mime]) throw new AttError(415, 'فرمت تصویر پشتیبانی نمی‌شود (JPG، PNG، WebP، GIF).');
    if (data.length > MAX_IMG_B64) throw new AttError(413, 'حجم تصویر زیاد است.');
    const head = Buffer.from(data.slice(0, 16), 'base64');
    if (!IMG[mime].some(sig => startsWith(head, sig))) throw new AttError(415, 'محتوای فایل با فرمت تصویر هم‌خوانی ندارد.');
    return { kind: 'image', name, mime, b64: data };
  }

  if (a.type === 'document') {
    if (data.length > MAX_DOC_BYTES * 1.4) throw new AttError(413, 'حجم فایل زیاد است.');
    const buf = Buffer.from(data, 'base64');
    if (buf.length > MAX_DOC_BYTES) throw new AttError(413, 'حجم فایل زیاد است.');
    const ext = (name.split('.').pop() || '').toLowerCase();
    let text = '';
    if (buf.slice(0, 5).toString('latin1') === '%PDF-') {
      let pdf;
      try { pdf = require('pdf-parse/lib/pdf-parse.js'); } catch { throw new AttError(501, 'خواندن PDF روی سرور فعال نیست؛ لطفاً متن را مستقیم بفرستید.'); }
      try { text = (await pdf(buf, { max: 10 })).text || ''; } catch { throw new AttError(422, 'خواندن این PDF ممکن نشد (رمزدار یا خراب است).'); }
    } else if (['txt', 'md', 'csv'].includes(ext)) {
      if (buf.includes(0)) throw new AttError(415, 'این فایل متنی نیست.');
      text = buf.toString('utf8');
    } else {
      throw new AttError(415, 'فقط PDF، TXT، MD و CSV پشتیبانی می‌شود.');
    }
    text = text.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
    if (!text) throw new AttError(422, 'متنی در فایل پیدا نشد (ممکن است اسکن‌شده باشد).');
    return { kind: 'text', name, text: text.slice(0, MAX_DOC_CHARS).replace(/</g, '＜').replace(/>/g, '＞') };
  }
  throw new AttError(400, 'نوع فایل نامعتبر است.');
}

module.exports = { parseAttachment, AttError };
