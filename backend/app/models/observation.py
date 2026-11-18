from geoalchemy2 import Geometry
from geoalchemy2 import admin
from sqlalchemy import Column, DateTime, Float, JSON, String, event
from sqlalchemy.engine import Engine

from app.models.base import TimeStampedModel

# Guard against missing SpatiaLite C library in pure SQLite environments
try:
    _orig_after_create = admin.dialects.sqlite.after_create

    def _safe_sqlite_after_create(table, bind, **kw):
        try:
            _orig_after_create(table, bind, **kw)
        except Exception as e:
            err_msg = str(e)
            if "RecoverGeometryColumn" in err_msg or "CreateSpatialIndex" in err_msg:
                pass
            else:
                raise

    admin.dialects.sqlite.after_create = _safe_sqlite_after_create
except Exception:
    pass

# Ensure SQLite connections have stub implementations of SpatiaLite functions
@event.listens_for(Engine, "connect")
def _register_sqlite_spatial_stubs(dbapi_conn, record):
    if hasattr(dbapi_conn, "create_function"):
        try:
            dbapi_conn.create_function("AsEWKB", 1, lambda x: x)
            dbapi_conn.create_function("ST_AsEWKB", 1, lambda x: x)
            dbapi_conn.create_function("GeomFromEWKT", -1, lambda *args: args[0] if args else None)
            dbapi_conn.create_function("RecoverGeometryColumn", -1, lambda *args: 1)
            dbapi_conn.create_function("CreateSpatialIndex", -1, lambda *args: 1)
        except Exception:
            pass


class EarthObservation(TimeStampedModel):
    """
    Catalog model for Earth observation datasets (MODIS, SWOT, GPM).
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

    # PostGIS spatial bounding polygon (WGS84 / SRID 4326) with automatic GiST index
    spatial_bounds = Column(
        Geometry(geometry_type="POLYGON", srid=4326, spatial_index=True),
        nullable=True,
    )

    # Statistical aggregates
    mean_value = Column(Float, nullable=True)
    min_value = Column(Float, nullable=True)
    max_value = Column(Float, nullable=True)
    unit = Column(String, nullable=False)

    # Extended scientific metadata (satellite orbit pass, quality flags, source granule URL)
    extra_metadata = Column(JSON, default=dict)
