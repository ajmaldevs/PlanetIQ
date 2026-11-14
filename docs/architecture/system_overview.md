# TerraLens Architecture Overview

## 1. System Vision
TerraLens is a modern, dark-first scientific Earth observation exploration platform. It ingests satellite measurements from NASA Earth science missions and serves them through high-performance spatial APIs and interactive visualization interfaces.

## 2. High-Level Architecture

```
[ NASA Earthdata APIs / CMR / OpenDAP ]
                 │
                 ▼
     [ TerraLens Backend (FastAPI) ]
     ├─ Data Ingestion & Harmonization Engine
     ├─ PostGIS Spatial & Temporal Indexing
     ├─ Gemini AI Contextual Translation
     └─ RESTful API (OpenAPI v3)
                 │
                 ▼
     [ TerraLens Frontend (React + Vite) ]
     ├─ MapLibre GL Interactive Viewports
     ├─ Recharts Scientific Trend Analytics
     └─ Educational Multi-Tier Interface
```

## 3. Technology Rationale
- **FastAPI**: Asynchronous Python performance, native Pydantic validation, dynamic OpenAPI documentation.
- **PostgreSQL + PostGIS**: Industry standard for geospatial coordinates, raster bands, and temporal spatial queries.
- **MapLibre GL JS**: High-performance WebGL map rendering without vendor lock-in.
- **Recharts**: Declarative, responsive charting for time-series trend analysis.
- **Google Gemini API**: Context-grounded explanation of complex scientific observations for students and public audiences.
