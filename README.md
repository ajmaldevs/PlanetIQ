# TerraLens (PlanetIQ)

**TerraLens** is an interactive Earth observation and environmental analysis platform powered by NASA Earth science datasets and modern geospatial visualization technologies. The platform helps high school students, university researchers, and the curious public understand changes and interactions in Earth's interconnected ocean, atmosphere, and terrestrial systems.

---

## 🌍 Core System Architecture

```
TerraLens/
├── frontend/                # React 19 + TypeScript + Vite + Tailwind CSS + MapLibre GL
├── backend/                 # Python 3.11+ + FastAPI + SQLAlchemy + GeoAlchemy2
├── docs/                    # Architectural, Dataset, API, and Deployment documentation
│   ├── architecture/        # Architecture diagrams, system models, and design decisions
│   ├── datasets/            # Scientific dataset catalogs, provenance, units, and limitations
│   ├── api/                 # OpenAPI specifications and endpoint documentation
│   └── deployment/          # Containerization and production deployment guides
├── scripts/                 # Utility automation, data downloaders, and maintenance tools
├── .github/                 # GitHub Actions workflows and CI configurations
├── .gitignore               # Strict exclusion rules for secrets, dependencies, and caches
├── .env.example             # Safe environment variable configuration template
└── LICENSE                  # MIT Open-Source License
```

---

## 🛰️ MVP Scientific Datasets

1. **Ocean MVP – SWOT Mission (Option A)**:
   * **Focus**: Sea Surface Height (SSH) anomalies, sea level dynamics, and ocean topography.
   * **Source**: NASA PO.DAAC / SWOT KaRIn Low Rate Ocean Products.
2. **Atmosphere MVP – GPM IMERG**:
   * **Focus**: Global precipitation, rainfall patterns, extreme weather trends.
   * **Dataset Identifier**: `GPM_3IMERGM` (Final Monthly Precipitation).
   * **Source**: NASA GES DISC.
3. **Land MVP – MODIS Vegetation Indices**:
   * **Focus**: Terrestrial photosynthetic activity, canopy phenology, drought impact, and vegetation dynamics.
   * **Dataset Identifier**: `MOD13C2` (Version 6.1, 0.05° Monthly Global NDVI/EVI).
   * **Source**: NASA LP DAAC / USGS.

---

## 🛠️ Technology Stack

* **Frontend**: React, TypeScript, Vite, Tailwind CSS, MapLibre GL JS, Recharts, Lucide Icons.
* **Backend**: Python 3.11+, FastAPI, Pydantic v2, SQLAlchemy 2, asyncpg, GeoAlchemy2.
* **Database**: PostgreSQL 16 + PostGIS 3.4.
* **AI Analysis**: Google Gemini API (scientific grounded interpretation).

---

## 🚀 Quickstart & Development Setup

### Prerequisites
* **Node.js**: v20+ (`npm` or `pnpm`)
* **Python**: 3.11+ (recommended package manager: `uv` or `venv`)
* **PostgreSQL + PostGIS**: Local instance or Docker container

### 1. Environment Configuration
Copy the template and configure local settings:
```bash
cp .env.example .env
```

### 2. Backend Setup
```bash
cd backend
uv venv
uv sync
uv run uvicorn app.main:app --reload --port 8000
```
API Documentation will be available at: `http://localhost:8000/docs`

### 3. Frontend Setup
```bash
cd frontend
npm install
npm run dev
```
Frontend dashboard will be available at: `http://localhost:5173`

---

## 📜 Branch & Contribution Strategy

* `main`: Production-ready, stable releases.
* `development`: Active feature development and ongoing phase deliverables.
* **Rule**: Never commit secrets or hardcoded scientific sample data as real observations.

---

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
