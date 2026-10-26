# Velora

A local marketplace for **Mahabubabad, Telangana**: book local professionals, order produce, and request vehicle rentals. This is a working development MVP with a React client, FastAPI API and persistent SQL database. It is not ready for public commercial launch without the work described below.

## What works

- Registration with multiple business roles, Argon2 password hashing, expiring server-side sessions and sign-out invalidation. Public registration cannot assign administrators.
- Search, category/locality/price/rating filters, sorting, pagination, public business pages, favourites and reviews from completed transactions.
- Business profile creation, administrator verification, listing creation/editing, produce stock management, image uploads, and availability windows.
- Scheduled and earliest-available service requests. Providers accept/reject, supply arrival estimates and manage fulfillment.
- Single-shop produce carts, inventory checks at checkout, exact decimal totals, pickup/delivery, order tracking, reorder and cancellation with stock restoration.
- Vehicle estimates with duration rounding, deposits, time windows and overlapping acceptance prevention.
- Customer and business dashboards, notifications, addresses and profile editing.
- Admin metrics, users, business verification, listing moderation, category creation, support reports and audit trail.
- Explicit direct-payment mode. No online payment, email, SMS, WhatsApp or push provider is configured.

## Stack and structure

React 19, Vite, TypeScript, Tailwind 4, React Router, TanStack Query and Lucide. Python 3.13+, FastAPI, Pydantic, SQLAlchemy 2, Alembic, Argon2 and PostgreSQL support. SQLite is provided for a laptop-friendly first run.

```text
backend/app/             API, models, schemas, auth, database and seed
backend/app/tests/       API workflow and authorization tests
backend/alembic/         schema migration and PostgreSQL overlap constraint
frontend/src/           React pages, dashboards, API client and design system
frontend/public/        local image fallback
docs/                   architecture, development status and deployment notes
```

## First run on Windows PowerShell

Prerequisites: Python 3.13 or later, Node.js 22 LTS with npm. PostgreSQL 16+ is recommended for deployment. Docker is optional. Run the following from the project folder. No activation or PowerShell execution-policy change is needed.

```powershell
cd 'C:\Users\Akshara Addagoda\OneDrive\Desktop\Velora'
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r backend\requirements.txt
Copy-Item .env.example .env
cd backend
..\.venv\Scripts\python.exe -m alembic upgrade head
..\.venv\Scripts\python.exe -m app.seed
..\.venv\Scripts\python.exe -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

If `venv` reports an `ensurepip` error but creates `.venv\Scripts\python.exe`, run this from the project root using your installed Python pip:

```powershell
python -m pip --python .venv/Scripts/python.exe install -r backend/requirements.txt
```

In a **second terminal**:

```powershell
cd 'C:\Users\Akshara Addagoda\OneDrive\Desktop\Velora\frontend'
npm.cmd ci
npm.cmd run dev
```

Open [Velora](http://localhost:5173). The API runs at [localhost:8000](http://localhost:8000/api/health); interactive documentation is at [localhost:8000/docs](http://localhost:8000/docs). Vite proxies `/api` to the API server. Stop each server with Ctrl+C. Repeat only the two server commands for subsequent runs.

The current setup already has a migrated SQLite database and sample listings. Do not overwrite an existing `.env`; edit it as needed. The seed is idempotent and does not replace existing listings.

## Create test accounts

There are **no shared demo passwords**. Register a customer account in the UI. In another browser or a second session, register a business account and select one or more of “Offer local services”, “Sell fresh produce” and “Rent out vehicles”. One account can hold all three roles.

1. Open **My account → Business dashboard** on the business account. Save a business profile with your supported localities and direct payment enabled.
2. Open **Listings → New listing**, create an offering and optionally add availability windows from Edit.
3. Sign in as the customer, find that listing and submit a request/order.
4. Sign in as the business owner, open **Requests**, expand the transaction and move through permitted states.
5. The customer sees updates under **My activity** and **Notifications**, and can review completed transactions.

Sample listings are illustrative and cannot fulfill real requests. Their business accounts use random, inaccessible passwords. Verification badges are not fabricated. To test fulfillment, create your own listings.

### Development administrator

Set `ADMIN_EMAIL` and a strong `ADMIN_PASSWORD` of at least 12 characters in the root `.env`, then rerun `python -m app.seed` from `backend` using the virtual environment interpreter. Registering through the public form never gives admin access. If the email already exists, the seed does not promote it. Use a new email. Sign in and use **My account → Administration**.

Remove the administrator bootstrap password from `.env` after creation. The seed never changes an existing user's password.

## PostgreSQL

Create a database and user using an installed PostgreSQL server (replace the password):

```sql
CREATE USER velora WITH PASSWORD 'REPLACE_WITH_A_STRONG_PASSWORD';
CREATE DATABASE velora OWNER velora;
```

Set root `.env`:

```dotenv
DATABASE_URL=postgresql+psycopg://velora:YOUR_URL_ENCODED_PASSWORD@localhost:5432/velora
```

Then, from `backend`:

```powershell
..\.venv\Scripts\python.exe -m alembic upgrade head
..\.venv\Scripts\python.exe -m app.seed
```

The first migration installs `btree_gist` for a database-level overlap exclusion constraint. If your database user cannot install extensions, have the database administrator run `CREATE EXTENSION IF NOT EXISTS btree_gist` first. SQLite and PostgreSQL databases are independent; changing the URL does not transfer data. Run the API from `backend` consistently so the relative SQLite file resolves to the same path.

## Configuration

| Variable | Purpose | Default |
| --- | --- | --- |
| `DATABASE_URL` | SQLAlchemy connection URL | SQLite `./velora.db` |
| `FRONTEND_ORIGIN` | Allowed CORS origin | `http://localhost:5173` |
| `COMMISSION_PERCENT` | Commission on subtotal, excluding deposits/delivery | `5` |
| `SESSION_HOURS` | Server session lifetime | `24` |
| `ADMIN_EMAIL`, `ADMIN_PASSWORD` | Optional seed-only admin bootstrap | empty |

Money uses SQL Decimal/Numeric and is calculated on the backend. ₹25 is the initial flat produce delivery fee; pickup has no fee. There are no discounts in this MVP. Rental durations round up to the next full hourly/daily unit. Vehicle deposits are separate from commission and provider earnings. Timestamps are UTC in storage; displays use Asia/Kolkata. Date/time entry is labelled as the browser's local time.

## Verification commands

From `backend`:

```powershell
..\.venv\Scripts\python.exe -m pytest app/tests -q
```

From `frontend`:

```powershell
npm.cmd test
npm.cmd run build
npm.cmd run lint
```

The API tests use isolated temporary SQLite databases. They never reset your development database. They cover auth, privilege escalation, ownership, service transitions, stock shortage/stale carts, cancellation restoration, mixed shops, reviews, rental overlaps, coverage, availability, urgent scheduling, upload rejection and moderation. Concurrent checkout and rental acceptance tests use separate database connections. PostgreSQL-specific and multi-process concurrency checks require a separate PostgreSQL test environment; SQLite results do not establish those checks.

## Common issues

- **Failed to fetch / API connection refused:** start the backend before the frontend. Check `/api/health` and terminal output.
- **Empty catalogue:** run migration and seed from `backend`, and confirm the configured database URL.
- **Stock conflict:** refresh your bag and reduce quantities. Cart quantities do not reserve stock; checkout does.
- **Booking overlap:** choose another time or have the provider reject/cancel the conflicting reservation.
- **Unsupported locality:** use an exact locality from the business coverage list. This avoids assuming town-wide coverage.
- **403 on dashboard:** the account needs the corresponding role and must own the business/listing.
- **Session expired:** sign in again. Sessions are stored per browser tab and invalidated on sign-out.
- **Image does not load:** remote sample images/fonts require internet. Uploaded files and the local listing fallback work without it.
- **Port in use:** stop the previous server or choose another port. If the API port changes, update `frontend/vite.config.ts`.
- **Dependency install cannot resolve registry:** allow the terminal internet access and retry. Do not disable TLS verification.

## Production readiness and external integrations

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for tradeoffs and [docs/STATUS.md](docs/STATUS.md) for verified scope. Before launch:

- Use PostgreSQL, separate deployment secrets, HTTPS, same-origin API routing and backups with tested restore.
- Keep the frozen migration immutable; generate new Alembic revisions for schema changes and add PostgreSQL concurrency CI.
- Add account email verification, password recovery, stronger session/browser protections and distributed rate limiting. Current auth throttling is process-local and is for development.
- Add object storage, image decoding/re-encoding, malware scanning, quotas and lifecycle cleanup. Local uploads currently validate signatures and size only.
- Finalize provider onboarding, licence/insurance requirements, consumer grievance policies and legally reviewed terms/privacy documents. Current policies are development notices.
- Connect a payment gateway only with verified server webhooks and idempotency. Add reconciliation, refunds, commission collection, payouts and gateway integration tests. Payments stay `unpaid` in this version, including after fulfillment; paying offline is not automatically recorded.
- Implement scalable notifications, metrics, monitoring, log retention, moderation operations, data export/deletion and accessibility audits.
- Add scheduling/availability editing safeguards, automated cancellation cutoffs and more comprehensive automated browser tests.

Existing customers can enable additional business roles from **My account** without creating another account. The frontend `.npmrc` retains `legacy-peer-deps=true` to avoid an npm 10 optional-peer resolution error encountered during setup; all required test peers are explicit dependencies.

For Python formatting and linting, install `backend/requirements-dev.txt` and run `.\.venv\Scripts\ruff.exe check backend` and `.\.venv\Scripts\ruff.exe format --check backend` from the root. Frontend formatting uses `npm.cmd run format`; `npm.cmd run lint` checks TypeScript.

No paid maps API is needed. SMS, email, WhatsApp, push and online payment providers need separate configuration and integration work. None is presented as live. This project is local-only and has not been published.
