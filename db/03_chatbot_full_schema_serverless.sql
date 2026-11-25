-- نسخه سازگار با MySQL ابری / Serverless (بدون CREATE EVENT؛ پاک‌سازی با Vercel Cron انجام می‌شود)
-- =====================================================================
--  نوکا — تکمیل اسکیمای جامع چت‌بات (نسخه 1.7.0)
--  ترتیب اجرا:
--    1) db/01_schema.sql
--    2) db/03_chatbot_full_schema.sql   (همین فایل)
--    3) db/02_grants.sql
--
--  معماری ترکیبی:
--    • MySQL 8.0.19+ = منبع اصلی داده (Source of Truth) برای کاربران، گفتگوها،
--      پایگاه دانش، حافظه یادگیری، گزارش‌ها و مصرف LLM.
--    • Upstash Vector = ایندکس جست‌وجوی معنایی؛ همگام‌سازی از طریق ستون‌های
--      content_sha256 / vector_synced_hash / vector_sync_status و نمای v_knowledge_unsynced.
-- =====================================================================

USE nooka;
SET NAMES utf8mb4 COLLATE utf8mb4_0900_ai_ci;
SET time_zone = '+03:30';

-- =====================================================================
-- ۱) نشست و توکن‌های احراز هویت کاربران عادی (جایگزین کلیدهای KV)
-- =====================================================================
CREATE TABLE IF NOT EXISTS end_user_sessions (
  id              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  end_user_id     BIGINT UNSIGNED NOT NULL,
  session_hash    BINARY(32)   NOT NULL COMMENT 'SHA-256 توکن کوکی nooka_user',
  created_at      DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  expires_at      DATETIME(3)  NOT NULL,
  last_seen_at    DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  revoked_at      DATETIME(3)  NULL,
  revoke_reason   VARCHAR(80)  NULL,
  ip_hash         VARCHAR(64)  NULL,
  user_agent      VARCHAR(255) NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_end_user_sess_hash (session_hash),
  KEY ix_end_user_sess_user (end_user_id, revoked_at, expires_at),
  KEY ix_end_user_sess_exp (expires_at),
  CONSTRAINT fk_eus_user FOREIGN KEY (end_user_id) REFERENCES end_users (id) ON DELETE CASCADE
) ENGINE=InnoDB COMMENT='نشست‌های کاربران چت‌بات؛ فقط هش SHA-256 ذخیره می‌شود';

CREATE TABLE IF NOT EXISTS user_auth_tokens (
  id              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  end_user_id     BIGINT UNSIGNED NOT NULL,
  purpose         ENUM('verify_email','verify_phone','password_reset') NOT NULL,
  token_hash      BINARY(32)   NOT NULL COMMENT 'SHA-256 کد/توکن یک‌بارمصرف',
  created_at      DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  expires_at      DATETIME(3)  NOT NULL,
  used_at         DATETIME(3)  NULL,
  ip_hash         VARCHAR(64)  NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_user_auth_tok_hash (token_hash),
  KEY ix_user_auth_tok_user (end_user_id, purpose, expires_at),
  CONSTRAINT fk_uat_user FOREIGN KEY (end_user_id) REFERENCES end_users (id) ON DELETE CASCADE
) ENGINE=InnoDB COMMENT='کدهای تأیید ایمیل/موبایل و بازیابی رمز عبور کاربران';

-- =====================================================================
-- ۲) تاریخچه گفتگوها و پیام‌ها (جایگزین localStorage برای کاربران واردشده)
-- =====================================================================
CREATE TABLE IF NOT EXISTS conversations (
  id              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  public_id       CHAR(26)     NOT NULL COMMENT 'شناسه عمومی غیرقابل حدس (ULID/UUID کوتاه)',
  end_user_id     BIGINT UNSIGNED NOT NULL,
  title           VARCHAR(160) NOT NULL DEFAULT 'گفتگوی جدید',
  lang            ENUM('fa','ar','en') NOT NULL DEFAULT 'fa',
  is_archived     TINYINT(1)   NOT NULL DEFAULT 0,
  is_pinned       TINYINT(1)   NOT NULL DEFAULT 0,
  message_count   INT UNSIGNED NOT NULL DEFAULT 0,
  last_message_at DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  created_at      DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  deleted_at      DATETIME(3)  NULL COMMENT 'حذف نرم برای بازیابی یا پاک‌سازی زمان‌بندی‌شده',
  PRIMARY KEY (id),
  UNIQUE KEY uq_conv_public_id (public_id),
  KEY ix_conv_user_list (end_user_id, deleted_at, is_archived, is_pinned, last_message_at),
  CONSTRAINT fk_conv_user FOREIGN KEY (end_user_id) REFERENCES end_users (id) ON DELETE CASCADE
) ENGINE=InnoDB COMMENT='جلسات چت کاربران واردشده';

CREATE TABLE IF NOT EXISTS chat_messages (
  id                  BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  conversation_id     BIGINT UNSIGNED NOT NULL,
  role                ENUM('user','assistant','system') NOT NULL,
  content             MEDIUMTEXT   NOT NULL,
  answer_source_code  VARCHAR(30)  NULL COMMENT 'منبع پاسخ دستیار (faq, knowledge, vector, memory, general, ...)',
  knowledge_chunk_ids JSON         NULL COMMENT 'آرایه شناسه‌های تکه‌های دانش استفاده‌شده',
  provider            VARCHAR(40)  NULL,
  model               VARCHAR(80)  NULL,
  prompt_tokens       INT UNSIGNED NULL,
  completion_tokens   INT UNSIGNED NULL,
  latency_ms          INT UNSIGNED NULL,
  attachment_meta     JSON         NULL COMMENT 'فقط متادیتای پیوست (نام، نوع، حجم) — بدون باینری خام',
  vote                TINYINT      NOT NULL DEFAULT 0 COMMENT '-1 منفی، 0 بدون رأی، +1 مثبت',
  created_at          DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY ix_msg_conv_time (conversation_id, created_at),
  KEY ix_msg_source (answer_source_code, created_at),
  CONSTRAINT fk_msg_conv   FOREIGN KEY (conversation_id)    REFERENCES conversations (id)  ON DELETE CASCADE,
  CONSTRAINT fk_msg_source FOREIGN KEY (answer_source_code) REFERENCES answer_sources (code) ON DELETE SET NULL,
  CONSTRAINT ck_msg_vote   CHECK (vote IN (-1, 0, 1))
) ENGINE=InnoDB COMMENT='پیام‌های ردوبدل‌شده در هر گفتگو';

-- =====================================================================
-- ۳) پایگاه دانش ساختاریافته (Source of Truth) با همگام‌سازی Upstash Vector
-- =====================================================================
CREATE TABLE IF NOT EXISTS knowledge_chunks (
  id                  VARCHAR(64)  NOT NULL COMMENT 'همان شناسه یکتا در chunks.json و Upstash Vector',
  chunk_type          ENUM('general','major','faculty','faq','list') NOT NULL,
  title               VARCHAR(200) NOT NULL,
  body_text           MEDIUMTEXT   NOT NULL,
  faq_answer          TEXT         NULL COMMENT 'فقط برای chunk_type=faq',
  faq_questions_json  JSON         NULL COMMENT 'آرایه سؤالات هم‌معنی برای FAQ',
  keywords_json       JSON         NULL COMMENT 'آرایه کلیدواژه‌ها',
  status              ENUM('draft','published','archived') NOT NULL DEFAULT 'published',
  valid_from          DATE         NULL COMMENT 'تاریخ شروع اعتبار (مثلاً نیمسال یا کنکور خاص)',
  valid_until         DATE         NULL COMMENT 'تاریخ انقضای اعتبار برای جلوگیری از پاسخ کهنه',
  content_sha256      CHAR(64)     NOT NULL COMMENT 'هش محتوای قابل ایندکس برای تشخیص نیاز به همگام‌سازی وکتور',
  vector_sync_status  ENUM('pending','synced','failed') NOT NULL DEFAULT 'pending',
  vector_synced_hash  CHAR(64)     NULL COMMENT 'آخرین هشی که با موفقیت به Upstash Vector ارسال شد',
  vector_synced_at    DATETIME(3)  NULL,
  vector_last_error   VARCHAR(255) NULL,
  current_version     INT UNSIGNED NOT NULL DEFAULT 1,
  created_by_admin_id BIGINT UNSIGNED NULL,
  updated_by_admin_id BIGINT UNSIGNED NULL,
  created_at          DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at          DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY ix_kc_type_status (chunk_type, status),
  KEY ix_kc_valid_until (status, valid_until),
  KEY ix_kc_vector_sync (status, vector_sync_status),
  FULLTEXT KEY ft_kc_search (title, body_text),
  CONSTRAINT fk_kc_created_by FOREIGN KEY (created_by_admin_id) REFERENCES admin_users (id) ON DELETE SET NULL,
  CONSTRAINT fk_kc_updated_by FOREIGN KEY (updated_by_admin_id) REFERENCES admin_users (id) ON DELETE SET NULL,
  CONSTRAINT ck_kc_id         CHECK (REGEXP_LIKE(id, '^[a-z0-9][a-z0-9_-]{2,63}$', 'c'))
) ENGINE=InnoDB COMMENT='منبع اصلی تکه‌های دانش؛ همگام‌شونده با Upstash Vector';

CREATE TABLE IF NOT EXISTS knowledge_chunk_versions (
  id                  BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  chunk_id            VARCHAR(64)  NOT NULL,
  version_no          INT UNSIGNED NOT NULL,
  snapshot_json       JSON         NOT NULL COMMENT 'نسخه کامل تکه در آن لحظه برای بازگردانی تک‌کلیکی',
  content_sha256      CHAR(64)     NOT NULL,
  change_note         VARCHAR(300) NULL,
  changed_by_admin_id BIGINT UNSIGNED NULL,
  created_at          DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_kcv_chunk_ver (chunk_id, version_no),
  KEY ix_kcv_time (created_at),
  CONSTRAINT fk_kcv_chunk FOREIGN KEY (chunk_id)            REFERENCES knowledge_chunks (id) ON DELETE CASCADE,
  CONSTRAINT fk_kcv_admin FOREIGN KEY (changed_by_admin_id) REFERENCES admin_users (id)      ON DELETE SET NULL
) ENGINE=InnoDB COMMENT='تاریخچه نسخه‌های هر تکه دانش (فقط‌افزودنی)';

-- نمای کمکی برای پیدا کردن تکه‌هایی که هنوز با Upstash Vector همگام نیستند
CREATE OR REPLACE VIEW v_knowledge_unsynced AS
SELECT id, chunk_type, title, content_sha256, vector_sync_status, vector_synced_hash, vector_synced_at, updated_at
  FROM knowledge_chunks
 WHERE status = 'published'
   AND (vector_sync_status <> 'synced' OR vector_synced_hash IS NULL OR vector_synced_hash <> content_sha256);

-- =====================================================================
-- ۴) حافظه یادگیری و خوشه‌بندی پرسش‌های پرتکرار/بی‌پاسخ (جایگزین کلیدهای KV)
-- =====================================================================
CREATE TABLE IF NOT EXISTS learned_answers (
  id                   BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  question_key         CHAR(16)     NOT NULL COMMENT 'کلید یکتای پرسش نرمال‌شده (سازگار با lib/learn.js)',
  knowledge_version    VARCHAR(16)  NOT NULL COMMENT 'نسخه پایگاه دانش هنگام یادگیری',
  canonical_question   VARCHAR(500) NOT NULL,
  answer_text          MEDIUMTEXT   NOT NULL,
  status               ENUM('candidate','approved','banned') NOT NULL DEFAULT 'candidate',
  distinct_askers      INT UNSIGNED NOT NULL DEFAULT 1,
  hit_count            INT UNSIGNED NOT NULL DEFAULT 0,
  up_votes             INT UNSIGNED NOT NULL DEFAULT 0,
  down_votes           INT UNSIGNED NOT NULL DEFAULT 0,
  retrieval_score      DECIMAL(6,4) NULL,
  vector_cached_at     DATETIME(3)  NULL COMMENT 'زمان ثبت در namespace کش معنایی Upstash Vector',
  approved_by_admin_id BIGINT UNSIGNED NULL,
  created_at           DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at           DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_la_key_ver (question_key, knowledge_version),
  KEY ix_la_status_hits (status, hit_count DESC),
  CONSTRAINT fk_la_admin FOREIGN KEY (approved_by_admin_id) REFERENCES admin_users (id) ON DELETE SET NULL
) ENGINE=InnoDB COMMENT='حافظه یادگیری خودکار با امکان تأیید یا مسدودسازی از پنل ادمین';

CREATE TABLE IF NOT EXISTS question_clusters (
  id                  BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  cluster_key         CHAR(16)     NOT NULL,
  sample_question     VARCHAR(500) NULL COMMENT 'NULL برای پرسش‌های حاوی اطلاعات شخصی (PII)',
  variants_json       JSON         NULL COMMENT 'عبارت‌های مشابه ثبت‌شده',
  ask_count           INT UNSIGNED NOT NULL DEFAULT 1,
  main_source_code    VARCHAR(30)  NULL,
  is_private          TINYINT(1)   NOT NULL DEFAULT 0,
  is_unanswered       TINYINT(1)   NOT NULL DEFAULT 0,
  resolved_chunk_id   VARCHAR(64)  NULL COMMENT 'تکه دانشی که برای پوشش این سؤال بی‌پاسخ اضافه شد',
  first_asked_at      DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  last_asked_at       DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_qc_key (cluster_key),
  KEY ix_qc_unanswered (is_unanswered, ask_count DESC),
  KEY ix_qc_last (last_asked_at),
  CONSTRAINT fk_qc_source FOREIGN KEY (main_source_code)  REFERENCES answer_sources (code)   ON DELETE SET NULL,
  CONSTRAINT fk_qc_chunk  FOREIGN KEY (resolved_chunk_id) REFERENCES knowledge_chunks (id)   ON DELETE SET NULL
) ENGINE=InnoDB COMMENT='گزارش تجمیعی پرسش‌های پرتکرار و بی‌پاسخ برای بهبود پایگاه دانش';

-- =====================================================================
-- ۵) تله‌متری دقیق مصرف توکن، هزینه و زمان پاسخ هر پروایدر LLM
-- =====================================================================
CREATE TABLE IF NOT EXISTS llm_provider_usage (
  id                  BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  chat_request_id     BIGINT UNSIGNED NULL,
  provider            VARCHAR(40)  NOT NULL COMMENT 'مثلاً irancopilot, ollama, groq, gemini',
  model               VARCHAR(80)  NOT NULL,
  intent_mode         ENUM('university','general','mixed','continuation','transcribe') NOT NULL DEFAULT 'university',
  prompt_tokens       INT UNSIGNED NOT NULL DEFAULT 0,
  completion_tokens   INT UNSIGNED NOT NULL DEFAULT 0,
  total_tokens        INT UNSIGNED GENERATED ALWAYS AS (prompt_tokens + completion_tokens) STORED,
  estimated_cost_usd  DECIMAL(10,6) NOT NULL DEFAULT 0.000000,
  latency_ms          INT UNSIGNED NOT NULL DEFAULT 0,
  http_status         SMALLINT UNSIGNED NOT NULL DEFAULT 200,
  error_code          VARCHAR(60)  NULL,
  created_at          DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY ix_lpu_time (created_at),
  KEY ix_lpu_provider_time (provider, model, created_at),
  KEY ix_lpu_status (http_status, created_at),
  CONSTRAINT fk_lpu_req FOREIGN KEY (chat_request_id) REFERENCES chat_requests (id) ON DELETE SET NULL
) ENGINE=InnoDB COMMENT='تفکیک دقیق توکن ورودی/خروجی، هزینه و تأخیر هر فراخوانی LLM';

-- =====================================================================
-- ۶) پاک‌سازی خودکار نشست‌ها و توکن‌های منقضی کاربران
-- =====================================================================
DELIMITER $$

DROP PROCEDURE IF EXISTS sp_purge_old_user_sessions$$
CREATE PROCEDURE sp_purge_old_user_sessions()
BEGIN
  DELETE FROM end_user_sessions WHERE expires_at < DATE_SUB(CURRENT_TIMESTAMP(3), INTERVAL 30 DAY) ORDER BY expires_at LIMIT 5000;
  DELETE FROM user_auth_tokens  WHERE expires_at < DATE_SUB(CURRENT_TIMESTAMP(3), INTERVAL 7 DAY)  ORDER BY expires_at LIMIT 5000;
END$$


DELIMITER ;

-- ثبت نسخه مهاجرت
INSERT INTO schema_meta (version, description)
VALUES ('1.7.0', 'Full chatbot schema: user sessions, conversations/messages, SQL knowledge_chunks synced with Upstash Vector, learned_answers, question_clusters, and granular LLM telemetry')
ON DUPLICATE KEY UPDATE description = VALUES(description);
