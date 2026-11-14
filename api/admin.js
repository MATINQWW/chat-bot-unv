'use strict';
const { kv, originAllowed, rateLimited, baseHeaders } = require('../lib/common');
const { getLearner } = require('../lib/prompt');
const report = require('../lib/report');
const auth = require('./admin-auth');

// Legacy report endpoint is retained for /report.html, but it now shares the
// main Super Admin session. ADMIN_TOKEN is no longer an independent credential.
module.exports = async (req, res) => {
  baseHeaders(res);
  res.setHeader('Cache-Control', 'private, no-store, max-age=0');
  if (!kv.remote) return res.status(503).json({ error: 'store_unavailable' });
  if (req.method !== 'GET' && !originAllowed(req)) return res.status(403).end();
  if (await rateLimited(req, 'admin-report', 10, 60)) return res.status(429).json({ error: 'rate_limited' });
  let session;
  try { session = await auth.resolveSession(req, kv, process.env); } catch { return res.status(503).json({ error: 'store_unavailable' }); }
  if (!session || session.account.key !== 'super') return res.status(401).json({ error: 'unauthorized' });
  const L = getLearner();
  const qs = new URL(req.url || '/', 'http://x').searchParams;
  if (req.method === 'GET' && qs.get('report')) {
    await report.prune(kv).catch(() => {});
    const rep = await report.build(kv);
    if (!rep) return res.status(503).json({ error: 'store_unavailable' });
    if (qs.get('report') === 'csv') {
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="questions-report-${rep.generatedAt.slice(0, 10)}.csv"`);
      return res.status(200).end(report.csv(rep));
    }
    rep.kvRemote = !!kv.remote;
    return res.status(200).json(rep);
  }
  if (req.method === 'GET') {
    const d = await L.dashboard();
    if (!d) return res.status(503).json({ error: 'store_unavailable' });
    const lr = await kv.exec([['LRANGE', 'leads', 0, 99]]);
    d.leads = ((lr && lr[0]) || []).map(x => { try { const o = JSON.parse(x); delete o.ip; return o; } catch { return null; } }).filter(Boolean);
    return res.status(200).json(d);
  }
  if (req.method === 'POST') {
    if (req.body && req.body.resetReport === true) {
      try { await report.reset(kv); } catch { return res.status(503).json({ error: 'store_unavailable' }); }
      return res.status(200).json({ ok: true });
    }
    const k = req.body && req.body.delete;
    if (typeof k !== 'string' || !/^[a-f0-9]{16}$/.test(k)) return res.status(400).json({ error: 'bad_request' });
    await L.remove(k);
    return res.status(200).json({ ok: true });
  }
  res.setHeader('Allow', 'GET, POST');
  return res.status(405).end();
};
