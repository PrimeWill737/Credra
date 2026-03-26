# Docker deployment (all services in one repo)

This runs the full CREDRA stack from this repository with one command:

- `frontend` (Next.js)
- `backend` (Node/Express)
- `ai-layer` (FastAPI)
- `processing` (FastAPI + Postgres access)
- `postgres` (database)

## Important about Vercel

Vercel does **not** run `docker-compose` for multi-container apps.  
Use this Docker setup on a VM/container host (DigitalOcean, AWS EC2, Azure VM, Fly Machines, etc).

If you still want Vercel for frontend only, keep using `frontend/` there and host the other services separately.

## 1) Prepare environment

From repo root:

```bash
cp .env.example .env
```

Edit `.env` and set production values at minimum:

- `POSTGRES_PASSWORD`
- `ADMIN_JWT_SECRET`
- `CLIENT_JWT_SECRET`
- `CORS_ORIGIN` (your public frontend origin)
- `NEXT_PUBLIC_API_BASE_URL`
- `NEXT_PUBLIC_API_ORIGIN`
- `NEXT_PUBLIC_MONO_PUBLIC_KEY` (if using Mono)
- email and billing variables as needed

## 2) Build and start everything

```bash
docker compose up -d --build
```

## 3) Verify health

```bash
docker compose ps
```

Check endpoints:

- Frontend: `http://localhost:3000`
- Backend health: `http://localhost:4000/health`
- AI health: `http://localhost:8001/health`
- Processing health: `http://localhost:8000/health`

## 4) View logs

```bash
docker compose logs -f
```

Or specific service:

```bash
docker compose logs -f backend
docker compose logs -f frontend
```

## 5) Stop / restart

```bash
docker compose down
docker compose up -d
```

Reset database data (destructive):

```bash
docker compose down -v
docker compose up -d --build
```

## 6) Updating after code changes

```bash
docker compose up -d --build
```

## Notes

- `database/init.sql` auto-runs on first Postgres initialization.
- Backend talks to services over internal network names:
  - `http://ai-layer:8001`
  - `http://processing:8000`
- Postgres is reachable internally as `postgres:5432`.
