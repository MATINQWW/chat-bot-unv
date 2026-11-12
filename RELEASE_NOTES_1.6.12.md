# Nooka 1.6.12 — Admin Preview Login & Role Demo

- Added a dedicated admin login screen as the first page at `/admin`.
- Added separate Preview-only demo identities for Super Admin and Admin.
- Super Admin demo can see all preview sections; Admin demo is limited to dashboard, requests, token usage, and knowledge.
- Added visible current-role indicator and logout action.
- Login state exists only in page memory and resets on refresh/logout.
- Explicitly labels client-side demo sign-in as non-production and non-security functionality.
- Real authentication, password hashing, server-side session validation, RBAC enforcement, and audit persistence remain planned for the VPS/MySQL implementation.
- Kept `api/admin-preview.js` Preview-only gate and existing chat APIs unchanged.
