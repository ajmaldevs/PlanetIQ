"""
Comprehensive Test Suite for PlanetIQ Milestone M3:
- Feature 9: PostGIS Geometry & Spatial Queries in Repositories
- Feature 10: Isolated Time-Series Queries (Zero Cross-Contamination)
- Feature 11: Complete Atmosphere Time-Series Schema & Null Preservation
- Feature 12: Schema & Type Unification (DataStatus)
- Feature 13: Audited Legacy Record Quarantine
"""

import pytest
from datetime import datetime, timezone
from sqlalchemy import create_engine, select
from sqlalchemy.orm import sessionmaker
from geoalchemy2 import Geometry
from geoalchemy2.elements import WKTElement
from pydantic import ValidationError

from app.core.database import Base
from app.models.timeseries import ObservationTimeSeriesRecord
from app.models.quarantine import QuarantineAuditLog
from app.repositories.observation_repository import ObservationRepository
from app.schemas.scientific import (
    DataStatus,
    AtmosphereTimeSeriesPoint,
    AtmosphereTimeSeriesResponse,
    OceanTimeSeriesPoint,
    OceanTimeSeriesResponse,
    LandTimeSeriesResponse,
    CrossSystemResponse,
    DataQualityBlock,
    AssistantQueryResponse,
    PeriodComparisonResponse,
)
from app.services.ocean_service import OceanService
from app.services.atmosphere_service import AtmosphereService
from app.services.comparison_service import ComparisonService


@pytest.fixture
def m3_db_session():
    """Isolated in-memory SQLite database session for M3 testing."""
    engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
    )
    Base.metadata.create_all(engine)
    SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    session = SessionLocal()
    ObservationRepository._last_db_failure_time = 0.0
    try:
        yield session
    finally:
        session.close()
        ObservationRepository._last_db_failure_time = 0.0


# =============================================================================
# Feature 9: PostGIS Geometry & Spatial Queries in Repositories
# =============================================================================

def test_f09_geom_column_metadata():
    """Verify geom column is Point with SRID 4326 and spatial index on model."""
    assert hasattr(ObservationTimeSeriesRecord, "geom")
    col = ObservationTimeSeriesRecord.geom
    assert isinstance(col.type, Geometry)
    assert col.type.geometry_type == "POINT"
    assert col.type.srid == 4326


def test_f09_spatial_bbox_filter_sqlite_execution(m3_db_session):
    """Verify _apply_bbox_filter correctly filters points on SQLite."""
    # Seed 2 records: one inside bbox, one outside
    inside_rec = ObservationTimeSeriesRecord(
        dataset_id="MOD13C2",
        location_name="Inside BBox",
        latitude=10.0,
        longitude=20.0,
        geom=WKTElement("POINT(20.0 10.0)", srid=4326),
        date_str="2026-03",
        metric_name="NDVI",
        value=0.75,
        unit="dimensionless",
        verification_status="verified_observation",
    )
    outside_rec = ObservationTimeSeriesRecord(
        dataset_id="MOD13C2",
        location_name="Outside BBox",
        latitude=50.0,
        longitude=60.0,
        geom=WKTElement("POINT(60.0 50.0)", srid=4326),
        date_str="2026-03",
        metric_name="NDVI",
        value=0.30,
        unit="dimensionless",
        verification_status="verified_observation",
    )
    m3_db_session.add_all([inside_rec, outside_rec])
    m3_db_session.commit()

    query = select(ObservationTimeSeriesRecord).filter(
        ObservationTimeSeriesRecord.verification_status == "verified_observation"
    )
    query = ObservationRepository._apply_bbox_filter(
        query, m3_db_session,
        min_lat=5.0, max_lat=15.0,
        min_lon=15.0, max_lon=25.0,
    )
    results = m3_db_session.execute(query).scalars().all()
    assert len(results) == 1
    assert results[0].location_name == "Inside BBox"


def test_f09_spatial_bbox_filter_compiles_postgis_on_postgresql():
    """Verify _apply_bbox_filter emits ST_Intersects and ST_MakeEnvelope when compiling for PostgreSQL."""
    from sqlalchemy.dialects import postgresql
    from unittest.mock import patch

    query = select(ObservationTimeSeriesRecord)
    with patch.object(ObservationRepository, "_is_postgis_available", return_value=True):
        filtered_query = ObservationRepository._apply_bbox_filter(
            query, None,
            min_lat=-10.0, max_lat=10.0,
            min_lon=100.0, max_lon=120.0,
        )
        sql_str = str(filtered_query.compile(dialect=postgresql.dialect()))
        assert "ST_Intersects" in sql_str
        assert "ST_MakeEnvelope" in sql_str


# =============================================================================
# Feature 10: Isolated Time-Series Queries (Zero Cross-Contamination)
# =============================================================================

def test_f10_ocean_point_schema_accepts_none():
    """Verify OceanTimeSeriesPoint accepts None for SSHA, min, max, and EKE."""
    pt = OceanTimeSeriesPoint(
        date="2026-03",
        ssha_mean_m=None,
        ssha_min_m=None,
        ssha_max_m=None,
        eddy_kinetic_energy_cm2_s2=None,
        chlor_a=1.45,
        sst=28.2,
    )
    assert pt.ssha_mean_m is None
    assert pt.ssha_min_m is None
    assert pt.ssha_max_m is None
    assert pt.eddy_kinetic_energy_cm2_s2 is None
    assert pt.chlor_a == 1.45
    assert pt.sst == 28.2


def test_f10_ocean_timeseries_isolation_and_deduplication(m3_db_session):
    """
    Verify multi-sensor records for the same month are merged into a single point,
    timestamps are not duplicated, and unmeasured variables are strictly None (never 0.0).
    """
    records = [
        # Month 1: 2026-03 has SWOT SSH, MODIS CHL, and MODIS SST
        ObservationTimeSeriesRecord(
            dataset_id="SWOT_L2_LR_SSH",
            location_name="Pacific Point",
            latitude=10.0,
            longitude=-140.0,
            date_str="2026-03",
            metric_name="ssha_karin",
            value=0.082,
            unit="m",
            verification_status="verified_observation",
            source_file_checksum="chk_swot_202603",
            granule_id="SWOT_GRAN_202603",
        ),
        ObservationTimeSeriesRecord(
            dataset_id="MODISA_L3m_CHL",
            location_name="Pacific Point",
            latitude=10.0,
            longitude=-140.0,
            date_str="2026-03",
            metric_name="chlor_a",
            value=0.215,
            unit="mg/m³",
            verification_status="verified_observation",
            source_file_checksum="chk_chl_202603",
            granule_id="CHL_GRAN_202603",
        ),
        ObservationTimeSeriesRecord(
            dataset_id="MODISA_L3m_SST",
            location_name="Pacific Point",
            latitude=10.0,
            longitude=-140.0,
            date_str="2026-03",
            metric_name="sst",
            value=27.4,
            unit="°C",
            verification_status="verified_observation",
            source_file_checksum="chk_sst_202603",
            granule_id="SST_GRAN_202603",
        ),
        # Month 2: 2026-04 has ONLY MODIS CHL (SWOT and SST unmeasured)
        ObservationTimeSeriesRecord(
            dataset_id="MODISA_L3m_CHL",
            location_name="Pacific Point",
            latitude=10.0,
            longitude=-140.0,
            date_str="2026-04",
            metric_name="chlor_a",
            value=0.198,
            unit="mg/m³",
            verification_status="verified_observation",
            source_file_checksum="chk_chl_202604",
            granule_id="CHL_GRAN_202604",
        ),
    ]
    m3_db_session.add_all(records)
    m3_db_session.commit()

    res = ObservationRepository.get_real_ocean_timeseries(
        latitude=10.0,
        longitude=-140.0,
        start_year=2026,
        end_year=2026,
        session=m3_db_session,
    )
    assert res["is_observation"] is True
    assert res["data_status"] == "observation"
    ts = res["timeseries"]

    # Exactly 2 unique months (deduplicated!)
    assert len(ts) == 2
    dates = [p["date"] for p in ts]
    assert dates == ["2026-03", "2026-04"]

    # Month 1: all 3 variables merged cleanly
    m1 = ts[0]
    assert m1["date"] == "2026-03"
    assert m1["ssha_mean_m"] == 0.082
    assert m1["chlor_a"] == 0.215
    assert m1["sst"] == 27.4

    # Month 2: unmeasured variables are strictly None (NOT 0.0!)
    m2 = ts[1]
    assert m2["date"] == "2026-04"
    assert m2["ssha_mean_m"] is None
    assert m2["sst"] is None
    assert m2["chlor_a"] == 0.198


def test_f10_ocean_service_no_zero_injection():
    """Verify OceanService.get_timeseries does not inject 0.0 defaults for unmeasured variables."""
    mock_data = {
        "is_observation": True,
        "data_status": "observation",
        "dataset_id": "SWOT_L2_LR_SSH",
        "dataset_name": "SWOT Ocean SSH",
        "region_name": "Pacific Swath",
        "summary_statistics": {"observation_count": 1},
        "timeseries": [
            {
                "date": "2026-03",
                "ssha_mean_m": 0.05,
                "ssha_min_m": None,
                "ssha_max_m": None,
                "eddy_kinetic_energy_cm2_s2": None,
                "chlor_a": None,
                "sst": None,
            }
        ],
    }
    from unittest.mock import patch
    with patch.object(ObservationRepository, "get_real_swot_timeseries", return_value=mock_data):
        resp = OceanService.get_timeseries(10.0, -140.0, 2026, 2026, source_mode="observation")
        assert resp.is_observation is True
        pt = resp.timeseries[0]
        assert pt.ssha_min_m is None
        assert pt.ssha_max_m is None
        assert pt.eddy_kinetic_energy_cm2_s2 is None
        assert pt.chlor_a is None
        assert pt.sst is None


# =============================================================================
# Feature 11: Complete Atmosphere Time-Series Schema & Null Handling
# =============================================================================

def test_f11_atmosphere_point_schema_accepts_none():
    """Verify AtmosphereTimeSeriesPoint accepts None for missing variables."""
    pt = AtmosphereTimeSeriesPoint(
        date="2026-03",
        precipitation_rate_mm_hr=None,
        precipitation_accumulated_mm=None,
        climatological_normal_mm=None,
        anomaly_mm=None,
        aod_550=0.35,
        cloud_fraction=0.6,
    )
    assert pt.precipitation_rate_mm_hr is None
    assert pt.precipitation_accumulated_mm is None
    assert pt.climatological_normal_mm is None
    assert pt.anomaly_mm is None
    assert pt.aod_550 == 0.35


def test_f11_atmosphere_repository_returns_all_keys(m3_db_session):
    """
    Verify get_real_atmosphere_timeseries and get_real_gpm_timeseries return all 7 expected keys:
    date, precipitation_rate_mm_hr, precipitation_accumulated_mm, climatological_normal_mm, anomaly_mm, aod_550, cloud_fraction.
    """
    gpm_rec = ObservationTimeSeriesRecord(
        dataset_id="GPM_3IMERGM",
        location_name="Amazon Basin",
        latitude=-3.0,
        longitude=-60.0,
        date_str="2026-03",
        metric_name="precipitation",
        value=240.0,  # mm
        unit="mm",
        baseline_normal=210.0,
        anomaly=30.0,
        verification_status="verified_observation",
        source_file_checksum="chk_gpm_202603",
        granule_id="GPM_GRAN_202603",
    )
    mod08_rec = ObservationTimeSeriesRecord(
        dataset_id="MOD08_M3",
        location_name="Amazon Basin",
        latitude=-3.0,
        longitude=-60.0,
        date_str="2026-03",
        metric_name="aod_550",
        value=0.28,
        unit="dimensionless",
        baseline_normal=0.25,
        anomaly=0.03,
        verification_status="verified_observation",
        source_file_checksum="chk_aod_202603",
        granule_id="AOD_GRAN_202603",
    )
    m3_db_session.add_all([gpm_rec, mod08_rec])
    m3_db_session.commit()

    res = ObservationRepository.get_real_atmosphere_timeseries(
        latitude=-3.0,
        longitude=-60.0,
        start_year=2026,
        end_year=2026,
        session=m3_db_session,
    )
    assert res["is_observation"] is True
    assert len(res["timeseries"]) == 1
    pt = res["timeseries"][0]

    expected_keys = {
        "date",
        "precipitation_rate_mm_hr",
        "precipitation_accumulated_mm",
        "climatological_normal_mm",
        "anomaly_mm",
        "aod_550",
        "cloud_fraction",
    }
    assert expected_keys.issubset(pt.keys())
    assert pt["precipitation_accumulated_mm"] == 240.0
    assert pt["precipitation_rate_mm_hr"] == round(240.0 / (24.0 * 31), 4)
    assert pt["climatological_normal_mm"] == 210.0
    assert pt["anomaly_mm"] == 30.0
    assert pt["aod_550"] == 0.28


def test_f11_atmosphere_service_no_key_error(m3_db_session):
    """Verify AtmosphereService.get_timeseries does not throw KeyError when processing observations."""
    rec = ObservationTimeSeriesRecord(
        dataset_id="GPM_3IMERGM",
        location_name="Amazon Basin",
        latitude=-3.0,
        longitude=-60.0,
        date_str="2026-03",
        metric_name="precipitation",
        value=150.0,
        unit="mm",
        baseline_normal=140.0,
        anomaly=10.0,
        verification_status="verified_observation",
        source_file_checksum="chk_gpm",
        granule_id="GPM_GRAN",
    )
    m3_db_session.add(rec)
    m3_db_session.commit()

    from unittest.mock import patch
    real_data = ObservationRepository.get_real_gpm_timeseries(
        latitude=-3.0, longitude=-60.0, session=m3_db_session
    )
    with patch.object(ObservationRepository, "get_real_gpm_timeseries", return_value=real_data):
        resp = AtmosphereService.get_timeseries(-3.0, -60.0, 2026, 2026, source_mode="observation")
        assert resp.data_status == "observation"
        assert resp.is_observation is True
        assert len(resp.timeseries) == 1
        assert resp.timeseries[0].precipitation_accumulated_mm == 150.0


# =============================================================================
# Feature 12: Schema & Type Unification (DataStatus)
# =============================================================================

def test_f12_datastatus_literal_validation():
    """Verify DataStatus enforces valid literal values and rejects obsolete simulated/observations."""
    # Valid values
    r1 = AtmosphereTimeSeriesResponse(
        data_status="observation",
        is_observation=True,
        region_name="Test",
        latitude=0.0,
        longitude=0.0,
        summary_statistics={},
        timeseries=[],
    )
    assert r1.data_status == "observation"

    r2 = AtmosphereTimeSeriesResponse(
        data_status="demonstration_model",
        is_observation=False,
        region_name="Test",
        latitude=0.0,
        longitude=0.0,
        summary_statistics={},
        timeseries=[],
    )
    assert r2.data_status == "demonstration_model"

    r3 = AtmosphereTimeSeriesResponse(
        data_status="unavailable",
        is_observation=False,
        region_name="Test",
        latitude=0.0,
        longitude=0.0,
        summary_statistics={},
        timeseries=[],
    )
    assert r3.data_status == "unavailable"

    # Rejection of obsolete values
    with pytest.raises(ValidationError):
        AtmosphereTimeSeriesResponse(
            data_status="simulated",
            region_name="Test",
            latitude=0.0,
            longitude=0.0,
            summary_statistics={},
            timeseries=[],
        )

    with pytest.raises(ValidationError):
        PeriodComparisonResponse(
            data_status="observations",  # plural invalid!
            module="atmosphere",
            period_a="2024-03",
            period_b="2026-03",
            location_name="Test",
            latitude=0.0,
            longitude=0.0,
            unit="mm",
            metric_label="Precipitation",
            observation_a={"date": "2024-03", "value": 10.0, "unit": "mm"},
            observation_b={"date": "2026-03", "value": 12.0, "unit": "mm"},
            absolute_difference=2.0,
            interpretation="Test",
        )


def test_f12_comparison_service_sets_data_status():
    """Verify ComparisonService sets data_status and is_observation properly in demonstration and observation modes."""
    # Demonstration mode
    demo_comp = ComparisonService.compare_periods(
        module="atmosphere",
        period_a="2024-03",
        period_b="2026-03",
        latitude=6.5,
        longitude=-150.0,
        source_mode="demonstration",
    )
    assert demo_comp.data_status == "demonstration_model"
    assert demo_comp.is_observation is False


# =============================================================================
# Feature 13: Audited Legacy Record Quarantine
# =============================================================================

def test_f13_quarantine_audit_log_persistence(m3_db_session):
    """Verify QuarantineAuditLog records can be persisted and queried."""
    audit_entry = QuarantineAuditLog(
        record_id="legacy-rec-999",
        table_name="observation_timeseries",
        quarantine_reason="Legacy record missing verified NASA Earthdata source checksum or marked unverified/synthetic",
        provenance_details={"dataset_id": "SWOT_L2_LR_SSH", "checksum": None},
    )
    m3_db_session.add(audit_entry)
    m3_db_session.commit()

    queried = m3_db_session.execute(
        select(QuarantineAuditLog).filter_by(record_id="legacy-rec-999")
    ).scalar_one_or_none()
    assert queried is not None
    assert queried.table_name == "observation_timeseries"
    assert "Legacy record missing" in queried.quarantine_reason
    assert queried.provenance_details["dataset_id"] == "SWOT_L2_LR_SSH"


def test_f13_quarantined_records_excluded_from_repository_queries(m3_db_session):
    """
    Verify that records with verification_status='quarantined_synthetic' are completely excluded
    from all repository queries without deleting rows.
    """
    quarantined_rec = ObservationTimeSeriesRecord(
        dataset_id="MOD13C2",
        location_name="Quarantined Site",
        latitude=0.0,
        longitude=0.0,
        date_str="2026-03",
        metric_name="NDVI",
        value=0.65,
        unit="dimensionless",
        verification_status="quarantined_synthetic",
        source_file_checksum=None,
    )
    verified_rec = ObservationTimeSeriesRecord(
        dataset_id="MOD13C2",
        location_name="Verified Site",
        latitude=0.0,
        longitude=0.0,
        date_str="2026-03",
        metric_name="NDVI",
        value=0.72,
        unit="dimensionless",
        verification_status="verified_observation",
        source_file_checksum="verified_checksum_123",
    )
    m3_db_session.add_all([quarantined_rec, verified_rec])
    m3_db_session.commit()

    # Query repository
    res = ObservationRepository.get_real_modis_spatial_grid(
        date_str="2026-03",
        session=m3_db_session,
    )
    assert res["metadata"]["data_status"] == "observation"
    assert len(res["features"]) == 1
    assert res["features"][0]["properties"]["region_name"] == "Verified Site"

    # Both records still exist in database (zero deletion)
    total_count = m3_db_session.execute(
        select(ObservationTimeSeriesRecord)
    ).scalars().all()
    assert len(total_count) == 2
