'use strict';

// Public shell for the admin login. All sensitive data and identity checks stay in admin-auth.
const ASSETS = require('../lib/admin-panel/assets');
const TYPES = {
  html: 'text/html; charset=utf-8',
  css: 'text/css; charset=utf-8',
  js: 'application/javascript; charset=utf-8',
};

module.exports = (req, res) => {
  res.setHeader('Cache-Control', 'private, no-store, max-age=0');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('X-Robots-Tag', 'noindex, nofollow, noarchive');

  if (req.method !== 'GET' && req.method !== 'HEAD') return res.status(405).end();
  const qs = new URL(req.url || '/', 'https://nooka.invalid').searchParams;
  const asset = qs.get('asset') || 'html';
  if (!Object.prototype.hasOwnProperty.call(ASSETS, asset)) return res.status(404).end();

  res.setHeader('Content-Type', TYPES[asset]);
  if (req.method === 'HEAD') return res.status(200).end();
  return res.status(200).end(ASSETS[asset]);
};
