from sqlalchemy import Column, String, Float, DateTime, Index
from app.models.base import TimeStampedModel


class ObservationTimeSeriesRecord(TimeStampedModel):
    """
    Time-series table storing chronological satellite observations and anomalies.
    """
    __tablename__ = "observation_timeseries"

    dataset_id = Column(String(64), index=True, nullable=False)
    location_name = Column(String(128), index=True, nullable=False)
    latitude = Column(Float, nullable=False)
    longitude = Column(Float, nullable=False)
    date_str = Column(String(10), index=True, nullable=False)  # YYYY-MM
    metric_name = Column(String(64), index=True, nullable=False)
    value = Column(Float, nullable=False)
    unit = Column(String(32), nullable=False)
    baseline_normal = Column(Float, nullable=True)
    anomaly = Column(Float, nullable=True)
    quality_flag = Column(Float, default=1.0)

    __table_args__ = (
        Index("idx_ts_lookup", "dataset_id", "date_str", "latitude", "longitude"),
    )
