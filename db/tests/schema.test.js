// تست اسکیما روی یک سرور MySQL 8 آزمایشی (دیتابیس nooka_test را می‌سازد و پاک می‌کند؛ هرگز روی سرور واقعی اجرا نکنید)
//   TEST_MYSQL_URL='mysql://root:رمز@127.0.0.1:3306'  npm test      (سرور باید default-time-zone='+03:30' داشته باشد)
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const mysql = require('mysql2/promise');

const URL = process.env.TEST_MYSQL_URL;
if (!URL) { console.log('TEST_MYSQL_URL تنظیم نشده؛ تست رد شد.'); process.exit(0); }
const DB = 'nooka_test';
const APP = { user: 'nooka_app_t', pass: 'App_pw_1234!' };
const ARGON = '$argon2id$v=19$m=65536,t=3,p=4$c29tZXNhbHQ$aGFzaGhhc2hoYXNoaGFzaGhhc2g';
const BCRYPT = '$2b$12$abcdefghijklmnopqrstuuABCDEFGHIJKLMNOPQRSTUVWXYZ01234';

// اجرای فایل SQL شامل DELIMITER (کلاینت mysql2 خودش DELIMITER نمی‌فهمد)
async function runSqlFile(conn, file, transform = (s) => s) {
  const lines = transform(fs.readFileSync(path.join(__dirname, '..', file), 'utf8')).split('\n');
  let delim = ';', buf = '';
  for (const line of lines) {
    const t = line.trim();
    if (!buf && (t === '' || t.startsWith('--'))) continue;
    const m = /^DELIMITER\s+(\S+)/i.exec(t);
    if (m && !buf) { delim = m[1]; continue; }
    const code = line.replace(/\s+--\s.*$/, '');   // کامنت انتهای خط (در فایل‌ها داخل رشته‌ها « -- » نیامده)
    buf += code + '\n';
    if (code.trim().endsWith(delim)) {
      const stmt = buf.trim().slice(0, -delim.length);
      buf = '';
      if (stmt.trim()) await conn.query(stmt);
    }
  }
  assert.equal(buf.trim(), '', 'statement left unterminated in ' + file);
}
const rejects = (p, re) => assert.rejects(p, re);

let root, app;
test.before(async () => {
  root = await mysql.createConnection({ uri: URL, timezone: '+03:30', charset: 'utf8mb4' });
  await root.query(`DROP DATABASE IF EXISTS ${DB}`);
  await root.query(`DROP USER IF EXISTS '${APP.user}'@'localhost'`);
  await runSqlFile(root, '01_schema.sql', (s) => s.replace('CREATE DATABASE IF NOT EXISTS nooka', `CREATE DATABASE IF NOT EXISTS ${DB}`).replace('USE nooka;', `USE ${DB};`));
  await runSqlFile(root, '02_grants.sql', (s) => s.replace(/nooka\./g, `${DB}.`).replace(/'nooka_(app|report|migrator)'/g, "'nooka_$1_t'")
    .replace('<<APP_PASSWORD>>', APP.pass).replace('<<REPORT_PASSWORD>>', 'R1!rrrrrrrr').replace('<<MIGRATOR_PASSWORD>>', 'M1!mmmmmmmm'));
  await root.query(`USE ${DB}`);
  app = await mysql.createConnection({ host: '127.0.0.1', user: APP.user, password: APP.pass, database: DB, timezone: '+03:30' });
});
test.after(async () => {
  if (app) await app.end();
  if (root) {
    await root.query(`DROP DATABASE IF EXISTS ${DB}`);
    await root.query("DROP USER IF EXISTS 'nooka_app_t'@'localhost', 'nooka_report_t'@'localhost', 'nooka_migrator_t'@'localhost'");
    await root.end();
  }
});

const one = async (c, sql, p = []) => (await c.query(sql, p))[0][0];
const adminId = async (name) => (await one(root, 'SELECT id FROM admin_users WHERE username=?', [name])).id;

test('time zone is Tehran and day boundary uses it', async () => {
  await root.query('CALL sp_assert_time_zone()');
  const r = await one(root, "SELECT CURDATE() = DATE(CONVERT_TZ(UTC_TIMESTAMP(),'+00:00','+03:30')) AS same");
  assert.equal(Number(r.same), 1);
  assert.equal((await one(root, "SELECT meta_value v FROM schema_meta WHERE meta_key='schema_version'")).v, '2');
});

test('seed data is complete', async () => {
  const c = async (t) => Number((await one(root, `SELECT COUNT(*) n FROM ${t}`)).n);
  assert.equal(await c('roles'), 5);
  assert.equal(await c('permissions'), 42);
  assert.equal(await c('audit_actions'), 42);
  assert.equal(await c('answer_sources'), 10);
  assert.equal(await c('settings'), 23);
  assert.equal(await c('setting_versions'), 23);
  const sa = await one(root, "SELECT COUNT(*) n FROM role_permissions rp JOIN roles r ON r.id=rp.role_id WHERE r.code='super_admin'");
  assert.equal(Number(sa.n), 42);
});

test('admin_users: password algo, lowercase email, username format, unique', async () => {
  await root.query('INSERT INTO admin_users (username,email,password_hash) VALUES (?,?,?)', ['owner', 'owner@example.com', ARGON]);
  await root.query('INSERT INTO admin_users (username,email,password_hash) VALUES (?,?,?)', ['sara', 'sara@example.com', BCRYPT]);
  await rejects(root.query('INSERT INTO admin_users (username,email,password_hash) VALUES (?,?,?)', ['b1', 'b1@example.com', 'scrypt$00$11']), /ck_admin_pw_algo/);
  await rejects(root.query('INSERT INTO admin_users (username,email,password_hash) VALUES (?,?,?)', ['bad2', 'B2@Example.com', ARGON]), /ck_admin_email_lower/);
  await rejects(root.query('INSERT INTO admin_users (username,email,password_hash) VALUES (?,?,?)', ['Bad3', 'b3@example.com', ARGON]), /ck_admin_username/);
  await rejects(root.query('INSERT INTO admin_users (username,email,password_hash) VALUES (?,?,?)', ['sara2', 'owner@example.com', ARGON]), /Duplicate/);
  await root.query("INSERT INTO admin_user_roles (admin_user_id, role_id) SELECT u.id, r.id FROM admin_users u JOIN roles r ON r.code='super_admin' WHERE u.username='owner'");
  await root.query("INSERT INTO admin_user_roles (admin_user_id, role_id) SELECT u.id, r.id FROM admin_users u JOIN roles r ON r.code='counselor' WHERE u.username='sara'");
  const [rows] = await root.query('SELECT u.username, COUNT(*) n FROM v_admin_effective_permissions v JOIN admin_users u ON u.id=v.admin_user_id GROUP BY u.username ORDER BY 1');
  assert.deepEqual(rows.map((r) => [r.username, Number(r.n)]), [['owner', 42], ['sara', 14]]);
  await root.query("UPDATE admin_users SET status='locked' WHERE username='sara'");
  const [after] = await root.query("SELECT COUNT(*) n FROM v_admin_effective_permissions WHERE admin_user_id=?", [await adminId('sara')]);
  assert.equal(Number(after[0].n), 0, 'locked admin has no effective permissions');
  await root.query("UPDATE admin_users SET status='active' WHERE username='sara'");
});

test('sessions and api tokens store only hashes and revoke individually', async () => {
  const uid = await adminId('owner');
  const h1 = crypto.createHash('sha256').update('t1').digest(), h2 = crypto.createHash('sha256').update('t2').digest();
  await root.query('INSERT INTO admin_sessions (admin_user_id,session_hash,expires_at) VALUES (?,?,DATE_ADD(NOW(3),INTERVAL 6 HOUR)),(?,?,DATE_ADD(NOW(3),INTERVAL 6 HOUR))', [uid, h1, uid, h2]);
  await rejects(root.query('INSERT INTO admin_sessions (admin_user_id,session_hash,expires_at) VALUES (?,?,NOW(3))', [uid, h1]), /Duplicate/);
  await root.query('UPDATE admin_sessions SET revoked_at=NOW(3) WHERE session_hash=?', [h1]);
  const valid = 'SELECT COUNT(*) n FROM admin_sessions WHERE session_hash=? AND revoked_at IS NULL AND expires_at>NOW(3)';
  assert.equal(Number((await one(root, valid, [h1])).n), 0);
  assert.equal(Number((await one(root, valid, [h2])).n), 1);
  await root.query('INSERT INTO admin_api_tokens (admin_user_id,name,token_hash,scopes) VALUES (?,?,?,?)', [uid, 'ci', crypto.randomBytes(32), JSON.stringify(['requests.view'])]);
  await rejects(root.query('INSERT INTO admin_api_tokens (admin_user_id,name,token_hash,scopes) VALUES (?,?,?,?)', [uid, 'x', crypto.randomBytes(32), '{"a":1}']), /ck_tok_scopes/);
});

test('audit_logs is append-only and hashes rows', async () => {
  const uid = await adminId('owner');
  await app.query("INSERT INTO audit_logs (actor_admin_id,actor_label,action_code,ip_hash,details) VALUES (?,?,?,?,?)", [uid, 'owner', 'admin.login.success', 'abc', JSON.stringify({ k: 1 })]);
  await app.query("INSERT INTO audit_logs (attempted_identifier_hash,action_code,outcome) VALUES ('dead','admin.login.failed','failure')");
  const [rows] = await root.query('SELECT HEX(event_hash) h FROM audit_logs ORDER BY id LIMIT 2');
  assert.equal(rows.length, 2);
  assert.notEqual(rows[0].h, rows[1].h);
  assert.match(rows[0].h, /^[0-9A-F]{64}$/);
  await rejects(root.query("UPDATE audit_logs SET outcome='success'"), /append-only/);
  await rejects(root.query('DELETE FROM audit_logs'), /append-only/);
  await rejects(root.query("INSERT INTO audit_logs (action_code) VALUES ('no.such.action')"), /foreign key/);
  await rejects(root.query('DELETE FROM admin_users WHERE id=?', [uid]), /foreign key/);
});

test('app DB user cannot tamper with audit/settings or alter schema', async () => {
  await rejects(app.query("UPDATE audit_logs SET outcome='failure'"), /UPDATE command denied/);
  await rejects(app.query('DELETE FROM audit_logs'), /DELETE command denied/);
  await rejects(app.query('TRUNCATE TABLE audit_logs'), /DROP command denied/);
  await rejects(app.query('DROP TABLE audit_logs'), /DROP command denied/);
  await rejects(app.query('DROP TRIGGER audit_logs_bu'), /TRIGGER command denied/);
  await rejects(app.query("UPDATE settings SET value_json='1' WHERE setting_key='llm.max_tokens'"), /UPDATE command denied/);
  await rejects(app.query('INSERT INTO role_permissions VALUES (1,1)'), /INSERT command denied/);
  await rejects(app.query("UPDATE setting_versions SET change_note='x'"), /UPDATE command denied/);
  await rejects(app.query('SELECT 1 FROM nooka_x.t'), /denied|Unknown|doesn't exist/i);
});

test('settings: validation, versioning, audit via sp_set_setting', async () => {
  const uid = await adminId('owner');
  await app.query("CALL sp_set_setting('llm.max_tokens', CAST(? AS JSON), ?, ?, ?)", ['900', uid, 'raise', 'iph']);
  await app.query("CALL sp_set_setting('llm.temperature', CAST(? AS JSON), ?, NULL, NULL)", ['0.35', uid]);
  await app.query("CALL sp_set_setting('search.semantic_cache', CAST(? AS JSON), ?, NULL, NULL)", ['false', uid]);
  await rejects(app.query("CALL sp_set_setting('llm.max_tokens', CAST('99999' AS JSON), ?, NULL, NULL)", [uid]), /out of allowed range/);
  await rejects(app.query("CALL sp_set_setting('llm.max_tokens', CAST('\"abc\"' AS JSON), ?, NULL, NULL)", [uid]), /must be an integer/);
  await rejects(app.query("CALL sp_set_setting('llm.temperature', CAST('1.5' AS JSON), ?, NULL, NULL)", [uid]), /out of allowed range/);
  await rejects(app.query("CALL sp_set_setting('nope', CAST('1' AS JSON), ?, NULL, NULL)", [uid]), /unknown setting key/);
  const s = await one(root, "SELECT current_version v, updated_by_admin_id u FROM settings WHERE setting_key='llm.max_tokens'");
  assert.equal(s.v, 2); assert.equal(s.u, uid);
  const vers = (await root.query("SELECT version, change_note FROM setting_versions WHERE setting_key='llm.max_tokens' ORDER BY version"))[0];
  assert.deepEqual(vers.map((r) => [r.version, r.change_note]), [[1, 'initial'], [2, 'raise']]);
  const a = (await root.query("SELECT actor_label, target_id FROM audit_logs WHERE action_code='settings.update' AND target_id='llm.max_tokens'"))[0];
  assert.deepEqual(a, [{ actor_label: 'owner', target_id: 'llm.max_tokens' }]);
  await rejects(root.query("UPDATE setting_versions SET change_note='x'"), /append-only/);
  await root.query("UPDATE settings SET is_editable=0 WHERE setting_key='bot.name'");
  await rejects(app.query("CALL sp_set_setting('bot.name', CAST('\"x\"' AS JSON), ?, NULL, NULL)", [uid]), /not editable/);
  await root.query("UPDATE settings SET is_editable=1 WHERE setting_key='bot.name'");
  assert.equal((await one(root, "SELECT JSON_UNQUOTE(value_json) v FROM settings WHERE setting_key='bot.name'")).v, 'نوکا');
});

test('leads: consent, 30-day default retention, scheduled purge, ticket link', async () => {
  const lead = (code, consent, del) => root.query(
    'INSERT INTO leads (lead_code,name,phone_enc,phone_hmac,phone_masked,major,question,consent_given,scheduled_delete_at) VALUES (?,?,?,?,?,?,?,?,?)',
    [code, 'علی', Buffer.from('00', 'hex'), crypto.randomBytes(32), '0912***0000', 'کامپیوتر', 'شهریه چقدر است؟', consent, del]);
  await rejects(lead('c0', 0, null), /ck_leads_consent/);
  await lead('c1', 1, null);
  await lead('old', 1, '2020-01-01 00:00:00');
  const d = await one(root, "SELECT DATEDIFF(scheduled_delete_at, created_at) d FROM leads WHERE lead_code='c1'");
  assert.equal(Number(d.d), 30, 'default retention is 30 days');
  await app.query("CALL sp_set_setting('leads.retention_days', CAST('7' AS JSON), ?, NULL, NULL)", [await adminId('owner')]);
  await lead('c7', 1, null);
  assert.equal(Number((await one(root, "SELECT DATEDIFF(scheduled_delete_at, created_at) d FROM leads WHERE lead_code='c7'")).d), 7, 'retention comes from settings');
  await root.query("INSERT INTO tickets (ticket_code,subject,source,lead_id) SELECT 'T-1','پیگیری','lead',id FROM leads WHERE lead_code='old'");
  await rejects(root.query("INSERT INTO tickets (ticket_code,subject,source,lead_id) SELECT 'T-2','dup','lead',id FROM leads WHERE lead_code='old'"), /Duplicate/);
  await root.query('CALL sp_purge_expired_leads(1000)');
  const left = (await root.query("SELECT lead_code FROM leads ORDER BY lead_code"))[0].map((r) => r.lead_code);
  assert.deepEqual(left, ['c1', 'c7']);
  assert.equal((await one(root, "SELECT lead_id FROM tickets WHERE ticket_code='T-1'")).lead_id, null);
  const log = await one(root, "SELECT actor_label, JSON_EXTRACT(details,'$.deleted') n FROM audit_logs WHERE action_code='lead.purge'");
  assert.equal(log.actor_label, 'system'); assert.equal(Number(log.n), 1);
});

test('tickets: staff messages need an author, internal notes, attachments metadata', async () => {
  const sara = await adminId('sara');
  const t = (await root.query("INSERT INTO tickets (ticket_code,subject) VALUES ('T-9','x')"))[0].insertId;
  await rejects(root.query("INSERT INTO ticket_messages (ticket_id,sender_type,body) VALUES (?,'staff','x')", [t]), /ck_tm_sender/);
  const m = (await root.query("INSERT INTO ticket_messages (ticket_id,sender_type,sender_admin_id,body) VALUES (?,'staff',?,'سلام')", [t, sara]))[0].insertId;
  const n = (await root.query("INSERT INTO ticket_notes (ticket_id,author_admin_id,body) VALUES (?,?,'داخلی')", [t, sara]))[0].insertId;
  const att = (mid, nid) => root.query('INSERT INTO ticket_attachments (ticket_id,message_id,note_id,original_filename,mime_type,size_bytes,sha256,storage_path) VALUES (?,?,?,?,?,?,?,?)',
    [t, mid, nid, 'a.pdf', 'application/pdf', 10, crypto.randomBytes(32), 't/9/a.pdf']);
  await rejects(att(m, n), /ck_ta_one_parent/);
  await att(m, null);
  await root.query('DELETE FROM tickets WHERE id=?', [t]);
  assert.equal(Number((await one(root, 'SELECT COUNT(*) n FROM ticket_attachments')).n), 0, 'cascade removes metadata');
});

test('feedback: one vote per voter, key format', async () => {
  const ins = (vote, key, voter) => root.query('INSERT INTO feedback (vote,answer_key,voter_hash) VALUES (?,?,?)', [vote, key, voter]);
  await ins('down', '0123456789abcdef', 'v1');
  await rejects(ins('up', '0123456789abcdef', 'v1'), /Duplicate/);
  await rejects(ins('up', 'ZZZ', 'v2'), /ck_feedback_key/);
  await ins('down', '0123456789abcdef', 'v2');
  const r = await one(root, "SELECT SUM(vote='down') d FROM feedback WHERE answer_key='0123456789abcdef'");
  assert.equal(Number(r.d), 2);
});

test('chat_requests: metadata only, keys validated, retention purge', async () => {
  const ins = (code, src, createdAt, qk = null) => root.query(
    'INSERT INTO chat_requests (request_code,source,status,provider,model,input_tokens,output_tokens,duration_ms,question_key,created_at) VALUES (?,?,?,?,?,?,?,?,?,?)',
    [code, src, 'success', 'irancopilot', 'icp-chat', 842, 186, 1200, qk, createdAt]);
  const cols = (await root.query("SELECT COLUMN_NAME c FROM information_schema.columns WHERE table_schema=? AND table_name='chat_requests'", [DB]))[0].map((r) => r.c);
  assert.ok(!cols.some((c) => /question$|answer$|text|body/.test(c)), 'no question/answer text columns: ' + cols.join());
  await ins('NK-NEW', 'vector', new Date());
  await ins('NK-OLD', 'faq', new Date(Date.now() - 40 * 864e5), 'a'.repeat(16));
  await rejects(ins('NK-BAD', 'faq', new Date(), 'xyz'), /ck_cr_qkey/);
  await rejects(ins('NK-SRC', 'bogus', new Date()), /foreign key/);
  await root.query('CALL sp_purge_old_chat_requests()');
  const left = (await root.query('SELECT request_code FROM chat_requests'))[0].map((r) => r.request_code);
  assert.deepEqual(left, ['NK-NEW']);
  await app.query("INSERT INTO chat_requests (request_code,source) VALUES ('NK-APP','memory')");
  await rejects(app.query('DELETE FROM chat_requests'), /DELETE command denied/);
});

test('vector snapshots, restores and knowledge revisions', async () => {
  const sha = crypto.randomBytes(32);
  await rejects(root.query("INSERT INTO vector_snapshots (snapshot_code,status,knowledge_version) VALUES ('s1','completed','abc')"), /ck_vs_done/);
  await root.query("INSERT INTO vector_snapshots (snapshot_code,status,knowledge_version,vector_count,content_sha256,file_path) VALUES ('s1','completed',?,75,?,'/b/s1.json')", [sha.toString('hex'), sha]);
  await root.query('INSERT INTO vector_restores (snapshot_id) VALUES (1)');
  await rejects(root.query('DELETE FROM vector_snapshots WHERE id=1'), /foreign key/);
  await app.query("INSERT INTO knowledge_revisions (content_sha256,chunk_count,size_bytes,backup_path,change_summary) VALUES (?,75,123456,'/b/chunks-1.json','edited: faq-tuition')", [sha]);
  await rejects(app.query('UPDATE knowledge_revisions SET chunk_count=1'), /UPDATE command denied/);
});

test('daily aggregates upsert and Tehran date', async () => {
  for (let i = 0; i < 2; i++) await app.query("INSERT INTO daily_source_stats (stat_date,source,request_count) VALUES (CURDATE(),'faq',1) ON DUPLICATE KEY UPDATE request_count=request_count+1");
  for (let i = 0; i < 2; i++) await app.query("INSERT INTO daily_token_usage (stat_date,provider,model,call_count,input_tokens,output_tokens) VALUES (CURDATE(),'p','m',1,1000,200) ON DUPLICATE KEY UPDATE call_count=call_count+1,input_tokens=input_tokens+VALUES(input_tokens),output_tokens=output_tokens+VALUES(output_tokens)");
  const r = await one(root, "SELECT request_count n FROM daily_source_stats WHERE source='faq'");
  assert.equal(r.n, 2);
  assert.equal(Number((await one(root, "SELECT input_tokens n FROM daily_token_usage WHERE model='m'")).n), 2000);
  await rejects(root.query("INSERT INTO daily_source_stats (stat_date,source,request_count) VALUES (CURDATE(),'bogus',1)"), /foreign key/);
});

test('end users and append-only consent history', async () => {
  await rejects(root.query("INSERT INTO end_users (username,password_hash) VALUES ('u1',?)", [ARGON]), /ck_eu_contact/);
  const id = (await root.query("INSERT INTO end_users (username,email,password_hash) VALUES ('u1','u1@example.com',?)", [ARGON]))[0].insertId;
  await root.query("INSERT INTO end_user_consents (end_user_id,consent_type,document_version,granted) VALUES (?,'callback','v1',1),(?,'callback','v1',0)", [id, id]);
  const cur = (await root.query('SELECT granted FROM v_end_user_current_consents WHERE end_user_id=?', [id]))[0];
  assert.equal(cur.length, 1); assert.equal(Number(cur[0].granted), 0);
  await rejects(root.query('UPDATE end_user_consents SET granted=1'), /append-only/);
  await rejects(root.query('DELETE FROM end_user_consents'), /append-only/);
});

test('scheduled events exist and are enabled', async () => {
  const [ev] = await root.query('SELECT event_name n, status s FROM information_schema.events WHERE event_schema=? ORDER BY 1', [DB]);
  assert.deepEqual(ev.map((e) => [e.n, e.s]), [['ev_purge_expired_leads', 'ENABLED'], ['ev_purge_old_chat_requests', 'ENABLED'], ['ev_purge_old_sessions', 'ENABLED']]);
});
