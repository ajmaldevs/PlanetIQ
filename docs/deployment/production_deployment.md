# TerraLens Production Deployment Guide

TerraLens is engineered for cloud-native deployment with decoupled frontend (Vercel) and backend services (Render / AWS / GCP) paired with a high-availability PostGIS instance.

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

## 2. Frontend Deployment: Vercel

1. **Root Directory**: `frontend`
2. **Framework Preset**: `Vite`
3. **Build Command**: `npm run build`
4. **Output Directory**: `dist`
5. **Environment Variables**:
   * `VITE_API_BASE_URL`: `https://terralens-backend.onrender.com/api/v1`
6. Single-page application rewrites are managed by [`frontend/vercel.json`](file:///C:/Users/ajumu/Downloads/PlanetIQ/frontend/vercel.json).

---

## 3. Backend Deployment: Render / Cloud Container

1. **Root Directory**: `backend`
2. **Environment**: Python 3.11+ or Docker via [`backend/Dockerfile`](file:///C:/Users/ajumu/Downloads/PlanetIQ/backend/Dockerfile).
3. **Start Command**: `uvicorn app.main:app --host 0.0.0.0 --port $PORT`
4. **Health Check Path**: `/api/v1/health`
5. **Required Production Environment Variables**:
   * `ENVIRONMENT`: `production`
   * `DEBUG`: `false`
   * `CORS_ORIGINS`: `["https://terralens.vercel.app","https://terralens.onrender.com"]`
   * `POSTGRES_SERVER`: Hostname of managed PostGIS instance
   * `POSTGRES_PORT`: `5432`
   * `POSTGRES_USER`: Database username
   * `POSTGRES_PASSWORD`: Database password
   * `POSTGRES_DB`: `terralens_db`
   * `GEMINI_API_KEY`: Google AI Studio API key
   * `GEMINI_MODEL`: `gemini-1.5-flash`

---

## 4. Managed PostgreSQL + PostGIS Setup

1. Provision PostgreSQL 16.
2. Initialize spatial extensions:
   ```sql
   CREATE EXTENSION IF NOT EXISTS postgis;
   CREATE EXTENSION IF NOT EXISTS postgis_topology;
   CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
   ```
3. Run Alembic migrations:
   ```bash
   alembic upgrade head
   ```

---

## 5. Security & Rate-Limiting Controls

* **CORS**: Strict domain whitelisting configured in [`backend/app/core/config.py`](file:///C:/Users/ajumu/Downloads/PlanetIQ/backend/app/core/config.py).
* **Non-Root Execution**: Container runs under unprivileged `appuser`.
* **Zero Credentials in Git**: Enforced via strict `.gitignore` and `.env.example`.
* **Scientific Precision**: Units validated at schema boundary prior to client presentation.
