#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════
// SERVER — اجرای پروژه بدون Vercel (هاست cPanel با «Setup Node.js App»، یا VPS)
//   node server.js          (پورت: PORT یا 3000)
// همان هندلرهای api/*.js بدون تغییر اجرا می‌شوند. قوانین redirect و هدرهای امنیتی از vercel.json
// خوانده می‌شوند تا روی هر دو محیط یکسان باشند. روی Vercel این فایل استفاده نمی‌شود.
// ═══════════════════════════════════════════════════════════
try { process.loadEnvFile(); } catch { /* .env اختیاری است؛ در cPanel متغیرها را در پنل بگذارید */ }
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
process.chdir(ROOT); // lib/knowledge.js دانش را نسبت به cwd می‌خواند
const vcfg = JSON.parse(fs.readFileSync(path.join(ROOT, 'vercel.json'), 'utf8'));
const BLOCK = (vcfg.redirects || []).map(r => new RegExp('^' + r.source + '$'));
const HEADERS = ((vcfg.headers || [])[0] || {}).headers || [];
const API = new Set(fs.readdirSync(path.join(ROOT, 'api')).filter(f => f.endsWith('.js')).map(f => f.slice(0, -3)));
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.woff2': 'font/woff2', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.ico': 'image/x-icon', '.txt': 'text/plain; charset=utf-8' };
const MAX_JSON = 4.5 * 1024 * 1024; // همان سقف بدنهٔ Vercel

const handlers = {};
const handler = (name) => handlers[name] || (handlers[name] = require(path.join(ROOT, 'api', name + '.js')));

// افزودن متدهای سبک Vercel/Express به res (status، json)
function decorate(res) {
  res.status = (c) => { res.statusCode = c; return res; };
  res.json = (o) => { if (!res.getHeader('Content-Type')) res.setHeader('Content-Type', 'application/json; charset=utf-8'); res.end(JSON.stringify(o)); return res; };
  return res;
}

async function readJson(req) {
  const chunks = []; let n = 0;
  for await (const c of req) { n += c.length; if (n > MAX_JSON) { const e = new Error('too large'); e.status = 413; throw e; } chunks.push(c); }
  const raw = Buffer.concat(chunks).toString('utf8');
  if (!raw) return {};
  try { return JSON.parse(raw); } catch { const e = new Error('bad json'); e.status = 400; throw e; }
}

const server = http.createServer(async (req, res) => {
  decorate(res);
  for (const h of HEADERS) res.setHeader(h.key, h.value);
  let url;
  try { url = new URL(req.url, 'http://localhost'); } catch { return res.status(400).end(); }
  const p = decodeURIComponent(url.pathname);
  try {
    // ─── API ───
    const m = /^\/api\/([a-z0-9_-]+)\/?$/.exec(p);
    if (m) {
      if (!API.has(m[1])) return res.status(404).json({ error: 'not_found' });
      req.query = Object.fromEntries(url.searchParams);
      // transcribe بدنهٔ خام صوتی را خودش می‌خواند؛ بقیه JSON
      if (req.method === 'POST' && /json/i.test(req.headers['content-type'] || '')) req.body = await readJson(req);
      else if (req.method !== 'POST') req.body = {};
      return await handler(m[1])(req, res);
    }
    // ─── فایل‌های ایستا ───
    if (req.method !== 'GET' && req.method !== 'HEAD') return res.status(405).end();
    const rel = p === '/' ? 'index.html' : p.replace(/^\/+/, '');
    if (BLOCK.some(r => r.test('/' + rel)) || rel.split('/').some(s => s.startsWith('.') || s === 'node_modules' || s === 'api' || s === 'test')) {
      res.statusCode = 302; res.setHeader('Location', '/'); return res.end();
    }
    const file = path.join(ROOT, rel);
    const ext = path.extname(file).toLowerCase();
    if (!file.startsWith(ROOT + path.sep) || !MIME[ext] || ext === '.js' && rel !== 'script.js') return res.status(404).end();
    fs.stat(file, (err, st) => {
      if (err || !st.isFile()) return res.status(404).end();
      res.setHeader('Content-Type', MIME[ext]);
      res.setHeader('Content-Length', st.size);
      res.setHeader('Cache-Control', ext === '.woff2' ? 'public, max-age=31536000, immutable' : 'public, max-age=300');
      if (req.method === 'HEAD') return res.end();
      fs.createReadStream(file).pipe(res);
    });
  } catch (e) {
    console.error('server', e && e.message);
    if (res.headersSent) return res.end();
    return res.status(e.status || 500).json({ error: e.status === 413 ? 'payload_too_large' : e.status === 400 ? 'bad_request' : 'server_error' });
  }
});

// پاسخ‌های جریانی طولانی‌اند؛ timeout پیش‌فرض را کمی بیشتر از سقف درخواست مدل بگذار
server.requestTimeout = 90_000;
server.headersTimeout = 30_000;
server.keepAliveTimeout = 10_000;

if (require.main === module) {
  const port = parseInt(process.env.PORT || '3000', 10);
  server.listen(port, () => console.log(`chat-bot listening on :${port}`));
}
module.exports = server;
