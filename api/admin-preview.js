'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', 'lib', 'admin-preview');
const ASSETS = {
  html: { file: 'index.html', type: 'text/html; charset=utf-8' },
  css: { file: 'style.css', type: 'text/css; charset=utf-8' },
  js: { file: 'app.js', type: 'application/javascript; charset=utf-8' },
};

module.exports = (req, res) => {
  res.setHeader('Cache-Control', 'private, no-store, max-age=0');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('X-Robots-Tag', 'noindex, nofollow, noarchive');

  // Preview UI must never be exposed on production deployments.
  if (process.env.VERCEL_ENV !== 'preview' || process.env.ADMIN_PREVIEW_ENABLED !== '1') {
    return res.status(404).end();
  }
  if (req.method !== 'GET') return res.status(405).end();

  const qs = new URL(req.url || '/', 'https://nooka.invalid').searchParams;
  const asset = qs.get('asset') || 'html';
  const entry = ASSETS[asset];
  if (!entry) return res.status(404).end();

  try {
    const content = fs.readFileSync(path.join(ROOT, entry.file), 'utf8');
    res.setHeader('Content-Type', entry.type);
    return res.status(200).end(content);
  } catch (error) {
    console.error('admin preview asset unavailable', asset, error && error.message);
    return res.status(500).end('Preview asset unavailable');
  }
};
