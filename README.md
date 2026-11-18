# PlanetIQ — Professional Scientific Earth Observation Platform

[![PlanetIQ CI](https://github.com/ajmaldevs/PlanetIQ/actions/workflows/ci.yml/badge.svg)](https://github.com/ajmaldevs/PlanetIQ/actions/workflows/ci.yml)
[![Live Deployment](https://img.shields.io/badge/Live-Deployment-06b6d4?logo=render&logoColor=white)](https://planetiq-1.onrender.com/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Python: 3.11+](https://img.shields.io/badge/Python-3.11+-3776AB?logo=python&logoColor=white)](https://www.python.org/)
[![Node: 20+](https://img.shields.io/badge/Node-20+-339933?logo=node.js&logoColor=white)](https://nodejs.org/)

**PlanetIQ** is an engineering-grade scientific Earth observation and multi-sphere teleconnection analysis platform. It connects directly with NASA Earth science data archives to ingest, calibrate, and visualize satellite measurements across Earth's interconnected ocean, atmosphere, and terrestrial systems.

---

## 🌍 Platform Highlights

* **Authentic NASA Satellite Telemetry**: Integrated with NASA Common Metadata Repository (CMR) and Earthdata Login to discover, retrieve, and decode genuine satellite granules.
* **Strict Provenance & Dual Data Modes**: Features a transparent architectural and visual distinction between `REAL OBSERVATION` (calibrated satellite telemetry with granule provenance) and `SIMULATED DEMONSTRATION DATA` (calibrated models for offline demos).
* **Multi-Scale Geospatial Visualizers**: Dual-view synchronized exploration featuring a 3D spherical WebGL globe (Three.js) with procedural Rayleigh atmosphere and a 2D planar GIS map (MapLibre GL) with country, province, and natural feature layers.
* **Intelligent Scientific AI Assistant**: Powered by Google Gemini with deterministic scientific tool execution (`get_vegetation_indices`, `compare_regions`, `get_historical_trends`) to prevent hallucinated numbers and cite exact datasets and observation dates.
* **Comprehensive Time & Trends Analysis**: Synchronized multi-sphere timeline (2024–2026), period comparisons (A vs B), and coupled teleconnection diagnostics (e.g., ENSO Walker Circulation).

---

## 🛰️ Supported Satellite Missions & Datasets

| Sphere | Mission / Instrument | Dataset Identifier | CMR Concept ID | Spatial / Temporal Resolution | Measured Physical Variables |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Land** | **NASA MODIS Terra** (LP DAAC) | `MOD13C2.061` | `C2565788914-LPCLOUD` | 0.05° CMG (~5.6 km) / Monthly | NDVI, EVI, Vegetation Condition Index (VCI %), Drought Severity |
| **Atmosphere** | **NASA GPM Core** (GES DISC) | `GPM_3IMERGM` v07 | `C2723754851-GES_DISC` | 0.1° x 0.1° (~11 km) / Monthly | Precipitation Rate (mm/hr), Accumulated Liquid Depth (mm), Anomalies |
| **Ocean** | **NASA/CNES SWOT** (PO.DAAC) | `SWOT_L2_LR_SSH` vD | `C3233945000-POCLOUD` | ~2 km KaRIn Swath / 21-day Repeat | Sea Surface Height Anomaly (SSHA), Dynamic Topography, Eddy Kinetic Energy |

---

## 📐 Data Ingestion Architecture

```
NASA Earthdata (CMR & DAAC Archives)
       │
       ▼
Dataset Discovery (`NasaEarthdataClient`)
       │
       ▼
Granule Retrieval & Authenticated Streaming (`ModisClient`, `GpmClient`, `SwotClient`)
       │
       ▼
File Validation & Integrity Checks (`.part` streaming, checksums, size guards)
       │
       ▼
Scientific Decoding & Quality Control (`QualityControl`, `NdviProcessor`)
  ├── Scale factors (e.g. MODIS 0.0001)
  ├── Fill values (e.g. -3000 masked)
  ├── Pixel Reliability QA (Good, Marginal, Snow/Ice, Cloud)
  └── Coordinate mapping (0.05° CMG global grid to Lat/Lon)
       │
       ▼
Observation Repository (`ObservationRepository`)
  ├── Source Mode: "observation" vs "demonstration"
  └── Metadata provenance (Granule ID, sensor, processing version)
       │
       ▼
FastAPI REST Endpoints (`/api/v1/land`, `/api/v1/atmosphere`, `/api/v1/ocean`)
       │
       ▼
PlanetIQ Client Visualizers (3D Earth Globe, 2D MapView, TrendDrawer, AdaptiveSidePanel)
```

---

## 🛠️ Technology Stack

* **Frontend**: React 19, TypeScript, Vite, Tailwind CSS, Three.js, MapLibre GL, Recharts, Lucide Icons.
* **Backend**: Python 3.11+, FastAPI, Pydantic v2, NumPy, HTTPX, GeoAlchemy2, SQLAlchemy 2.
* **Database & GIS**: PostgreSQL 16 + PostGIS 3.4.
* **AI Engine**: Google Gemini API (`gemini-3.8-flash` / `gemini-3.5-flash-lite`) with structured tool-calling.
* **Deployment & CI/CD**: Render Blueprint (`render.yaml`), GitHub Actions (`.github/workflows/ci.yml`).

---

## 🚀 Quickstart & Local Development

### Prerequisites
* **Node.js**: v20+ (`npm` or `pnpm`)
* **Python**: 3.11+
* **NASA Earthdata Account** (optional for public CMR search, required for granule downloads): [urs.earthdata.nasa.gov](https://urs.earthdata.nasa.gov/)
* **Google Gemini API Key**: [aistudio.google.com](https://aistudio.google.com/)

### 1. Environment Configuration
Copy the configuration template:
```bash
cp .env.example .env
```
Fill in your credentials:
```env
GEMINI_API_KEY=your_gemini_api_key
NASA_EARTHDATA_USERNAME=your_username
NASA_EARTHDATA_PASSWORD=your_password
```

### 2. Backend Setup
```bash
cd backend
python -m venv .venv
# On Windows:
.venv\Scripts\activate
# On Linux/macOS:
source .venv/bin/activate

pip install -e .
uvicorn app.main:app --reload --port 8000
```
Interactive OpenAPI documentation will be accessible at: `http://localhost:8000/docs`

### 3. Frontend Setup
```bash
cd frontend
npm install
npm run dev
```
Interactive Earth Observation platform dashboard: `http://localhost:5173`

### 4. Running Automated Tests
Run backend scientific and pipeline test suites:
```bash
python -m pytest backend/tests -v
```
Run frontend lint and production build:
```bash
cd frontend
npm run lint
npm run build
```

---

## 🌐 Production Deployment

PlanetIQ is configured as a synchronized multi-service architecture on **Render**:
* **Backend Web Service**: Python / FastAPI running on `https://planetiq-1.onrender.com/` with automated health checks at `/api/v1/health`.
* **Frontend Static Site**: React / Vite SPA with SPA rewrite routes and asset cache headers.
* **Database**: PostgreSQL 16 with PostGIS extension.

Deployment blueprint specification: [`render.yaml`](render.yaml)

---

## 📜 Scientific Citation & Provenance Notice

PlanetIQ is committed to scientific transparency:
* **MODIS Data**: Courtesy of NASA EOSDIS Land Processes Distributed Active Archive Center (LP DAAC), USGS Earth Resources Observation and Science (EROS) Center, Sioux Falls, South Dakota.
* **GPM IMERG Data**: Courtesy of NASA Goddard Earth Sciences Data and Information Services Center (GES DISC) and the Precipitation Processing System (PPS).
* **SWOT Data**: Courtesy of NASA Jet Propulsion Laboratory Physical Oceanography DAAC (PO.DAAC) and the Centre National d'Études Spatiales (CNES).

---

## 📄 License

This project is licensed under the MIT License — see the [LICENSE](LICENSE) file for details.
