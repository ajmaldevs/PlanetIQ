from typing import Optional
from fastapi import APIRouter, Query
from app.schemas.scientific import GeoJSONFeatureCollection, AtmosphereTimeSeriesResponse
from app.services.atmosphere_service import AtmosphereService

router = APIRouter()


@router.get(
    "/grid",
    response_model=GeoJSONFeatureCollection,
    summary="GPM IMERG Monthly Precipitation Spatial Grid"
)
def get_precipitation_grid(
    min_lat: Optional[float] = Query(None, ge=-90.0, le=90.0, description="Minimum bounding latitude"),
    max_lat: Optional[float] = Query(None, ge=-90.0, le=90.0, description="Maximum bounding latitude"),
    min_lon: Optional[float] = Query(None, ge=-180.0, le=180.0, description="Minimum bounding longitude"),
    max_lon: Optional[float] = Query(None, ge=-180.0, le=180.0, description="Maximum bounding longitude"),
    date: str = Query("2026-03", pattern=r"^\d{4}-(0[1-9]|1[0-2])$", description="Target calendar month (YYYY-MM)")
):
    """
    Returns spatially gridded GPM IMERG Final Monthly Precipitation (GPM_3IMERGM v07) observations.
    Each feature clearly includes both:
    - precipitation_rate_mm_hr: Average rate in mm/hr
    - precipitation_accumulated_mm: Total monthly liquid accumulation in mm
    - climatological_normal_mm: Historical baseline in mm
    - anomaly_mm: Monthly departure in mm
    """
    return AtmosphereService.get_spatial_grid(
        min_lat=min_lat,
        max_lat=max_lat,
        min_lon=min_lon,
        max_lon=max_lon,
        date_str=date
    )


@router.get(
    "/timeseries",
    response_model=AtmosphereTimeSeriesResponse,
    summary="GPM IMERG Multi-Year Precipitation Trend"
)
def get_precipitation_timeseries(
    latitude: float = Query(..., ge=-90.0, le=90.0, description="Target latitude"),
    longitude: float = Query(..., ge=-180.0, le=180.0, description="Target longitude"),
    start_year: int = Query(2024, ge=1998, le=2026, description="Start year"),
    end_year: int = Query(2026, ge=1998, le=2026, description="End year")
):
    """
    Returns historical monthly precipitation trends and climatological normal comparisons
    for a chosen geographic coordinate.
    """
    return AtmosphereService.get_timeseries(
        latitude=latitude,
        longitude=longitude,
        start_year=start_year,
        end_year=end_year
    )
