# PlanetIQ Backend Service

FastAPI scientific backend providing spatial query processing, NASA Earthdata harmonization, satellite data ingestion, and Google Gemini AI interpretation.

## Structure
* `app/api/`: Versioned API routers and endpoints (`/api/v1/{land, atmosphere, ocean, comparison, cross-system, datasets, assistant, health}`).
* `app/core/`: Configuration, security, and PostgreSQL/PostGIS database engine settings.
* `app/models/`: SQLAlchemy and GeoAlchemy2 spatial models (`EarthObservation`, `ObservationTimeSeriesRecord`).
* `app/schemas/`: Pydantic validation schemas with explicit provenance (`source_type`, `data_status`, `data_notice`).
* `app/services/`: Domain business logic and orchestrators (`IngestionService`, `DemoDataService`, `LandService`, `AtmosphereService`, `OceanService`, `AssistantService`, `ComparisonService`).
* `app/repositories/`: Data access layer enforcing genuine satellite observations and explicit unavailable states.
* `app/data_processing/`: Geospatial scientific pipelines (`NdviProcessor`, `QualityControl`).
* `app/integrations/`: NASA CMR / Earthdata clients (`ModisClient`, `GpmClient`, `SwotClient`) and Google Gemini API integration.
* `tests/`: Automated test suite (84 tests covering scientific calculations, CMR discovery, QA filtering, and AI grounding).
