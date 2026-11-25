# راهنمای استقرار نسخه Vercel

## ۱) ساخت دیتابیس ابری
1. یک دیتابیس MySQL 8 سازگار (مانند **TiDB Cloud Serverless**، **Aiven** یا **لیارا**) بسازید.
2. فایل‌های زیر را به ترتیب اجرا کنید (نسخه بدون `CREATE EVENT` سازگار با پلن‌های رایگان):
   - `db/01_schema_serverless.sql`
   - `db/03_chatbot_full_schema_serverless.sql`
3. برای انتقال پایگاه دانش اولیه به دیتابیس:
   ```bash
   NOOKA_DB_URL="mysql://..." NOOKA_DB_SSL=1 node db/seed-knowledge.js
   ```
4. برای ساخت اولین مدیر کل در دیتابیس:
   ```bash
   NOOKA_DB_URL="mysql://..." NOOKA_DB_SSL=1 node db/create-admin.js --username owner --email owner@example.com --role super_admin --generate
   ```

## ۲) تنظیمات Vercel
1. پروژه را در Vercel ایمپورت کنید.
2. متغیرهای فایل `.env.example` را در **Settings → Environment Variables** وارد کنید (حتماً `NOOKA_DB_SSL=1` و `CRON_SECRET` را ست کنید).
3. پاک‌سازی روزانه نشست‌ها و لیدهای منقضی به‌صورت خودکار توسط `vercel.json` (`/api/cron-purge`) اجرا می‌شود.
4. همگام‌سازی وکتورها را پس از تنظیم کلیدهای Upstash Vector اجرا کنید:
   ```bash
   npm run ingest
   ```
