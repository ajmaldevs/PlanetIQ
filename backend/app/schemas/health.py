from typing import Optional, Dict
from pydantic import BaseModel, Field


class DatabaseHealth(BaseModel):
    status: str
    connected: bool
    postgis_available: bool
    version: Optional[str] = None
    message: Optional[str] = None
    verified_observations_count: int = 0
    verified_datasets: Dict[str, int] = Field(default_factory=dict)
    last_ingested_at: Optional[str] = None


class SystemHealthResponse(BaseModel):
    status: str = Field(..., json_schema_extra={"example": "healthy"})
    service: str = Field(..., json_schema_extra={"example": "PlanetIQ Backend"})
    version: str = Field(..., json_schema_extra={"example": "0.1.0"})
    environment: str = Field(..., json_schema_extra={"example": "development"})
    database: DatabaseHealth
    scientific_modules: Dict[str, str] = Field(
        default_factory=lambda: {
            "ocean": "SWOT KaRIn Sea Surface Height (Option A)",
            "atmosphere": "GPM IMERG Final Monthly (GPM_3IMERGM)",
            "land": "MODIS Monthly Global NDVI/EVI (MOD13C2)",
        }
    )


class SystemInfoResponse(BaseModel):
    project_name: str
    version: str
    environment: str
    docs_url: str
    api_prefix: str
    nasa_cmr_endpoint: str
    gemini_model: str
