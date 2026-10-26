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
- The migration and automated tests run on SQLite locally. PostgreSQL runtime behavior needs a PostgreSQL instance; do not infer it from SQLite passes.

## Executed verification

- Backend: 9 tests passed, including simultaneous checkouts and rental acceptance, ownership restrictions, role escalation rejection, sign-out invalidation, stock restoration, and complete service/rental status workflows. A Starlette warning recommends a future transition from httpx to httpx2 in its test client; tests pass with the pinned current dependencies.
- Frontend: 9 tests passed, covering registration, API failure/loading/empty states, protected routes, token expiry, estimate-before-booking, checkout and sign-out. A browser-discovered stale identity after sign-out was fixed and covered by a regression test.
- Database: initial migration and seed passed. A fresh SQLite migration succeeded, and `alembic check` reported no new upgrade operations. No PostgreSQL instance was used for these checks.
- Runtime: Uvicorn and Vite started, `/api/health` and proxied catalogue requests returned successfully.
- Browser: customer registration, adding a provider role, business profile creation, hidden listing creation, sign-in and immediate protected-screen sign-out were verified against the live API.
- Layout: inspected at 1440×1000 and 390×844. Fixed the mobile horizontal overflow; document width matches client width. Screenshots are saved in `docs/screenshots`.
- Dependency audit: npm reported zero vulnerabilities after compatible patches. Python constraints and npm lockfile capture the installed versions.

The browser test leaves one synthetic QA business and one hidden service listing in the local development database. They cannot be discovered in the public catalogue. No real payment or third-party message was sent.
