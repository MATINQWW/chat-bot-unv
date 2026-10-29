# چت‌بات هدایت تحصیلی (دانشگاه آزاد اصفهان)

فرانت‌اند ساده (HTML/CSS/JS) + توابع Serverless روی Vercel + مدل `icp-chat` از IranCopilot (قابل تغییر با env).

## متغیرهای محیطی (Vercel → Project → Settings → Environment Variables)

| نام | الزامی | توضیح |
|---|---|---|
| `ICP_API_KEY` | ✅ | کلید API سرویس IranCopilot |
| `CHAT_SIGNING_SECRET` | ✅ توصیه‌شده | رشتهٔ تصادفی ≥۱۶ نویسه؛ یک‌بار بسازید و عوض نکنید |
| `ICP_MODEL` / `ICP_BASE_URL` | ❌ | پیش‌فرض `icp-chat` و `https://irancopilot.com/studio/pro/v1` (برای Ollama: `https://ollama.com/v1` و `gemma4:31b`) |
| `KV_REST_API_URL` / `KV_REST_API_TOKEN` | ⚠️ بسیار توصیه‌شده | Upstash Redis (Vercel → Storage/Marketplace). بدون آن rate-limit و یادگیری روی هر instance جدا و عملاً بی‌اثر است |
| `UPSTASH_VECTOR_REST_URL` / `UPSTASH_VECTOR_REST_TOKEN` | ⚠️ بسیار توصیه‌شده | Upstash Vector (ایندکس Hybrid). بدون آن فقط جست‌وجوی کلمه‌ای محلی کار می‌کند |
| `ADMIN_TOKEN` | ❌ | برای `/api/admin` (≥۱۶ نویسه) |

بقیهٔ گزینه‌ها در `.env.example` است. **فایل `.env` را هرگز در گیت‌هاب نگذارید.**

## استقرار
1. کد را در GitHub پوش کنید.
2. در Vercel: Add New → Project → ریپو را Import کنید (Framework Preset: Other، بدون Build Command).
3. متغیرهای بالا را اضافه کنید (برای Production و Preview).
4. Storage → Upstash Redis را وصل کنید.
5. Deploy / Redeploy (بعد از هر تغییر env باید دوباره Deploy شود).
6. بررسی: `https://<دامنه>/knowledge/chunks.json` نباید محتوا نشان دهد (به `/` هدایت می‌شود).

## اجرای تست
```
npm install
npm test
```

## پایگاه دانش (Vector)
دانش در `knowledge/chunks.json` است: هر رشته/موضوع یک «تکه» با `id` ثابت، `type` (major، faculty، general، faq، list)، `title`، `keywords` و `text`.

مسیر پاسخ به هر پیام (ارزان‌ترین اول):
1. احوالپرسی/تشکر → پاسخ آماده (بدون مدل)
2. سؤال‌های FAQ (`type: faq`، فیلد `questions`) → پاسخ مستقیم `answer` (بدون مدل)
3. حافظهٔ یادگیری (Redis): اول تطبیق کلمه‌ای، بعد **کش معنایی** (namespace `qcache` در همان Vector؛ فقط وقتی اعداد و نام رشته/دانشکده یکسان باشد) → پاسخ ذخیره‌شده
4. بازیابی Hybrid: Upstash Vector (معنایی + BM25) ⊕ جست‌وجوی کلمه‌ای محلی (RRF) → فقط ۲–۴ تکهٔ مرتبط به مدل می‌رود
5. تاریخچه: فقط سؤال‌های قبلی کاربر + آخرین پاسخ بات (بریده به ۳۰۰ نویسه)
6. پاسخ مدل به‌صورت **جریانی (SSE)** نمایش داده می‌شود؛ پاسخ‌های کش/FAQ همان JSON هستند

اگر پاسخ به مرکز هدایت تحصیلی ارجاع دهد، دکمهٔ «📞 مشاور با من تماس بگیرد» نمایش داده می‌شود (`/api/lead`). درخواست‌ها در `GET /api/admin` (فیلد `leads`) دیده می‌شوند و با `LEAD_WEBHOOK_URL` می‌توانند به یک بات/سرویس پیام ارسال شوند.

اگر Vector در دسترس نباشد یا کند باشد (> `VECTOR_TIMEOUT_MS`)، بات بدون خطا با جست‌وجوی کلمه‌ای ادامه می‌دهد.

### ساخت ایندکس (یک‌بار)
Upstash Console → Vector → Create Index:
- Type: **Hybrid** · Dense model: **openai/text-embedding-3-small** · Sparse model: **BM25** · Metric: COSINE
- `UPSTASH_VECTOR_REST_URL` و `UPSTASH_VECTOR_REST_TOKEN` را در `.env` و در Vercel بگذارید.

```
npm install
npm run ingest -- --dry     # گزارش بدون تغییر
npm run ingest              # بارگذاری (فقط تکه‌های تغییرکرده)
npm run search -- "میتونم هم کار کنم هم درس بخونم؟"   # آزمایش بازیابی بدون مدل
npm run eval                # سنجش روی eval/questions.json (با -v جزئیات)
```
قبل و بعد از هر تغییر در دانش یا کد بازیابی `npm run eval` را اجرا کنید؛ سؤال‌های واقعی کاربران (از `topUnanswered` پنل) را به `eval/questions.json` اضافه کنید.

## تغییر دانش بات
`knowledge/chunks.json` را ویرایش کنید (برای تکهٔ جدید `id` یکتا بدهید؛ `id` موجود را عوض نکنید) و پوش کنید.
GitHub Action (`.github/workflows/ingest.yml`) تست‌ها را اجرا و ایندکس را خودکار همگام می‌کند (Secrets: `UPSTASH_VECTOR_REST_URL`، `UPSTASH_VECTOR_REST_TOKEN`).
حافظهٔ یادگیری با تغییر فایل خودکار باطل می‌شود. پرسش‌های بی‌پاسخ را از `/api/admin` (فیلد `topUnanswered`) ببینید و به دانش اضافه کنید.
