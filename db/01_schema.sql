-- =====================================================================
--  Nooka (chat-bot-azad) — دیتابیس MySQL پنل ادمین
--  هدف: MySQL 8.0.19+  (تست‌شده روی 8.0.46) — روی MariaDB اجرا نکنید.
--  اجرا:  mysql --default-character-set=utf8mb4 -u root -p < 01_schema.sql
--  حتماً با کلاینت mysql اجرا شود (دستور DELIMITER را کتابخانه‌ی mysql2 نمی‌فهمد).
--  پیش‌نیاز my.cnf:  default-time-zone='+03:30'  و  event_scheduler=ON
--  همهٔ زمان‌ها و «روز آماری» به وقت تهران (+03:30) ذخیره می‌شوند. ایران از ۱۴۰۱ ساعت تابستانی
--  ندارد، پس آفست ثابت است. در mysql2 هم  timezone: '+03:30'  بگذارید.
--  بعد از اجرا، CALL sp_assert_time_zone();  را در شروع برنامه/تست صدا بزنید.
-- =====================================================================

SET NAMES utf8mb4;
SET time_zone = '+03:30';

CREATE DATABASE IF NOT EXISTS nooka
  DEFAULT CHARACTER SET utf8mb4 DEFAULT COLLATE utf8mb4_0900_ai_ci;
USE nooka;

-- =====================================================================
-- ۱) کاربران پنل ادمین، نقش‌ها و دسترسی‌ها
--    جایگزین ADMIN_TOKEN مشترک و حساب‌های NOOKA_*_EMAIL در Environment
-- =====================================================================

CREATE TABLE IF NOT EXISTS admin_users (
  id                   BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  username             VARCHAR(40)  NOT NULL,
  email                VARCHAR(254) NOT NULL,
  display_name         VARCHAR(80)  NULL,
  -- فقط رشتهٔ PHC از Argon2id یا bcrypt؛ رمز خام/scrypt قدیمی پذیرفته نمی‌شود
  password_hash        VARCHAR(255) NOT NULL,
  password_changed_at  DATETIME(3)  NULL,
  must_change_password TINYINT(1)   NOT NULL DEFAULT 1,
  status               ENUM('active','locked') NOT NULL DEFAULT 'active',
  locked_reason        VARCHAR(200) NULL,
  locked_at            DATETIME(3)  NULL,
  locked_until         DATETIME(3)  NULL COMMENT 'قفل خودکار موقت بعد از تلاش ناموفق؛ NULL = تا رفع دستی',
  failed_login_count   SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  last_login_at        DATETIME(3)  NULL,
  last_login_ip_hash   VARCHAR(64)  NULL,
  created_by           BIGINT UNSIGNED NULL,
  created_at           DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at           DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_admin_users_username (username),
  UNIQUE KEY uq_admin_users_email (email),
  KEY ix_admin_users_status (status),
  CONSTRAINT fk_admin_users_created_by FOREIGN KEY (created_by) REFERENCES admin_users (id) ON DELETE SET NULL,
  CONSTRAINT ck_admin_username CHECK (REGEXP_LIKE(username, '^[a-z0-9_.-]{3,40}$', 'c')),
  CONSTRAINT ck_admin_email_lower CHECK ((email COLLATE utf8mb4_bin) = (LOWER(email) COLLATE utf8mb4_bin)),
  CONSTRAINT ck_admin_pw_algo CHECK (REGEXP_LIKE(password_hash, '^\\$(argon2id|2[aby])\\$', 'c'))
) ENGINE=InnoDB COMMENT='کاربران پنل ادمین — حذف فیزیکی ممنوع (FK لاگ ممیزی)، فقط status=locked';

CREATE TABLE IF NOT EXISTS roles (
  id          SMALLINT UNSIGNED NOT NULL AUTO_INCREMENT,
  code        VARCHAR(40)  NOT NULL,
  name_fa     VARCHAR(60)  NOT NULL,
  description VARCHAR(300) NULL,
  is_system   TINYINT(1)   NOT NULL DEFAULT 0 COMMENT '۱ = نقش پایه؛ از پنل قابل حذف نباشد',
  created_at  DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_roles_code (code)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS permissions (
  id           SMALLINT UNSIGNED NOT NULL AUTO_INCREMENT,
  code         VARCHAR(64)  NOT NULL,
  category     VARCHAR(30)  NOT NULL,
  description  VARCHAR(200) NOT NULL,
  is_sensitive TINYINT(1)   NOT NULL DEFAULT 0 COMMENT '۱ = استفاده‌اش باید در audit_logs ثبت شود',
  PRIMARY KEY (id),
  UNIQUE KEY uq_permissions_code (code),
  KEY ix_permissions_category (category)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS role_permissions (
  role_id       SMALLINT UNSIGNED NOT NULL,
  permission_id SMALLINT UNSIGNED NOT NULL,
  PRIMARY KEY (role_id, permission_id),
  CONSTRAINT fk_rp_role FOREIGN KEY (role_id) REFERENCES roles (id) ON DELETE CASCADE,
  CONSTRAINT fk_rp_perm FOREIGN KEY (permission_id) REFERENCES permissions (id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS admin_user_roles (
  admin_user_id BIGINT UNSIGNED   NOT NULL,
  role_id       SMALLINT UNSIGNED NOT NULL,
  granted_by    BIGINT UNSIGNED   NULL,
  granted_at    DATETIME(3)       NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (admin_user_id, role_id),
  KEY ix_aur_role (role_id),
  CONSTRAINT fk_aur_user    FOREIGN KEY (admin_user_id) REFERENCES admin_users (id) ON DELETE CASCADE,
  CONSTRAINT fk_aur_role    FOREIGN KEY (role_id)       REFERENCES roles (id)       ON DELETE RESTRICT,
  CONSTRAINT fk_aur_granter FOREIGN KEY (granted_by)    REFERENCES admin_users (id) ON DELETE SET NULL
) ENGINE=InnoDB;

-- =====================================================================
-- ۲) نشست‌ها و توکن‌های API شخصی — فقط هش (SHA-256 خام، ۳۲ بایت)
--    در Node:  crypto.createHash('sha256').update(token).digest()  ← Buffer مستقیم به mysql2
-- =====================================================================

CREATE TABLE IF NOT EXISTS admin_sessions (
  id             BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  admin_user_id  BIGINT UNSIGNED NOT NULL,
  session_hash   BINARY(32)      NOT NULL,
  created_at     DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  last_seen_at   DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  expires_at     DATETIME(3)     NOT NULL,
  ip_hash        VARCHAR(64)     NULL,
  user_agent     VARCHAR(255)    NULL,
  device_label   VARCHAR(80)     NULL COMMENT 'مثلاً «Chrome روی Windows» برای نمایش در فهرست نشست‌ها',
  revoked_at     DATETIME(3)     NULL,
  revoked_by     BIGINT UNSIGNED NULL,
  revoke_reason  VARCHAR(100)    NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_admin_sessions_hash (session_hash),
  KEY ix_admin_sessions_user (admin_user_id, revoked_at, expires_at),
  KEY ix_admin_sessions_expires (expires_at),
  CONSTRAINT fk_sess_user   FOREIGN KEY (admin_user_id) REFERENCES admin_users (id) ON DELETE CASCADE,
  CONSTRAINT fk_sess_revoker FOREIGN KEY (revoked_by)   REFERENCES admin_users (id) ON DELETE SET NULL
) ENGINE=InnoDB COMMENT='نشست معتبر = revoked_at IS NULL AND expires_at > CURRENT_TIMESTAMP(3)';

CREATE TABLE IF NOT EXISTS admin_api_tokens (
  id               BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  admin_user_id    BIGINT UNSIGNED NOT NULL,
  name             VARCHAR(80)     NOT NULL,
  token_hash       BINARY(32)      NOT NULL,
  token_hint       CHAR(4)         NULL COMMENT '۴ نویسهٔ آخر توکن، فقط برای شناسایی در فهرست',
  scopes           JSON            NULL COMMENT 'آرایهٔ کد دسترسی‌ها؛ NULL = همهٔ دسترسی‌های صاحب توکن',
  created_at       DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  expires_at       DATETIME(3)     NULL,
  last_used_at     DATETIME(3)     NULL,
  last_used_ip_hash VARCHAR(64)    NULL,
  revoked_at       DATETIME(3)     NULL,
  revoked_by       BIGINT UNSIGNED NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_api_tokens_hash (token_hash),
  KEY ix_api_tokens_user (admin_user_id, revoked_at),
  CONSTRAINT fk_tok_user    FOREIGN KEY (admin_user_id) REFERENCES admin_users (id) ON DELETE CASCADE,
  CONSTRAINT fk_tok_revoker FOREIGN KEY (revoked_by)    REFERENCES admin_users (id) ON DELETE SET NULL,
  CONSTRAINT ck_tok_scopes  CHECK (scopes IS NULL OR JSON_TYPE(scopes) = 'ARRAY')
) ENGINE=InnoDB COMMENT='ابطال تکی با revoked_at؛ مقدار خام توکن هیچ‌جا ذخیره نمی‌شود';

-- =====================================================================
-- ۳) لاگ ممیزی (Audit) — فقط‌افزودنی
--    لایه ۱: تریگرها UPDATE/DELETE را رد می‌کنند.
--    لایه ۲: کاربر برنامه فقط INSERT/SELECT دارد (02_grants.sql) و DROP/TRUNCATE ندارد.
--    حریم خصوصی: IP فقط هش؛ شماره تماس/متن پرسش هرگز در details نوشته نشود.
-- =====================================================================

CREATE TABLE IF NOT EXISTS audit_actions (
  code         VARCHAR(64)  NOT NULL,
  category     VARCHAR(30)  NOT NULL,
  description  VARCHAR(200) NOT NULL,
  is_sensitive TINYINT(1)   NOT NULL DEFAULT 0,
  PRIMARY KEY (code),
  KEY ix_audit_actions_cat (category)
) ENGINE=InnoDB COMMENT='فهرست کنترل‌شدهٔ رویدادها (برای فیلتر پنل: ورود/خروج، تغییر دانش، ...)';

CREATE TABLE IF NOT EXISTS audit_logs (
  id                        BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  occurred_at               DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  actor_admin_id            BIGINT UNSIGNED NULL COMMENT 'NULL = سیستم یا ورود ناموفق با ایمیل ناشناس',
  actor_label               VARCHAR(80)  NULL COMMENT 'نسخهٔ لحظه‌ای username یا system',
  attempted_identifier_hash VARCHAR(64)  NULL COMMENT 'هش ایمیل/نام کاربری در ورود ناموفق',
  action_code               VARCHAR(64)  NOT NULL,
  outcome                   ENUM('success','failure','denied') NOT NULL DEFAULT 'success',
  target_type               VARCHAR(40)  NULL,
  target_id                 VARCHAR(64)  NULL,
  session_id                BIGINT UNSIGNED NULL COMMENT 'عمداً بدون FK تا لاگ به نشست وابسته نشود',
  ip_hash                   VARCHAR(64)  NULL,
  user_agent                VARCHAR(255) NULL,
  details                   JSON         NULL COMMENT 'متادیتای غیرحساس (شناسه‌ها، تعداد‌ها)',
  event_hash                BINARY(32)   NOT NULL COMMENT 'SHA-256 محتوای ردیف؛ توسط تریگر پر می‌شود (نشانهٔ سلامت، نه مدرک ضدجعل)',
  PRIMARY KEY (id),
  KEY ix_audit_time (occurred_at),
  KEY ix_audit_actor (actor_admin_id, occurred_at),
  KEY ix_audit_action (action_code, occurred_at),
  KEY ix_audit_target (target_type, target_id),
  CONSTRAINT fk_audit_actor  FOREIGN KEY (actor_admin_id) REFERENCES admin_users (id) ON DELETE RESTRICT,
  CONSTRAINT fk_audit_action FOREIGN KEY (action_code)    REFERENCES audit_actions (code) ON DELETE RESTRICT
) ENGINE=InnoDB COMMENT='فقط‌افزودنی — تغییر/حذف با تریگر و دسترسی کاربر مسدود است';

-- =====================================================================
-- ۴) حساب کاربران نهایی (بعد از افزودن لاگین چت‌بات)
--    الان: Redis کلید chat:users با scrypt. بعداً: این جدول با Argon2id/bcrypt.
-- =====================================================================

CREATE TABLE IF NOT EXISTS end_users (
  id              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  username        VARCHAR(30)  NULL,
  email           VARCHAR(254) NULL,
  phone_hmac      BINARY(32)   NULL COMMENT 'HMAC-SHA256(شماره نرمال‌شده، PHONE_PEPPER) برای ورود/یکتایی',
  phone_enc       VARBINARY(128) NULL COMMENT 'AES-256-GCM در برنامه: iv(12)|tag(16)|cipher',
  phone_masked    VARCHAR(16)  NULL COMMENT 'مثلاً 0912***4567',
  password_hash   VARCHAR(255) NOT NULL,
  email_verified_at DATETIME(3) NULL,
  phone_verified_at DATETIME(3) NULL,
  status          ENUM('active','locked','deleted') NOT NULL DEFAULT 'active',
  last_login_at   DATETIME(3)  NULL,
  created_at      DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at      DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_end_users_username (username),
  UNIQUE KEY uq_end_users_email (email),
  UNIQUE KEY uq_end_users_phone (phone_hmac),
  CONSTRAINT ck_eu_contact CHECK (email IS NOT NULL OR phone_hmac IS NOT NULL),
  CONSTRAINT ck_eu_email_lower CHECK (email IS NULL OR (email COLLATE utf8mb4_bin) = (LOWER(email) COLLATE utf8mb4_bin)),
  CONSTRAINT ck_eu_pw_algo CHECK (REGEXP_LIKE(password_hash, '^\\$(argon2id|2[aby])\\$', 'c'))
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS end_user_consents (
  id               BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  end_user_id      BIGINT UNSIGNED NOT NULL,
  consent_type     VARCHAR(40) NOT NULL COMMENT 'terms | privacy | callback | marketing ...',
  document_version VARCHAR(20) NOT NULL,
  granted          TINYINT(1)  NOT NULL,
  recorded_at      DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  source           VARCHAR(30) NULL COMMENT 'register | settings | lead_form',
  ip_hash          VARCHAR(64) NULL,
  PRIMARY KEY (id),
  KEY ix_euc_user_type (end_user_id, consent_type, id),
  CONSTRAINT fk_euc_user FOREIGN KEY (end_user_id) REFERENCES end_users (id) ON DELETE CASCADE
) ENGINE=InnoDB COMMENT='هر اعطا/لغو رضایت یک ردیف جدید است (تاریخچه)؛ وضعیت فعلی = آخرین ردیف هر نوع';

-- =====================================================================
-- ۵) درخواست‌های تماس (Lead) — جایگزین لیست Redis «leads» (بدون TTL)
--    شماره: رمزنگاری در برنامه (AES-256-GCM) + HMAC برای جست‌وجو/تکراری + نسخهٔ ماسک‌شده
--    حذف زمان‌بندی‌شده: scheduled_delete_at + رویداد ev_purge_expired_leads
-- =====================================================================

CREATE TABLE IF NOT EXISTS leads (
  id                  BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  lead_code           VARCHAR(16)  NOT NULL COMMENT 'شناسهٔ کوتاه قابل نمایش (همان id هشت‌حرفی فعلی)',
  created_at          DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  user_type           ENUM('guest','registered') NOT NULL DEFAULT 'guest',
  end_user_id         BIGINT UNSIGNED NULL,
  name                VARCHAR(60)  NULL,
  phone_enc           VARBINARY(128) NOT NULL,
  phone_hmac          BINARY(32)   NOT NULL,
  phone_masked        VARCHAR(16)  NOT NULL,
  major               VARCHAR(80)  NULL,
  question            VARCHAR(300) NULL COMMENT 'آخرین پرسش بی‌پاسخ — ممکن است داده شخصی داشته باشد',
  lang                VARCHAR(4)   NULL,
  consent_given       TINYINT(1)   NOT NULL,
  consent_text_version VARCHAR(20) NULL,
  consent_at          DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  follow_up_status    ENUM('new','contacted','no_answer','callback_scheduled','done','not_interested','invalid_number')
                      NOT NULL DEFAULT 'new',
  follow_up_note      VARCHAR(500) NULL,
  assigned_admin_id   BIGINT UNSIGNED NULL,
  contacted_at        DATETIME(3)  NULL,
  status_updated_at   DATETIME(3)  NULL,
  status_updated_by   BIGINT UNSIGNED NULL,
  scheduled_delete_at DATETIME(3)  NULL COMMENT 'اگر برنامه ندهد، تریگر از settings: leads.retention_days پر می‌کند؛ پس از درج هرگز NULL نیست',
  ip_hash             VARCHAR(64)  NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_leads_code (lead_code),
  KEY ix_leads_status (follow_up_status, created_at),
  KEY ix_leads_delete (scheduled_delete_at),
  KEY ix_leads_phone (phone_hmac),
  KEY ix_leads_assignee (assigned_admin_id, follow_up_status),
  CONSTRAINT fk_leads_end_user FOREIGN KEY (end_user_id)       REFERENCES end_users (id)   ON DELETE SET NULL,
  CONSTRAINT fk_leads_assignee FOREIGN KEY (assigned_admin_id) REFERENCES admin_users (id) ON DELETE SET NULL,
  CONSTRAINT fk_leads_status_by FOREIGN KEY (status_updated_by) REFERENCES admin_users (id) ON DELETE SET NULL,
  CONSTRAINT ck_leads_consent CHECK (consent_given = 1),
  CONSTRAINT ck_leads_delete_set CHECK (scheduled_delete_at IS NOT NULL)
) ENGINE=InnoDB COMMENT='بدون رضایت ثبت نمی‌شود (مثل api/lead.js)';

-- =====================================================================
-- ۶) تیکت‌های پشتیبانی (هستهٔ پنل)
-- =====================================================================

CREATE TABLE IF NOT EXISTS tickets (
  id                BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  ticket_code       VARCHAR(16)  NOT NULL,
  subject           VARCHAR(200) NOT NULL,
  status            ENUM('new','open','waiting_requester','resolved','closed') NOT NULL DEFAULT 'new',
  priority          ENUM('low','normal','high','urgent') NOT NULL DEFAULT 'normal',
  source            ENUM('lead','chat','manual','end_user') NOT NULL DEFAULT 'manual',
  category          VARCHAR(60)  NULL,
  requester_type    ENUM('guest','registered') NOT NULL DEFAULT 'guest',
  requester_name    VARCHAR(80)  NULL,
  end_user_id       BIGINT UNSIGNED NULL,
  lead_id           BIGINT UNSIGNED NULL,
  assigned_admin_id BIGINT UNSIGNED NULL,
  created_by_admin_id BIGINT UNSIGNED NULL,
  due_at            DATETIME(3)  NULL,
  first_response_at DATETIME(3)  NULL,
  resolved_at       DATETIME(3)  NULL,
  closed_at         DATETIME(3)  NULL,
  last_activity_at  DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  created_at        DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at        DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_tickets_code (ticket_code),
  UNIQUE KEY uq_tickets_lead (lead_id),
  KEY ix_tickets_queue (status, priority, last_activity_at),
  KEY ix_tickets_assignee (assigned_admin_id, status),
  KEY ix_tickets_end_user (end_user_id),
  CONSTRAINT fk_tickets_assignee FOREIGN KEY (assigned_admin_id)   REFERENCES admin_users (id) ON DELETE SET NULL,
  CONSTRAINT fk_tickets_creator  FOREIGN KEY (created_by_admin_id) REFERENCES admin_users (id) ON DELETE SET NULL,
  CONSTRAINT fk_tickets_end_user FOREIGN KEY (end_user_id)         REFERENCES end_users (id)   ON DELETE SET NULL,
  CONSTRAINT fk_tickets_lead     FOREIGN KEY (lead_id)             REFERENCES leads (id)       ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS ticket_messages (
  id              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  ticket_id       BIGINT UNSIGNED NOT NULL,
  sender_type     ENUM('requester','staff','system') NOT NULL,
  sender_admin_id BIGINT UNSIGNED NULL,
  body            TEXT NOT NULL,
  created_at      DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY ix_tm_ticket (ticket_id, id),
  CONSTRAINT fk_tm_ticket FOREIGN KEY (ticket_id)       REFERENCES tickets (id)     ON DELETE CASCADE,
  CONSTRAINT fk_tm_admin  FOREIGN KEY (sender_admin_id) REFERENCES admin_users (id) ON DELETE RESTRICT,
  CONSTRAINT ck_tm_sender CHECK (sender_type <> 'staff' OR sender_admin_id IS NOT NULL)
) ENGINE=InnoDB COMMENT='پیام‌های قابل‌دیدن برای درخواست‌دهنده';

CREATE TABLE IF NOT EXISTS ticket_notes (
  id              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  ticket_id       BIGINT UNSIGNED NOT NULL,
  author_admin_id BIGINT UNSIGNED NOT NULL,
  body            TEXT NOT NULL,
  created_at      DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at      DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY ix_tn_ticket (ticket_id, id),
  CONSTRAINT fk_tn_ticket FOREIGN KEY (ticket_id)       REFERENCES tickets (id)     ON DELETE CASCADE,
  CONSTRAINT fk_tn_author FOREIGN KEY (author_admin_id) REFERENCES admin_users (id) ON DELETE RESTRICT
) ENGINE=InnoDB COMMENT='یادداشت داخلی — جدا از پیام‌ها تا هرگز به درخواست‌دهنده نشت نکند';

CREATE TABLE IF NOT EXISTS ticket_attachments (
  id               BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  ticket_id        BIGINT UNSIGNED NOT NULL,
  message_id       BIGINT UNSIGNED NULL,
  note_id          BIGINT UNSIGNED NULL,
  original_filename VARCHAR(255) NOT NULL,
  mime_type        VARCHAR(100)  NOT NULL,
  size_bytes       BIGINT UNSIGNED NOT NULL,
  sha256           BINARY(32)    NOT NULL,
  storage_path     VARCHAR(500)  NOT NULL COMMENT 'مسیر نسبی/کلید شیء؛ خود فایل در دیتابیس نیست',
  scan_status      ENUM('pending','clean','infected','skipped') NOT NULL DEFAULT 'pending',
  uploaded_by_admin_id BIGINT UNSIGNED NULL,
  created_at       DATETIME(3)   NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  deleted_at       DATETIME(3)   NULL,
  PRIMARY KEY (id),
  KEY ix_ta_ticket (ticket_id),
  KEY ix_ta_sha (sha256),
  CONSTRAINT fk_ta_ticket  FOREIGN KEY (ticket_id)  REFERENCES tickets (id)         ON DELETE CASCADE,
  CONSTRAINT fk_ta_message FOREIGN KEY (message_id) REFERENCES ticket_messages (id) ON DELETE CASCADE,
  CONSTRAINT fk_ta_note    FOREIGN KEY (note_id)    REFERENCES ticket_notes (id)    ON DELETE CASCADE,
  CONSTRAINT fk_ta_admin   FOREIGN KEY (uploaded_by_admin_id) REFERENCES admin_users (id) ON DELETE SET NULL,
  CONSTRAINT ck_ta_one_parent CHECK (message_id IS NULL OR note_id IS NULL)
) ENGINE=InnoDB COMMENT='فقط متادیتا؛ پس از حذف تیکت، فایل‌های storage_path را هم در برنامه پاک کنید';

-- =====================================================================
-- ۷) بک‌آپ Vector (Upstash) — رکورد هر اسنپ‌شات
--    منبع اصلی دانش همچنان knowledge/chunks.json در Git است؛ اینجا فقط ردیابی بک‌آپ‌هاست.
-- =====================================================================

CREATE TABLE IF NOT EXISTS vector_snapshots (
  id                  BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  snapshot_code       VARCHAR(40)  NOT NULL COMMENT 'مثلاً 20261113T101500Z',
  status              ENUM('pending','running','completed','failed','deleted') NOT NULL DEFAULT 'pending',
  trigger_type        ENUM('manual','scheduled','pre_ingest','ci') NOT NULL DEFAULT 'manual',
  knowledge_version   VARCHAR(64)  NOT NULL COMMENT 'SHA-256 هگز chunks.json در لحظهٔ بک‌آپ (= knowledge_revisions.content_sha256)',
  namespace           VARCHAR(80)  NOT NULL DEFAULT '' COMMENT 'config.search.vectorNamespace',
  vector_count        INT UNSIGNED NULL,
  size_bytes          BIGINT UNSIGNED NULL,
  content_sha256      BINARY(32)   NULL,
  file_path           VARCHAR(500) NULL,
  error_message       VARCHAR(500) NULL,
  note                VARCHAR(300) NULL,
  created_by_admin_id BIGINT UNSIGNED NULL,
  created_at          DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  started_at          DATETIME(3)  NULL,
  completed_at        DATETIME(3)  NULL,
  deleted_at          DATETIME(3)  NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_vs_code (snapshot_code),
  KEY ix_vs_list (status, created_at),
  KEY ix_vs_version (knowledge_version),
  CONSTRAINT fk_vs_admin FOREIGN KEY (created_by_admin_id) REFERENCES admin_users (id) ON DELETE SET NULL,
  CONSTRAINT ck_vs_done CHECK (status <> 'completed' OR (vector_count IS NOT NULL AND content_sha256 IS NOT NULL AND file_path IS NOT NULL))
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS vector_restores (
  id                    BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  snapshot_id           BIGINT UNSIGNED NOT NULL,
  status                ENUM('pending','running','completed','failed') NOT NULL DEFAULT 'pending',
  requested_by_admin_id BIGINT UNSIGNED NULL,
  vectors_restored      INT UNSIGNED NULL,
  error_message         VARCHAR(500) NULL,
  created_at            DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  started_at            DATETIME(3)  NULL,
  finished_at           DATETIME(3)  NULL,
  PRIMARY KEY (id),
  KEY ix_vr_snapshot (snapshot_id, created_at),
  CONSTRAINT fk_vr_snapshot FOREIGN KEY (snapshot_id) REFERENCES vector_snapshots (id) ON DELETE RESTRICT,
  CONSTRAINT fk_vr_admin    FOREIGN KEY (requested_by_admin_id) REFERENCES admin_users (id) ON DELETE SET NULL
) ENGINE=InnoDB COMMENT='ثبت هر بازیابی؛ اجرای واقعی با اسکریپت/برنامه است';

-- =====================================================================
-- ۸) بازخورد کاربران (👍/👎) — الان فقط شمارنده در Redis
-- =====================================================================

CREATE TABLE IF NOT EXISTS feedback (
  id                BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  created_at        DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  vote              ENUM('up','down') NOT NULL,
  answer_key        CHAR(16)    NOT NULL COMMENT 'کلید پاسخ (همان cid امضاشده؛ sha1 اول ۱۶ هگز)',
  knowledge_version VARCHAR(64) NULL,
  reason            VARCHAR(500) NULL,
  voter_hash        VARCHAR(64) NOT NULL COMMENT 'HMAC آی‌پی؛ برای شمارش کاربر مستقل',
  reviewed_by       BIGINT UNSIGNED NULL,
  reviewed_at       DATETIME(3) NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_feedback_voter (answer_key, voter_hash),
  KEY ix_feedback_vote (vote, created_at),
  KEY ix_feedback_unreviewed (reviewed_at, vote),
  CONSTRAINT fk_feedback_reviewer FOREIGN KEY (reviewed_by) REFERENCES admin_users (id) ON DELETE SET NULL,
  CONSTRAINT ck_feedback_key CHECK (REGEXP_LIKE(answer_key, '^[a-f0-9]{16}$'))
) ENGINE=InnoDB COMMENT='یک رأی برای هر (پاسخ، رأی‌دهنده)؛ تغییر رأی = UPDATE همان ردیف';

-- =====================================================================
-- ۹) گزارش‌های تجمیعی روزانه — جایگزین rep:day و stats در Redis
--    روز = تاریخ تهران (CURDATE() با time_zone +03:30). توجه: lib/report.js فعلاً روز UTC می‌نویسد.
--    الگوی ثبت:  INSERT ... ON DUPLICATE KEY UPDATE request_count = request_count + 1
-- =====================================================================

CREATE TABLE IF NOT EXISTS answer_sources (
  code               VARCHAR(20) NOT NULL,
  label_fa           VARCHAR(80) NOT NULL,
  counts_as_answered TINYINT(1)  NOT NULL DEFAULT 0 COMMENT 'در «درصد پاسخ از پایگاه دانش» حساب می‌شود (faq/memory/knowledge/vector)',
  sort_order         TINYINT UNSIGNED NOT NULL DEFAULT 0,
  PRIMARY KEY (code)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS daily_source_stats (
  stat_date     DATE        NOT NULL,
  source        VARCHAR(20) NOT NULL,
  request_count INT UNSIGNED NOT NULL DEFAULT 0,
  PRIMARY KEY (stat_date, source),
  CONSTRAINT fk_dss_source FOREIGN KEY (source) REFERENCES answer_sources (code) ON DELETE RESTRICT
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS daily_token_usage (
  stat_date     DATE        NOT NULL,
  provider      VARCHAR(40) NOT NULL,
  model         VARCHAR(80) NOT NULL,
  call_count    INT UNSIGNED    NOT NULL DEFAULT 0,
  input_tokens  BIGINT UNSIGNED NOT NULL DEFAULT 0,
  output_tokens BIGINT UNSIGNED NOT NULL DEFAULT 0,
  PRIMARY KEY (stat_date, provider, model)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS daily_error_stats (
  stat_date   DATE        NOT NULL,
  error_code  VARCHAR(40) NOT NULL COMMENT 'timeout | rate_limited | provider_error | server_error ...',
  provider    VARCHAR(40) NOT NULL DEFAULT '' COMMENT 'رشتهٔ خالی = نامشخص/بدون ارائه‌دهنده',
  error_count INT UNSIGNED NOT NULL DEFAULT 0,
  PRIMARY KEY (stat_date, error_code, provider)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS daily_counters (
  stat_date DATE        NOT NULL,
  counter   VARCHAR(40) NOT NULL COMMENT 'hit | miss | hit_semantic | tokens_saved | learned | up | down | removed | leads',
  value     BIGINT UNSIGNED NOT NULL DEFAULT 0,
  PRIMARY KEY (stat_date, counter)
) ENGINE=InnoDB COMMENT='معادل هش stats در Redis؛ hit_rate = hit / (hit + miss)';

-- =====================================================================
-- ۱۰) تنظیمات غیرمحرمانه — نسخه‌دار و قابل ردیابی
--     تغییر فقط با CALL sp_set_setting(...) یا UPDATE همراه با @app_admin_id؛
--     تریگرها: اعتبارسنجی، افزایش نسخه، ثبت در setting_versions و audit_logs.
--     رمزها/کلیدها (ICP_API_KEY, CHAT_SIGNING_SECRET, ...) هرگز اینجا نیایند.
-- =====================================================================

CREATE TABLE IF NOT EXISTS settings (
  setting_key         VARCHAR(100) NOT NULL,
  category            VARCHAR(30)  NOT NULL,
  value_json          JSON         NOT NULL,
  value_type          ENUM('int','decimal','bool','string','json') NOT NULL,
  min_value           DECIMAL(18,4) NULL,
  max_value           DECIMAL(18,4) NULL,
  description_fa      VARCHAR(300) NOT NULL,
  is_editable         TINYINT(1)   NOT NULL DEFAULT 1,
  current_version     INT UNSIGNED NOT NULL DEFAULT 1,
  updated_by_admin_id BIGINT UNSIGNED NULL,
  updated_at          DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (setting_key),
  KEY ix_settings_cat (category),
  CONSTRAINT fk_settings_admin FOREIGN KEY (updated_by_admin_id) REFERENCES admin_users (id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS setting_versions (
  setting_key         VARCHAR(100) NOT NULL,
  version             INT UNSIGNED NOT NULL,
  value_json          JSON         NOT NULL,
  changed_by_admin_id BIGINT UNSIGNED NULL,
  changed_at          DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  change_note         VARCHAR(300) NULL,
  PRIMARY KEY (setting_key, version),
  CONSTRAINT fk_sv_setting FOREIGN KEY (setting_key) REFERENCES settings (setting_key) ON DELETE RESTRICT,
  CONSTRAINT fk_sv_admin   FOREIGN KEY (changed_by_admin_id) REFERENCES admin_users (id) ON DELETE RESTRICT
) ENGINE=InnoDB COMMENT='فقط‌افزودنی؛ بازگردانی = ثبت نسخهٔ جدید با مقدار قدیمی';

-- =====================================================================
-- ۱۱) فهرست درخواست‌های چت (بدون متن سؤال/پاسخ)
--     منبع صفحه‌های «درخواست‌ها و گفتگوها» و «مصرف توکن هر درخواست» پنل.
--     متن پرسش و پاسخ عمداً ذخیره نمی‌شود (حریم خصوصی)؛ question_key همان کلید
--     sha1 توکن‌های describe() در lib/learn.js است و پرسش‌های هم‌ارز را گروه می‌کند.
--     نگهداری: settings chat_requests.retention_days (پیش‌فرض ۳۰ روز)؛ آمار تجمیعی روزانه می‌ماند.
-- =====================================================================

CREATE TABLE IF NOT EXISTS chat_requests (
  id                BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  request_code      VARCHAR(16)  NOT NULL COMMENT 'شناسهٔ نمایشی پنل، مثل NK-8F21A',
  created_at        DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  source            VARCHAR(20)  NOT NULL,
  intent_mode       ENUM('general','university','mixed') NULL,
  status            ENUM('success','warning','error') NOT NULL DEFAULT 'success' COMMENT 'warning = بی‌پاسخ (no_info)',
  error_code        VARCHAR(40)  NULL,
  duration_ms       INT UNSIGNED NULL,
  provider          VARCHAR(40)  NOT NULL DEFAULT '',
  model             VARCHAR(80)  NOT NULL DEFAULT '',
  input_tokens      INT UNSIGNED NOT NULL DEFAULT 0,
  output_tokens     INT UNSIGNED NOT NULL DEFAULT 0,
  question_key      CHAR(16)     NULL COMMENT 'NULL = پرسش خصوصی/حساس (شماره، ایمیل، لینک)',
  answer_key        CHAR(16)     NULL COMMENT 'کلید پاسخ/cid برای پیوند با feedback',
  knowledge_version VARCHAR(64)  NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_chat_requests_code (request_code),
  KEY ix_cr_time (created_at),
  KEY ix_cr_source (source, created_at),
  KEY ix_cr_status (status, created_at),
  KEY ix_cr_question (question_key),
  KEY ix_cr_answer (answer_key),
  CONSTRAINT fk_cr_source FOREIGN KEY (source) REFERENCES answer_sources (code) ON DELETE RESTRICT,
  CONSTRAINT ck_cr_qkey CHECK (question_key IS NULL OR REGEXP_LIKE(question_key, '^[a-f0-9]{16}$')),
  CONSTRAINT ck_cr_akey CHECK (answer_key IS NULL OR REGEXP_LIKE(answer_key, '^[a-f0-9]{16}$'))
) ENGINE=InnoDB COMMENT='فقط متادیتا؛ حذف خودکار روزانه با ev_purge_old_chat_requests';

-- =====================================================================
-- ۱۲) تاریخچهٔ نسخه‌های knowledge/chunks.json (وقتی پنل مستقیم روی VPS فایل را می‌نویسد)
--     فایل منبع اصلی می‌ماند؛ اینجا فقط ردپا و مسیر کپی پشتیبان هر نسخه است (بدون Git).
--     content_sha256 را به‌صورت هگز در vector_snapshots.knowledge_version هم بگذارید.
-- =====================================================================

CREATE TABLE IF NOT EXISTS knowledge_revisions (
  id                  BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  content_sha256      BINARY(32)   NOT NULL,
  chunk_count         INT UNSIGNED NOT NULL,
  size_bytes          BIGINT UNSIGNED NOT NULL,
  backup_path         VARCHAR(500) NOT NULL COMMENT 'کپی کامل این نسخه؛ برای بازگردانی',
  change_summary      VARCHAR(500) NULL COMMENT 'مثلاً added: major-x · edited: faq-tuition',
  changed_by_admin_id BIGINT UNSIGNED NULL,
  created_at          DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY ix_kr_time (created_at),
  KEY ix_kr_sha (content_sha256),
  CONSTRAINT fk_kr_admin FOREIGN KEY (changed_by_admin_id) REFERENCES admin_users (id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS schema_meta (
  meta_key   VARCHAR(40)  NOT NULL,
  meta_value VARCHAR(200) NOT NULL,
  PRIMARY KEY (meta_key)
) ENGINE=InnoDB;

-- =====================================================================
-- نماها
-- =====================================================================

CREATE OR REPLACE VIEW v_admin_effective_permissions AS
SELECT DISTINCT ur.admin_user_id, p.code AS permission_code
FROM admin_user_roles ur
JOIN admin_users u        ON u.id = ur.admin_user_id AND u.status = 'active'
JOIN role_permissions rp  ON rp.role_id = ur.role_id
JOIN permissions p        ON p.id = rp.permission_id;

CREATE OR REPLACE VIEW v_end_user_current_consents AS
SELECT c.end_user_id, c.consent_type, c.document_version, c.granted, c.recorded_at
FROM end_user_consents c
JOIN (SELECT end_user_id, consent_type, MAX(id) AS max_id
      FROM end_user_consents GROUP BY end_user_id, consent_type) m ON m.max_id = c.id;

-- =====================================================================
-- رویه‌ها و تریگرها
-- =====================================================================

DELIMITER $$

DROP PROCEDURE IF EXISTS sp_check_setting$$
CREATE PROCEDURE sp_check_setting(IN p_type VARCHAR(10), IN p_value JSON, IN p_min DECIMAL(18,4), IN p_max DECIMAL(18,4))
BEGIN
  DECLARE t VARCHAR(20) DEFAULT JSON_TYPE(p_value);
  IF p_type = 'int' AND t NOT IN ('INTEGER','UNSIGNED INTEGER') THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'setting must be an integer';
  ELSEIF p_type = 'decimal' AND t NOT IN ('INTEGER','UNSIGNED INTEGER','DOUBLE','DECIMAL') THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'setting must be a number';
  ELSEIF p_type = 'bool' AND t <> 'BOOLEAN' THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'setting must be true/false';
  ELSEIF p_type = 'string' AND t <> 'STRING' THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'setting must be a string';
  ELSEIF p_type = 'json' AND t NOT IN ('OBJECT','ARRAY') THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'setting must be a JSON object/array';
  END IF;
  IF p_type IN ('int','decimal') THEN
    IF (p_min IS NOT NULL AND CAST(p_value AS DECIMAL(18,4)) < p_min)
       OR (p_max IS NOT NULL AND CAST(p_value AS DECIMAL(18,4)) > p_max) THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'setting value out of allowed range';
    END IF;
  END IF;
END$$

-- ---------- append-only: audit_logs ----------
DROP TRIGGER IF EXISTS audit_logs_bi$$
CREATE TRIGGER audit_logs_bi BEFORE INSERT ON audit_logs FOR EACH ROW
BEGIN
  SET NEW.event_hash = UNHEX(SHA2(CONCAT_WS('|',
        NEW.occurred_at, IFNULL(NEW.actor_admin_id,''), IFNULL(NEW.actor_label,''),
        IFNULL(NEW.attempted_identifier_hash,''), NEW.action_code, NEW.outcome,
        IFNULL(NEW.target_type,''), IFNULL(NEW.target_id,''), IFNULL(NEW.ip_hash,''),
        IFNULL(CAST(NEW.details AS CHAR),'')), 256));
END$$
DROP TRIGGER IF EXISTS audit_logs_bu$$
CREATE TRIGGER audit_logs_bu BEFORE UPDATE ON audit_logs FOR EACH ROW
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'audit_logs is append-only'$$
DROP TRIGGER IF EXISTS audit_logs_bd$$
CREATE TRIGGER audit_logs_bd BEFORE DELETE ON audit_logs FOR EACH ROW
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'audit_logs is append-only'$$

-- ---------- append-only: setting_versions ----------
DROP TRIGGER IF EXISTS setting_versions_bu$$
CREATE TRIGGER setting_versions_bu BEFORE UPDATE ON setting_versions FOR EACH ROW
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'setting_versions is append-only'$$
DROP TRIGGER IF EXISTS setting_versions_bd$$
CREATE TRIGGER setting_versions_bd BEFORE DELETE ON setting_versions FOR EACH ROW
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'setting_versions is append-only'$$

-- ---------- append-only: end_user_consents (تاریخچهٔ رضایت) ----------
DROP TRIGGER IF EXISTS end_user_consents_bu$$
CREATE TRIGGER end_user_consents_bu BEFORE UPDATE ON end_user_consents FOR EACH ROW
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'end_user_consents is append-only'$$
DROP TRIGGER IF EXISTS end_user_consents_bd$$
CREATE TRIGGER end_user_consents_bd BEFORE DELETE ON end_user_consents FOR EACH ROW
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'end_user_consents is append-only (erasure goes through end_users cascade)'$$

-- ---------- settings: اعتبارسنجی + نسخه‌گذاری ----------
DROP TRIGGER IF EXISTS settings_bi$$
CREATE TRIGGER settings_bi BEFORE INSERT ON settings FOR EACH ROW
BEGIN
  CALL sp_check_setting(NEW.value_type, NEW.value_json, NEW.min_value, NEW.max_value);
  SET NEW.current_version = 1;
  SET NEW.updated_by_admin_id = @app_admin_id;
END$$

DROP TRIGGER IF EXISTS settings_ai$$
CREATE TRIGGER settings_ai AFTER INSERT ON settings FOR EACH ROW
BEGIN
  INSERT INTO setting_versions (setting_key, version, value_json, changed_by_admin_id, change_note)
  VALUES (NEW.setting_key, 1, NEW.value_json, NEW.updated_by_admin_id, COALESCE(@app_change_note, 'initial'));
END$$

DROP TRIGGER IF EXISTS settings_bu$$
CREATE TRIGGER settings_bu BEFORE UPDATE ON settings FOR EACH ROW
BEGIN
  IF NOT (NEW.value_json <=> OLD.value_json) THEN
    CALL sp_check_setting(NEW.value_type, NEW.value_json, NEW.min_value, NEW.max_value);
    SET NEW.current_version = OLD.current_version + 1;
    SET NEW.updated_by_admin_id = @app_admin_id;
  END IF;
END$$

DROP TRIGGER IF EXISTS settings_au$$
CREATE TRIGGER settings_au AFTER UPDATE ON settings FOR EACH ROW
BEGIN
  IF NEW.current_version <> OLD.current_version THEN
    INSERT INTO setting_versions (setting_key, version, value_json, changed_by_admin_id, change_note)
    VALUES (NEW.setting_key, NEW.current_version, NEW.value_json, NEW.updated_by_admin_id, @app_change_note);
    INSERT INTO audit_logs (actor_admin_id, actor_label, action_code, target_type, target_id, ip_hash, details)
    VALUES (@app_admin_id,
            COALESCE((SELECT username FROM admin_users WHERE id = @app_admin_id), 'system'),
            'settings.update', 'setting', NEW.setting_key, @app_ip_hash,
            JSON_OBJECT('from_version', OLD.current_version, 'to_version', NEW.current_version));
  END IF;
END$$

-- راه امن تغییر تنظیم (متغیرهای نشست را روی همان اتصال می‌گذارد و پاک می‌کند)
DROP PROCEDURE IF EXISTS sp_set_setting$$
CREATE PROCEDURE sp_set_setting(IN p_key VARCHAR(100), IN p_value JSON, IN p_admin BIGINT UNSIGNED,
                                IN p_note VARCHAR(300), IN p_ip_hash VARCHAR(64))
BEGIN
  DECLARE v_editable TINYINT(1);
  SELECT is_editable INTO v_editable FROM settings WHERE setting_key = p_key;
  IF v_editable IS NULL THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'unknown setting key';
  ELSEIF v_editable = 0 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'setting is not editable from the panel';
  END IF;
  SET @app_admin_id = p_admin, @app_change_note = p_note, @app_ip_hash = p_ip_hash;
  UPDATE settings SET value_json = p_value WHERE setting_key = p_key;
  SET @app_admin_id = NULL, @app_change_note = NULL, @app_ip_hash = NULL;
END$$

-- ---------- leads: تاریخ حذف پیش‌فرض از تنظیمات ----------
DROP TRIGGER IF EXISTS leads_bi$$
CREATE TRIGGER leads_bi BEFORE INSERT ON leads FOR EACH ROW
BEGIN
  IF NEW.scheduled_delete_at IS NULL THEN
    SET NEW.scheduled_delete_at = DATE_ADD(CURRENT_TIMESTAMP(3), INTERVAL COALESCE(
        (SELECT CAST(value_json AS UNSIGNED) FROM settings WHERE setting_key = 'leads.retention_days'), 30) DAY);
  END IF;
END$$

-- ---------- حذف زمان‌بندی‌شده ----------
DROP PROCEDURE IF EXISTS sp_purge_expired_leads$$
CREATE PROCEDURE sp_purge_expired_leads(IN p_batch INT)
BEGIN
  DECLARE v_n INT DEFAULT 0;
  DELETE FROM leads WHERE scheduled_delete_at <= CURRENT_TIMESTAMP(3) ORDER BY scheduled_delete_at LIMIT p_batch;
  SET v_n = ROW_COUNT();
  IF v_n > 0 THEN
    INSERT INTO audit_logs (actor_label, action_code, target_type, details)
    VALUES ('system', 'lead.purge', 'lead', JSON_OBJECT('deleted', v_n));
  END IF;
END$$

DROP PROCEDURE IF EXISTS sp_purge_old_sessions$$
CREATE PROCEDURE sp_purge_old_sessions()
BEGIN
  DELETE FROM admin_sessions WHERE expires_at < DATE_SUB(CURRENT_TIMESTAMP(3), INTERVAL 30 DAY);
END$$

DROP EVENT IF EXISTS ev_purge_expired_leads$$
CREATE EVENT ev_purge_expired_leads ON SCHEDULE EVERY 1 HOUR
  DO CALL sp_purge_expired_leads(1000)$$

DROP EVENT IF EXISTS ev_purge_old_sessions$$
CREATE EVENT ev_purge_old_sessions ON SCHEDULE EVERY 1 DAY
  DO CALL sp_purge_old_sessions()$$

DROP PROCEDURE IF EXISTS sp_purge_old_chat_requests$$
CREATE PROCEDURE sp_purge_old_chat_requests()
BEGIN
  DECLARE v_days INT DEFAULT 30;
  DECLARE v_loops INT DEFAULT 0;
  SELECT COALESCE(CAST(value_json AS UNSIGNED), 30) INTO v_days
    FROM settings WHERE setting_key = 'chat_requests.retention_days';
  REPEAT
    DELETE FROM chat_requests WHERE created_at < DATE_SUB(CURRENT_TIMESTAMP(3), INTERVAL v_days DAY) LIMIT 5000;
    SET v_loops = v_loops + 1;
  UNTIL ROW_COUNT() < 5000 OR v_loops >= 40 END REPEAT;
END$$

-- هشدار اگر منطقهٔ زمانی سرور تهران (+03:30) نباشد؛ در شروع برنامه صدا بزنید
DROP PROCEDURE IF EXISTS sp_assert_time_zone$$
CREATE PROCEDURE sp_assert_time_zone()
BEGIN
  IF TIMEDIFF(NOW(), UTC_TIMESTAMP()) <> '03:30:00' THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'MySQL time zone must be +03:30 (Asia/Tehran); set default-time-zone in my.cnf';
  END IF;
END$$

DROP EVENT IF EXISTS ev_purge_old_chat_requests$$
CREATE EVENT ev_purge_old_chat_requests ON SCHEDULE EVERY 1 DAY STARTS (TIMESTAMP(CURRENT_DATE) + INTERVAL 1 DAY + INTERVAL 3 HOUR)
  DO CALL sp_purge_old_chat_requests()$$

DELIMITER ;

-- =====================================================================
-- دادهٔ اولیه (Seed) — idempotent
-- =====================================================================

INSERT IGNORE INTO roles (code, name_fa, description, is_system) VALUES
 ('super_admin',      'مدیر کل',        'همهٔ دسترسی‌ها؛ مدیریت ادمین‌ها، تنظیمات و ممیزی', 1),
 ('admin',            'ادمین',          'داشبورد، درخواست‌ها، مصرف توکن و مدیریت دانش (نقش Admin فعلی کد)', 1),
 ('counselor',        'مشاور',          'تیکت‌ها و درخواست‌های تماس (همان Support در نمونهٔ پنل)', 1),
 ('knowledge_editor', 'ویرایشگر دانش',  'ویرایش/انتشار دانش و حذف پاسخ‌های حافظه (همان Knowledge Manager)', 1),
 ('read_only',        'فقط‌خواندنی',    'مشاهدهٔ گزارش‌ها بدون داده‌های حساس (همان Analyst)', 1);

INSERT IGNORE INTO permissions (code, category, description, is_sensitive) VALUES
 ('dashboard.view',        'dashboard', 'مشاهدهٔ داشبورد', 0),
 ('requests.view',         'requests',  'مشاهدهٔ فهرست درخواست‌ها (بدون متن حساس)', 0),
 ('requests.view_sensitive','requests', 'مشاهدهٔ متن سؤال و پاسخ', 1),
 ('requests.export',       'requests',  'خروجی CSV درخواست‌ها', 1),
 ('usage.view',            'usage',     'مشاهدهٔ مصرف توکن (بخش «مصرف توکن» پنل)', 0),
 ('knowledge.view',        'knowledge', 'مشاهدهٔ دانش', 0),
 ('knowledge.create',      'knowledge', 'افزودن اطلاعات', 0),
 ('knowledge.edit',        'knowledge', 'ویرایش اطلاعات', 0),
 ('knowledge.publish',     'knowledge', 'انتشار و همگام‌سازی Vector', 0),
 ('answers.delete',        'knowledge', 'حذف پاسخ از حافظهٔ یادگیری', 0),
 ('feedback.view',         'feedback',  'مشاهدهٔ بازخوردها', 0),
 ('feedback.review',       'feedback',  'علامت‌گذاری بازخورد به‌عنوان بررسی‌شده', 0),
 ('reports.view',          'reports',   'مشاهدهٔ گزارش‌های تجمیعی', 0),
 ('reports.export',        'reports',   'خروجی گزارش‌ها', 0),
 ('tickets.view',          'tickets',   'مشاهدهٔ تیکت‌ها', 0),
 ('tickets.create',        'tickets',   'ساخت تیکت', 0),
 ('tickets.reply',         'tickets',   'پاسخ به تیکت', 0),
 ('tickets.assign',        'tickets',   'ارجاع تیکت به کارشناس', 0),
 ('tickets.update',        'tickets',   'تغییر وضعیت/اولویت', 0),
 ('tickets.note',          'tickets',   'یادداشت داخلی', 0),
 ('leads.view',            'leads',     'مشاهدهٔ درخواست‌های تماس (شمارهٔ ماسک‌شده)', 0),
 ('leads.view_phone',      'leads',     'دیدن شمارهٔ کامل تماس', 1),
 ('leads.update',          'leads',     'تغییر وضعیت پیگیری', 0),
 ('leads.export',          'leads',     'خروجی درخواست‌های تماس', 1),
 ('leads.delete',          'leads',     'حذف فوری درخواست تماس', 1),
 ('vector.view',           'vector',    'مشاهدهٔ فهرست بک‌آپ‌های Vector', 0),
 ('vector.backup',         'vector',    'ساخت بک‌آپ Vector', 0),
 ('vector.restore',        'vector',    'بازیابی Vector از اسنپ‌شات', 1),
 ('vector.delete',         'vector',    'حذف اسنپ‌شات', 1),
 ('admins.view',           'admins',    'مشاهدهٔ ادمین‌ها', 0),
 ('admins.create',         'admins',    'ساخت ادمین', 1),
 ('admins.manage_roles',   'admins',    'تغییر نقش و دسترسی ادمین‌ها', 1),
 ('admins.lock',           'admins',    'قفل/بازکردن حساب ادمین', 1),
 ('sessions.revoke_any',   'security',  'ابطال نشست دیگران', 1),
 ('api_tokens.manage_own', 'security',  'ساخت/ابطال توکن API شخصی', 0),
 ('api_tokens.manage_any', 'security',  'ابطال توکن API دیگران', 1),
 ('audit.view',            'audit',     'مشاهدهٔ لاگ ممیزی', 1),
 ('audit.export',          'audit',     'خروجی لاگ ممیزی', 1),
 ('settings.view',         'settings',  'مشاهدهٔ تنظیمات', 0),
 ('settings.manage',       'settings',  'تغییر تنظیمات', 1),
 ('end_users.view',        'end_users', 'مشاهدهٔ کاربران نهایی', 0),
 ('end_users.manage',      'end_users', 'قفل/حذف کاربران نهایی', 1);

-- ماتریس نقش ← دسترسی
INSERT IGNORE INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r CROSS JOIN permissions p WHERE r.code = 'super_admin';

INSERT IGNORE INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r JOIN permissions p ON p.code IN
 ('dashboard.view','requests.view','usage.view','knowledge.view','knowledge.create','knowledge.edit',
  'feedback.view','reports.view','api_tokens.manage_own')
WHERE r.code = 'admin';

INSERT IGNORE INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r JOIN permissions p ON p.code IN
 ('dashboard.view','requests.view','knowledge.view','feedback.view',
  'tickets.view','tickets.create','tickets.reply','tickets.assign','tickets.update','tickets.note',
  'leads.view','leads.view_phone','leads.update','api_tokens.manage_own')
WHERE r.code = 'counselor';

INSERT IGNORE INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r JOIN permissions p ON p.code IN
 ('dashboard.view','knowledge.view','knowledge.create','knowledge.edit','knowledge.publish','answers.delete',
  'feedback.view','feedback.review','reports.view','vector.view','api_tokens.manage_own')
WHERE r.code = 'knowledge_editor';

INSERT IGNORE INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r JOIN permissions p ON p.code IN
 ('dashboard.view','requests.view','usage.view','knowledge.view','feedback.view','reports.view',
  'tickets.view','leads.view','vector.view')
WHERE r.code = 'read_only';

INSERT IGNORE INTO audit_actions (code, category, description, is_sensitive) VALUES
 ('admin.login.success',   'auth',      'ورود موفق', 0),
 ('admin.login.failed',    'auth',      'ورود ناموفق', 0),
 ('admin.logout',          'auth',      'خروج', 0),
 ('admin.password.change', 'auth',      'تغییر رمز عبور', 1),
 ('admin.session.revoke',  'auth',      'ابطال نشست', 1),
 ('admin.api_token.create','auth',      'ساخت توکن API', 1),
 ('admin.api_token.revoke','auth',      'ابطال توکن API', 1),
 ('admin.user.create',     'admins',    'ساخت ادمین', 1),
 ('admin.user.update',     'admins',    'ویرایش ادمین', 1),
 ('admin.user.lock',       'admins',    'قفل حساب ادمین', 1),
 ('admin.user.unlock',     'admins',    'بازکردن قفل حساب ادمین', 1),
 ('admin.role.assign',     'admins',    'اختصاص نقش', 1),
 ('admin.role.revoke',     'admins',    'لغو نقش', 1),
 ('knowledge.create',      'knowledge', 'افزودن دانش', 0),
 ('knowledge.update',      'knowledge', 'ویرایش دانش', 0),
 ('knowledge.delete',      'knowledge', 'حذف دانش', 1),
 ('knowledge.publish',     'knowledge', 'انتشار دانش', 0),
 ('answer.delete',         'knowledge', 'حذف پاسخ از حافظهٔ یادگیری', 0),
 ('report.reset',          'reports',   'پاک‌کردن گزارش', 1),
 ('request.view_sensitive','requests',  'مشاهدهٔ متن حساس یک درخواست', 1),
 ('request.export',        'requests',  'خروجی درخواست‌ها', 1),
 ('lead.view_phone',       'leads',     'دیدن شمارهٔ تماس', 1),
 ('lead.update_status',    'leads',     'تغییر وضعیت پیگیری', 0),
 ('lead.export',           'leads',     'خروجی درخواست‌های تماس', 1),
 ('lead.delete',           'leads',     'حذف دستی درخواست تماس', 1),
 ('lead.purge',            'leads',     'حذف زمان‌بندی‌شده (سیستم)', 0),
 ('ticket.create',         'tickets',   'ساخت تیکت', 0),
 ('ticket.update',         'tickets',   'تغییر وضعیت/اولویت تیکت', 0),
 ('ticket.assign',         'tickets',   'ارجاع تیکت', 0),
 ('ticket.reply',          'tickets',   'پاسخ به تیکت', 0),
 ('ticket.note',           'tickets',   'یادداشت داخلی', 0),
 ('ticket.close',          'tickets',   'بستن تیکت', 0),
 ('ticket.attachment.view','tickets',   'مشاهدهٔ پیوست', 1),
 ('vector.backup.create',  'vector',    'ساخت بک‌آپ Vector', 0),
 ('vector.backup.delete',  'vector',    'حذف بک‌آپ Vector', 1),
 ('vector.restore',        'vector',    'بازیابی Vector', 1),
 ('feedback.review',       'feedback',  'بررسی بازخورد', 0),
 ('settings.update',       'settings',  'تغییر تنظیم', 1),
 ('audit.view',            'audit',     'مشاهدهٔ لاگ ممیزی', 1),
 ('audit.export',          'audit',     'خروجی لاگ ممیزی', 1),
 ('end_user.update',       'end_users', 'ویرایش/قفل کاربر نهایی', 1),
 ('end_user.delete',       'end_users', 'حذف کاربر نهایی', 1);

-- برچسب‌ها مطابق LABELS در lib/report.js
INSERT IGNORE INTO answer_sources (code, label_fa, counts_as_answered, sort_order) VALUES
 ('smalltalk', 'احوالپرسی',                         0, 1),
 ('faq',       'پاسخ آمادهٔ پایگاه دانش',            1, 2),
 ('memory',    'حافظهٔ پرسش‌های تکراری',             1, 3),
 ('knowledge', 'پایگاه دانش (جست‌وجوی کلمه‌ای)',     1, 4),
 ('vector',    'پایگاه دادهٔ وکتور',                 1, 5),
 ('general',   'راهنمایی عمومی با دانش مدل',         0, 6),
 ('no_info',   'بی‌پاسخ (اطلاعات نبود)',              0, 7),
 ('off_topic', 'خارج از حوزه',                        0, 8),
 ('error',     'خطا/شلوغی',                           0, 9),
 ('web',       'جست‌وجوی اینترنت (رزرو)',             0, 10);

-- تنظیمات اولیه؛ مقادیر از config.js و کد فعلی (settings_bi/settings_ai نسخهٔ ۱ را می‌سازند)
INSERT IGNORE INTO settings (setting_key, category, value_json, value_type, min_value, max_value, description_fa, is_editable) VALUES
 ('llm.max_tokens',            'llm',    '800',    'int',     100,   4000,   'سقف طول پاسخ مدل (توکن خروجی)', 1),
 ('llm.knowledge_chars',       'llm',    '1800',   'int',     200,   8000,   'سقف نویسهٔ دانش ارسالی به مدل در هر درخواست', 1),
 ('llm.temperature',           'llm',    '0.2',    'decimal', 0,     1,      'دمای مدل', 1),
 ('llm.timeout_ms',            'llm',    '40000',  'int',     5000,  120000, 'مهلت پاسخ مدل (میلی‌ثانیه)؛ روی Vercel کمتر از ۶۰ ثانیه', 1),
 ('llm.max_concurrent',        'llm',    '50',     'int',     1,     1000,   'سقف درخواست هم‌زمان به هر سرویس مدل در هر instance', 1),
 ('search.faq_sim',            'search', '0.6',    'decimal', 0,     1,      'حداقل شباهت برای پاسخ مستقیم FAQ', 1),
 ('search.vector_top_k',       'search', '5',      'int',     1,     20,     'تعداد نتایج بازیابی از Vector', 1),
 ('search.vector_keep',        'search', '3',      'int',     1,     10,     'تعداد نتایج برتر وارد‌شونده به پرامپت', 1),
 ('search.vector_timeout_ms',  'search', '2500',   'int',     500,   10000,  'مهلت جست‌وجوی Vector', 1),
 ('search.semantic_cache',     'search', 'true',   'bool',    NULL,  NULL,   'فعال بودن کش معنایی', 1),
 ('search.semantic_cache_sim', 'search', '0.92',   'decimal', 0.5,   1,      'آستانهٔ شباهت کش معنایی', 1),
 ('learn.min_askers',          'learn',  '2',      'int',     1,     20,     'حداقل کاربر مستقل برای ذخیرهٔ پاسخ در حافظه', 1),
 ('learn.max_entries',         'learn',  '300',    'int',     10,    5000,   'سقف پاسخ‌های حافظهٔ یادگیری', 1),
 ('learn.sim',                 'learn',  '0.75',   'decimal', 0.3,   1,      'آستانهٔ شباهت پرسش‌های تکراری', 1),
 ('leads.retention_days',      'leads',  '30',     'int',     1,     3650,   'مدت نگهداری درخواست تماس تا حذف خودکار (روز)', 1),
 ('chat_requests.retention_days','requests','30',   'int',     1,     365,    'مدت نگهداری فهرست درخواست‌های چت (روز)؛ آمار روزانه می‌ماند', 1),
 ('admin.session_ttl_hours',   'admin',  '6',      'int',     1,     72,     'عمر نشست ادمین (ساعت)', 1),
 ('admin.max_failed_logins',   'admin',  '5',      'int',     3,     20,     'تعداد ورود ناموفق تا قفل موقت', 1),
 ('admin.lockout_minutes',     'admin',  '15',     'int',     1,     1440,   'مدت قفل موقت حساب (دقیقه)', 1),
 ('admin.password_min_length', 'admin',  '12',     'int',     12,    128,    'حداقل طول رمز ادمین', 1),
 ('bot.name',                  'texts',  '"نوکا"', 'string',  NULL,  NULL,   'نام دستیار', 1),
 ('contact.center_phone',      'texts',  '"031-35354049"', 'string', NULL, NULL, 'شمارهٔ مرکز هدایت تحصیلی که در پیام‌های خطا/ثبت تماس نمایش داده می‌شود', 1),
 ('texts.lead_success',        'texts',  '"درخواست شما ثبت شد؛ همکاران مرکز هدایت تحصیلی با شما تماس می‌گیرند."', 'string', NULL, NULL, 'پیام موفقیت ثبت درخواست تماس', 1);

INSERT INTO schema_meta (meta_key, meta_value) VALUES ('schema_version','2'), ('time_zone','+03:30 Asia/Tehran')
  ON DUPLICATE KEY UPDATE meta_value = VALUES(meta_value);
