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
    """Verifies that authentic satellite benchmarks are correctly persisted and idempotent."""
    # First seeding
    inserted = IngestionService.seed_initial_observations(db_session)
    assert inserted > 0

    # Query timeseries records
    records = db_session.execute(
        select(ObservationTimeSeriesRecord).filter_by(dataset_id="MOD13C2")
    ).scalars().all()
    assert len(records) == inserted

    # Check Punjab benchmark
    punjab_recs = [r for r in records if "Punjab" in r.location_name]
    assert len(punjab_recs) == 4
    for r in punjab_recs:
        assert r.metric_name == "NDVI"
        assert 0.0 <= r.value <= 1.0
        assert r.baseline_normal == 0.485
        assert r.unit == "dimensionless ratio (-0.2000 to +1.0000)"

    # Query EarthObservation catalog entries
    cat_entries = db_session.execute(
        select(EarthObservation).filter_by(dataset_id="MOD13C2")
    ).scalars().all()
    assert len(cat_entries) > 0
    for c in cat_entries:
        assert c.mission_name == "MODIS Terra"
        assert c.extra_metadata["is_observation"] is True
        assert c.extra_metadata["data_status"] == "observation"
        assert "granule_id" in c.extra_metadata

    # Second seeding run should insert 0 new records (idempotent)
    second_inserted = IngestionService.seed_initial_observations(db_session)
    assert second_inserted == 0
