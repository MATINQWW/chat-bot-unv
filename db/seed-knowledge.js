#!/usr/bin/env node
'use strict';
// انتقال اولیه knowledge/chunks.json به جدول knowledge_chunks در MySQL (بدون شکستن وکتوری‌سازی Upstash Vector)
//   NOOKA_DB_URL='mysql://nooka_app:رمز@127.0.0.1:3306/nooka' node db/seed-knowledge.js
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const mysql = require('mysql2/promise');

function sha256(s) {
  return crypto.createHash('sha256').update(String(s)).digest('hex');
}

function canonicalHash(c) {
  return sha256(JSON.stringify({
    type: c.type,
    title: c.title,
    text: c.text || '',
    answer: c.answer || '',
    questions: c.questions || [],
    keywords: c.keywords || [],
  }));
}

(async () => {
  const dbUrl = process.env.NOOKA_DB_URL || process.env.MYSQL_URL;
  if (!dbUrl) throw new Error('NOOKA_DB_URL تنظیم نشده است.');

  const file = path.join(__dirname, '..', 'knowledge', 'chunks.json');
  const data = JSON.parse(fs.readFileSync(file, 'utf8'));
  const chunks = Array.isArray(data.chunks) ? data.chunks : [];
  if (!chunks.length) throw new Error('هیچ تکه دانشی در knowledge/chunks.json پیدا نشد.');

  const db = await mysql.createConnection({ uri: dbUrl, timezone: '+03:30', charset: 'utf8mb4' });
  let inserted = 0;
  try {
    await db.beginTransaction();
    for (const c of chunks) {
      const h = canonicalHash(c);
      await db.execute(
        `INSERT INTO knowledge_chunks
          (id, chunk_type, title, body_text, faq_answer, faq_questions_json, keywords_json, status, content_sha256, vector_sync_status)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'published', ?, 'pending')
         ON DUPLICATE KEY UPDATE
          title = VALUES(title),
          body_text = VALUES(body_text),
          faq_answer = VALUES(faq_answer),
          faq_questions_json = VALUES(faq_questions_json),
          keywords_json = VALUES(keywords_json),
          content_sha256 = VALUES(content_sha256),
          vector_sync_status = IF(vector_synced_hash = VALUES(content_sha256), vector_sync_status, 'pending')`,
        [
          c.id,
          c.type,
          c.title,
          c.text || '',
          c.type === 'faq' ? (c.answer || null) : null,
          c.questions ? JSON.stringify(c.questions) : null,
          c.keywords ? JSON.stringify(c.keywords) : null,
          h,
        ]
      );
      inserted++;
    }
    await db.commit();
    console.log(`✓ ${inserted} تکه دانش با موفقیت در knowledge_chunks ثبت/به‌روزرسانی شد.`);
    console.log('  برای همگام‌سازی با Upstash Vector دستور npm run ingest را اجرا کنید.');
  } catch (e) {
    await db.rollback().catch(() => {});
    throw e;
  } finally {
    await db.end();
  }
})().catch((e) => {
  console.error('✗', e && e.message || e);
  process.exit(1);
});
