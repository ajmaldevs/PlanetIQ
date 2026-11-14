# TerraLens Integration Inventory & Tool Register

This document maintains the official inventory of all plugins, MCP servers, extensions, external developer tools, and APIs utilized throughout the development, testing, and deployment of TerraLens.

---

## 1. Inventory Summary Matrix

| Category | Integration / Tool | Nature | Availability | Auth / Credential Requirement | Development Phase Usage |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **A. GitHub & VCS** | Git CLI & Remote Origin | Native CLI | Available | Personal Access Token / SSH Key (Configured) | Phases 0–9 (Continuous) |
| **A. GitHub & VCS** | CodeRabbit | Plugin / Skill | Installed (`coderabbit`) | GitHub CLI / OAuth | Phase 8 (Code Review & QA) |
| **B. Dev & File Mgmt** | Antigravity File Tools | Native Agent Tools | Available | None (Local Workspace Scope) | Phases 1–9 |
| **B. Dev & File Mgmt** | PowerShell / Cmd Runner | Native Process Tool | Available | Local System Execution Permissions | Phases 1–9 |
| **B. Dev & File Mgmt** | Astral UV & Python 3.11+ | Python Toolchain | Available | None | Phases 1, 3, 4, 8 |
| **B. Dev & File Mgmt** | Node.js & npm.cmd | Node Toolchain | Available | None | Phases 1, 2, 5, 8 |
| **C. Web & Docs** | `search_web` Tool | Native Research Tool | Available | None (Managed Agent Gateway) | Phases 1, 4, 6 |
| **C. Web & Docs** | `gemini-api-docs` MCP | MCP Server | Installed (`gemini-api`) | None | Phases 1, 6 |
| **D. NASA Data APIs** | NASA Earthdata CMR API | REST Web API | Available | Anonymous / Optional Earthdata Token | Phases 3, 4 |
| **D. NASA Data APIs** | NASA GES DISC OPeNDAP | REST / HTTPS | Available | URS Earthdata Login | Phase 4 (GPM IMERG Ingestion) |
| **D. NASA Data APIs** | NASA PO.DAAC S3/HTTP | Cloud / HTTPS | Available | URS Earthdata Login | Phase 4 (SWOT KaRIn Ingestion) |
| **D. NASA Data APIs** | NASA LP DAAC OPeNDAP | REST / HTTPS | Available | URS Earthdata Login | Phase 4 (MODIS NDVI Ingestion) |
| **E. Database** | PostgreSQL 16 + PostGIS | Database & Extensions | Available / Container | `POSTGRES_USER` & `POSTGRES_PASSWORD` | Phases 1, 3, 7, 9 |
| **E. Database** | Alembic Migrations | Python Tool | Installed | Database Connection String | Phases 1, 3, 9 |
| **F. AI Assistant** | Google Gemini API | Cloud AI Service | Available via Backend | `GEMINI_API_KEY` (in `.env`) | Phase 6 (Assistant Service) |
| **G. Maps & Charts** | MapLibre GL JS | WebGL Library | Installed in Frontend | Carto Dark Matter Tile URL | Phases 2, 5 |
| **G. Maps & Charts** | Recharts | React Library | Installed in Frontend | None | Phases 2, 5, 7 |
| **H. Testing** | Pytest & Pytest-Asyncio | Python Test Engine | Installed in Backend | None | Phases 1, 3, 8 |
| **H. Testing** | Scientific Validation Suite | Python Automation | Custom Tool (`scripts/`) | None | Phases 4, 7, 8 |
| **I. Deployment** | Vercel SPA Hosting | Cloud Frontend | Configured (`vercel.json`) | Vercel Deployment Token / GitHub App | Phase 9 |
| **I. Deployment** | Render Cloud Blueprint | Cloud Backend | Configured (`render.yaml`) | Render API Token / GitHub App | Phase 9 |
| **I. Deployment** | Production Dockerfiles | Containerization | Configured (`Dockerfile`) | Docker Engine | Phase 9 |

---

## 2. Category Breakdown & Integration Specifications

### A. GitHub & Version Control
* **Tool**: Official Git CLI connected to `https://github.com/ajmaldevs/PlanetIQ.git`.
* **Purpose**: Inspect existing branches, manage feature branches, commit verified changes, push to `development`, and protect `main` against force-pushing.
* **Security & Auth**: Authentication handled securely through existing system Git credentials. No passwords or tokens are stored in plain text or logged in chat.
* **Phases**: Continuous across all phases.

### B. Development & File Management
* **Tool**: Antigravity File System & Process Management (`read_file`, `write_file`, `edit_file`, `run_command`, `manage_task`).
* **Purpose**: Inspect project source code, execute background builds, run tests, manage environment packages, and verify TypeScript and Python outputs.
* **Configuration**: Scoped strictly to project directory `C:\Users\ajumu\Downloads\PlanetIQ`.

### C. Web Research & Documentation
* **Tools**: `search_web` and `gemini-api-docs` MCP (`gemini_search_docs`, `gemini_get_doc`).
* **Purpose**: Verify exact NASA dataset product IDs (`GPM_3IMERGM v07`, `SWOT_L2_LR_SSH`, `MOD13C2 v061`), query current Gemini SDK syntax (`google-genai`), and cross-reference Earth observation scientific standards.

### D. NASA & Scientific Data Integrations
* **NASA CMR (Common Metadata Repository)**:
  * Endpoint: `https://cmr.earthdata.nasa.gov/search/granules.json`
  * Purpose: Programmatic discovery of satellite granules across PO.DAAC, GES DISC, and LP DAAC.
* **GPM IMERG Ingestion**: Handled by [`scripts/ingest_gpm.py`](file:///C:/Users/ajumu/Downloads/PlanetIQ/scripts/ingest_gpm.py), enforcing strict physical unit separation (instantaneous rate in mm/hr vs monthly accumulated depth in mm).
* **SWOT KaRIn Ingestion**: Handled by [`scripts/ingest_swot.py`](file:///C:/Users/ajumu/Downloads/PlanetIQ/scripts/ingest_swot.py), validating radar interferometric swath flags, tidal corrections, and SSHA range limits.
* **MODIS NDVI Ingestion**: Handled by [`scripts/ingest_modis.py`](file:///C:/Users/ajumu/Downloads/PlanetIQ/scripts/ingest_modis.py), applying NASA scale factor $0.0001$ and computing Vegetation Condition Index (VCI %).

### E. Database & Spatial Query Engine
* **Engine**: PostgreSQL 16 with PostGIS 3.4 spatial extension.
* **Client Driver**: `asyncpg` (FastAPI async queries) and `psycopg` (Alembic sync migrations).
* **Spatial Capabilities**: Bounding box spatial queries (`ST_MakeEnvelope`), point-in-polygon checks, and temporal indexing.
* **Migration Control**: Alembic versioning via [`backend/alembic/`](file:///C:/Users/ajumu/Downloads/PlanetIQ/backend/alembic).
* **Resilience**: Dynamic fallback engine keeps API operational even when PostgreSQL is disconnected during local development.

### F. AI Scientific Assistant
* **SDK**: `google-genai` official Python SDK.
* **Model**: `gemini-1.5-flash` (or `gemini-2.5-flash`).
* **Architecture**: Secure server-side proxy endpoint `/api/v1/assistant/query` ensures API keys are never leaked to frontend client code.
* **Grounded Prompts**: Injects active viewport coordinates, current date, active sphere, and strict prohibitions against fabricating measurements or claiming correlation = causation.
* **Fallback**: High-accuracy planetary physics engine provides immediate answers with citations if the API key is not configured.

### G. Maps & Scientific Visualization
* **Map Engine**: MapLibre GL JS utilizing Carto Dark Matter basemap vector tiles.
* **Features**: Dynamic choropleth color scales (Precipitation blue-to-pink, Ocean SSHA cold-to-warm, Land NDVI yellow-to-forest green), interactive point popups, viewport presets, and timeline slider.
* **Chart Engine**: Recharts rendering synchronized time-series, historical climatological baselines, anomaly bars, and range envelopes.

### H. Testing & Quality Assurance
* **Backend**: `pytest` & `pytest-asyncio` covering health, database models, and all scientific endpoints.
* **Scientific Suite**: [`scripts/validate_scientific_datasets.py`](file:///C:/Users/ajumu/Downloads/PlanetIQ/scripts/validate_scientific_datasets.py) performing automated physical law and unit checks.
* **Frontend**: TypeScript strict typechecking (`tsc -b`) and Vite production build verification.

### I. Cloud Deployment
* **Vercel**: Configured with [`frontend/vercel.json`](file:///C:/Users/ajumu/Downloads/PlanetIQ/frontend/vercel.json) for static WebGL asset distribution and client-side routing.
* **Render**: Configured with [`render.yaml`](file:///C:/Users/ajumu/Downloads/PlanetIQ/render.yaml) for automated FastAPI backend containerization and PostgreSQL/PostGIS database provisioning.
* **Docker**: Multi-stage production container definitions in [`backend/Dockerfile`](file:///C:/Users/ajumu/Downloads/PlanetIQ/backend/Dockerfile) and [`frontend/Dockerfile`](file:///C:/Users/ajumu/Downloads/PlanetIQ/frontend/Dockerfile).
