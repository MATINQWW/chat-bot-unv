-- افزودن ستون cached_tokens به جدول llm_provider_usage (برای دیتابیس‌هایی که قبلاً ساخته شده‌اند)
USE nooka;
SET @col_exists := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'llm_provider_usage' AND COLUMN_NAME = 'cached_tokens'
);
SET @sql := IF(@col_exists = 0,
  'ALTER TABLE llm_provider_usage ADD COLUMN cached_tokens INT UNSIGNED NOT NULL DEFAULT 0 AFTER completion_tokens',
  'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
