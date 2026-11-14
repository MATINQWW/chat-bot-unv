#!/usr/bin/env node
// VPS/standalone HTTP entry point. The public UI and the /api/* contract are kept intact.
try { process.loadEnvFile(); } catch { /* .env is optional when env is injected by the host */ }

const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = fs.realpathSync(__dirname);
// فقط همین فایل‌ها به‌صورت استاتیک سرو می‌شوند؛ بقیهٔ ریشهٔ پروژه (config.js، lib، ...) هرگز
const STATIC_OK = /^(index\.html|style\.css|script\.js|report\.html|report\.js|owl\.png|assets\/.+|admin\/.+)$/;
process.chdir(ROOT);
const vcfg = JSON.parse(fs.readFileSync(path.join(ROOT, 'vercel.json'), 'utf8'));
const BLOCK = (vcfg.redirects || []).map(r => new RegExp('^' + r.source + '$'));
const HEADERS = ((vcfg.headers || [])[0] || {}).headers || [];
const API = new Set(fs.readdirSync(path.join(ROOT, 'api')).filter(f => f.endsWith('.js')).map(f => f.slice(0, -3)));
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.woff2': 'font/woff2', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp',
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.ico': 'image/x-icon', '.txt': 'text/plain; charset=utf-8',
};
const MAX_JSON = 4.5 * 1024 * 1024;

const handlers = Object.create(null);
const handler = name => handlers[name] || (handlers[name] = require(path.join(ROOT, 'api', name + '.js')));

function decorate(res) {
  res.status = code => { res.statusCode = code; return res; };
  res.json = value => {
    if (!res.headersSent && !res.getHeader('Content-Type')) res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(JSON.stringify(value));
    return res;
  };
  return res;
}

async function readJson(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_JSON) {
      const error = new Error('payload too large');
      error.status = 413;
      throw error;
    }
    chunks.push(chunk);
  }
  const raw = Buffer.concat(chunks).toString('utf8');
  if (!raw) return {};
  try { return JSON.parse(raw); }
  catch {
    const error = new Error('invalid JSON');
    error.status = 400;
    throw error;
  }
}

function sendError(res, error) {
  if (res.headersSent || res.destroyed) {
    if (!res.destroyed) res.end();
    return;
  }
  const status = Number(error && error.status) || 500;
  const code = status === 413 ? 'payload_too_large' : status === 400 ? 'bad_request' : 'server_error';
  res.status(status).json({ error: code });
}

async function staticFile(req, res, pathname) {
  if (req.method !== 'GET' && req.method !== 'HEAD') return res.status(405).end();

  const rel = pathname.replace(/^\/+/, '');
  if (rel === 'admin') { res.statusCode = 302; res.setHeader('Location', '/admin/'); return res.end(); }   // مسیرهای نسبیِ پنل به اسلش پایانی نیاز دارند
  if (BLOCK.some(regex => regex.test('/' + rel)) || rel.split('/').some(part =>
    part.startsWith('.') || part === 'node_modules' || part === 'api' || part === 'test')) {
    res.statusCode = 302;
    res.setHeader('Location', '/');
    return res.end();
  }

  const target = rel === '' ? 'index.html' : rel === 'admin/' ? 'admin/index.html' : rel;   // «/» و «/admin»
  if (!STATIC_OK.test(target)) return res.status(404).end();
  const file = path.resolve(ROOT, target);
  if (!file.startsWith(ROOT + path.sep)) return res.status(404).end();
  const ext = path.extname(file).toLowerCase();
  if (!MIME[ext]) return res.status(404).end();

  let realPath;
  let stat;
  try {
    realPath = await fs.promises.realpath(file);
    stat = await fs.promises.stat(realPath);
  } catch { return res.status(404).end(); }
  // Also defend against a symlink inside the public tree pointing outside it.
  if (!realPath.startsWith(ROOT + path.sep) || !stat.isFile()) return res.status(404).end();

  res.setHeader('Content-Type', MIME[ext]);
  res.setHeader('Content-Length', stat.size);
  res.setHeader('Cache-Control', ext === '.woff2' ? 'public, max-age=31536000, immutable' : 'public, max-age=300');
  if (rel === 'admin' || rel.startsWith('admin/')) {   // همان هدرهای قبلیِ /api/admin-ui برای صفحهٔ پنل
    res.setHeader('Cache-Control', 'private, no-store, max-age=0');
    res.setHeader('X-Robots-Tag', 'noindex, nofollow, noarchive');
    res.setHeader('Referrer-Policy', 'no-referrer');
  }
  if (req.method === 'HEAD') return res.end();

  const stream = fs.createReadStream(realPath);
  stream.on('error', error => {
    console.error('static file read failed:', error.code || error.message);
    if (!res.headersSent) sendError(res, error);
    else res.destroy(error);
  });
  stream.pipe(res);
}

async function readiness() {
  let llmReady = false;
  let storeReady = true;
  try { llmReady = require('./lib/llm').configured(); } catch { llmReady = false; }

  const { kv } = require('./lib/common');
  if (process.env.REQUIRE_SHARED_STORE === '1') {
    if (!kv.remote) storeReady = false;
    else {
      const probe = await kv.exec([['GET', '__chatbot_readiness_probe__']]);
      storeReady = Array.isArray(probe);
    }
  }
  return llmReady && storeReady;
}

const server = http.createServer(async (req, res) => {
  decorate(res);
  for (const header of HEADERS) res.setHeader(header.key, header.value);
  res.setHeader('X-DNS-Prefetch-Control', 'off');

  let url;
  let pathname;
  try {
    url = new URL(req.url, 'http://localhost');
    pathname = decodeURIComponent(url.pathname);
  } catch {
    return res.status(400).json({ error: 'bad_request' });
  }

  try {
    if (pathname === '/health/live') {
      if (req.method !== 'GET' && req.method !== 'HEAD') return res.status(405).end();
      res.setHeader('Cache-Control', 'no-store');
      return req.method === 'HEAD' ? res.status(200).end() : res.status(200).json({ status: 'ok' });
    }

    if (pathname === '/health/ready') {
      if (req.method !== 'GET' && req.method !== 'HEAD') return res.status(405).end();
      const ready = await readiness();
      res.setHeader('Cache-Control', 'no-store');
      return req.method === 'HEAD' ? res.status(ready ? 200 : 503).end()
        : res.status(ready ? 200 : 503).json({ status: ready ? 'ready' : 'not_ready' });
    }

    const apiMatch = /^\/api\/([a-z0-9_-]+)\/?$/.exec(pathname);
    if (apiMatch) {
      const name = apiMatch[1];
      if (!API.has(name)) return res.status(404).json({ error: 'not_found' });
      req.query = Object.fromEntries(url.searchParams);
      // /api/transcribe consumes raw audio; all JSON methods (POST/PUT/PATCH/DELETE) are parsed.
      if (!['GET', 'HEAD'].includes(req.method) && /application\/json/i.test(req.headers['content-type'] || '')) req.body = await readJson(req);
      else if (['GET', 'HEAD'].includes(req.method)) req.body = {};
      return await handler(name)(req, res);
    }

    return await staticFile(req, res, pathname);
  } catch (error) {
    console.error('request failed:', error && (error.code || error.message || error));
    return sendError(res, error);
  }
});

server.requestTimeout = 120_000;
server.headersTimeout = 30_000;
server.keepAliveTimeout = 10_000;
server.maxHeadersCount = 100;
server.maxRequestsPerSocket = 1000;

if (require.main === module) {
  const port = Number.parseInt(process.env.PORT || '3000', 10);
  const host = process.env.HOST || (process.env.NODE_ENV === 'production' ? '127.0.0.1' : '0.0.0.0');
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT must be between 1 and 65535');

  server.listen(port, host, () => console.log(`chat-bot listening on ${host}:${port}`));

  let shuttingDown = false;
  const shutdown = signal => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`received ${signal}; shutting down`);
    const force = setTimeout(() => process.exit(1), 12_000);
    force.unref();
    server.close(async () => {
      try {
        const { kv } = require('./lib/common');
        if (typeof kv.end === 'function') await kv.end();
      } catch (error) {
        console.error('shutdown cleanup failed:', error && (error.code || error.message));
      } finally {
        clearTimeout(force);
        process.exit(0);
      }
    });
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

module.exports = server;
