from app.core.config import settings
from app.core.database import check_database_connection
from app.schemas.health import SystemHealthResponse, DatabaseHealth, SystemInfoResponse


class HealthService:
    """Service to inspect system health, database status, and configuration."""

    @staticmethod
    async def get_system_health() -> SystemHealthResponse:
        db_status = await check_database_connection()
        return SystemHealthResponse(
            status="healthy",
            service="PlanetIQ Scientific Backend",
            version=settings.VERSION,
            environment=settings.ENVIRONMENT,
            database=DatabaseHealth(**db_status),
        )

    @staticmethod
    def get_system_info() -> SystemInfoResponse:
        return SystemInfoResponse(
            project_name=settings.PROJECT_NAME,
            version=settings.VERSION,
            environment=settings.ENVIRONMENT,
            docs_url="/docs",
            api_prefix=settings.API_V1_STR,
            nasa_cmr_endpoint=settings.NASA_CMR_ENDPOINT,
            gemini_model=settings.GEMINI_MODEL,
        )
