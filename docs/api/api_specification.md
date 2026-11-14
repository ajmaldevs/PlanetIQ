# TerraLens API Specification (Preliminary)

## Base URL
* Development: `http://localhost:8000/api/v1`

## Core Endpoints Architecture

### System & Health
* `GET /api/v1/health`: System health and component connectivity status.
* `GET /api/v1/system-info`: Metadata, environment, and version information.

### Atmosphere Service (`/api/v1/atmosphere`)
* `GET /precipitation/grid`: Spatial bounding box query for GPM_3IMERGM precipitation fields.
* `GET /precipitation/timeseries`: Temporal precipitation trends for given coordinates or bounding polygon.

### Ocean Service (`/api/v1/ocean`)
* `GET /ssh/observations`: SWOT Sea Surface Height measurements and swath tracks.
* `GET /ssh/trends`: Regional ocean height anomalies and statistical summaries.

### Land Service (`/api/v1/land`)
* Endpoints to be specified upon confirmation of approved land dataset.

### AI Assistant Service (`/api/v1/assistant`)
* `POST /query`: Grounded natural language interpretation of current viewport datasets via Gemini API.
