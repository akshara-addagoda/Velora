# Publish a Velora demo: Vercel + Render

**Status: prepared locally, not deployed. No public URL has been verified.** No Git push, hosted resource creation, hosted migration, seed, or production-data change was performed. Your local `.env` and PostgreSQL data remain private and unchanged.

## What is prepared

| Component | Folder | Local command | Hosting configuration |
| --- | --- | --- | --- |
| React / Vite / TypeScript / Tailwind | `frontend` | `npm.cmd run dev` | Vercel root `frontend`; `npm ci --include=dev`; `npm run build`; output `dist` |
| FastAPI / SQLAlchemy | `backend` | `..\.venv\Scripts\python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8000` | Render root `backend`; `pip install -r requirements.txt`; start command below |
| PostgreSQL / Alembic | `backend/alembic` | Existing local database remains in use locally | A separate hosted demo database is required; migration head `001` |

Render production start command (provider Linux shell):

```sh
python -m uvicorn app.main:app --host 0.0.0.0 --port $PORT --workers 1
```

There is no reload flag, no startup migration and no automatic seed. One worker matches the current process-local auth limiter; this is a demo configuration, not a claim of production-scale security. Python is pinned to the 3.13 family through `.python-version`; Node is pinned to 22.x. Runtime Python requirements are separate from development/test requirements.

Vercel's SPA rewrite supports direct links such as `/explore` and `/listing/1`. Browser API calls use the configured HTTPS backend directly, including uploaded image paths. The Vite development proxy does not exist in a static deployment.

## Environment variables

### Vercel: public build configuration only

| Key | Value |
| --- | --- |
| `VITE_API_BASE_URL` | `https://YOUR_RENDER_SERVICE.onrender.com` — origin only, **without `/api`** |

Set it for the Production environment. Public `VITE_*` values are included in browser JavaScript: never put database URLs, passwords, access tokens or admin credentials there. The Vercel build refuses a missing API origin, and public API origins must use HTTPS. Changing the variable requires a new frontend build.

`VITE_API_TARGET` remains a **local-only proxy** setting. It is not a substitute for `VITE_API_BASE_URL`. Vercel and Render must be configured as two separate services; the root `npm run dev` command is only for your laptop.

### Render: server environment and secrets

| Key | Value |
| --- | --- |
| `APP_ENV` | `production` |
| `DATABASE_URL` | Hosted demo PostgreSQL URL from your database provider; set privately in Render |
| `FRONTEND_ORIGINS` | Exact Vercel Production origin, e.g. `https://YOUR_PROJECT.vercel.app` |
| `DATABASE_SSLMODE` | `require`; stronger certificate validation in a provider URL is preserved |
| `UPLOADS_ENABLED` | `false` for the free demo configuration |
| `SESSION_HOURS` | `24` |
| `COMMISSION_PERCENT` | `5` |

`PORT` is supplied by Render. `postgres://`, `postgresql://` and `postgresql+psycopg://` database URL forms select the installed psycopg driver correctly. Provider passwords must already be URL-encoded in their connection string. In production, local `.env` files are not loaded, SQLite/loopback databases are rejected, TLS is required, and exact public HTTPS CORS origins are mandatory. No JWT secret is needed for the current database-backed opaque sessions.

For multiple known domains, separate exact origins with commas. Never allow `*` or all Vercel subdomains. A Vercel preview's distinct origin needs its own explicit CORS entry; use the stable Production URL for mentors. If Vercel assigns a different domain than expected, update this setting and manually redeploy the API.

The health check is `/api/health`. It verifies both database connectivity and the category table; a missing schema or unavailable database returns a generic 503. `/api/config` exposes only upload/payment availability flags, not connection settings.

## Approval and remaining decisions

- [ ] Approve creating the public demo services and a **separate hosted demo database**. Do not expose your laptop database or reuse its superuser password.
- [ ] Choose hosting accounts, service/project names, region and database retention/plan. API and Render Postgres should use a compatible region.
- [ ] Approve Git commit/push and publishing. The working changes are currently uncommitted. Render auto-deploy is off in the prepared Blueprint.
- [ ] Approve migration/seed operations against the named **new demo database only**. Do not run them against production or Fleet Masters.

The Blueprint contains a free web service but deliberately does not create a database or disk. Applying it is a deployment action and still needs approval. Free Render services can sleep and have ephemeral files; free Render Postgres has a time limit and no managed backups. Decide whether those limits fit the demo duration before choosing a plan. No paid resource has been selected or created. See [Render's free-service limits](https://render.com/docs/free).

Vercel documents Hobby as restricted to non-commercial personal use. Confirm the appropriate plan for a business/investor demo rather than assuming Hobby is suitable; no plan has been purchased or changed. See [Vercel's Hobby plan conditions](https://vercel.com/docs/plans/hobby).

## Exact publication steps — only after approval

### 1. Review and push the prepared code

From the project root, review the changes before staging:

```powershell
git status --short
git diff --stat
git diff --check
```

When approved and the reviewed files are ready:

```powershell
git add .
git diff --cached --stat
git diff --cached --check
git commit -m "Prepare Velora demo for Vercel and Render"
git push origin main
```

Do not force-push. `.env`, private environment variants, local databases, uploads, key files and database backups are ignored. The example environment files contain placeholders only. Inspect the staged file list; a real `.env` must never be included.

### 2. Create a hosted demo PostgreSQL database

In your chosen provider, create a **new demo database**, not a copy of private customer data. Use its TLS-enabled **external** connection URL for the laptop migration tool. For Render's runtime you may use its private/internal URL when API and database share a supported region, or a TLS-enabled external provider URL. Keep each URL in secret settings; never paste it into source or command history.

The existing migration uses the `btree_gist` extension to prevent overlapping bookings. The provider must support this extension and the migration role must be allowed to install it/create tables. No schema reset or downgrade is needed. Existing unversioned tables or unexpected Alembic history require review rather than blind initialization.

Choose the planned Vercel project name/origin in the project setup screen. If the final assigned origin differs, use the actual origin for CORS before sharing the link.

### 3. Inspect, migrate and seed the approved demo database

From `backend`, these commands prompt for the hosted URL **without echo**. They do not change your local `.env` or local database. Replace the public frontend-origin placeholder:

```powershell
..\.venv\Scripts\python.exe -m app.deployment inspect --frontend-origin https://YOUR_PROJECT.vercel.app
```

Only after target inspection and migration approval:

```powershell
..\.venv\Scripts\python.exe -m app.deployment migrate --apply --frontend-origin https://YOUR_PROJECT.vercel.app
..\.venv\Scripts\python.exe -m app.deployment seed --apply --frontend-origin https://YOUR_PROJECT.vercel.app
```

Each write requires typing the exact target database name as confirmation. The seed adds illustrative catalogue data and random, inaccessible sample-business passwords; it does not overwrite existing records. Admin credentials are not copied from your laptop. The helper offers no drop, reset or downgrade action. These commands have **not** been run against a hosted database.

### 4. Publish the API on Render

Create a Python Web Service from the reviewed repository on `main`. Use Root Directory `backend`, build/start commands from the table above, `/api/health`, Python 3.13, and the Render variables above. Keep automatic deploys disabled until you choose otherwise. Alternatively apply the reviewed root `render.yaml` after approval.

Wait for a healthy deployment and record Render's **actual** HTTPS URL. Verify:

```powershell
Invoke-RestMethod 'https://YOUR_RENDER_SERVICE.onrender.com/api/health'
Invoke-RestMethod 'https://YOUR_RENDER_SERVICE.onrender.com/api/categories'
```

Health must report `ok`. A 503 means database connectivity/migrations need attention; it must not be labelled a successful deployment. Render/Linux installation and service health remain unverified until this step.

### 5. Publish the frontend on Vercel

Import the same reviewed repository. Set Root Directory `frontend` and Framework Preset Vite. The checked-in `frontend/vercel.json` supplies install/build/output and SPA routing settings. Set `VITE_API_BASE_URL` to the **verified Render origin** and deploy.

Record Vercel's actual Production URL. Make `FRONTEND_ORIGINS` on Render match it exactly and manually redeploy the API if necessary. Open a deep link directly and refresh it; it must load instead of returning 404.

### 6. Verify before sharing

- [ ] Frontend loads over HTTPS and `/explore?kind=service` survives a page refresh.
- [ ] The Production link opens signed-out/incognito without requiring a hosting-provider account. Velora's own private account routes still require normal app sign-in.
- [ ] Browser Network shows successful calls to the actual Render origin; no calls target localhost or return frontend HTML instead of JSON.
- [ ] Catalogue, filters, sign-up, sign-in, sign-out and protected routes work.
- [ ] Test customer/provider accounts can complete a service, produce and rental walkthrough using synthetic data; ownership and overlap checks still apply.
- [ ] Images render; upload controls are explicitly disabled when storage is not configured.
- [ ] No real payment or third-party message is claimed. The footer labels this as a demo.

Only then share the verified Vercel Production URL. No such live URL exists from this preparation work.

## Demo limitations and blockers

- **Required before publishing:** hosted database/credentials, actual provider URLs, exact CORS origin, approved migration/seed, hosting account/plan choices and final live verification.
- **Uploads:** disabled by default in production because Render free files are temporary. HTTPS image URLs work. Enabling uploads requires approved persistent storage, `UPLOADS_ENABLED=true` and an explicit mounted `UPLOAD_DIR`; further media scanning/quotas are still launch work.
- **Account walkthroughs:** sample catalogue businesses cannot fulfill requests. Create your own business account/listing and a separate customer account to demonstrate the full workflow. There are no bundled admin or shared demo passwords.
- **MVP features:** online payments, refunds/payout execution, external messaging, password recovery and email verification remain unconfigured. Use synthetic data; policies are development notices, not final commercial terms.
- **Scaling/security:** auth throttling is process-local, not distributed. Proxy/IP handling, abuse controls, backups, monitoring and production hardening need review before a real customer launch. Never enable trust of arbitrary forwarded headers blindly.
- **Verification scope:** unit tests use isolated SQLite databases, production configuration/CORS are tested without contacting a hosted database, and PostgreSQL migration SQL is rendered offline. This is not proof of a successful Render Linux build or a live cloud deployment.

## Checks and official references

Preparation results on 27 October 2026:

- Backend: **32 tests passed**; frontend: **18 tests passed**.
- Normal frontend build and Vercel-style production build with a reserved placeholder HTTPS API origin passed. The placeholder is not a live backend and was not contacted. A missing Vercel API origin correctly fails the build. The extra production-build artifact is ignored by Git.
- TypeScript, Ruff, formatting, JSON/YAML parsing, Git whitespace and Python dependency consistency checks passed. npm's lockfile audit reported zero vulnerabilities.
- Offline Alembic PostgreSQL SQL includes `btree_gist` and the booking overlap exclusion constraint; no migration SQL was executed by that check.
- Read-only local checks reported revision `001` and no schema drift. The local environment file was not edited, and no local or hosted data was migrated or seeded during this preparation.
- No known local database/admin credential matched publishable files or existing Git history; no real `.env` is tracked. This is a targeted credential check, not a claim of a comprehensive external security audit.
- No cloud resources, deployments, Git commits or pushes were created. No live public URL has been verified.

Run backend tests from `backend` with `..\.venv\Scripts\python.exe -m pytest app/tests -q` after installing `requirements-dev.txt`. Run frontend `npm.cmd test`, `npm.cmd run build`, `npm.cmd run lint` and `npm.cmd run format:check` from `frontend`. The hosted-data mutation guards and offline PostgreSQL SQL generation are included in the backend suite.

Configuration was checked against [Vercel's Vite guide](https://vercel.com/docs/frameworks/frontend/vite), [Vite environment-variable guidance](https://vite.dev/guide/env-and-mode), [Render FastAPI deployment](https://render.com/docs/deploy-fastapi), [Blueprint fields](https://render.com/docs/blueprint-spec), [Python version selection](https://render.com/docs/python-version) and [free-service limitations](https://render.com/docs/free). Provider-side deployment validation still requires the future approved deployment.
