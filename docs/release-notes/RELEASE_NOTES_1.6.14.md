# Nooka 1.6.14 — Admin data integration and dynamic admin accounts

- Replaces fabricated admin dashboard, request, token, knowledge, admin and audit records with data read from Redis, the existing report aggregates, learner statistics and `knowledge/chunks.json`.
- Adds authenticated `/api/admin-data` with per-view data filtering, no-store headers and server-side session validation.
- Adds `/api/admin-users` for Super Admin-only creation, permission updates, deactivation and deletion of additional admin accounts stored in Redis.
- Unifies the legacy `/api/admin` and `/report.html` with the main Super Admin cookie session; the separate `ADMIN_TOKEN` credential no longer bypasses the main login.
- New admin passwords are salted and hashed with scrypt; disabled or deleted accounts cannot restore existing sessions.
- Bootstrap Super Admin remains environment-configured. Legacy `NOOKA_ADMIN_*` bootstrap credentials are no longer loaded; additional admins are managed in Redis.
- Removes static demo counters, fake request rows, fake admins, fake audit rows, sample token costs and misleading infrastructure status claims from the admin UI.
- Shows only tracked token totals; input/output split, per-request transcripts, provider breakdown, costs and latency are explicitly unavailable because the current chat pipeline does not persist them.
- Knowledge is read-only in this release. Safe versioned editing, publishing and Vector re-indexing remain disabled until an atomic publish/outbox workflow is implemented.
- Preserves the existing admin layout and styling.
- Adds admin-user persistence and session revocation tests.
