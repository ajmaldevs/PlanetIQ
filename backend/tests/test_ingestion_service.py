"""
Tests for Satellite Ingestion Service & Scientific Integrity Verification.
Verifies:
1. Hardcoded development fixtures are strictly tagged as synthetic:
   - verification_status = "synthetic"
   - is_observation = False
   - data_status = "synthetic_fixture"
   - NEVER labeled as real satellite observations.
2. Genuine satellite granule ingestion:
   - Computes SHA-256 file checksum.
   - Extracts arrays and quality control.
   - Persists verified observations with:
     - verification_status = "verified_observation"
     - is_observation = True
     - data_status = "observation"
     - source_file_checksum = <sha256>
3. ObservationRepository strictly quarantines synthetic records:
   - Queries only return records with verification_status = "verified_observation".
   - Synthetic fixtures return unavailable when queried for observations.
4. Transparent credential gating:
   - Live ingestion blocks with explicit status when NASA credentials are not configured.
"""

import pytest
import os
import rasterio
import numpy as np
from sqlalchemy import create_engine, select
from sqlalchemy.orm import sessionmaker

from app.models.base import Base
from app.models.observation import EarthObservation
from app.models.timeseries import ObservationTimeSeriesRecord
from app.services.ingestion_service import IngestionService
from app.repositories.observation_repository import ObservationRepository


@pytest.fixture
def db_session():
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)
    Session = sessionmaker(bind=engine)
    session = Session()
    yield session
    session.close()


def test_fabricated_seeders_removed_from_ingestion_service():
    """Verifies that seed_authoritative_satellite_observations and seed_initial_observations do not exist."""
    assert not hasattr(IngestionService, "seed_authoritative_satellite_observations")
    assert not hasattr(IngestionService, "seed_initial_observations")


def test_observation_repository_quarantines_synthetic_fixtures(db_session):
    """Verifies that ObservationRepository rejects synthetic fixtures and returns unavailable."""
    synthetic_record = ObservationTimeSeriesRecord(
        dataset_id="MOD13C2",
        location_name="Test Synthetic Location",
        latitude=0.0,
        longitude=0.0,
        date_str="2026-03",
        metric_name="ndvi",
        value=0.5,
        unit="dimensionless",
        verification_status="synthetic",
        granule_id="SYNTHETIC_DEV_FIXTURE_001",
    )
    db_session.add(synthetic_record)
    db_session.commit()

    # When querying real observations, synthetic fixtures MUST NOT be returned as genuine observations
    grid = ObservationRepository.get_real_modis_spatial_grid("2026-03", session=db_session)
    assert grid["metadata"]["data_status"] == "unavailable"
    assert grid["metadata"]["is_observation"] is False
    assert len(grid["features"]) == 0

    ocean_grid = ObservationRepository.get_real_ocean_spatial_grid("2026-03", session=db_session)
    assert ocean_grid["metadata"]["data_status"] == "unavailable"
    assert ocean_grid["metadata"]["is_observation"] is False
    assert len(ocean_grid["features"]) == 0

    atmo_grid = ObservationRepository.get_real_atmosphere_spatial_grid("2026-03", session=db_session)
    assert atmo_grid["metadata"]["data_status"] == "unavailable"
    assert atmo_grid["metadata"]["is_observation"] is False
    assert len(atmo_grid["features"]) == 0


def test_ingest_genuine_satellite_granule_with_checksum(tmp_path, db_session):
    """Verifies that genuine satellite files are ingested with verified checksum and observation status."""
    granule_path = str(tmp_path / "MOD13C2.A2026060.061.verified.tif")

    # Create valid synthetic satellite GeoTIFF array
    with rasterio.open(granule_path, "w", driver="GTiff", height=20, width=20, count=3, dtype="int16") as dst:
        dst.write(np.full((20, 20), 7420, dtype="int16"), 1)  # NDVI band (0.7420)
        dst.write(np.full((20, 20), 5200, dtype="int16"), 2)  # EVI band (0.5200)
        dst.write(np.zeros((20, 20), dtype="int16"), 3)       # QA band (0 = Good Data)

    res = IngestionService.ingest_granule_file(
        granule_path=granule_path,
        dataset_id="MOD13C2",
        date_str="2026-03",
        session=db_session,
        mission_name="MODIS Terra (Verified Ingestion)",
    )

    assert res["status"] == "success"
    assert len(res["checksum"]) == 64
    assert res["records_persisted"] > 0

    # Verify EarthObservation record
    cat_rec = db_session.execute(
        select(EarthObservation).filter_by(granule_id=os.path.basename(granule_path))
    ).scalar_one()

    assert cat_rec.verification_status == "verified_observation"
    assert cat_rec.source_file_checksum == res["checksum"]
    assert cat_rec.spatial_bounds is not None
    assert "polygon" in str(cat_rec.spatial_bounds).lower()
    assert cat_rec.extra_metadata["is_observation"] is True
    assert cat_rec.extra_metadata["data_status"] == "observation"
    assert cat_rec.extra_metadata["collection_id"] in ["MOD13C2", "C2565788914-LPCLOUD"]
    assert cat_rec.extra_metadata["version"] == "061"
    assert "download_url" in cat_rec.extra_metadata
    assert "metadata_url" in cat_rec.extra_metadata
    assert "observation_start_time" in cat_rec.extra_metadata
    assert "observation_end_time" in cat_rec.extra_metadata
    assert "extracted_variables" in cat_rec.extra_metadata
    assert "units" in cat_rec.extra_metadata
    assert "quality_flags" in cat_rec.extra_metadata
    assert "checksum_sha256" in cat_rec.extra_metadata
    assert "ingestion_timestamp" in cat_rec.extra_metadata

    # Verify that ObservationRepository NOW returns this genuine observation
    grid = ObservationRepository.get_real_modis_spatial_grid("2026-03", session=db_session)
    assert grid["metadata"]["data_status"] == "observation"
    assert grid["metadata"]["is_observation"] is True
    assert len(grid["features"]) > 0
    assert grid["features"][0]["properties"]["verification_status"] == "verified_observation"
    assert grid["features"][0]["properties"]["source_file_checksum"] == res["checksum"]


@pytest.mark.asyncio
async def test_live_granule_ingestion_blocks_without_credentials(db_session):
    """Verifies that live ingestion transparently blocks when NASA credentials are not configured."""
    res = await IngestionService.ingest_live_granule("MOD13C2", 2026, 3, db_session)
    assert res["status"] == "blocked"
    assert res["reason"] == "NASA_EARTHDATA_CREDENTIALS_REQUIRED"
    assert "NASA Earthdata credentials" in res["message"]


@pytest.mark.asyncio
async def test_gpm_date_substitution_strictly_prohibited(monkeypatch, db_session):
    """
    Regression Test:
    Verifies that IngestionService strictly prohibits substituting a different month's
    granule (e.g. September 2025) when a requested period (e.g. March 2026) is unavailable.
    If a discovered granule's start date does not match the requested date (YYYY-MM),
    it MUST be rejected with status 'not_found' and never relabeled or persisted under the requested date.
    """
    from app.integrations.nasa.earthdata_client import NasaEarthdataClient
    from app.integrations.nasa.gpm_client import GpmClient

    monkeypatch.setattr(
        NasaEarthdataClient,
        "get_auth_status",
        lambda: {"authenticated": True, "granule_download_available": True}
    )

    # Return a 2025-09 granule when 2026-03 is requested
    async def mock_find_granule(year, month, bounding_box=None):
        return {
            "title": "3B-MO.MS.MRG.3IMERG.20250901-S000000-E235959.09.V07B.HDF5",
            "observation_start_time": "2025-09-01T00:00:00Z",
            "observation_end_time": "2025-09-30T23:59:59Z",
            "data_links": ["https://gesdisc.earthdata.nasa.gov/data/GPM_L3/sample.nc4"],
        }

    monkeypatch.setattr(GpmClient, "find_granule_for_month", mock_find_granule)

    res = await IngestionService.ingest_live_granule("GPM_3IMERGM", 2026, 3, db_session)

    assert res["status"] == "not_found"
    assert "No genuine granule discovered" in res["message"]

    # Verify no records were persisted under 2026-03
    recs = db_session.execute(
        select(ObservationTimeSeriesRecord).filter_by(dataset_id="GPM_3IMERGM", date_str="2026-03")
    ).scalars().all()
    assert len(recs) == 0
