from fastapi import APIRouter
from app.schemas.health import SystemHealthResponse, SystemInfoResponse
from app.services.health_service import HealthService

router = APIRouter()


@router.get("/health", response_model=SystemHealthResponse, summary="System Health & Database Status")
async def health_check():
    """Returns system operational status, module catalog, and database connectivity."""
    return await HealthService.get_system_health()


@router.get("/system-info", response_model=SystemInfoResponse, summary="System Metadata")
def get_system_info():
    """Returns system parameters, API prefixes, and configured scientific endpoints."""
    return HealthService.get_system_info()
