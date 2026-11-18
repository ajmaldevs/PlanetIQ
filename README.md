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

PlanetIQ provides operational, multi-sphere Earth observation data pipelines backed by authentic NASA Distributed Active Archive Centers (DAACs):

| Earth Sphere | Satellite Mission / Sensor | Dataset Identifier | NASA DAAC & Provider | CMR Concept ID | Spatial & Temporal Resolution | Measured Physical Variables & Units |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **Ocean Hydrosphere** | **NASA MODIS Aqua** (Ocean Color) | `MODISA_L3m_CHL` | Ocean Biology DAAC (**OB.DAAC**) | `C1443684497-OB_DAAC` | 4 km / 9 km Standard Mapped (Monthly) | Chlorophyll-a ($mg/m^3$), Biological Productivity Classification |
| **Ocean Hydrosphere** | **NASA MODIS Aqua** (Thermal IR) | `MODISA_L3m_SST` | Ocean Biology DAAC (**OB.DAAC**) | `C1443684809-OB_DAAC` | 4 km / 9 km Standard Mapped (Monthly) | Sea Surface Temperature ($^\circ C$), Thermal Fronts & Regimes |
| **Ocean Hydrosphere** | **NASA/CNES SWOT** (KaRIn Altimeter) | `SWOT_L2_LR_SSH` vD | Physical Oceanography DAAC (**PO.DAAC**) | `C3233945000-POCLOUD` | ~2 km KaRIn Swath / 21-day Repeat | Sea Surface Height Anomaly ($SSHA$, $m$), Dynamic Topography ($m$), Eddy Kinetic Energy |
| **Atmospheric Envelope** | **NASA MODIS Terra/Aqua** (Atmosphere) | `MOD08_M3` / `MYD08_M3` | Level-1 and Atmosphere Archive (**LAADS DAAC**) | `C1443682974-LAADS` / `C1443683075-LAADS` | 1.0° x 1.0° Equal-Angle Grid (Monthly) | Aerosol Optical Depth ($AOD_{550}$, dimensionless light extinction ratio), Cloud Fraction (%), Cloud Optical Thickness, Cloud Effective Radius ($\mu m$) |
| **Atmospheric Envelope** | **NASA GPM Core** (DPR / GMI) | `GPM_3IMERGM` v07 | Goddard Earth Sciences DISC (**GES DISC**) | `C2723754851-GES_DISC` | 0.1° x 0.1° Global (~11 km) / Monthly | Mean Precipitation Rate ($mm/hr$), Accumulated Liquid Depth ($mm$), Climatological Anomalies ($mm$) |
| **Terrestrial Biosphere** | **NASA MODIS Terra** (Optical/NIR) | `MOD13C2.061` | Land Processes DAAC (**LP DAAC**) | `C2565788914-LPCLOUD` | 0.05° CMG (~5.6 km) / Monthly | Normalized Difference Vegetation Index (NDVI), EVI, Vegetation Condition Index (VCI %), Drought Severity Classification |

---

## 🔬 Scientific Data Quality & Integrity Standards

PlanetIQ adheres to strict scientific remote-sensing principles:
* **Zero Fabricated Observations**: Unobserved coordinates or historical gaps return explicit `data_status: "unavailable"` and `is_observation: false`. Synthetic sine curves or harmonic interpolation formulas are strictly forbidden in production telemetry paths.
* **Strict Ocean-Only Masking**: `OceanProcessor` validates geographic boundary coordinates, ensuring ocean color (Chlorophyll-a), sea-surface temperature, and radar altimetry are never projected onto continental landmasses.
* **AOD Atmospheric Extinction Clarification**: Aerosol Optical Depth is formally defined and presented as **columnar light extinction by particulates through the vertical atmospheric column at 550nm**, never falsely conflated with ground-level PM2.5 or localized air-quality monitors.
* **Precipitation Rate vs. Depth Accumulation**: GPM IMERG measurements strictly differentiate instantaneous mean liquid precipitation rate ($mm/hr$) from monthly accumulated precipitation depth ($mm = \text{rate} \times 24 \times \text{days\_in\_month}$). Satellite radiometer estimates are never mislabeled as direct rain-gauge observations.
* **Isolated Demonstration Models**: Calibrated educational models are isolated exclusively within `DemoDataService` under `source_mode="demonstration"`. Real observations carry full NASA provenance metadata, valid ranges, scale factors, and granule IDs.

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
* **Frontend Web App (Static Site)**: React / Vite SPA running on `https://planetiq-1.onrender.com/` with SPA rewrite routes and asset cache headers.
* **Backend API Service**: Python / FastAPI running on `https://planetiq.onrender.com/` (Docs: `https://planetiq.onrender.com/docs`, Health: `https://planetiq.onrender.com/api/v1/health`).
* **Database**: PostgreSQL 16 with PostGIS extension.

Deployment blueprint specification: [`render.yaml`](render.yaml)

---

## 📜 Scientific Citation & Provenance Notice

PlanetIQ is committed to scientific transparency:
* **MODIS Land Vegetation Data**: Courtesy of NASA EOSDIS Land Processes Distributed Active Archive Center (LP DAAC), USGS Earth Resources Observation and Science (EROS) Center, Sioux Falls, South Dakota.
* **MODIS Ocean Color & SST Data**: Courtesy of NASA Ocean Biology Distributed Active Archive Center (OB.DAAC), NASA Goddard Space Flight Center, Greenbelt, MD.
* **MODIS Atmosphere & Aerosol Data**: Courtesy of NASA Level-1 and Atmosphere Archive & Distribution System (LAADS) DAAC, NASA Goddard Space Flight Center, Greenbelt, MD.
* **GPM IMERG Precipitation Data**: Courtesy of NASA Goddard Earth Sciences Data and Information Services Center (GES DISC) and the Precipitation Processing System (PPS).
* **SWOT Ocean Altimetry Data**: Courtesy of NASA Jet Propulsion Laboratory Physical Oceanography DAAC (PO.DAAC) and the Centre National d'Études Spatiales (CNES).

---

## 📄 License

This project is licensed under the MIT License — see the [LICENSE](LICENSE) file for details.
