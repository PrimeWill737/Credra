# CREDRA

AI-native infrastructure that helps financial apps decide who to trust with money. This repo implements the stack from `credra.md`:

| Layer | Role | Folder |
| ----- | ---- | ------ |
| **L1** | Open banking (Mono) | `backend/src/integrations/mono.ts` |
| **L2** | Processing (Python, Pandas, PostgreSQL) | `processing/` |
| **L3** | AI scoring (Python, scikit-learn) | `ai-layer/` |
| **L4** | API (Node.js, TypeScript) | `backend/` |
| **L5** | Dashboard (Next.js, TypeScript, SCSS) | `frontend/` |

## Deployment guides

- Full stack via Docker Compose (single host): `DOCKER_DEPLOY.md`
- Frontend on Vercel + external services: `VERCEL_DEPLOY.md`

## Prerequisites

- Node.js 20+
- Python 3.11+
- PostgreSQL (via **Supabase**, **Docker**, or a **local install**—see Database)

## Database

### Option A — Docker (recommended if `docker` works in your terminal)

Postgres runs in Docker on **host port 5433** (not 5432) so it does not fight a local PostgreSQL install on Windows/macOS.

```bash
docker compose up -d postgres
```

If PowerShell says **`docker` is not recognized**, Docker Desktop is not installed or not on your `PATH`. Install [Docker Desktop for Windows](https://docs.docker.com/desktop/setup/install/windows-install/), sign in if prompted, finish setup, **restart the terminal** (or reboot), then run the command again.

### Option B — No Docker (PostgreSQL installed on Windows)

1. Install PostgreSQL from the [official Windows installer](https://www.postgresql.org/download/windows/) (default port **5432**).
2. Create a role and database the app can use, for example in **pgAdmin** or `psql`:
   - User: `credra` / password: `credra`
   - Database: `credra`
3. In `processing/.env`, set:

   `DATABASE_URL=postgresql://credra:credra@127.0.0.1:5432/credra`

### Option C — Supabase (hosted Postgres)

1. In the [Supabase dashboard](https://supabase.com/dashboard), open your project → **Project Settings** → **Database**.
2. Under **Connection string**, choose **URI**, copy the string, and replace `[YOUR-PASSWORD]` with your database password.
3. Prefer **Session mode** if you use the **connection pooler** (port `6543`); the direct connection (port `5432`) also works.
4. Put the full URI in `processing/.env` as `DATABASE_URL=...`.

The processing service turns on **TLS automatically** for non-localhost hosts, so Supabase connections work without extra flags. Use `DATABASE_SSLMODE=disable` only if you use an unusual tunnel where SSL breaks.

### Env file

Copy `processing/.env.example` to `processing/.env` and set `DATABASE_URL` to match **Option A**, **B**, or **C**.

If you see `password authentication failed for user "credra"`, the URL is pointing at the wrong server or wrong credentials—fix `DATABASE_URL` to match the Postgres you actually started. With Docker only: to reset data, `docker compose down -v` then `docker compose up -d postgres`.

### Schema bootstrap (`database/init.sql`)

Run the **entire** file in the Supabase SQL Editor (or `psql`). It **drops and recreates** all `admin_*` tables so you never get stuck with old column names; it does **not** drop `transactions` (used by the processing service). Re-running the script resets admin seed data.

## Run services (frontend → processing)

Use **one terminal per service** (or a multiplexer). Commands assume you are in the **repository root** (`CREDRA/`). On Windows, use **PowerShell**.

### Before the first run

1. **Postgres** — Follow [Database](#database) and ensure `processing/.env` exists with a valid `DATABASE_URL`.
2. **Backend env** — From the repo root: `copy backend\.env.example backend\.env` (or create `backend/.env` yourself). Optional: set `MONO_SECRET_KEY`, `AI_SERVICE_URL` (default `http://127.0.0.1:8001`), `PROCESSING_SERVICE_URL` if you wire it later.

### 1. Frontend (L5) — http://localhost:3000

```powershell
cd frontend
npm install
npm run dev
```

- First-time only: `npm install`. After that, usually just `npm run dev`.
- The marketing UI does not require other servers to load.
- To test bank linking with Mono Connect, set `NEXT_PUBLIC_MONO_PUBLIC_KEY` in `frontend/.env.local` (see Testing).

### 2. Backend (L4) — http://localhost:4000

```powershell
cd backend
npm install
npm run dev
```

- Set **`DATABASE_URL`** in `backend/.env` to the **same** Postgres URI as `processing/.env` (e.g. Supabase). Admin login and `/admin/*` APIs need it. If it’s missing, the API falls back to `127.0.0.1:5433` and you’ll see `ECONNREFUSED` unless Docker Postgres is running.
- If you see **`SELF_SIGNED_CERT_IN_CHAIN`** from `pg`, the backend now uses relaxed TLS verification for remote hosts by default. To enforce strict CA checks, set **`DATABASE_SSL_REJECT_UNAUTHORIZED=true`** in `backend/.env`.
- First-time: `npm install` and ensure `backend/.env` exists (copy from `.env.example` and fill `DATABASE_URL`, `ADMIN_JWT_SECRET`).
- Health check: `GET http://localhost:4000/health`.
- For `/credit-score` and similar routes, start the **AI layer** (step 3) or those calls return **503**.

### 3. AI layer (L3) — http://localhost:8001

```powershell
cd ai-layer
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
uvicorn src.main:app --reload --port 8001
```

- First-time: create the venv and `pip install`. Later: activate the venv, then run `uvicorn`.
- Health: `GET http://127.0.0.1:8001/health`.
- Interactive docs: http://127.0.0.1:8001/docs

### 4. Processing (L2) — http://localhost:8000

```powershell
cd processing
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
uvicorn src.main:app --reload --port 8000
```

- Requires a working `DATABASE_URL` in `processing/.env`.
- Health: `GET http://127.0.0.1:8000/health` — expect `"db": true` when Postgres is connected.
- Docs: http://127.0.0.1:8000/docs

### Dependency note

- **Listing order** above is **L5 → L4 → L3 → L2** (dashboard down toward data).
- For **end-to-end API tests** (Node → AI → DB), start **Processing** and **AI** before calling backend routes that proxy to them; the **frontend** can be started anytime.

## API quick checks

- `GET http://localhost:4000/health`
- `POST http://localhost:4000/api/v1/credit-score` — proxies to AI layer (**requires Authorization: Bearer <client_api_key> with active subscription**)
- `POST http://localhost:8000/ingest` — Layer 2 ingest
- `POST http://localhost:8001/score` — Layer 3 score
- `POST http://localhost:4000/api/v1/admin/auth/login` — admin login (sets httpOnly cookie + returns JWT in JSON)
- `POST http://localhost:4000/api/v1/admin/auth/totp/verify` — complete 2FA after login when TOTP is enabled
- `POST http://localhost:4000/api/v1/admin/auth/logout` — clear admin cookie
- `POST http://localhost:4000/api/v1/admin/auth/totp/setup` — (authenticated) generate TOTP secret + otpauth URL
- `POST http://localhost:4000/api/v1/admin/auth/totp/enable` — (authenticated) enable TOTP after verifying a code
- `GET http://localhost:4000/api/v1/admin/panel` — admin panel data (`credentials` + cookie, or `Authorization: Bearer`)
- `GET http://localhost:4000/api/v1/admin/exports/compliance.csv` — compliance CSV export
- `GET http://localhost:4000/api/v1/admin/exports/compliance.pdf` — compliance PDF summary

Set `MONO_SECRET_KEY` in `backend/.env` for live Mono calls; otherwise Layer 1 returns safe stubs.

Set `ADMIN_JWT_SECRET` in `backend/.env` for signing admin JWTs (required for production). With HTTPS, set `ADMIN_COOKIE_SECURE=true`.

## Admin panel

- **Backend must be running** on port **4000** or login will fail with `ERR_CONNECTION_REFUSED` / “Failed to fetch”. In a separate terminal: `cd backend`, `npm install` (once), `npm run dev`. Confirm `GET http://localhost:4000/health` returns JSON.
- Optional: set `NEXT_PUBLIC_API_BASE_URL` in `frontend/.env.local` if the API is not at `http://localhost:4000/api/v1`.
- Optional (Mono Connect UI): set `NEXT_PUBLIC_MONO_PUBLIC_KEY` in `frontend/.env.local` to enable the “Connect bank account (Mono)” widget in the Admin panel.
- Frontend route: `http://localhost:3000/admin`
- Login email: `knowrist@gmail.com`
- Login password: `CredrabyWilliam-001` (stored as bcrypt hash in the database; see `database/init.sql`)
- Sessions use **JWT** plus an **httpOnly cookie** (`credra_admin_access`); the UI also sends the Bearer token from the login response for API calls.
- Optional **TOTP 2FA**: enable via authenticated `totp/setup` then `totp/enable` (not required for the seeded user unless you turn it on in the DB).
- **Analytics chart** (API usage / revenue) and **compliance export** downloads are available in the admin UI after login.
- The SQL bootstrap in `database/init.sql` creates admin tables and seeds records for:
  - dashboard overview
  - user management
  - data management
  - AI model monitoring
  - API management
  - transactions & risk review
  - billing/subscriptions
  - settings/configuration
  - security/compliance
  - analytics/reporting

## Client dashboard (paying customers)

- Frontend route: `http://localhost:3000/client`
- Customers sign up and log in (email + password), then submit a transfer reference for manual approval.
- After approval, their API key becomes active and can be used to call:
  - `POST /api/v1/client/credit-score`
  - `POST /api/v1/client/fraud-check`
  - `POST /api/v1/client/risk-analysis`
- All client API endpoints require: `Authorization: Bearer <client_api_key>`

Transfer-based subscription (for now)

- Client submits their payment via `POST /api/v1/client/subscription/transfer`
- Bank receiving details (used to show + store in the transfer record):
  - Bank: `GTBank`
  - Account number: `0558518751`
  - Account name: `Onoja William Bosworth`

Admin internal approval (manual)

- List pending transfers: `GET /api/v1/admin/client/transfers/pending`
- Approve: `POST /api/v1/admin/client/transfers/:transferId/approve`
- Reject: `POST /api/v1/admin/client/transfers/:transferId/reject`

## Styling

Global SCSS lives under `frontend/styles/scss/`. The main entry `main.scss` uses `@forward` for `variables` and `mixins`, then `@use` for layers that emit CSS.

## Testing (bank connect / Mono)

1. Ensure backend is running (`cd backend && npm run dev`) with:
   - `MONO_SECRET_KEY` set in `backend/.env` for live calls (otherwise responses are stubs).
2. Ensure frontend is running (`cd frontend && npm run dev`) with `frontend/.env.local` containing:

   `NEXT_PUBLIC_MONO_PUBLIC_KEY=...`

3. Go to `http://localhost:3000/admin` → login.
4. Open **Data management** → **Connect bank account (Mono)**:
   - Click **Connect bank account** (opens Mono widget).
   - On success, the UI exchanges the returned `code` via `POST /api/v1/integrations/mono/token`.
   - Then click **Fetch balance** / **Fetch transactions** to call the backend routes.

## Compliance

CREDRA is infrastructure: do not hold customer funds; partner with licensed institutions (see `credra.md`).
