from app.core.config import settings
from app.core.database import check_database_connection, session_scope
from app.schemas.health import SystemHealthResponse, DatabaseHealth, SystemInfoResponse
from app.models.timeseries import ObservationTimeSeriesRecord
from app.models.observation import EarthObservation
from sqlalchemy import select, func


class HealthService:
    """Service to inspect system health, database status, and configuration."""

    @staticmethod
    async def get_system_health() -> SystemHealthResponse:
        db_status = await check_database_connection()

        verified_count = 0
        dataset_counts = {}
        last_ingested = None

        if db_status.get("connected"):
            with session_scope() as sess:
                if sess is not None:
                    try:
                        rows = sess.execute(
                            select(
                                ObservationTimeSeriesRecord.dataset_id,
                                func.count(ObservationTimeSeriesRecord.id),
                            )
                            .filter(ObservationTimeSeriesRecord.verification_status == "verified_observation")
                            .group_by(ObservationTimeSeriesRecord.dataset_id)
                        ).all()
                        dataset_counts = {r[0]: int(r[1]) for r in rows}
                        verified_count = sum(dataset_counts.values())

                        last_ts = sess.execute(
                            select(func.max(EarthObservation.created_at))
                            .filter(EarthObservation.verification_status == "verified_observation")
                        ).scalar()
                        if last_ts:
                            last_ingested = last_ts.isoformat() if hasattr(last_ts, "isoformat") else str(last_ts)
                    except Exception:
                        pass

        db_health_data = {
            **db_status,
            "verified_observations_count": verified_count,
            "verified_datasets": dataset_counts,
            "last_ingested_at": last_ingested,
        }

        return SystemHealthResponse(
            status="healthy" if db_status.get("connected") else "degraded",
            service="PlanetIQ Scientific Backend",
            version=settings.VERSION,
            environment=settings.ENVIRONMENT,
            database=DatabaseHealth(**db_health_data),
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
