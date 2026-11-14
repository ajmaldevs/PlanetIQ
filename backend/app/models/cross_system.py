from sqlalchemy import Column, String, Float, Index
from app.models.base import TimeStampedModel


class CrossSystemRecord(TimeStampedModel):
    """
    Persistent table for synchronized cross-sphere observations (ENSO, IOD).
    """
    __tablename__ = "cross_system_records"

    phenomenon_id = Column(String(64), index=True, nullable=False)
    date_str = Column(String(10), index=True, nullable=False)  # YYYY-MM
    ocean_metric_val = Column(Float, nullable=False)
    atmosphere_metric_val = Column(Float, nullable=False)
    land_metric_val = Column(Float, nullable=False)
    phase_label = Column(String(64), nullable=True)

    __table_args__ = (
        Index("idx_cross_system_lookup", "phenomenon_id", "date_str"),
    )
