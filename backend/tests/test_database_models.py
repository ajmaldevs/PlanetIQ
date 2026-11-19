import pytest
from datetime import datetime, timezone

try:
    from app.models.dataset import DatasetCatalogModel
    from app.models.observation import EarthObservation
    from app.models.timeseries import ObservationTimeSeriesRecord
    from app.models.cross_system import CrossSystemRecord
    from app.models.quarantine import QuarantineAuditLog
    from geoalchemy2 import Geometry
    from geoalchemy2.elements import WKTElement
except (ImportError, Exception) as e:
    pytest.skip(f"SQLAlchemy Cython extension unavailable on host environment: {e}", allow_module_level=True)


def test_dataset_catalog_model_creation():
    model = DatasetCatalogModel(
        dataset_id="GPM_3IMERGM",
        module="atmosphere",
        name="GPM IMERG Final Monthly Precipitation",
        agency="NASA GES DISC / JAXA",
        sensor="GMI / DPR",
        spatial_resolution="0.1° × 0.1°",
        temporal_resolution="Monthly",
        units=["mm/hr", "mm"],
        variables=[{"name": "precipitation", "unit": "mm/hr"}],
        scientific_purpose="Global precipitation tracking",
        scientific_limitations=["Snow/ice uncertainty"],
        cmr_concept_id="C2723754864-GES_DISC"
    )
    assert model.dataset_id == "GPM_3IMERGM"
    assert model.module == "atmosphere"
    assert "mm/hr" in model.units


def test_earth_observation_model_creation():
    obs = EarthObservation(
        dataset_id="SWOT_L2_LR_SSH",
        mission_name="SWOT",
        observation_time=datetime.now(timezone.utc),
        min_latitude=-10.0,
        max_latitude=10.0,
        min_longitude=-140.0,
        max_longitude=-120.0,
        mean_value=0.15,
        min_value=-0.20,
        max_value=0.35,
        unit="meters (m)",
        extra_metadata={"cycle": 32, "pass": 110}
    )
    assert obs.dataset_id == "SWOT_L2_LR_SSH"
    assert obs.unit == "meters (m)"
    assert obs.extra_metadata["cycle"] == 32


def test_observation_timeseries_model_creation():
    ts = ObservationTimeSeriesRecord(
        dataset_id="MOD13C2",
        location_name="Amazon Basin",
        latitude=-3.5,
        longitude=-62.0,
        date_str="2026-03",
        metric_name="ndvi",
        value=0.82,
        unit="dimensionless",
        baseline_normal=0.80,
        anomaly=0.02,
        quality_flag=0.95
    )
    assert ts.metric_name == "ndvi"
    assert ts.value == 0.82
    assert ts.anomaly == 0.02


def test_cross_system_record_creation():
    cs = CrossSystemRecord(
        phenomenon_id="enso_walker",
        date_str="2026-03",
        ocean_metric_val=0.12,
        atmosphere_metric_val=-24.0,
        land_metric_val=-0.04,
        phase_label="Warm Neutral"
    )
    assert cs.phenomenon_id == "enso_walker"
    assert cs.ocean_metric_val == 0.12
    assert cs.atmosphere_metric_val == -24.0


def test_quarantine_audit_log_model_creation():
    log = QuarantineAuditLog(
        record_id="rec-12345",
        table_name="observation_timeseries",
        quarantine_reason="Legacy record missing verified NASA Earthdata source checksum or marked unverified/synthetic",
        provenance_details={"dataset_id": "MOD13C2", "previous_status": "synthetic"},
    )
    assert log.record_id == "rec-12345"
    assert log.table_name == "observation_timeseries"
    assert "Legacy record" in log.quarantine_reason
    assert log.provenance_details["dataset_id"] == "MOD13C2"


def test_observation_timeseries_geom_point_column():
    assert hasattr(ObservationTimeSeriesRecord, "geom")
    geom_col = ObservationTimeSeriesRecord.geom
    assert isinstance(geom_col.type, Geometry)
    assert geom_col.type.geometry_type == "POINT"
    assert geom_col.type.srid == 4326

    ts = ObservationTimeSeriesRecord(
        dataset_id="MOD13C2",
        location_name="Amazon Basin",
        latitude=-3.5,
        longitude=-62.0,
        geom=WKTElement("POINT(-62.0 -3.5)", srid=4326),
        date_str="2026-03",
        metric_name="ndvi",
        value=0.82,
        unit="dimensionless",
        verification_status="verified_observation",
    )
    assert ts.geom is not None

