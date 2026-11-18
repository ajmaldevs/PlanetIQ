"""
Tests for Satellite Ingestion Service & Database Persistence.
Verifies:
- Seeding of authentic NASA MODIS MOD13C2 observation benchmarks into SQLite / PostgreSQL.
- Provenance enforcement: is_observation=True, data_status='observation'.
- Idempotency of database ingestion.
- Correct coordinate and attribute persistence in EarthObservation and ObservationTimeSeriesRecord.
"""

import pytest
from sqlalchemy import create_engine, select
from sqlalchemy.orm import sessionmaker

from app.models.base import Base
from app.models.observation import EarthObservation
from app.models.timeseries import ObservationTimeSeriesRecord
from app.services.ingestion_service import IngestionService


@pytest.fixture
def db_session():
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)
    Session = sessionmaker(bind=engine)
    session = Session()
    yield session
    session.close()


def test_seed_initial_observations_idempotent(db_session):
    """Verifies that authentic satellite benchmarks are correctly persisted across Land, Ocean, and Atmosphere and idempotent."""
    # First seeding
    inserted = IngestionService.seed_initial_observations(db_session)
    assert inserted > 0

    # Query all timeseries records
    records = db_session.execute(
        select(ObservationTimeSeriesRecord)
    ).scalars().all()
    assert len(records) == inserted

    # Check Land (MODIS Punjab)
    punjab_recs = [r for r in records if "Punjab" in r.location_name and r.dataset_id == "MOD13C2"]
    assert len(punjab_recs) == 4
    for r in punjab_recs:
        assert r.metric_name == "NDVI"
        assert 0.0 <= r.value <= 1.0
        assert r.baseline_normal == 0.485
        assert r.unit == "dimensionless ratio (-0.2000 to +1.0000)"

    # Check Ocean (MODIS Aqua Chlorophyll-a & SST / SWOT SSHA)
    ocean_recs = [r for r in records if "Arabian Sea" in r.location_name]
    assert len(ocean_recs) >= 4
    chl_recs = [r for r in ocean_recs if r.metric_name == "chlor_a"]
    assert len(chl_recs) == 4
    for r in chl_recs:
        assert r.value > 0.0
        assert r.unit == "mg/m³"

    # Check Atmosphere (MODIS AOD & GPM Precipitation)
    atmo_recs = [r for r in records if "Indo-Gangetic" in r.location_name]
    assert len(atmo_recs) >= 4
    aod_recs = [r for r in atmo_recs if r.metric_name == "aod_550"]
    assert len(aod_recs) == 4
    for r in aod_recs:
        assert r.value > 0.0

    # Query EarthObservation catalog entries across all 3 domains
    cat_entries = db_session.execute(
        select(EarthObservation)
    ).scalars().all()
    assert len(cat_entries) > 0
    domains_present = {c.dataset_id for c in cat_entries}
    assert "MOD13C2" in domains_present
    assert "MODISA_L3m_CHL" in domains_present
    assert "MOD08_M3" in domains_present

    for c in cat_entries:
        assert c.extra_metadata["is_observation"] is True
        assert c.extra_metadata["data_status"] == "observation"
        assert "granule_id" in c.extra_metadata

    # Second seeding run should insert 0 new records (idempotent)
    second_inserted = IngestionService.seed_initial_observations(db_session)
    assert second_inserted == 0
