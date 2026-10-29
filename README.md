# چت‌بات هدایت تحصیلی (دانشگاه آزاد اصفهان)

فرانت‌اند ساده (HTML/CSS/JS) + APIهای Node در `api/`. اجرا روی **Vercel** (serverless) یا هر سرور Node با `server.js` (هاست cPanel، VPS).
برنامهٔ رشد و تصمیم‌های زیرساخت: [`ROADMAP.md`](ROADMAP.md).

## اصل طراحی: بدون وابستگی خارجی در سرور، به‌جز خود مدل زبانی
| بخش | پیش‌فرض (بدون هیچ سرویس خارجی) | افزونهٔ اختیاری |
|---|---|---|
| جست‌وجوی دانش | کلمه‌ای محلی + گروه‌های هم‌معنی (`lib/synonyms.js`) | Upstash Vector (جست‌وجوی معنایی + کش معنایی) |
| rate-limit و حافظهٔ یادگیری | حافظهٔ داخل همان instance | Upstash Redis (مشترک بین instanceها) |
| درخواست تماس | **غیرفعال** (جایی برای نگه‌داری نیست، پس دکمه نشان داده نمی‌شود) | `LEAD_WEBHOOK_URL` یا Upstash Redis |
| مدل زبانی | یک سرویس (`config.js`) | چند سرویس پشت سر هم (`fallback` در همان فایل) |

## تنظیمات: فقط `config.js`
همهٔ تنظیمات در فایل `config.js` (ریشهٔ پروژه) است. در Vercel فقط کلیدها و رمزها.

```js
llm: {
  use: 'ollama',               // سرویس فعال
  fallback: [],                // مثلاً ['irancopilot'] → اگر فعال خطا داد یا پر بود
  providers: {
    ollama:      { url: 'https://ollama.com/v1',                 model: 'gemma4:31b', key: 'OLLAMA_API_KEY', vision: true },
    irancopilot: { url: 'https://irancopilot.com/studio/pro/v1', model: 'icp-chat',   key: 'ICP_API_KEY' },
  },
  maxTokens: 800,              // سقف طول پاسخ
  knowledgeChars: 1800,        // سقف متن دانش در هر درخواست
  stream: true,                // پاسخ کلمه‌به‌کلمه
  ...
},
search: { ... }, learn: { ... }, allowedOrigins: [], ...
```
- **عوض کردن سرویس، مدل یا آدرس:** همان فایل را در گیت‌هاب ویرایش و commit کنید؛ Vercel خودکار deploy می‌کند.
- **سرویس جدید:** یک خط به `providers` اضافه کنید (هر API سازگار با OpenAI).
- `key` **اسم** متغیر کلید است، نه خود کلید. خود کلید فقط در Vercel → Environment Variables.
- این فایل در گیت‌هاب دیده می‌شود (روی سایت مسدود است)؛ هیچ کلیدی داخلش ننویسید.

با `fallback`، اگر سرویس فعال محدود (429)، خراب (5xx) یا کند بود یا ظرفیتش (`maxConcurrent`) پر بود، درخواست به بعدی می‌رود؛ سرویسی که پشت سر هم خطا بدهد یک دقیقه کنار گذاشته می‌شود؛ اگر همه پر باشند کاربر پیام «شلوغ است» می‌بیند.

## متغیرهای محیطی
فقط کلیدها و رمزها؛ فهرست کامل در `.env.example`. حداقل لازم:

| نام | توضیح |
|---|---|
| `OLLAMA_API_KEY` | کلید سرویس فعال (اسمش همان `key` در `config.js`) |
| `CHAT_SIGNING_SECRET` | رشتهٔ تصادفی ≥ ۱۶ نویسه؛ یک‌بار بسازید و عوض نکنید |
| `ADMIN_TOKEN` | اختیاری، برای `/api/admin` (≥ ۱۶ نویسه) |

**فایل `.env` را هرگز در گیت‌هاب نگذارید.**

فونت (IRANYekan) مثل قبل از `cdn.jsdelivr.net` در مرورگر کاربر بارگذاری می‌شود؛ اگر CDN در دسترس نباشد، مرورگر فونت جایگزین (Tahoma) را نشان می‌دهد و بات کار می‌کند.

## استقرار روی Vercel
1. کد را در GitHub پوش کنید؛ Vercel خودکار deploy می‌کند.
2. Settings → Environment Variables: متغیرهای بالا (برای Production و Preview).
3. Redeploy.
4. بررسی: `https://<دامنه>/knowledge/chunks.json` باید به `/` هدایت شود.

## اجرا بدون Vercel (cPanel / VPS)
```
npm install --omit=dev
node server.js          # پورت: PORT یا 3000
```
- **cPanel:** Setup Node.js App → Application startup file: `server.js` · متغیرها را در همان صفحه بگذارید · «Run NPM Install» و Restart.
- **VPS:** با `pm2 start server.js` یا systemd، پشت nginx (برای پاسخ جریانی در nginx `proxy_buffering off;`).

## مسیر پاسخ به هر پیام (ارزان‌ترین اول)
1. احوالپرسی/تشکر → پاسخ آماده (بدون مدل)
2. سؤال‌های آماده (`type: faq`) → پاسخ مستقیم (بدون مدل)
3. حافظهٔ یادگیری: پرسش‌هایی که چند کاربر مستقل پرسیده‌اند و پاسخ مستند گرفته‌اند (بدون مدل)
4. جست‌وجوی دانش → فقط ۱ تا ۴ تکهٔ مرتبط به مدل می‌رود
5. تاریخچه: فقط سؤال‌های قبلی کاربر + آخرین پاسخ بات (بریده به ۳۰۰ نویسه)
6. پاسخ مدل به‌صورت جریانی (SSE) نمایش داده می‌شود

## دانش بات
در `knowledge/chunks.json`: هر رشته/موضوع یک «تکه» با `id` ثابت، `type`، `title`، `keywords` و `text`.
- برای تکهٔ جدید `id` یکتا بدهید؛ `id` موجود را عوض نکنید.
- اگر کاربران با کلمه‌ای می‌پرسند که در دانش نیست، آن را به `keywords` همان تکه یا به گروه مناسب در `lib/synonyms.js` اضافه کنید.
- حافظهٔ یادگیری با تغییر دانش خودکار باطل می‌شود.
- پرسش‌های بی‌پاسخ و پرتکرار: `GET /api/admin` (فیلدهای `topUnanswered` و `topAsked`).

```
npm test                    # تست‌ها (بدون شبکه)
npm run eval                # سنجش بازیابی روی eval/questions.json (با -v جزئیات)
npm run search -- "سؤال"    # دیدن تکه‌هایی که برای یک سؤال پیدا می‌شود
```
قبل و بعد از هر تغییر در دانش یا کد جست‌وجو `npm run eval` بزنید. GitHub Action روی هر push تست‌ها و eval (حداقل ۹۰٪) را اجرا می‌کند.

## افزونهٔ اختیاری: Upstash
فقط وقتی لازم شد (مثلاً rate-limit مشترک روی Vercel، یا جست‌وجوی معنایی):
- **Redis:** `KV_REST_API_URL` و `KV_REST_API_TOKEN` (Vercel → Storage → Upstash Redis)
- **Vector:** ایندکس Hybrid (dense: `openai/text-embedding-3-small`، sparse: `BM25`) و `UPSTASH_VECTOR_REST_URL` / `UPSTASH_VECTOR_REST_TOKEN`؛ سپس `npm run ingest`. با Secrets همین دو نام در GitHub، Action ایندکس را خودکار همگام می‌کند.

اگر Upstash در دسترس نباشد یا کند باشد، بات بدون خطا به حالت محلی برمی‌گردد.
