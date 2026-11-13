# Nooka 1.6.10 — Admin Preview Foundation

- Added a Preview-only admin UI shell at `/admin`, matching the existing Nooka warm-neutral and blue visual system.
- Added demo pages for dashboard, requests, token usage, knowledge, admins/permissions, audit events, and settings.
- Preview route requires both `VERCEL_ENV=preview` and `ADMIN_PREVIEW_ENABLED=1`; it is hard-disabled on Production.
- All displayed data is fictional. No real user data, database writes, or admin mutations are performed by this preview.
- Kept the existing chat frontend, chat APIs, knowledge JSON, and Vector ingestion flow unchanged.
- Added automated tests for preview gating and static asset delivery.
