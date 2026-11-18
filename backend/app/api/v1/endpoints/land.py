from typing import Optional
from fastapi import APIRouter, Query
from app.schemas.scientific import GeoJSONFeatureCollection, LandTimeSeriesResponse
from app.services.land_service import LandService

router = APIRouter()


@router.get(
    "/grid",
    response_model=GeoJSONFeatureCollection,
    summary="MODIS Monthly Global Vegetation Indices (MOD13C2 v061)"
)
def get_land_grid(
    min_lat: Optional[float] = Query(None, ge=-90.0, le=90.0),
    max_lat: Optional[float] = Query(None, ge=-90.0, le=90.0),
    min_lon: Optional[float] = Query(None, ge=-180.0, le=180.0),
    max_lon: Optional[float] = Query(None, ge=-180.0, le=180.0),
    date: str = Query("2026-03", pattern=r"^\d{4}-(0[1-9]|1[0-2])$", description="Calendar month (YYYY-MM)"),
    source_mode: str = Query(
        "auto",
        pattern=r"^(auto|observation|demonstration)$",
        description="Data provenance mode: 'observation' (real NASA satellite data), 'demonstration' (calibrated mathematical model), or 'auto'"
    ),
):
    """
    Returns spatially gridded MODIS MOD13C2 vegetation observations.
    Variables include:
    - ndvi: Normalized Difference Vegetation Index (dimensionless ratio, -0.2 to 1.0)
    - evi: Enhanced Vegetation Index (dimensionless ratio, -0.2 to 1.0)
    - vci_percent: Vegetation Condition Index (%)
    - drought_category: Agricultural/ecological drought condition
    - land_cover_type: IGBP classification
    - data_status: 'observation' (genuine satellite data) or 'demonstration_model' (simulated)
    - is_observation: Boolean flag confirming genuine satellite telemetry
    """
    return LandService.get_spatial_grid(
        min_lat=min_lat,
        max_lat=max_lat,
        min_lon=min_lon,
        max_lon=max_lon,
        date_str=date,
        source_mode=source_mode,
    )


@router.get(
    "/timeseries",
    response_model=LandTimeSeriesResponse,
    summary="MODIS Vegetation Canopy Phenology & Trend"
)
def get_land_timeseries(
    latitude: float = Query(..., ge=-90.0, le=90.0),
    longitude: float = Query(..., ge=-180.0, le=180.0),
    start_year: int = Query(2024, ge=2000, le=2026),
    end_year: int = Query(2026, ge=2000, le=2026),
    source_mode: str = Query(
        "auto",
        pattern=r"^(auto|observation|demonstration)$",
        description="Data provenance mode: 'observation' (real satellite data) or 'demonstration' (simulated model)"
    ),
):
    """
    Returns multi-year monthly NDVI/EVI trajectory and historical baseline departures
    for a chosen terrestrial coordinate. Clearly distinguishes genuine satellite observations
    from demonstration models.
    """
    return LandService.get_timeseries(
        latitude=latitude,
        longitude=longitude,
        start_year=start_year,
        end_year=end_year,
        source_mode=source_mode,
    )
