from typing import List, Dict
from fastapi import APIRouter, Query
from app.schemas.scientific import CrossSystemResponse
from app.services.cross_system_service import CrossSystemService

router = APIRouter()


@router.get(
    "/teleconnections",
    response_model=List[Dict[str, str]],
    summary="List Planetary System Teleconnection Analyses"
)
def list_teleconnections():
    """
    Returns available cross-system teleconnection scenarios linking
    ocean (SWOT), atmosphere (GPM), and land (MODIS) subsystems.
    """
    return CrossSystemService.list_phenomena()


@router.get(
    "/analysis",
    response_model=CrossSystemResponse,
    summary="Get Synchronized Cross-System Teleconnection Analysis"
)
def get_teleconnection_analysis(
    phenomenon_id: str = Query("enso_walker", description="Identifier (e.g., 'enso_walker', 'iod_indian_ocean')")
):
    """
    Returns multi-system synchronized observations, explaining coupling mechanisms
    and emphasizing that statistical correlation does not equal direct local causation.
    """
    return CrossSystemService.get_teleconnection_analysis(phenomenon_id)
