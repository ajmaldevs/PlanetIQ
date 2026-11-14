# TerraLens Backend Service

Python FastAPI backend providing spatial query processing, NASA Earthdata harmonization, and Google Gemini AI interpretation.

## Structure
* `app/api/`: Versioned API routers and endpoints.
* `app/core/`: Configuration, security, and database engine settings.
* `app/models/`: SQLAlchemy and GeoAlchemy2 spatial models.
* `app/schemas/`: Pydantic validation schemas.
* `app/services/`: Domain business logic and orchestrators.
* `app/repositories/`: Data access layers.
* `app/data_processing/`: Geospatial scientific pipelines.
* `app/integrations/`: NASA CMR / Earthdata and Gemini API clients.
* `tests/`: Automated test suite.
