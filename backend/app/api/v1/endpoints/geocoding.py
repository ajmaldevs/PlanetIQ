from fastapi import APIRouter, Query, HTTPException
from app.schemas.geocoding import GeocodingSearchResponse
from app.services.geocoding_service import GeocodingService

router = APIRouter()


@router.get("/search", response_model=GeocodingSearchResponse)
async def search_places(
    q: str = Query(..., min_length=1, description="Geographic query string (country, city, mountain, river, sea, etc.)"),
    limit: int = Query(10, ge=1, le=50, description="Maximum number of search suggestions"),
) -> GeocodingSearchResponse:
    """
    Search authoritative global geographic places including countries, states,
    major cities, rivers, lakes, mountain peaks, and ocean systems.
    Includes exact bounding boxes for spatial navigation.
    """
    try:
        return GeocodingService.search(query=q, limit=limit)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Geocoding service error: {str(e)}")
