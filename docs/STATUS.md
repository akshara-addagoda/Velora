# Development status

The implementation is a functional local MVP, not a production-complete marketplace. Current features and setup are documented in README.

## Known scope limits

- No password-reset/email verification, multi-business accounts or social login. Existing accounts can enable additional business roles from their profile.
- Vehicle public details are flexible JSON and registration documents are not collected. No identity verification or driving eligibility assessment.
- Text locality coverage, one town selector, no geographic polygons, routing or distance-based delivery fees.
- Manual time windows, no recurring schedules, blackout windows or shared-staff calendars. Customers can request times and providers confirm; no real-time dispatch.
- One seller per checkout; no discounts/coupons, bundled subscriptions, live chat, promotions or real-time sockets.
- Direct/cash payment is explicit and remains unpaid in the system. No gateway, collection, refunds or payouts.
- Reviews can be created after completion, and businesses can read public reviews. There is no provider reply editor.
- Admin can create categories and moderate listings/users/reports. Category renaming/deletion and complex permission customization are not included.
- Local image uploads have signature/size checks; production needs full media decoding, scanning, storage policies and quotas.
- Lists in private dashboards are not yet paginated. Public catalogue is paginated.
- Unit/concurrency tests use isolated SQLite databases. PostgreSQL 17 migrations and real HTTP workflows were additionally verified against the existing local `Velora` database; multi-process PostgreSQL stress testing is still not included.

## Executed verification

- Backend: 9 tests passed, including simultaneous checkouts and rental acceptance, ownership restrictions, role escalation rejection, sign-out invalidation, stock restoration, and complete service/rental status workflows. A Starlette warning recommends a future transition from httpx to httpx2 in its test client; tests pass with the pinned current dependencies.
- Frontend: 9 tests passed, covering registration, API failure/loading/empty states, protected routes, token expiry, estimate-before-booking, checkout and sign-out. A browser-discovered stale identity after sign-out was fixed and covered by a regression test.
- Database: initial migration and seed passed. A fresh SQLite migration succeeded, and `alembic check` reported no new upgrade operations. No PostgreSQL instance was used for these checks.
- Runtime: Uvicorn and Vite started, `/api/health` and proxied catalogue requests returned successfully.
- Browser: customer registration, adding a provider role, business profile creation, hidden listing creation, sign-in and immediate protected-screen sign-out were verified against the live API.
- Layout: inspected at 1440×1000 and 390×844. Fixed the mobile horizontal overflow; document width matches client width. Screenshots are saved in `docs/screenshots`.
- Dependency audit: npm reported zero vulnerabilities after compatible patches. Python constraints and npm lockfile capture the installed versions.

The browser test leaves one synthetic QA business and one hidden service listing in the local development database. They cannot be discovered in the public catalogue. No real payment or third-party message was sent.

## PostgreSQL integration — 27 October 2026

- Found PostgreSQL 17.2 running on port 5432. The existing database is named **`Velora`**, with a capital V; lowercase `velora` does not exist.
- Inspected the target database before migration: no public tables and no Alembic history. Applied the existing `001` migration, verified head and no schema drift, and ran the idempotent development seed. No database, table or existing record was deleted, renamed or reset. Fleet Masters was not modified.
- Saved the URL-encoded connection only in ignored root `.env`, using a hidden password prompt. No credentials are embedded in code, frontend configuration, examples or logs.
- Added a root `npm.cmd run dev` launcher to start the existing API and Vite processes together, verify their HTTP health/proxy and support alternate ports without terminating unrelated programs. Both remain bound to loopback.
- Added a generic HTTP 503 database-outage response and a five-second database connection timeout. Backend suite: **10 tests passed**. Frontend suite: **9 tests passed**; build and TypeScript checks passed.
- Ran `python -m app.smoke_check http://127.0.0.1:5173` against the PostgreSQL-backed running application. Registration, multiple roles, listing creation, service completion/review, private-record checks, insufficient produce stock, accurate totals, cancellation restoration, seller stock updates, rental estimates, overlap prevention, rental completion, notifications and logout all passed.
- That opt-in smoke check leaves synthetic records in the development database and hides its three listings afterward. It does not reset any data or process payments.

The earlier SQLite data file is preserved. New activity now uses PostgreSQL. Application servers must remain running for the browser URL to work; opening the browser alone does not start them.
