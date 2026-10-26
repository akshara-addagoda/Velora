# Local setup and PostgreSQL verification

Verified on 27 October 2026. The existing application and UI were preserved.

## Root causes

1. No frontend or API process was listening on ports 5173/8000. The previous temporary verification servers had been stopped at handover. Opening a browser does not start either process.
2. The backend had no local `.env` and therefore used its SQLite fallback. The requested lowercase database `velora` does not exist; the installed PostgreSQL server has an existing database named `Velora` with a capital V.

## Result

- Connected to the existing `Velora` database on `127.0.0.1:5432` as the requested local `postgres` user. PostgreSQL reports version 17.2.
- Inspected it first: no public tables or migration history. Applied the existing migration `001`, verified it is at head, and confirmed `alembic check` reports no new upgrade operations.
- There are now 17 public application/migration tables. The PostgreSQL rental/service booking exclusion constraint `no_booking_overlap` is present.
- Ran the existing idempotent seed. No database, table or existing record was dropped, truncated, reset, renamed or overwritten. Fleet Masters was not modified. The older SQLite file is preserved and has not been imported into PostgreSQL.
- Saved the URL-encoded connection only in the ignored root `.env`. The password was entered through a hidden prompt and was not printed, placed in source, or committed. Examples contain placeholders only.
- Started both application processes on loopback and left them running. The frontend proxy reaches the PostgreSQL-backed API.

## URLs and restart

- Website: http://127.0.0.1:5173/
- API health: http://127.0.0.1:8000/api/health
- Interactive API documentation: http://127.0.0.1:8000/docs

From PowerShell or the VS Code terminal:

```powershell
cd 'C:\Users\Akshara Addagoda\OneDrive\Desktop\Velora'
npm.cmd run dev
```

Keep that terminal open. Ctrl+C stops the two application processes. PostgreSQL continues running as its separate Windows service. Do not start a duplicate copy when the current one is already running. For occupied ports, first identify the process, then select alternatives without terminating unrelated programs:

```powershell
Get-NetTCPConnection -State Listen -LocalPort 5173,8000 | Select-Object LocalPort,OwningProcess
npm.cmd run dev -- --frontend-port=5174 --backend-port=8001
```

The launcher adjusts CORS and the proxy for the chosen ports. Separate-terminal startup instructions remain in README.

## Checks performed

| Check | Result |
| --- | --- |
| Existing virtual-environment imports | FastAPI, SQLAlchemy, Alembic and psycopg imported successfully |
| PostgreSQL connection and database name | Passed, existing `Velora` |
| Migration, migration head and schema drift | Passed, `001`, no changes pending |
| PostgreSQL booking exclusion constraint | Present |
| Frontend HTML | HTTP 200 with the Velora title |
| API health through frontend proxy | HTTP 200, status `ok` |
| CORS | Configured 127.0.0.1 origin allowed; unrelated origin blocked |
| Backend tests | 10 passed, including a safe HTTP 503 database-outage response |
| Frontend tests | 9 passed |
| Production build and TypeScript | Passed |
| Ruff and formatting | Passed |
| Git whitespace check | Passed |
| `.env` Git exclusion | Confirmed ignored and absent from tracked changes |
| Real PostgreSQL HTTP workflows | Passed through the frontend proxy |
| Browser | Fresh preview rendered Velora; an older tab retained its cached connection-error page |

The opt-in `app.smoke_check` exercised registration, multiple business roles, listing creation, service completion and review, produce inventory validation, totals and cancellation restoration, seller stock updates, rental estimates, overlapping acceptance prevention, pickup/return states, private transaction permissions, notifications and logout invalidation. It creates labelled synthetic records and hides its listings afterward; no records are deleted and no real payment is made.

The isolated concurrency/unit suite still uses temporary SQLite databases. The PostgreSQL smoke check verifies real PostgreSQL workflows but is not a multi-process concurrency stress test. Starlette emits a non-failing warning about a future test-client transition from httpx to httpx2.

## Files created or changed

- Ignored local `.env`: PostgreSQL URL and actual frontend origin.
- `.env.example`, `.gitignore`: safe PostgreSQL placeholder and environment-file exclusions.
- `backend/app/database.py`: bounded connection timeout and canonical local origin.
- `backend/app/main.py`: safe HTTP 503 response for unavailable databases.
- `backend/app/setup_postgres.py`: hidden credential prompt, read-only discovery/validation, environment update.
- `backend/app/smoke_check.py`: explicit non-destructive local HTTP workflow check.
- `backend/app/tests/test_workflows.py`: database-outage regression test.
- `backend/requirements.txt`: explicit declaration of already-installed python-dotenv.
- `frontend/vite.config.ts`, `frontend/.env.example`: configurable server-side API proxy and explicit port handling.
- Root `package.json`, `scripts/dev.mjs`: dependency-free one-command launcher for both existing servers.
- `README.md`, `docs/STATUS.md`, this report: current setup, restart instructions and verification results.

No new dependencies were installed; the required drivers, framework packages and tooling were already present. No frontend pages or components were replaced. No Git commit was created.

Online payments, third-party messaging and the other production-readiness work listed in README remain outside this local connection fix. Local sample listings are for development and do not represent available real-world fulfillment.
