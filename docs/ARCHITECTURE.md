# Architecture and workflow rules

## Domain

`User` supports multiple role values. Customer profile information is held on the user and address records. One `Business` belongs to one user and can represent their shop, service practice and rental fleet. Independent shops and multiple business profiles per account are a future extension. `Category` has a marketplace kind, and `Listing` has a category, kind and business. Catalogue fields are shared; vehicle-specific descriptive fields are JSON text. Sensitive registration documents are intentionally not collected. Registration values are never returned by the public serializer.

This is deliberately a compact MVP model rather than a separate near-identical table for each offering. Stock is a single integer count in listing units; 500 g products use units of 500 g. Orders snapshot item prices/titles. Persisted carts remain associated with an account. Favourites and reviews have uniqueness constraints; reviews require completed transactions. Availability records specify permitted windows. When a listing has no windows, future requests are permitted, subject to provider confirmation.

Business contact details are shared with the customer after acceptance, through their private transaction. There is no public contact directory, chat provider or automatic messaging. Provider and customer can inspect their own transaction details; administrators have separate protected routes.

## Consistency

Inventory is reserved on checkout. Listing rows are write-locked in ID order; SQL performs a guarded stock decrement, and all decrements, order creation, cart removal, payment metadata and notifications commit together. Exceptions close and roll back the request session. A single seller per cart is enforced on cart additions and checked again at checkout. Cancellations/rejections serialize on the transaction row and restore stock exactly once.

Booking requests are pending and do not reserve inventory/time. Acceptance acquires a listing write lock, rechecks conflict and transitions the request. PostgreSQL additionally enforces an exclusion constraint on accepted/in-progress/active overlapping intervals. Adjacent bookings may share a boundary. Service bookings use the same conflict rule, assuming one team per listing. Separate listings sharing staff/fleet resources are not yet modeled.

Urgent service requests have no promised arrival. A provider must supply a future confirmed start and ETA to accept them. A normal service request without end time defaults to one hour. Fixed and quotation service pricing is not an online contract: quotations remain indicative and there is no price-negotiation chat. Hourly/day estimates round up. Accepted vehicle requests are the confirmed reservation state; there is no redundant separate confirmed status.

Customers may cancel only pending requests. Providers may reject pending requests, or cancel accepted requests before work starts. Fulfillment transitions are defined in `TRANSITIONS` in `main.py`. No completed transaction can be cancelled and no customer can mark work complete. Order stock is restored only on rejection/cancellation. Reorder uses current listing prices/stock, never historical prices; partially added items remain in the cart if later items fail.

## Authentication

Passwords use Argon2. An opaque random bearer token is returned at sign-in/registration, SHA-256 hashed in the database, expires after a configured duration, and is deleted on logout. The frontend stores it in `sessionStorage` to avoid persistent cross-session credentials. That remains readable by JavaScript: deployment should consider Secure/HttpOnly cookie sessions, CSRF controls and a strict content security policy. Backend permissions are mandatory even when frontend routes are protected.

The development login/register limiter is in memory, 15 attempts per minute per direct client IP, and does not trust forwarded headers. Deploy a shared limiter at an authenticated ingress before using multiple API workers. Public registration accepts only business/customer roles and will reject admin values. Administrators bootstrap from environment variables only, and administrative mutations write audit records.

## Payments

There is no gateway implementation, payment capture, refund or payout execution. Businesses explicitly enable pay-direct/cash; checkout is rejected when disabled. The backend calculates totals and commission, and inserts an unpaid payment record. Deposits are excluded from commission and provider earnings. No frontend operation can claim payment succeeded. Commission values are accounting estimates until reconciliation and collection exist.

## Development and growth

PostgreSQL is the deployment target. SQLite simplifies a first laptop run, serializes writes globally and is not a replacement for PostgreSQL concurrency verification. Do not change historical migrations after deployment.

The initial Alembic migration contains frozen table and index operations and PostgreSQL-specific overlap DDL. Future schema changes must use new revisions. The migration does not create tables from live application metadata.

The API is grouped into `/auth`, `/business`, `/listings`, `/bookings`, `/cart`, `/transactions` and `/admin`. Extract the shared transaction domain and API routers as the team grows. Introduce a location table when onboarding additional towns: businesses already carry town and comma-separated exact locality coverage. Public locality filtering is a discovery match; checkout/booking checks exact coverage. No map dependency exists.

The UI uses shared cards, forms, notices, a reusable API client and TanStack Query cache invalidation. Navigation routes compose marketplace, account and management screens. Image placeholders are local. Sample photos and Google Fonts require internet and are optional to core workflows. No real sample ratings, completed bookings or verification claims are invented.

## Hosted demo configuration

`app/config.py` validates environment settings. Local development retains its database and `/api` proxy. In production the API reads provider environment variables instead of local dotenv files, requires hosted PostgreSQL with TLS, normalizes provider URLs to psycopg, and accepts only explicitly configured public HTTPS frontend origins. Password-bearing settings use redacted secret types. Production startup never migrates or seeds data.

The Vercel build uses `VITE_API_BASE_URL` for both API requests and relative uploaded-image paths; the value is a public origin, never a database connection string. Vercel SPA routing is defined in `frontend/vercel.json`. The Render Blueprint is a single-worker demo API with auto-deploy off. Production uploads are disabled unless explicitly enabled with a persistent storage directory, and `/api/config` reports feature availability to the editor. Publishing requires the separate, approval-controlled steps in `docs/DEPLOYMENT.md`.
