from typing import Optional
from fastapi import APIRouter, Query
from app.schemas.scientific import GeoJSONFeatureCollection, OceanTimeSeriesResponse
from app.services.ocean_service import OceanService

router = APIRouter()


@router.get(
    "/observations",
    response_model=GeoJSONFeatureCollection,
    summary="SWOT KaRIn Sea Surface Height Spatial Observations (Option A)"
)
def get_ocean_observations(
    min_lat: Optional[float] = Query(None, ge=-90.0, le=90.0),
    max_lat: Optional[float] = Query(None, ge=-90.0, le=90.0),
    min_lon: Optional[float] = Query(None, ge=-180.0, le=180.0),
    max_lon: Optional[float] = Query(None, ge=-180.0, le=180.0),
    date: str = Query("2026-03", pattern=r"^\d{4}-\d{2}$", description="Calendar month (YYYY-MM)")
):
    """
    Returns SWOT KaRIn Low Rate Ocean Sea Surface Height (Option A) swath and gridded features.
    Variables include:
    - ssh_karin_m: Absolute Sea Surface Height relative to WGS84 in meters.
    - ssha_karin_m: Sea Surface Height Anomaly in meters.
    - dynamic_topography_m: Dynamic topography in meters.
    - eddy_type: Meso-scale vortex classification.
    - eddy_kinetic_energy_cm2_s2: Eddy kinetic energy (cm²/s²).
    """
    return OceanService.get_spatial_observations(
        min_lat=min_lat,
        max_lat=max_lat,
        min_lon=min_lon,
        max_lon=max_lon,
        date_str=date
    )


@router.get(
    "/timeseries",
    response_model=OceanTimeSeriesResponse,
    summary="SWOT Regional Sea Surface Height Anomaly Trend"
)
def get_ocean_timeseries(
    latitude: float = Query(..., ge=-90.0, le=90.0),
    longitude: float = Query(..., ge=-180.0, le=180.0),
    start_year: int = Query(2024, ge=2022, le=2026),
    end_year: int = Query(2026, ge=2022, le=2026)
):
    """
    Returns multi-year monthly SSHA trajectory and eddy kinetic energy trends for a given ocean coordinate.
    """
    return OceanService.get_timeseries(
        latitude=latitude,
        longitude=longitude,
        start_year=start_year,
        end_year=end_year
    )
