# Release Notes — 1.6.11

- Fix Vercel deployment configuration by removing the unmatched per-function pattern for `api/admin-preview.js`; the existing `api/*.js` pattern already covers API functions.
- Bundle Preview UI assets through a static CommonJS dependency so Vercel can trace them into the Preview function without a dedicated `includeFiles` rule.
- Keep `/admin` restricted to Preview deployments with `ADMIN_PREVIEW_ENABLED=1`; Production continues to return 404.
- Preserve the MySQL client pin at `mysql2@3.24.6`.
