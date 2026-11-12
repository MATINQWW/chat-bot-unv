# University Chatbot 1.6.9 — Security and Load-Test Readiness

- CSV exports neutralize formula-leading user-controlled cells (Excel-oriented tab prefix).
- Invalid attachment structures are rejected before the larger attachment request-body budget is granted.
- Production guidance now requires a shared Redis service and `RATE_LIMIT_FAIL_CLOSED=1` for distributed rate limiting on Vercel.
- Added `npm run test:load:local` for repeatable load tests against a local server with a simulated OpenAI-compatible provider.
- No HTML, CSS, frontend JavaScript, or image assets were changed.

## Important remaining deployment checks

- Verify Upstash environment variables and `RATE_LIMIT_FAIL_CLOSED=1` in the Vercel Production environment.
- Provider concurrency remains process-local (`maxConcurrent` in `config.js`); apply provider quotas and a global limit/WAF before large public traffic.
- `mysql2` remains pinned at 3.11.3. If `MYSQL_URL` is used, upgrade to >=3.22.0 before connecting to an untrusted/remote MySQL endpoint because GHSA-3f6p-5ww8-9rcr affects versions before 3.22.0. The current Vercel setup should use Upstash, not MySQL, unless intentionally configured.
- Define retention and deletion policy for contact-request phone numbers stored in Redis.
- Live Vercel and real-provider load testing must still be run from an external network; this package's load test is local-only.
