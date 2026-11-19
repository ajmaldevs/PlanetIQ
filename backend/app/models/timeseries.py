from geoalchemy2 import Geometry
from sqlalchemy import Column, String, Float, Index
from app.models.base import TimeStampedModel
import app.models.observation  # noqa: F401 - ensures SQLite spatial stubs and after_create hooks are active


class ObservationTimeSeriesRecord(TimeStampedModel):
    """
    Time-series table storing chronological satellite observations and anomalies.
    """
    __tablename__ = "observation_timeseries"

    dataset_id = Column(String(64), index=True, nullable=False)
    location_name = Column(String(128), index=True, nullable=False)
    latitude = Column(Float, nullable=False)
    longitude = Column(Float, nullable=False)

    # PostGIS Point geometry (WGS84 / SRID 4326) with automatic GiST spatial index
    geom = Column(
        Geometry(geometry_type="POINT", srid=4326, spatial_index=True),
        nullable=True,
    )

    date_str = Column(String(10), index=True, nullable=False)  # YYYY-MM
    metric_name = Column(String(64), index=True, nullable=False)
    value = Column(Float, nullable=False)
    unit = Column(String(64), nullable=False)
    baseline_normal = Column(Float, nullable=True)
    anomaly = Column(Float, nullable=True)
    quality_flag = Column(Float, default=1.0)

    # Scientific verification & provenance tracking
    verification_status = Column(String(32), default="unverified", nullable=False, index=True)
    source_file_checksum = Column(String(64), nullable=True)
    granule_id = Column(String(128), nullable=True, index=True)

    __table_args__ = (
        Index("idx_ts_lookup", "dataset_id", "date_str", "latitude", "longitude"),
    )
