# دیتابیس MySQL پنل ادمین نوکا

اسکیما روی **MySQL 8.0.46** اجرا و با ۱۵ تست خودکار آزمایش شده است: ۲۹ جدول، ۲ نما، ۶ رویه، ۱۲ تریگر، ۳ رویداد زمان‌بندی‌شده. روی MariaDB اجرا نکنید.

| فایل | کار |
|---|---|
| `01_schema.sql` | جدول‌ها، قیدها، تریگرها، رویه‌ها، رویدادها و دادهٔ اولیه (نقش‌ها، دسترسی‌ها، تنظیمات) |
| `02_grants.sql` | سه کاربر دیتابیس با حداقل دسترسی (`nooka_app`، `nooka_report`، `nooka_migrator`) |
| `create-admin.js` | ساخت ادمین با Argon2id (رمز را می‌پرسد یا با `--generate` رمز موقت می‌سازد) |
| `tests/schema.test.js` | ۱۵ تست خودکار روی یک MySQL آزمایشی |
| `package.json` | وابستگی‌های ابزارهای دیتابیس (`argon2`، `mysql2`)؛ جدا از `package.json` اصلی تا استقرار پروژه تغییر نکند |

## راه‌اندازی روی VPS

```ini
# /etc/mysql/mysql.conf.d/nooka.cnf
[mysqld]
default-time-zone = '+03:30'    # وقت تهران؛ ایران از ۱۴۰۱ ساعت تابستانی ندارد، پس آفست ثابت است
event_scheduler   = ON          # حذف خودکار Lead، درخواست‌های قدیمی و نشست‌های منقضی
```

```bash
sudo systemctl restart mysql
mysql --default-character-set=utf8mb4 -u root -p < db/01_schema.sql   # با کلاینت mysql، نه mysql2 (DELIMITER)
# رمزهای <<...>> را در 02_grants.sql عوض کنید، بعد:
mysql -u root -p < db/02_grants.sql
mysql -u root -p nooka -e "CALL sp_assert_time_zone()"                 # اگر منطقهٔ زمانی تهران نباشد خطا می‌دهد

cd db && npm ci
MYSQL_URL='mysql://nooka_app:رمز@127.0.0.1:3306/nooka' node create-admin.js \
  --username owner --email you@example.com --role super_admin --generate
```

در برنامه: `mysql2.createPool({ uri: process.env.MYSQL_URL, timezone: '+03:30', charset: 'utf8mb4' })` و در شروع سرور `CALL sp_assert_time_zone()`. `MYSQL_URL` را فقط در Environment بگذارید.

**اجرای تست‌ها** (روی یک MySQL آزمایشی؛ دیتابیس `nooka_test` را می‌سازد و پاک می‌کند):

```bash
cd db && TEST_MYSQL_URL='mysql://root:رمز@127.0.0.1:3306' npm test
```

## تغییرهای این نسخه (طبق پاسخ‌های شما)

1. **`chat_requests`** اضافه شد: فهرست درخواست‌های چت برای دو صفحهٔ «درخواست‌ها و گفتگوها» و «مصرف توکن هر درخواست». **متن سؤال و پاسخ ذخیره نمی‌شود**؛ فقط `question_key` (همان کلید sha1 توکن‌های `lib/learn.js`)، منبع، وضعیت، مدت، Provider/مدل، توکن‌ها و `answer_key` برای پیوند با بازخورد. حذف خودکار روزانه ساعت ۰۳:۰۰ بر اساس `chat_requests.retention_days` (**فرض من: ۳۰ روز**؛ آمار تجمیعی روزانه می‌ماند).
2. **اتصال پنل به `chunks.json` روی VPS:** درست می‌گویید، بدون Git هم ممکن است (پاسخ کامل در بخش بعد). جدول **`knowledge_revisions`** اضافه شد تا بدون Git ردپا و کپی پشتیبان هر نسخه از فایل را داشته باشید.
3. **ادمین‌ها:** رمزهای scrypt قدیمی قابل انتقال نیستند، پس `create-admin.js` با `--generate` رمز موقت تصادفی می‌سازد، فقط هش Argon2id را ذخیره می‌کند و ادمین را با `must_change_password=1` می‌سازد. من حساب واقعی نساختم چون ایمیل‌ها و رمزهای شما را ندارم؛ اسکریپت را دو بار (مدیر کل و ادمین) اجرا کنید.
4. **وقت تهران:** همهٔ زمان‌ها و «روز آماری» به وقت تهران (+03:30) است. `CURDATE()` در جدول‌های روزانه و `NOW()` در تایم‌استمپ‌ها همان را می‌دهد. هشدار: `lib/report.js` فعلاً روز را **UTC** می‌نویسد (`toISOString`)؛ وقتی آن را به MySQL وصل کردید از `CURDATE()` استفاده کنید، وگرنه مرز روز ۳٫۵ ساعت جابه‌جا می‌شود. یک نکتهٔ طراحی: ذخیره به وقت محلی یعنی اگر منطقهٔ زمانی سرور عوض شود داده‌های قدیم و جدید ناهمخوان می‌شوند؛ برای همین `sp_assert_time_zone` را اضافه کردم.
5. **نگهداری Lead: ۳۰ روز** (`leads.retention_days`، قابل تغییر از پنل). تست شده است که مقدار از تنظیمات خوانده می‌شود.

## آیا می‌شود پنل را روی VPS مستقیم به `chunks.json` وصل کرد؟

بله، اشتباه نمی‌کنید. روی VPS پروسهٔ Node (`server.js` زیر pm2) به فایل‌سیستم دسترسی دارد و `lib/knowledge.js` فایل را از `process.cwd()/knowledge/chunks.json` می‌خواند. نکته‌هایی که باید رعایت شود:

- **کش در هر پروسه:** `load()` فایل را یک‌بار می‌خواند و نگه می‌دارد، و `deploy/ecosystem.config.js` در حالت `cluster` با `instances: 'max'` چند پروسه می‌سازد. بعد از نوشتن فایل باید همهٔ Workerها reload شوند (مثلاً `pm2 reload chatbot` از خود API پنل، یا بررسی `mtime` فایل در `load()`)، وگرنه بعضی درخواست‌ها هنوز دانش قدیمی را می‌بینند.
- **نوشتن اتمیک:** اول در فایل موقت در همان پوشه بنویسید، `JSON.parse` و اعتبارسنجی کنید (شناسه‌های یکتا، نوع‌های مجاز)، بعد با `rename` جایگزین کنید. نوشتن مستقیم روی فایل زنده با کرش وسط کار، دانش را خراب می‌کند.
- **قفل هم‌زمانی:** دو ادمین هم‌زمان نباید روی هم بنویسند؛ نسخهٔ فعلی (sha256) را در درخواست بفرستید و اگر عوض شده بود رد کنید.
- **بدون Git، تاریخچه ندارید:** قبل از هر نوشتن، کپی کامل فایل را ذخیره کنید و ردیف `knowledge_revisions` بنویسید (هش، تعداد تکه، مسیر کپی، چه کسی، خلاصهٔ تغییر) و `knowledge.update` را در ممیزی ثبت کنید. بدون این، اشتباه یک ادمین قابل بازگشت نیست.
- **مجوز فایل:** کاربر سرویس باید روی پوشهٔ `knowledge/` دسترسی نوشتن داشته باشد.
- **همگام‌سازی Vector:** نوشتن فایل Upstash Vector را عوض نمی‌کند؛ بعدش باید همان منطق `scripts/ingest.js` اجرا شود (ایدمپوتنت است و فقط تکه‌های تغییرکرده را می‌فرستد). قبلش یک `vector_snapshots` بگیرید.
- **اثر جانبی خوب:** نسخهٔ حافظهٔ یادگیری از هش فایل ساخته می‌شود، پس هر تغییر دانش، پاسخ‌های یادگرفته‌شدهٔ قدیمی را خودکار باطل می‌کند.

**من این بخش (APIهای پنل و نوشتن فایل) را پیاده‌سازی نکرده‌ام**؛ فقط جدول‌ها و مجوزها (`knowledge.edit/publish`) آماده‌اند.

## نگاشت به جدول‌های شما

| نیاز شما | جدول‌ها |
|---|---|
| کاربران پنل | `admin_users` (نام کاربری، ایمیل، `password_hash`، `status` فعال/قفل، `last_login_at`، `must_change_password`) |
| نقش و دسترسی | `roles`، `permissions`، `role_permissions`، `admin_user_roles`، نمای `v_admin_effective_permissions` |
| نشست و توکن | `admin_sessions` (هش، انقضا، دستگاه/UA، ابطال تکی)، `admin_api_tokens` |
| لاگ ممیزی | `audit_logs` + `audit_actions` (فهرست کنترل‌شدهٔ رویدادها) |
| تیکت‌ها | `tickets`، `ticket_messages`، `ticket_notes` (داخلی)، `ticket_attachments` (فقط متادیتا) |
| درخواست تماس | `leads` (وضعیت پیگیری، `scheduled_delete_at`) |
| بک‌آپ Vector | `vector_snapshots`، `vector_restores` |
| بازخورد | `feedback` |
| گزارش تجمیعی | `daily_source_stats`، `daily_token_usage`، `daily_error_stats`، `daily_counters`، `answer_sources` |
| فهرست درخواست‌های چت | `chat_requests` (بدون متن) |
| نسخه‌های دانش | `knowledge_revisions` |
| تنظیمات | `settings` + `setting_versions` |
| کاربران نهایی | `end_users` + `end_user_consents` |
| فنی | `schema_meta` (نسخهٔ اسکیما و منطقهٔ زمانی) |

```mermaid
erDiagram
  admin_users ||--o{ admin_user_roles : has
  roles ||--o{ admin_user_roles : grants
  roles ||--o{ role_permissions : has
  permissions ||--o{ role_permissions : in
  admin_users ||--o{ admin_sessions : opens
  admin_users ||--o{ admin_api_tokens : owns
  admin_users ||--o{ audit_logs : acts
  audit_actions ||--o{ audit_logs : types
  end_users ||--o{ end_user_consents : gives
  end_users ||--o{ leads : submits
  leads ||--o| tickets : becomes
  admin_users ||--o{ tickets : assigned
  tickets ||--o{ ticket_messages : has
  tickets ||--o{ ticket_notes : has
  tickets ||--o{ ticket_attachments : has
  vector_snapshots ||--o{ vector_restores : restored_by
  admin_users ||--o{ knowledge_revisions : edits
  settings ||--o{ setting_versions : versions
  answer_sources ||--o{ daily_source_stats : counted_in
  answer_sources ||--o{ chat_requests : source_of
```

## تصمیم‌های امنیتی که در خود دیتابیس اعمال شده (همه تست شده‌اند)

- **رمز:** قید `CHECK` فقط `$argon2id$` یا bcrypt (`$2a/$2b/$2y$`) را می‌پذیرد؛ رمز خام یا هش scrypt قدیمی وارد نمی‌شود. ایمیل باید lowercase باشد.
- **نشست و توکن:** فقط `BINARY(32)` از SHA-256. در Node: `crypto.createHash('sha256').update(token).digest()` را مستقیم به `mysql2` بدهید.
- **فقط‌افزودنی (دو لایه):** تریگر `UPDATE/DELETE` را روی `audit_logs`، `setting_versions` و `end_user_consents` رد می‌کند؛ و کاربر برنامه اصلاً `UPDATE/DELETE/DROP/TRUNCATE/TRIGGER` ندارد. حذف ادمین‌ای که لاگ دارد با `FK RESTRICT` ممکن نیست؛ به‌جایش `status='locked'`.
- **`event_hash`:** تریگر برای هر ردیف ممیزی SHA-256 محتوا می‌سازد (ستون «هش رویداد» پنل). نشانهٔ سلامت است، نه مدرک ضدجعل؛ دارندهٔ دسترسی root می‌تواند دور بزند.
- **شماره تماس:** رمزنگاری در برنامه با AES-256-GCM (`phone_enc` به‌صورت `iv|tag|cipher`، کلید در Environment) + `phone_hmac` (جست‌وجو/تکراری) + `phone_masked` (نمایش). دیدن شمارهٔ کامل نیازمند `leads.view_phone` است و باید `lead.view_phone` ثبت شود. **این رمزنگاری کد برنامه می‌خواهد که هنوز نوشته نشده.**
- **تنظیمات:** `sp_set_setting` نوع و بازه را اعتبارسنجی می‌کند، نسخهٔ جدید در `setting_versions` می‌نویسد و `settings.update` را در ممیزی ثبت می‌کند. کاربر برنامه فقط `EXECUTE` دارد، نه `UPDATE`.
- **حذف زمان‌بندی‌شده:** اگر برنامه `scheduled_delete_at` ندهد، تریگر آن را از `leads.retention_days` پر می‌کند. رویداد ساعتی `ev_purge_expired_leads` ردیف‌های سررسیده را پاک و `lead.purge` ثبت می‌کند؛ `ev_purge_old_chat_requests` روزانه و `ev_purge_old_sessions` نشست‌های منقضی‌شدهٔ بیش از ۳۰ روز را پاک می‌کند.

## الگوهای استفاده

```js
// گزارش روزانه (جایگزین HINCRBY rep:day) — CURDATE() = روز تهران
await db.execute(
  `INSERT INTO daily_source_stats (stat_date, source, request_count) VALUES (CURDATE(), ?, 1)
   ON DUPLICATE KEY UPDATE request_count = request_count + 1`, [source]);

// مصرف توکن بعد از هر فراخوانی مدل
await db.execute(
  `INSERT INTO daily_token_usage (stat_date, provider, model, call_count, input_tokens, output_tokens)
   VALUES (CURDATE(), ?, ?, 1, ?, ?)
   ON DUPLICATE KEY UPDATE call_count = call_count + 1,
     input_tokens = input_tokens + VALUES(input_tokens), output_tokens = output_tokens + VALUES(output_tokens)`,
  [provider, model, usage.prompt_tokens, usage.completion_tokens]);

// تغییر تنظیم (مقدار JSON است)
await db.execute('CALL sp_set_setting(?, CAST(? AS JSON), ?, ?, ?)', ['llm.max_tokens', '900', adminId, 'افزایش سقف', ipHash]);

// نشست معتبر
// SELECT ... FROM admin_sessions WHERE session_hash = ? AND revoked_at IS NULL AND expires_at > NOW(3)
```

## چیزهایی که عمداً در دیتابیس نیست

`ICP_API_KEY`، `CHAT_SIGNING_SECRET`، توکن Upstash و Transcribe ← Environment/Secret Manager · توکن خام نشست/API ← فقط هش · شمارهٔ ملی/کارت/هویت ← اصلاً جمع نشود · شمارندهٔ Rate limit ← Redis با TTL · حافظهٔ یادگیری و کش معنایی ← Redis/Vector · لاگ خام درخواست و خطا ← سیستم لاگ · پرامپت و کد ← Git · دانش و داده‌های Vector ← `knowledge/chunks.json`.

## نکته‌های باقی‌مانده

- **پنل هنوز به این دیتابیس وصل نیست.** APIهای واقعی (ادمین‌ها، تیکت‌ها، Lead، گزارش‌ها، تنظیمات، نوشتن `chunks.json`) باید نوشته شوند؛ من فقط زیربنا را ساختم و تست کردم.
- **نام نقش‌ها:** مدیر کل = `super_admin`، مشاور = `counselor` (همان Support نمونهٔ پنل)، ویرایشگر دانش = `knowledge_editor` (Knowledge Manager)، فقط‌خواندنی = `read_only` (Analyst)، به‌علاوهٔ `admin` که همان نقش Admin فعلی کد است.
- **متن سؤال در Lead** (`question`، تا ۳۰۰ نویسه) ممکن است داده‌ی شخصی داشته باشد؛ در فرم رضایت ذکرش کنید.
- **`lib/kv-mysql.js`** جدول‌های `kv_*` خودش را می‌سازد و با این اسکیما تداخل ندارد.
