from typing import Any, Dict, List, Optional
from datetime import datetime
from fastapi import APIRouter, Depends, Header, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import select, func, text

from app.core.config import settings
from app.core.database import session_scope
from app.models.observation import EarthObservation
from app.models.timeseries import ObservationTimeSeriesRecord
from app.integrations.nasa.earthdata_client import NasaEarthdataClient
from app.services.ingestion_service import IngestionService

router = APIRouter()


class IngestionTriggerRequest(BaseModel):
    dataset_id: str = Field(..., description="Target dataset ('MOD13C2', 'GPM_3IMERGM', 'SWOT_L2_LR_SSH', 'MODISA_L3m_CHL', 'MOD08_M3')")
    year: int = Field(..., ge=2000, le=2026, description="Target observation year")
    month: int = Field(..., ge=1, le=12, description="Target observation month (1-12)")
    bounding_box: Optional[List[float]] = Field(None, description="Optional bounding box [min_lat, min_lon, max_lat, max_lon]")


def require_admin_authorization(
    x_admin_key: Optional[str] = Header(None, alias="X-Admin-Key"),
    authorization: Optional[str] = Header(None),
) -> None:
    """Protects expensive satellite ingestion endpoints from unauthorized public execution."""
    expected_key = settings.ADMIN_API_KEY
    if not expected_key:
        return

    # Check X-Admin-Key header
    if x_admin_key and x_admin_key.strip() == expected_key:
        return

    # Check Authorization: Bearer <key>
    if authorization:
        parts = authorization.strip().split()
        if len(parts) == 2 and parts[0].lower() == "bearer" and parts[1] == expected_key:
            return

    raise HTTPException(
        status_code=401,
        detail="Unauthorized. Scientific granule ingestion requires administrative authentication (X-Admin-Key header).",
    )


@router.get(
    "/status",
    summary="Scientific Ingestion and Observation Database Status",
    description="Reports database connectivity, PostGIS extension, NASA auth status, verified observation counts, and available date ranges.",
)
def get_ingestion_status() -> Dict[str, Any]:
    """Inspects authentic satellite observation presence and ingest system readiness."""
    auth_status = NasaEarthdataClient.get_auth_status()

    db_connected = False
    postgis_available = False
    verified_counts: Dict[str, int] = {}
    available_date_ranges: Dict[str, Dict[str, Optional[str]]] = {}
    last_ingestion_time: Optional[str] = None

    with session_scope() as db:
        if db is not None:
            try:
                # 1. Connectivity test
                db.execute(text("SELECT 1")).scalar()
                db_connected = True

                # 2. PostGIS test
                try:
                    gis_ver = db.execute(text("SELECT PostGIS_Full_Version()")).scalar()
                    postgis_available = bool(gis_ver)
                except Exception:
                    postgis_available = False

                # 3. Verified counts by dataset
                count_rows = db.execute(
                    select(
                        ObservationTimeSeriesRecord.dataset_id,
                        func.count(ObservationTimeSeriesRecord.id),
                    )
                    .filter(ObservationTimeSeriesRecord.verification_status == "verified_observation")
                    .group_by(ObservationTimeSeriesRecord.dataset_id)
                ).all()
                verified_counts = {r[0]: int(r[1]) for r in count_rows}

                # 4. Available observation date ranges
                range_rows = db.execute(
                    select(
                        ObservationTimeSeriesRecord.dataset_id,
                        func.min(ObservationTimeSeriesRecord.date_str),
                        func.max(ObservationTimeSeriesRecord.date_str),
                    )
                    .filter(ObservationTimeSeriesRecord.verification_status == "verified_observation")
                    .group_by(ObservationTimeSeriesRecord.dataset_id)
                ).all()
                for r in range_rows:
                    available_date_ranges[r[0]] = {
                        "min_date": r[1],
                        "max_date": r[2],
                    }

                # 5. Last successful ingestion timestamp
                last_ts = db.execute(
                    select(func.max(EarthObservation.created_at))
                    .filter(EarthObservation.verification_status == "verified_observation")
                ).scalar()
                if last_ts:
                    last_ingestion_time = last_ts.isoformat() if hasattr(last_ts, "isoformat") else str(last_ts)

            except Exception as e:
                db_connected = False

    return {
        "status": "operational" if db_connected else "degraded",
        "database": {
            "connected": db_connected,
            "postgis_available": postgis_available,
        },
        "nasa_earthdata": {
            "cmr_search_operational": True,
            "authentication_configured": auth_status.get("granule_download_available", False),
            "auth_method": auth_status.get("auth_method", "none"),
        },
        "scientific_observations": {
            "verified_record_counts": verified_counts,
            "available_date_ranges": available_date_ranges,
            "last_successful_ingestion": last_ingestion_time,
            "has_genuine_observations": sum(verified_counts.values()) > 0,
        },
    }


@router.post(
    "/trigger",
    summary="Trigger NASA Granule Discovery, Download, and Scientific Ingestion",
    description="Discovers official NASA CMR granule, downloads file via Earthdata Login, decodes scientific variables, and persists verified observations to PostGIS.",
    dependencies=[Depends(require_admin_authorization)],
)
async def trigger_granule_ingestion(request: IngestionTriggerRequest) -> Dict[str, Any]:
    date_str = f"{request.year:04d}-{request.month:02d}"

    # Step 1: Prevent duplicate ingestion
    with session_scope() as db:
        if db is not None:
            existing = db.execute(
                select(EarthObservation.id, EarthObservation.granule_id, EarthObservation.source_file_checksum)
                .filter(
                    EarthObservation.dataset_id == request.dataset_id,
                    func.to_char(EarthObservation.observation_time, "YYYY-MM") == date_str,
                    EarthObservation.verification_status == "verified_observation",
                )
            ).first()
            if existing:
                return {
                    "status": "already_ingested",
                    "dataset_id": request.dataset_id,
                    "date": date_str,
                    "granule_id": existing[1],
                    "checksum": existing[2],
                    "message": f"Authentic satellite granule for {request.dataset_id} ({date_str}) is already verified in PostgreSQL.",
                }

    # Step 2: Execute live ingestion
    res = await IngestionService.ingest_live_granule(
        dataset_id=request.dataset_id,
        year=request.year,
        month=request.month,
    )

    return res
