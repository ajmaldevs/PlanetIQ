# TerraLens Production Deployment Guide

TerraLens is engineered for cloud deployment with a decoupled React frontend and FastAPI backend paired with PostgreSQL + PostGIS. The repository's one-click Render configuration is documented in [Render deployment](render.md).

---

## 1. Architecture Topology

```
[ User Browser / Device ]
           │
           ▼
[ Vercel CDN (Frontend) ] ──── HTTPS REST / WebGL ───▶ [ Render / Cloud (FastAPI Backend) ]
 (React + Vite + MapLibre GL)                                  │
                                                               ├─▶ [ PostgreSQL 16 + PostGIS 3.4 ]
                                                               └─▶ [ Google Gemini API ]
```

---

## 2. Frontend Deployment

For Render, the Blueprint configures `frontend` as a static Vite site, sets the API URL at build time, and rewrites nested routes to `index.html`. Follow the Render guide above. Other static hosts need `VITE_API_BASE_URL` set to the public backend URL ending in `/api/v1` and an SPA fallback rewrite.

---

## 3. Backend Deployment

The Render Blueprint sets Python 3.11, starts Uvicorn on Render's assigned `$PORT`, checks `/api/v1/health`, references the managed database credentials, and runs `alembic upgrade head` before each deploy. Gemini and NASA Earthdata credentials are optional for this demo build.

---

## 4. Managed PostgreSQL + PostGIS Setup

The Render Blueprint provisions PostgreSQL 16. The first Alembic revision enables PostGIS before creating spatial tables, and the backend pre-deploy command applies the migrations automatically. For an existing database, confirm PostGIS is enabled before running `alembic upgrade head`.

---

## 5. Security & Rate-Limiting Controls

* **CORS**: Strict domain whitelisting configured in [`backend/app/core/config.py`](file:///C:/Users/ajumu/Downloads/PlanetIQ/backend/app/core/config.py).
* **Non-Root Execution**: Container runs under unprivileged `appuser`.
* **Zero Credentials in Git**: Enforced via strict `.gitignore` and `.env.example`.
* **Scientific Precision**: Units validated at schema boundary prior to client presentation.
