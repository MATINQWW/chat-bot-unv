'use strict';
const { getPool, enabled } = require('../lib/db');
module.exports = async function cronPurge(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'GET' && req.method !== 'POST') { res.setHeader('Allow', 'GET, POST'); return res.status(405).end(); }
  const secret = process.env.CRON_SECRET;
  const auth = (req.headers && req.headers.authorization) || '';
  if (!secret || auth !== `Bearer ${secret}`) return res.status(401).json({ error: 'unauthorized' });
  if (!enabled()) return res.status(200).json({ ok: true, skipped: 'no_db' });
  const db = getPool();
  try {
    const [r1] = await db.query('DELETE FROM admin_sessions WHERE expires_at < DATE_SUB(NOW(3), INTERVAL 30 DAY) LIMIT 5000').catch(() => [{ affectedRows: 0 }]);
    const [r2] = await db.query('DELETE FROM end_user_sessions WHERE expires_at < DATE_SUB(NOW(3), INTERVAL 30 DAY) LIMIT 5000').catch(() => [{ affectedRows: 0 }]);
    const [r3] = await db.query('DELETE FROM user_auth_tokens WHERE expires_at < DATE_SUB(NOW(3), INTERVAL 7 DAY) LIMIT 5000').catch(() => [{ affectedRows: 0 }]);
    const [r4] = await db.query('DELETE FROM leads WHERE scheduled_delete_at <= NOW(3) ORDER BY scheduled_delete_at LIMIT 1000').catch(() => [{ affectedRows: 0 }]);
    const [r5] = await db.query('DELETE FROM chat_requests WHERE created_at < DATE_SUB(NOW(3), INTERVAL 30 DAY) ORDER BY created_at LIMIT 5000').catch(() => [{ affectedRows: 0 }]);
    return res.status(200).json({ ok: true, purged: { admin_sessions: r1.affectedRows || 0, end_user_sessions: r2.affectedRows || 0, user_auth_tokens: r3.affectedRows || 0, leads: r4.affectedRows || 0, chat_requests: r5.affectedRows || 0 } });
  } catch (e) { return res.status(503).json({ error: 'db_unavailable' }); }
};
