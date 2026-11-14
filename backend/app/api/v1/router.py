from fastapi import APIRouter
from app.api.v1.endpoints import (
    health,
    atmosphere,
    ocean,
    land,
    cross_system,
    assistant,
    datasets,
    comparison,
    geocoding,
)

api_router = APIRouter()

# System & Infrastructure
api_router.include_router(health.router, tags=["System Health"])
api_router.include_router(geocoding.router, prefix="/geocoding", tags=["Geographic Search & Geocoding"])

# Scientific Core Modules
api_router.include_router(atmosphere.router, prefix="/atmosphere", tags=["Atmosphere (GPM IMERG)"])
api_router.include_router(ocean.router, prefix="/ocean", tags=["Ocean (SWOT SSH Option A)"])
api_router.include_router(land.router, prefix="/land", tags=["Land (MODIS NDVI/EVI)"])
api_router.include_router(cross_system.router, prefix="/cross-system", tags=["Cross-System Teleconnections"])

# AI Intelligence & Scientific Catalog
api_router.include_router(assistant.router, prefix="/assistant", tags=["AI Scientific Assistant"])
api_router.include_router(datasets.router, prefix="/datasets", tags=["Dataset Documentation & Provenance"])

# Historical Period Comparison
api_router.include_router(comparison.router, prefix="/comparison", tags=["Historical Period Comparison"])
