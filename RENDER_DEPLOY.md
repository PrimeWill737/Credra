# Deploy on Render (services individually)

The browser only talks to the **backend**. The backend talks to **AI** and **processing**.

## Blueprint (auto-wire service URLs)

Repo root **`render.yaml`** defines three web services and sets **`AI_SERVICE_URL`** and **`PROCESSING_SERVICE_URL`** on the backend from each Python service’s **`RENDER_EXTERNAL_URL`** (Render sets this automatically).

- Create or update services: **Dashboard → Blueprints** (or **New → Blueprint**).
- Set **`DATABASE_URL`** on `credra-processing` and `credra-backend` when prompted (or link a Render Postgres database).
- Rename services in `render.yaml` if your Render service names already differ.

Manual deploys: set **`AI_SERVICE_URL`** and **`PROCESSING_SERVICE_URL`** on the backend to the public HTTPS URLs of the AI and processing services (same values as their `RENDER_EXTERNAL_URL`).

## URLs (example)

| Service | URL |
| ------- | --- |
| Backend | `https://credra-backend.onrender.com` |
| AI layer | `https://credra-ai-layer.onrender.com` |
| Processing | `https://credra-processing.onrender.com` |

## Environment variables

### Backend Web Service

Set on the **backend** service in Render (not on the frontend):

| Variable | Example value |
| -------- | ------------- |
| `AI_SERVICE_URL` | `https://credra-ai-layer.onrender.com` |
| `PROCESSING_SERVICE_URL` | `https://credra-processing.onrender.com` |
| `DATABASE_URL` | Your Postgres connection string |
| `CORS_ORIGIN` | Optional comma-separated extra origins (in addition to built-in rules in `backend/src/index.ts`) |
| `CORS_ALLOW_ALL` | Set to `true` only as a last resort (allows any browser origin) |
| `ADMIN_JWT_SECRET` | Long random string |
| `CLIENT_JWT_SECRET` | Long random string |
| `ADMIN_COOKIE_SECURE` | `true` |

See `backend/.env.example` for the full list.

### Frontend Web Service

| Variable | Example value |
| -------- | ------------- |
| `NEXT_PUBLIC_API_BASE_URL` | `https://credra-backend.onrender.com/api/v1` |
| `NEXT_PUBLIC_API_ORIGIN` | `https://credra-backend.onrender.com` |
| `NEXT_PUBLIC_MONO_PUBLIC_KEY` | Your Mono public key (if using Connect) |

Do **not** set `AI_SERVICE_URL` or `PROCESSING_SERVICE_URL` on the frontend.

### AI layer & Processing

- **AI:** no need for backend URL in env unless you add custom logic.
- **Processing:** `DATABASE_URL` (and SSL mode as required by your host).

## Run commands (summary)

- **Frontend** (`frontend/`): `npm install && npm run build` → `npm run start`
- **Backend** (`backend/`): `npm install && npm run build` → `npm run start`
- **AI** (`ai-layer/`): `pip install -r requirements.txt` → `uvicorn src.main:app --host 0.0.0.0 --port $PORT`
- **Processing** (`processing/`): same pattern as AI

Use `runtime.txt` with Python 3.12.x for Python services to avoid source builds of `pydantic-core` on Render.
