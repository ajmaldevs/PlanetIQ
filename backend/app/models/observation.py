from sqlalchemy import Column, String, Float, DateTime, JSON
from app.models.base import TimeStampedModel


class EarthObservation(TimeStampedModel):
    """
    Catalog model for Earth observation datasets (SWOT, GPM, Land).
    Stores spatial bounds, temporal timestamps, and metadata attributes.
    """
    __tablename__ = "earth_observations"

    dataset_id = Column(String, index=True, nullable=False)
    mission_name = Column(String, index=True, nullable=False)
    observation_time = Column(DateTime(timezone=True), index=True, nullable=False)
    
    # Bounding coordinates in WGS84
    min_latitude = Column(Float, nullable=False)
    max_latitude = Column(Float, nullable=False)
    min_longitude = Column(Float, nullable=False)
    max_longitude = Column(Float, nullable=False)
    
    # Statistical aggregates
    mean_value = Column(Float, nullable=True)
    min_value = Column(Float, nullable=True)
    max_value = Column(Float, nullable=True)
    unit = Column(String, nullable=False)
    
    # Extended scientific metadata (satellite orbit pass, quality flags, source granule URL)
    extra_metadata = Column(JSON, default=dict)
