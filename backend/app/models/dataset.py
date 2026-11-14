from sqlalchemy import Column, JSON, String, Text

from app.models.base import TimeStampedModel


class DatasetCatalogModel(TimeStampedModel):
    """
    Persistent model representing registered scientific datasets,
    mission sensors, resolutions, and official documentation links.
    """
    __tablename__ = "dataset_catalogs"

    dataset_id = Column(String(64), unique=True, index=True, nullable=False)
    module = Column(String(32), index=True, nullable=False)  # ocean, atmosphere, land
    name = Column(String(255), nullable=False)
    agency = Column(String(128), nullable=False)
    sensor = Column(String(255), nullable=False)
    spatial_resolution = Column(String(128), nullable=False)
    temporal_resolution = Column(String(64), nullable=False)
    units = Column(JSON, default=list)
    variables = Column(JSON, default=list)
    scientific_purpose = Column(Text, nullable=False)
    scientific_limitations = Column(JSON, default=list)
    cmr_concept_id = Column(String(64), nullable=True)
    documentation_url = Column(String(512), nullable=True)
