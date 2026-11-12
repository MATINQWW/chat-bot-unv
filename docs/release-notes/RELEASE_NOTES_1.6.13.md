# Nooka 1.6.13 — Main Admin Login & Server-side Sessions

- Exposes `/admin` on the main deployment as a login shell; no mock/demo credentials or client-side role selector remain.
- Adds `/api/admin-auth` with server-side password verification using scrypt hashes.
- Adds separate bootstrap Super Admin and Admin accounts from environment variables.
- Stores opaque admin sessions in shared Upstash Redis with a six-hour TTL.
- Uses `__Host-` Secure, HttpOnly, SameSite=Strict cookies and same-origin POST validation.
- Adds login rate limiting and bounded authentication audit events in Redis.
- Fails closed when shared session storage is unavailable or the Super Admin account is not configured.
- Moves the UI function to `api/admin-ui.js` and updates `/admin` rewrites; removes Preview-only route gating.
- Dashboard content and admin-management screens remain sample UI only; MySQL-backed records and full server-enforced RBAC operations are planned for the VPS phase.
- Adds an interactive local scrypt hash generator; passwords are never included in source or ZIP.
