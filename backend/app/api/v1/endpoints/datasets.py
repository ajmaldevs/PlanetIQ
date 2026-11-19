from typing import List
from fastapi import APIRouter, Depends, HTTPException, Query
from app.schemas.scientific import DatasetCatalogItem
from app.services.dataset_service import DatasetService
from app.integrations.nasa.earthdata_client import NasaEarthdataClient
from app.core.database import get_sync_session, check_database_connection
from app.models.timeseries import ObservationTimeSeriesRecord
from app.api.v1.endpoints.ingest import require_admin_authorization
from sqlalchemy import func, select

router = APIRouter()


@router.get(
    "/auth-status",
    summary="Check NASA Earthdata Authentication & CMR Readiness",
    tags=["NASA Earthdata & Ingestion"]
)
async def get_nasa_auth_status():
    """
    Diagnostic endpoint that verifies actual NASA Earthdata authentication readiness,
    CMR connectivity, and database observation storage without exposing secrets.
    """
    auth = NasaEarthdataClient.get_auth_status()
    db_check = await check_database_connection()

    verified_counts = {}
    db = get_sync_session()
    if db is not None:
        try:
            rows = db.execute(
                select(ObservationTimeSeriesRecord.dataset_id, func.count(ObservationTimeSeriesRecord.id))
                .filter_by(verification_status="verified_observation")
                .group_by(ObservationTimeSeriesRecord.dataset_id)
            ).all()
            verified_counts = {r[0]: r[1] for r in rows}
        except Exception:
            pass
        finally:
            db.close()

    total_verified = sum(verified_counts.values())

    return {
        "status": "success",
        "nasa_earthdata": {
            "authenticated": auth.get("authenticated", False),
            "auth_method": auth.get("auth_method", "none"),
            "username_configured": auth.get("username_configured"),
            "cmr_public_search_available": auth.get("cmr_public_search_available", True),
            "granule_download_available": auth.get("granule_download_available", False),
            "notice": auth.get("notice"),
        },
        "database": {
            "status": db_check.get("status"),
            "connected": db_check.get("connected"),
            "postgis_available": db_check.get("postgis_available"),
            "total_verified_observations": total_verified,
            "observations_by_dataset": verified_counts,
        },
    }


@router.post(
    "/ingest",
    summary="Trigger NASA Satellite Granule Ingestion",
    tags=["NASA Earthdata & Ingestion"],
    dependencies=[Depends(require_admin_authorization)],
)
async def trigger_granule_ingestion(
    dataset_id: str = Query("MOD13C2", description="Dataset ID (MOD13C2, SWOT_L2_LR_SSH, GPM_3IMERGM, MODISA_L3m_CHL, MOD08_M3)"),
    year: int = Query(2026, ge=2020, le=2030, description="Observation year"),
    month: int = Query(3, ge=1, le=12, description="Observation month"),
):
    """
    Triggers live CMR discovery and ingestion for a requested satellite dataset and date.
    Requires active NASA Earthdata credentials in the backend environment.
    Decoupled from connection pool during NASA granule download.
    """
    from app.services.ingestion_service import IngestionService

    try:
        result = await IngestionService.ingest_live_granule(
            dataset_id=dataset_id,
            year=year,
            month=month,
            session=None,
        )
        return {
            "status": result.get("status"),
            "dataset_id": dataset_id,
            "year": year,
            "month": month,
            "result": result,
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Ingestion failed: {e}")


@router.get(
    "/ingestion-status",
    summary="Get Database Observation Catalog Statistics",
    tags=["NASA Earthdata & Ingestion"]
)
def get_ingestion_catalog_status():
    """Returns database observation counts and breakdown by verification status."""
    db = get_sync_session()
    if db is None:
        return {
            "database_connected": False,
            "total_records": 0,
            "message": "Database offline or unconfigured."
        }

    try:
        from app.models.observation import EarthObservation
        cat_count = db.execute(select(func.count(EarthObservation.id))).scalar() or 0
        ts_count = db.execute(select(func.count(ObservationTimeSeriesRecord.id))).scalar() or 0
        verified_count = db.execute(
            select(func.count(ObservationTimeSeriesRecord.id)).filter_by(verification_status="verified_observation")
        ).scalar() or 0

        return {
            "database_connected": True,
            "catalog_granules": cat_count,
            "total_timeseries_points": ts_count,
            "verified_observations": verified_count,
            "synthetic_fixtures": ts_count - verified_count,
            "status": "ready" if verified_count > 0 else "empty",
        }
    except Exception as exc:
        return {
            "database_connected": False,
            "error": str(exc),
        }
    finally:
        db.close()


@router.get(
    "/",
    response_model=List[DatasetCatalogItem],
    summary="List All Approved Scientific Datasets"
)
def get_all_datasets():
    """
    Returns complete scientific catalog metadata, sensors, resolutions,
    units, processing methods, and known limitations for all PlanetIQ modules.
    """
    return DatasetService.get_all_datasets()


@router.get(
    "/{dataset_id}",
    response_model=DatasetCatalogItem,
    summary="Get Specific Dataset Metadata"
)
def get_dataset_by_id(dataset_id: str):
    """
    Retrieves full provenance, scientific variables, units, and documentation
    for a specific NASA dataset identifier (e.g. SWOT_L2_LR_SSH, GPM_3IMERGM, MOD13C2).
    """
    item = DatasetService.get_dataset_by_id(dataset_id)
    if not item:
        raise HTTPException(status_code=404, detail=f"Dataset with ID '{dataset_id}' not found in catalog.")
    return item
