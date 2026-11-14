-- =====================================================================
--  دسترسی حداقلی کاربران دیتابیس — بعد از 01_schema.sql اجرا شود
--  ⚠ قبل از اجرا، سه رمز <<...>> را با رمز تصادفی قوی عوض کنید (و در Git نگذارید؛
--    آن‌ها را در Environment Variables سرور نگه دارید: مثلاً MYSQL_URL).
--  اگر برنامه روی سرور دیگری است، 'localhost' را با IP/الگوی همان سرور عوض کنید.
--  نکته: تریگرها و رویه‌ها با دسترسی سازنده (DEFINER) اجرا می‌شوند؛ پس کاربر برنامه
--  بدون هیچ دسترسی مستقیم می‌تواند از طریق آن‌ها لاگ ممیزی و نسخهٔ تنظیمات بنویسد.
-- =====================================================================

-- ۱) کاربر برنامه (Node / پنل ادمین)
CREATE USER IF NOT EXISTS 'nooka_app'@'localhost' IDENTIFIED BY '<<APP_PASSWORD>>';

-- جدول‌های عملیاتی: خواندن/نوشتن کامل
GRANT SELECT, INSERT, UPDATE, DELETE ON nooka.admin_users        TO 'nooka_app'@'localhost';
GRANT SELECT, INSERT, UPDATE, DELETE ON nooka.admin_user_roles   TO 'nooka_app'@'localhost';
GRANT SELECT, INSERT, UPDATE, DELETE ON nooka.admin_sessions     TO 'nooka_app'@'localhost';
GRANT SELECT, INSERT, UPDATE, DELETE ON nooka.admin_api_tokens   TO 'nooka_app'@'localhost';
GRANT SELECT, INSERT, UPDATE, DELETE ON nooka.end_users          TO 'nooka_app'@'localhost';
GRANT SELECT, INSERT, UPDATE, DELETE ON nooka.leads              TO 'nooka_app'@'localhost';
GRANT SELECT, INSERT, UPDATE, DELETE ON nooka.tickets            TO 'nooka_app'@'localhost';
GRANT SELECT, INSERT, UPDATE, DELETE ON nooka.ticket_messages    TO 'nooka_app'@'localhost';
GRANT SELECT, INSERT, UPDATE, DELETE ON nooka.ticket_notes       TO 'nooka_app'@'localhost';
GRANT SELECT, INSERT, UPDATE, DELETE ON nooka.ticket_attachments TO 'nooka_app'@'localhost';
GRANT SELECT, INSERT, UPDATE, DELETE ON nooka.vector_snapshots   TO 'nooka_app'@'localhost';
GRANT SELECT, INSERT, UPDATE, DELETE ON nooka.vector_restores    TO 'nooka_app'@'localhost';
GRANT SELECT, INSERT, UPDATE, DELETE ON nooka.feedback           TO 'nooka_app'@'localhost';
GRANT SELECT, INSERT, UPDATE         ON nooka.daily_source_stats TO 'nooka_app'@'localhost';
GRANT SELECT, INSERT, UPDATE         ON nooka.daily_token_usage  TO 'nooka_app'@'localhost';
GRANT SELECT, INSERT, UPDATE         ON nooka.daily_error_stats  TO 'nooka_app'@'localhost';
GRANT SELECT, INSERT, UPDATE         ON nooka.daily_counters     TO 'nooka_app'@'localhost';
GRANT SELECT, INSERT                 ON nooka.chat_requests      TO 'nooka_app'@'localhost';  -- حذف با رویداد سرور
GRANT SELECT, INSERT                 ON nooka.knowledge_revisions TO 'nooka_app'@'localhost';

-- مرجع‌ها: فقط خواندن (تغییر نقش/دسترسی از مسیر مهاجرت کنترل‌شده)
GRANT SELECT ON nooka.roles            TO 'nooka_app'@'localhost';
GRANT SELECT ON nooka.permissions      TO 'nooka_app'@'localhost';
GRANT SELECT ON nooka.role_permissions TO 'nooka_app'@'localhost';
GRANT SELECT ON nooka.audit_actions    TO 'nooka_app'@'localhost';
GRANT SELECT ON nooka.answer_sources   TO 'nooka_app'@'localhost';
GRANT SELECT ON nooka.schema_meta      TO 'nooka_app'@'localhost';
GRANT EXECUTE ON PROCEDURE nooka.sp_assert_time_zone TO 'nooka_app'@'localhost';
GRANT SELECT ON nooka.v_admin_effective_permissions TO 'nooka_app'@'localhost';
GRANT SELECT ON nooka.v_end_user_current_consents   TO 'nooka_app'@'localhost';

-- فقط‌افزودنی: INSERT و SELECT — بدون UPDATE/DELETE
GRANT SELECT, INSERT ON nooka.audit_logs        TO 'nooka_app'@'localhost';
GRANT SELECT, INSERT ON nooka.end_user_consents TO 'nooka_app'@'localhost';
GRANT SELECT         ON nooka.setting_versions  TO 'nooka_app'@'localhost';  -- نوشتن فقط با تریگر

-- تنظیمات: خواندن مستقیم؛ تغییر فقط با رویه (اعتبارسنجی + نسخه + ممیزی)
GRANT SELECT  ON nooka.settings TO 'nooka_app'@'localhost';
GRANT EXECUTE ON PROCEDURE nooka.sp_set_setting TO 'nooka_app'@'localhost';

-- عمداً داده نمی‌شود: DROP, ALTER, TRIGGER, CREATE, TRUNCATE (نیاز به DROP) و EVENT.

-- ۲) کاربر گزارش (فقط‌خواندنی؛ برای Grafana/Metabase) — بدون شماره، رمز، توکن و لاگ ممیزی
CREATE USER IF NOT EXISTS 'nooka_report'@'localhost' IDENTIFIED BY '<<REPORT_PASSWORD>>';
GRANT SELECT ON nooka.daily_source_stats TO 'nooka_report'@'localhost';
GRANT SELECT ON nooka.daily_token_usage  TO 'nooka_report'@'localhost';
GRANT SELECT ON nooka.daily_error_stats  TO 'nooka_report'@'localhost';
GRANT SELECT ON nooka.daily_counters     TO 'nooka_report'@'localhost';
GRANT SELECT ON nooka.answer_sources     TO 'nooka_report'@'localhost';
GRANT SELECT ON nooka.chat_requests      TO 'nooka_report'@'localhost';
GRANT SELECT ON nooka.vector_snapshots   TO 'nooka_report'@'localhost';

-- ۳) کاربر مهاجرت (فقط هنگام ارتقای اسکیما استفاده و بعد غیرفعال/قطع شود)
CREATE USER IF NOT EXISTS 'nooka_migrator'@'localhost' IDENTIFIED BY '<<MIGRATOR_PASSWORD>>';
GRANT ALL PRIVILEGES ON nooka.* TO 'nooka_migrator'@'localhost';

FLUSH PRIVILEGES;
