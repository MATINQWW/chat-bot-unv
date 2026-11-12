'use strict';

// Assets are imported statically so Vercel's file tracer bundles them into this function.
const ASSETS = require('../lib/admin-preview/assets');
const TYPES = {
  html: 'text/html; charset=utf-8',
  css: 'text/css; charset=utf-8',
  js: 'application/javascript; charset=utf-8',
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
  if (!Object.prototype.hasOwnProperty.call(ASSETS, asset)) return res.status(404).end();

  res.setHeader('Content-Type', TYPES[asset]);
  return res.status(200).end(ASSETS[asset]);
};
