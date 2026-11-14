from fastapi import APIRouter, Query, HTTPException
from app.schemas.scientific import PeriodComparisonResponse
from app.services.comparison_service import ComparisonService

router = APIRouter()


@router.get(
    "/periods",
    response_model=PeriodComparisonResponse,
    summary="Compare Historical Earth System Observations Across Two Periods",
    description=(
        "Compares observations between Period A and Period B for Atmosphere (GPM IMERG), "
        "Ocean (SWOT KaRIn), or Land (MODIS NDVI). Computes absolute differences, mathematically "
        "sound percentage shifts, regional geographic difference tables, and scientific interpretations."
    ),
)
def compare_periods(
    module: str = Query(..., description="Earth system module: 'atmosphere', 'ocean', or 'land'"),
    period_a: str = Query(..., pattern=r"^\d{4}-(0[1-9]|1[0-2])$", description="First period in YYYY-MM format"),
    period_b: str = Query(..., pattern=r"^\d{4}-(0[1-9]|1[0-2])$", description="Second period in YYYY-MM format"),
    latitude: float = Query(0.0, ge=-90.0, le=90.0, description="Latitude of inspection coordinate"),
    longitude: float = Query(0.0, ge=-180.0, le=180.0, description="Longitude of inspection coordinate"),
) -> PeriodComparisonResponse:
    try:
        return ComparisonService.compare_periods(
            module=module,
            period_a=period_a,
            period_b=period_b,
            latitude=latitude,
            longitude=longitude,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Comparison calculation failed: {str(e)}")
