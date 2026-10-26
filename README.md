# چت‌بات هدایت تحصیلی (دانشگاه آزاد اصفهان)

فرانت‌اند ساده (HTML/CSS/JS) + توابع Serverless روی Vercel + مدل `icp-chat` از IranCopilot (قابل تغییر با env).

## متغیرهای محیطی (Vercel → Project → Settings → Environment Variables)

| نام | الزامی | توضیح |
|---|---|---|
| `ICP_API_KEY` | ✅ | کلید API سرویس IranCopilot |
| `CHAT_SIGNING_SECRET` | ✅ توصیه‌شده | رشتهٔ تصادفی ≥۱۶ نویسه؛ یک‌بار بسازید و عوض نکنید |
| `ICP_MODEL` / `ICP_BASE_URL` | ❌ | پیش‌فرض `icp-chat` و `https://irancopilot.com/studio/pro/v1` (برای Ollama: `https://ollama.com/v1` و `gemma4:31b`) |
| `KV_REST_API_URL` / `KV_REST_API_TOKEN` | ⚠️ بسیار توصیه‌شده | Upstash Redis (Vercel → Storage/Marketplace). بدون آن rate-limit و یادگیری روی هر instance جدا و عملاً بی‌اثر است |
| `ADMIN_TOKEN` | ❌ | برای `/api/admin` (≥۱۶ نویسه) |

بقیهٔ گزینه‌ها در `.env.example` است. **فایل `.env` را هرگز در گیت‌هاب نگذارید.**

## استقرار
1. کد را در GitHub پوش کنید.
2. در Vercel: Add New → Project → ریپو را Import کنید (Framework Preset: Other، بدون Build Command).
3. متغیرهای بالا را اضافه کنید (برای Production و Preview).
4. Storage → Upstash Redis را وصل کنید.
5. Deploy / Redeploy (بعد از هر تغییر env باید دوباره Deploy شود).
6. بررسی: `https://<دامنه>/knowledge.txt` نباید محتوا نشان دهد (به `/` هدایت می‌شود).

## اجرای تست
```
npm install
npm test
```

## تغییر دانش بات
`knowledge.txt` را ویرایش و پوش کنید؛ حافظهٔ یادگیری با تغییر فایل خودکار باطل می‌شود.
