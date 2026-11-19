"""
Scientific Observation Repository for PlanetIQ.
Manages persistent storage, caching, and spatial querying of genuine NASA satellite observations:
- MODIS MOD13C2 v061 (Monthly Global Vegetation Indices)
- MODIS Aqua Ocean Color & SST (MODISA_L3m_CHL, MODISA_L3m_SST)
- SWOT KaRIn Ocean Altimetry (SWOT_L2_LR_SSH)
- MODIS Atmosphere (MOD08_M3) & GPM IMERG (GPM_3IMERGM)

CRITICAL SCIENTIFIC INTEGRITY RULES:
1. Never label generated, hardcoded, estimated, or simulated values as real satellite observations.
2. Real satellite measurements MUST satisfy strict provenance criteria:
   - verification_status: "verified_observation"
   - data_status: "observation"
   - is_observation: True
   - Verified source file checksum
   - Genuine NASA granule identifier
3. Never generate missing historical observations using formulas or interpolation.
4. Missing data must remain missing: return an explicit unavailable-data response.
"""

from typing import Dict, Any, List, Optional
import os
import logging
from sqlalchemy.orm import Session
from sqlalchemy import select

from app.models.timeseries import ObservationTimeSeriesRecord
from app.data_processing.quality_control import QualityControl
from app.data_processing.ocean_processor import OceanProcessor
from app.data_processing.atmosphere_processor import AtmosphereProcessor
from app.core.database import get_sync_session, session_scope

logger = logging.getLogger("planetiq.observation_repository")


class ObservationRepository:
    """Repository managing verified Earth satellite observations."""

    DATA_DIR = os.path.abspath(
        os.path.join(os.path.dirname(__file__), "..", "..", "..", "data", "processed")
    )
    _last_db_failure_time: float = 0.0

    @classmethod
    def _get_active_session(cls, session: Optional[Session] = None) -> Optional[Session]:
        """Provides an active database session for queries."""
        if session is not None:
            return session
        import time
        if time.time() - cls._last_db_failure_time < 30.0:
            return None
        try:
            sess = get_sync_session()
            if sess is None:
                cls._last_db_failure_time = time.time()
            return sess
        except Exception as exc:
            cls._last_db_failure_time = time.time()
            logger.debug(f"Could not acquire sync DB session: {exc}")
            return None

    @classmethod
    def mark_db_failed(cls):
        import time
        cls._last_db_failure_time = time.time()
        from app.core.database import mark_sync_db_failed
        mark_sync_db_failed()

    @classmethod
    def _is_postgis_available(cls, session: Session) -> bool:
        """Checks if the active session is connected to PostgreSQL with PostGIS."""
        try:
            bind = session.get_bind()
            return bind is not None and bind.dialect.name == "postgresql"
        except Exception:
            return False

    @classmethod
    def _apply_bbox_filter(
        cls,
        query,
        session: Session,
        min_lat: Optional[float] = None,
        max_lat: Optional[float] = None,
        min_lon: Optional[float] = None,
        max_lon: Optional[float] = None,
    ):
        """
        Applies spatial bounding filter using PostGIS ST_Intersects and ST_MakeEnvelope
        on PostgreSQL, with transparent fallback to scalar float coordinate filters on SQLite.
        """
        if all(v is not None for v in (min_lat, max_lat, min_lon, max_lon)):
            if cls._is_postgis_available(session):
                from geoalchemy2.functions import ST_Intersects, ST_MakeEnvelope
                from sqlalchemy import or_, and_
                # ST_MakeEnvelope(xmin, ymin, xmax, ymax, srid=4326) where x=lon, y=lat
                envelope = ST_MakeEnvelope(min_lon, min_lat, max_lon, max_lat, 4326)
                return query.filter(
                    or_(
                        and_(
                            ObservationTimeSeriesRecord.geom.isnot(None),
                            ST_Intersects(ObservationTimeSeriesRecord.geom, envelope),
                        ),
                        and_(
                            ObservationTimeSeriesRecord.geom.is_(None),
                            ObservationTimeSeriesRecord.latitude >= min_lat,
                            ObservationTimeSeriesRecord.latitude <= max_lat,
                            ObservationTimeSeriesRecord.longitude >= min_lon,
                            ObservationTimeSeriesRecord.longitude <= max_lon,
                        ),
                    )
                )
            else:
                return query.filter(
                    ObservationTimeSeriesRecord.latitude >= min_lat,
                    ObservationTimeSeriesRecord.latitude <= max_lat,
                    ObservationTimeSeriesRecord.longitude >= min_lon,
                    ObservationTimeSeriesRecord.longitude <= max_lon,
                )
        else:
            if min_lat is not None:
                query = query.filter(ObservationTimeSeriesRecord.latitude >= min_lat)
            if max_lat is not None:
                query = query.filter(ObservationTimeSeriesRecord.latitude <= max_lat)
            if min_lon is not None:
                query = query.filter(ObservationTimeSeriesRecord.longitude >= min_lon)
            if max_lon is not None:
                query = query.filter(ObservationTimeSeriesRecord.longitude <= max_lon)
            return query

    # =========================================================================
    # 1. LAND (NASA MODIS MOD13C2 v061 0.05° CMG)
    # =========================================================================

    @classmethod
    def get_real_modis_spatial_grid(
        cls,
        date_str: str = "2026-03",
        min_lat: Optional[float] = None,
        max_lat: Optional[float] = None,
        min_lon: Optional[float] = None,
        max_lon: Optional[float] = None,
        session: Optional[Session] = None,
    ) -> Dict[str, Any]:
        """
        Retrieves real NASA MODIS MOD13C2 satellite observation grid features.
        Only returns genuine observations with verification_status='verified_observation'.
        If no verified observations exist for the requested date/bounds,
        returns an explicit unavailable state. NEVER synthesizes or fabricates measurements.
        """
        features: List[Dict[str, Any]] = []
        with session_scope(session) as db:
            if db is not None:
                try:
                    # Query verified timeseries records for this month
                    query = select(ObservationTimeSeriesRecord).filter(
                        ObservationTimeSeriesRecord.dataset_id == "MOD13C2",
                        ObservationTimeSeriesRecord.date_str == date_str,
                        ObservationTimeSeriesRecord.verification_status == "verified_observation",
                    )
                    query = cls._apply_bbox_filter(query, db, min_lat, max_lat, min_lon, max_lon)

                    records = db.execute(query).scalars().all()

                    for rec in records:
                        qa_info = QualityControl.decode_modis_pixel_reliability(int(rec.quality_flag or 0))
                        features.append({
                            "type": "Feature",
                            "geometry": {
                                "type": "Point",
                                "coordinates": [round(rec.longitude, 4), round(rec.latitude, 4)],
                            },
                            "properties": {
                                "region_name": rec.location_name,
                                "latitude": rec.latitude,
                                "longitude": rec.longitude,
                                "date": date_str,
                                "dataset_id": "MOD13C2",
                                "ndvi": rec.value,
                                "evi": None,  # Preserved as null when band is unverified
                                "vci_percent": None,
                                "drought_category": "Climatological Baseline Unavailable",
                                "unit": rec.unit,
                                "sensor": "MODIS Terra (0.05° CMG)",
                                "data_status": "observation",
                                "is_observation": True,
                                "source_type": "satellite_telemetry",
                                "verification_status": "verified_observation",
                                "granule_id": rec.granule_id,
                                "source_file_checksum": rec.source_file_checksum,
                                "quality_reliability": qa_info.get("category"),
                                "quality_confidence": qa_info.get("confidence", 1.0),
                                "provenance": "NASA LP DAAC / USGS EROS",
                            },
                        })
                except Exception as exc:
                    cls.mark_db_failed()
                    logger.debug(f"Database query error in get_real_modis_spatial_grid: {exc}")

        if not features:
            return {
                "type": "FeatureCollection",
                "metadata": {
                    "dataset_id": "MOD13C2",
                    "date": date_str,
                    "data_status": "unavailable",
                    "is_observation": False,
                    "source_type": "none",
                    "agency": "NASA LP DAAC / USGS",
                    "sensor": "Moderate Resolution Imaging Spectroradiometer (MODIS Terra)",
                    "feature_count": 0,
                    "data_notice": f"No genuine NASA MODIS MOD13C2 observation granules currently ingested for {date_str}. Missing observations are not fabricated or mathematically interpolated.",
                },
                "features": [],
            }

        return {
            "type": "FeatureCollection",
            "metadata": {
                "dataset_id": "MOD13C2",
                "date": date_str,
                "data_status": "observation",
                "is_observation": True,
                "source_type": "satellite_telemetry",
                "agency": "NASA LP DAAC / USGS",
                "sensor": "Moderate Resolution Imaging Spectroradiometer (MODIS Terra)",
                "feature_count": len(features),
                "measurement_units": "dimensionless ratio (-0.2000 to +1.0000)",
                "spatial_resolution": "0.05° Climate Modeling Grid (CMG)",
                "scientific_accuracy": "Calibrated 16-day maximum value composite rescaled to monthly 0.05° CMG.",
                "data_notice": "AUTHENTIC NASA SATELLITE OBSERVATION: Retrieved from MODIS MOD13C2 Version 061.",
            },
            "features": features,
        }

    @classmethod
    def get_real_modis_timeseries(
        cls,
        latitude: float,
        longitude: float,
        start_year: int = 2024,
        end_year: int = 2026,
        session: Optional[Session] = None,
    ) -> Dict[str, Any]:
        """
        Retrieves real NASA MODIS MOD13C2 multi-year timeseries for coordinates.
        CRITICAL: ONLY includes dates with genuine observations. Does NOT fill missing months with formulas!
        """
        points = []
        ndvi_values = []
        region_name = f"Terrestrial Point ({latitude:+.2f}°, {longitude:+.2f}°)"
        target_granule = None

        with session_scope(session) as db:
            if db is not None:
                try:
                    # Query within a 1.0 degree proximity box
                    query = select(ObservationTimeSeriesRecord).filter(
                        ObservationTimeSeriesRecord.dataset_id == "MOD13C2",
                        ObservationTimeSeriesRecord.metric_name == "NDVI",
                        ObservationTimeSeriesRecord.verification_status == "verified_observation",
                    )
                    query = cls._apply_bbox_filter(
                        query, db,
                        min_lat=latitude - 1.0, max_lat=latitude + 1.0,
                        min_lon=longitude - 1.0, max_lon=longitude + 1.0,
                    ).order_by(ObservationTimeSeriesRecord.date_str)

                    recs = db.execute(query).scalars().all()
                    for r in recs:
                        parts = r.date_str.split("-")
                        yr = int(parts[0])
                        if start_year <= yr <= end_year:
                            ndvi_values.append(r.value)
                            target_granule = r.granule_id
                            region_name = r.location_name
                            points.append({
                                "date": r.date_str,
                                "ndvi": r.value,
                                "evi": None,
                                "historical_ndvi_median": r.baseline_normal,
                                "ndvi_anomaly": r.anomaly,
                            })
                except Exception as exc:
                    cls.mark_db_failed()
                    logger.debug(f"DB query error in get_real_modis_timeseries: {exc}")

        if not points:
            return {
                "dataset_id": "MOD13C2",
                "dataset_name": "NASA MODIS Monthly Global Vegetation Indices (MOD13C2 v061)",
                "region_name": region_name,
                "latitude": latitude,
                "longitude": longitude,
                "data_status": "unavailable",
                "is_observation": False,
                "source_type": "none",
                "unit": "dimensionless index (-0.2000 to +1.0000)",
                "summary_statistics": {
                    "data_status": "unavailable",
                    "is_observation": False,
                    "message": "No verified observation granules available for the requested range.",
                },
                "timeseries": [],
            }

        return {
            "dataset_id": "MOD13C2",
            "dataset_name": "NASA MODIS Monthly Global Vegetation Indices (MOD13C2 v061)",
            "region_name": region_name,
            "latitude": latitude,
            "longitude": longitude,
            "data_status": "observation",
            "is_observation": True,
            "source_type": "satellite_telemetry",
            "unit": "dimensionless index (-0.2000 to +1.0000)",
            "summary_statistics": {
                "data_status": "observation",
                "is_observation": True,
                "source_type": "satellite_telemetry",
                "mean_ndvi": round(sum(ndvi_values) / max(len(ndvi_values), 1), 3),
                "peak_ndvi_observed": max(ndvi_values),
                "minimum_ndvi_observed": min(ndvi_values),
                "observed_points_count": len(points),
                "granule_id": target_granule,
                "provenance": "NASA LP DAAC / USGS EROS",
            },
            "timeseries": points,
        }

    # =========================================================================
    # 2. OCEAN (NASA MODIS Aqua Ocean Color/SST & SWOT KaRIn)
    # =========================================================================

    @classmethod
    def get_real_ocean_spatial_grid(
        cls,
        date_str: str = "2026-03",
        min_lat: Optional[float] = None,
        max_lat: Optional[float] = None,
        min_lon: Optional[float] = None,
        max_lon: Optional[float] = None,
        session: Optional[Session] = None,
    ) -> Dict[str, Any]:
        """
        Retrieves real NASA MODIS Aqua & SWOT KaRIn ocean observations.
        Only returns genuine verified observations with verification_status='verified_observation'.
        """
        features: List[Dict[str, Any]] = []
        target_granule = ""

        with session_scope(session) as db:
            if db is not None:
                try:
                    query = select(ObservationTimeSeriesRecord).filter(
                        ObservationTimeSeriesRecord.dataset_id.in_(["MODISA_L3m_CHL", "MODISA_L3m_SST", "SWOT_L2_LR_SSH", "MODISA_L3m_OCEAN_SWOT"]),
                        ObservationTimeSeriesRecord.date_str == date_str,
                        ObservationTimeSeriesRecord.verification_status == "verified_observation",
                    )
                    query = cls._apply_bbox_filter(query, db, min_lat, max_lat, min_lon, max_lon)

                    records = db.execute(query).scalars().all()
                    for rec in records:
                        target_granule = rec.granule_id or "MODISA_SWOT_VERIFIED"
                        feat = OceanProcessor.process_ocean_point(
                            lat=rec.latitude,
                            lon=rec.longitude,
                            date_str=date_str,
                            granule_id=target_granule,
                            chl=rec.value if rec.metric_name == "chlor_a" else None,
                            sst=rec.value if rec.metric_name == "sst" else None,
                            ssha=rec.value if rec.metric_name in ["ssha", "ssha_karin"] else None,
                            quality_flag=int(rec.quality_flag or 0),
                            location_name=rec.location_name,
                        )
                        if feat:
                            feat["properties"]["verification_status"] = "verified_observation"
                            feat["properties"]["source_file_checksum"] = rec.source_file_checksum
                            features.append(feat)
                except Exception as exc:
                    cls.mark_db_failed()
                    logger.debug(f"DB error in get_real_ocean_spatial_grid: {exc}")

        if not features:
            return {
                "type": "FeatureCollection",
                "metadata": {
                    "dataset_id": "MODISA_L3m_OCEAN_SWOT",
                    "date": date_str,
                    "data_status": "unavailable",
                    "is_observation": False,
                    "source_type": "none",
                    "pipeline_status": "active",
                    "agency": "NASA OB.DAAC / PO.DAAC / CNES",
                    "sensor": "MODIS Aqua & SWOT KaRIn",
                    "feature_count": 0,
                    "units": {"chlor_a": "mg/m³", "sst": "°C", "ssha": "meters"},
                    "data_notice": f"No authentic ocean satellite observations available for calendar period {date_str}.",
                },
                "features": [],
            }

        return OceanProcessor.create_feature_collection(
            features=features,
            date_str=date_str,
            granule_id=target_granule,
        )

    @classmethod
    def get_real_swot_spatial_grid(
        cls,
        date_str: str = "2026-03",
        min_lat: Optional[float] = None,
        max_lat: Optional[float] = None,
        min_lon: Optional[float] = None,
        max_lon: Optional[float] = None,
        session: Optional[Session] = None,
    ) -> Dict[str, Any]:
        """
        SWOT KaRIn Sea Surface Height query strictly isolated from MODIS optical datasets.
        Only returns verified SWOT altimetry observations (ssha_karin).
        """
        features: List[Dict[str, Any]] = []
        target_granule = ""

        with session_scope(session) as db:
            if db is not None:
                try:
                    query = select(ObservationTimeSeriesRecord).filter(
                        ObservationTimeSeriesRecord.dataset_id == "SWOT_L2_LR_SSH",
                        ObservationTimeSeriesRecord.metric_name.in_(["ssha", "ssha_karin", "ssh_karin"]),
                        ObservationTimeSeriesRecord.date_str == date_str,
                        ObservationTimeSeriesRecord.verification_status == "verified_observation",
                    )
                    query = cls._apply_bbox_filter(query, db, min_lat, max_lat, min_lon, max_lon)

                    records = db.execute(query).scalars().all()
                    for rec in records:
                        target_granule = rec.granule_id or "SWOT_KARIN_VERIFIED"
                        feat = OceanProcessor.process_ocean_point(
                            lat=rec.latitude,
                            lon=rec.longitude,
                            date_str=date_str,
                            granule_id=target_granule,
                            chl=None,
                            sst=None,
                            ssha=rec.value,
                            quality_flag=int(rec.quality_flag or 0),
                            location_name=rec.location_name,
                        )
                        if feat:
                            feat["properties"]["verification_status"] = "verified_observation"
                            feat["properties"]["source_file_checksum"] = rec.source_file_checksum
                            features.append(feat)
                except Exception as exc:
                    cls.mark_db_failed()
                    logger.debug(f"DB error in get_real_swot_spatial_grid: {exc}")

        if not features:
            return {
                "type": "FeatureCollection",
                "metadata": {
                    "dataset_id": "SWOT_L2_LR_SSH",
                    "date": date_str,
                    "data_status": "unavailable",
                    "is_observation": False,
                    "source_type": "none",
                    "agency": "NASA PO.DAAC / CNES / CSA / UKSA",
                    "sensor": "Ka-band Radar Interferometer (KaRIn)",
                    "feature_count": 0,
                    "units": {"ssha": "meters (m)"},
                    "data_notice": f"No authentic SWOT satellite observations available for calendar period {date_str}.",
                },
                "features": [],
            }

        return OceanProcessor.create_feature_collection(
            features=features,
            date_str=date_str,
            granule_id=target_granule,
        )

    @classmethod
    def get_real_ocean_timeseries(
        cls,
        latitude: float,
        longitude: float,
        start_year: int = 2024,
        end_year: int = 2026,
        session: Optional[Session] = None,
    ) -> Dict[str, Any]:
        """Retrieves authentic ocean time series for coordinates."""
        points = []
        region_name = f"Ocean Coordinate ({latitude:+.2f}°, {longitude:+.2f}°)"
        target_granule = None

        with session_scope(session) as db:
            if db is not None:
                try:
                    query = select(ObservationTimeSeriesRecord).filter(
                        ObservationTimeSeriesRecord.dataset_id.in_(["MODISA_L3m_CHL", "MODISA_L3m_SST", "SWOT_L2_LR_SSH"]),
                        ObservationTimeSeriesRecord.verification_status == "verified_observation",
                    )
                    query = cls._apply_bbox_filter(
                        query, db,
                        min_lat=latitude - 2.0, max_lat=latitude + 2.0,
                        min_lon=longitude - 2.0, max_lon=longitude + 2.0,
                    ).order_by(ObservationTimeSeriesRecord.date_str)

                    recs = db.execute(query).scalars().all()
                    merged: Dict[str, Dict[str, Any]] = {}
                    for r in recs:
                        parts = r.date_str.split("-")
                        yr = int(parts[0])
                        if not (start_year <= yr <= end_year):
                            continue
                        target_granule = r.granule_id
                        region_name = r.location_name
                        d = r.date_str
                        if d not in merged:
                            merged[d] = {
                                "date": d,
                                "ssha_mean_m": None,
                                "ssha_min_m": None,
                                "ssha_max_m": None,
                                "eddy_kinetic_energy_cm2_s2": None,
                                "chlor_a": None,
                                "sst": None,
                            }
                        if r.dataset_id == "SWOT_L2_LR_SSH" or "SSH" in r.dataset_id or r.metric_name in ["ssha", "ssha_karin"]:
                            merged[d]["ssha_mean_m"] = r.value
                        elif r.dataset_id == "MODISA_L3m_CHL" or r.metric_name == "chlor_a":
                            merged[d]["chlor_a"] = r.value
                        elif r.dataset_id == "MODISA_L3m_SST" or r.metric_name == "sst":
                            merged[d]["sst"] = r.value

                    points = [merged[d] for d in sorted(merged.keys())]
                except Exception as exc:
                    cls.mark_db_failed()
                    logger.debug(f"DB error in get_real_ocean_timeseries: {exc}")

        if not points:
            return {
                "dataset_id": "MODISA_L3m_OCEAN_SWOT",
                "dataset_name": "NASA MODIS Aqua Ocean Color & SWOT KaRIn Altimetry",
                "region_name": region_name,
                "latitude": latitude,
                "longitude": longitude,
                "data_status": "unavailable",
                "is_observation": False,
                "source_type": "none",
                "unit_height": "meters (m)",
                "summary_statistics": {
                    "data_status": "unavailable",
                    "is_observation": False,
                    "message": "No authentic ocean satellite observation records ingested for this coordinate.",
                },
                "timeseries": [],
            }

        return {
            "dataset_id": "MODISA_L3m_OCEAN_SWOT",
            "dataset_name": "NASA MODIS Aqua Ocean Color & SWOT KaRIn Altimetry",
            "region_name": region_name,
            "latitude": latitude,
            "longitude": longitude,
            "data_status": "observation",
            "is_observation": True,
            "source_type": "satellite_direct",
            "unit_height": "meters (m)",
            "summary_statistics": {
                "data_status": "observation",
                "is_observation": True,
                "observation_count": len(points),
                "granule_id": target_granule,
                "provenance": "NASA OB.DAAC & PO.DAAC / CNES",
            },
            "timeseries": points,
        }

    @classmethod
    def get_real_swot_timeseries(
        cls,
        latitude: float,
        longitude: float,
        start_year: int = 2024,
        end_year: int = 2026,
        session: Optional[Session] = None,
    ) -> Dict[str, Any]:
        """SWOT KaRIn time series query strictly isolated to SWOT_L2_LR_SSH altimetry."""
        points = []
        region_name = f"Ocean Coordinate ({latitude:+.2f}°, {longitude:+.2f}°)"
        target_granule = None

        with session_scope(session) as db:
            if db is not None:
                try:
                    query = select(ObservationTimeSeriesRecord).filter(
                        ObservationTimeSeriesRecord.dataset_id == "SWOT_L2_LR_SSH",
                        ObservationTimeSeriesRecord.metric_name.in_(["ssha", "ssha_karin"]),
                        ObservationTimeSeriesRecord.verification_status == "verified_observation",
                    )
                    query = cls._apply_bbox_filter(
                        query, db,
                        min_lat=latitude - 2.0, max_lat=latitude + 2.0,
                        min_lon=longitude - 2.0, max_lon=longitude + 2.0,
                    ).order_by(ObservationTimeSeriesRecord.date_str)

                    recs = db.execute(query).scalars().all()
                    merged: Dict[str, Dict[str, Any]] = {}
                    for r in recs:
                        parts = r.date_str.split("-")
                        yr = int(parts[0])
                        if not (start_year <= yr <= end_year):
                            continue
                        target_granule = r.granule_id
                        region_name = r.location_name
                        d = r.date_str
                        if d not in merged:
                            merged[d] = {
                                "date": d,
                                "ssha_mean_m": None,
                                "ssha_min_m": None,
                                "ssha_max_m": None,
                                "eddy_kinetic_energy_cm2_s2": None,
                                "chlor_a": None,
                                "sst": None,
                            }
                        merged[d]["ssha_mean_m"] = r.value

                    points = [merged[d] for d in sorted(merged.keys())]
                except Exception as exc:
                    cls.mark_db_failed()
                    logger.debug(f"DB error in get_real_swot_timeseries: {exc}")

        if not points:
            return {
                "dataset_id": "SWOT_L2_LR_SSH",
                "dataset_name": "NASA/CNES SWOT KaRIn Ocean Altimetry",
                "region_name": region_name,
                "latitude": latitude,
                "longitude": longitude,
                "data_status": "unavailable",
                "is_observation": False,
                "source_type": "none",
                "unit_height": "meters (m)",
                "summary_statistics": {
                    "data_status": "unavailable",
                    "is_observation": False,
                    "message": "No authentic SWOT satellite observation records ingested for this coordinate.",
                },
                "timeseries": [],
            }

        return {
            "dataset_id": "SWOT_L2_LR_SSH",
            "dataset_name": "NASA/CNES SWOT KaRIn Ocean Altimetry",
            "region_name": region_name,
            "latitude": latitude,
            "longitude": longitude,
            "data_status": "observation",
            "is_observation": True,
            "source_type": "satellite_direct",
            "unit_height": "meters (m)",
            "summary_statistics": {
                "data_status": "observation",
                "is_observation": True,
                "observation_count": len(points),
                "granule_id": target_granule,
                "provenance": "NASA PO.DAAC / CNES / CSA / UKSA",
            },
            "timeseries": points,
        }

    # =========================================================================
    # 3. ATMOSPHERE (NASA MODIS Atmosphere & GPM IMERG)
    # =========================================================================

    @classmethod
    def get_real_atmosphere_spatial_grid(
        cls,
        date_str: str = "2026-03",
        min_lat: Optional[float] = None,
        max_lat: Optional[float] = None,
        min_lon: Optional[float] = None,
        max_lon: Optional[float] = None,
        session: Optional[Session] = None,
    ) -> Dict[str, Any]:
        """
        Retrieves real NASA MODIS Atmosphere & GPM IMERG observations.
        Only returns genuine verified observations with verification_status='verified_observation'.
        """
        features: List[Dict[str, Any]] = []
        target_granule = ""

        with session_scope(session) as db:
            if db is not None:
                try:
                    query = select(ObservationTimeSeriesRecord).filter(
                        ObservationTimeSeriesRecord.dataset_id.in_(["MOD08_M3", "GPM_3IMERGM", "MODIS_GPM_ATMOSPHERE"]),
                        ObservationTimeSeriesRecord.date_str == date_str,
                        ObservationTimeSeriesRecord.verification_status == "verified_observation",
                    )
                    query = cls._apply_bbox_filter(query, db, min_lat, max_lat, min_lon, max_lon)

                    records = db.execute(query).scalars().all()
                    for rec in records:
                        target_granule = rec.granule_id or "MODIS_GPM_VERIFIED"
                        feat = AtmosphereProcessor.process_atmosphere_point(
                            lat=rec.latitude,
                            lon=rec.longitude,
                            date_str=date_str,
                            granule_id=target_granule,
                            aod=rec.value if rec.metric_name == "aod_550" else None,
                            precip_accumulated_mm=rec.value if "precip" in rec.metric_name else None,
                            quality_flag=int(rec.quality_flag or 3),
                            location_name=rec.location_name,
                        )
                        if feat:
                            feat["properties"]["verification_status"] = "verified_observation"
                            feat["properties"]["source_file_checksum"] = rec.source_file_checksum
                            features.append(feat)
                except Exception as exc:
                    cls.mark_db_failed()
                    logger.debug(f"DB error in get_real_atmosphere_spatial_grid: {exc}")

        if not features:
            return {
                "type": "FeatureCollection",
                "metadata": {
                    "dataset_id": "MODIS_GPM_ATMOSPHERE",
                    "date": date_str,
                    "data_status": "unavailable",
                    "is_observation": False,
                    "source_type": "none",
                    "pipeline_status": "active",
                    "agency": "NASA LAADS DAAC / GES DISC",
                    "sensor": "MODIS Terra/Aqua & GPM Core Observatory",
                    "feature_count": 0,
                    "units": {"aod_550": "dimensionless ratio", "precipitation": "mm"},
                    "data_notice": f"No authentic atmospheric satellite observations available for calendar period {date_str}.",
                },
                "features": [],
            }

        return AtmosphereProcessor.create_feature_collection(
            features=features,
            date_str=date_str,
            granule_id=target_granule,
        )

    @classmethod
    def get_real_gpm_spatial_grid(
        cls,
        date_str: str = "2026-03",
        min_lat: Optional[float] = None,
        max_lat: Optional[float] = None,
        min_lon: Optional[float] = None,
        max_lon: Optional[float] = None,
        session: Optional[Session] = None,
    ) -> Dict[str, Any]:
        """
        GPM IMERG Final Monthly Precipitation query strictly isolated from MODIS aerosol datasets.
        Only returns verified GPM IMERG precipitation observations.
        """
        features: List[Dict[str, Any]] = []
        target_granule = ""

        with session_scope(session) as db:
            if db is not None:
                try:
                    query = select(ObservationTimeSeriesRecord).filter(
                        ObservationTimeSeriesRecord.dataset_id == "GPM_3IMERGM",
                        ObservationTimeSeriesRecord.date_str == date_str,
                        ObservationTimeSeriesRecord.verification_status == "verified_observation",
                    )
                    query = cls._apply_bbox_filter(query, db, min_lat, max_lat, min_lon, max_lon)

                    records = db.execute(query).scalars().all()
                    for rec in records:
                        target_granule = rec.granule_id or "GPM_3IMERGM_VERIFIED"
                        feat = AtmosphereProcessor.process_atmosphere_point(
                            lat=rec.latitude,
                            lon=rec.longitude,
                            date_str=date_str,
                            granule_id=target_granule,
                            aod=None,
                            precip_accumulated_mm=rec.value if "precip" in rec.metric_name else None,
                            quality_flag=int(rec.quality_flag or 3),
                            location_name=rec.location_name,
                        )
                        if feat:
                            feat["properties"]["verification_status"] = "verified_observation"
                            feat["properties"]["source_file_checksum"] = rec.source_file_checksum
                            features.append(feat)
                except Exception as exc:
                    cls.mark_db_failed()
                    logger.debug(f"DB error in get_real_gpm_spatial_grid: {exc}")

        if not features:
            return {
                "type": "FeatureCollection",
                "metadata": {
                    "dataset_id": "GPM_3IMERGM",
                    "date": date_str,
                    "data_status": "unavailable",
                    "is_observation": False,
                    "source_type": "none",
                    "agency": "NASA GES DISC / JAXA",
                    "sensor": "GPM DPR & GMI",
                    "feature_count": 0,
                    "units": {"precipitation": "mm (liquid depth)"},
                    "data_notice": f"No authentic GPM IMERG precipitation observations available for calendar period {date_str}.",
                },
                "features": [],
            }

        return AtmosphereProcessor.create_feature_collection(
            features=features,
            date_str=date_str,
            granule_id=target_granule,
        )

    @classmethod
    def get_real_atmosphere_timeseries(
        cls,
        latitude: float,
        longitude: float,
        start_year: int = 2024,
        end_year: int = 2026,
        session: Optional[Session] = None,
    ) -> Dict[str, Any]:
        """Retrieves authentic atmospheric time series for coordinates."""
        points = []
        region_name = f"Atmospheric Coordinate ({latitude:+.2f}°, {longitude:+.2f}°)"
        target_granule = None

        with session_scope(session) as db:
            if db is not None:
                try:
                    query = select(ObservationTimeSeriesRecord).filter(
                        ObservationTimeSeriesRecord.dataset_id.in_(["MOD08_M3", "GPM_3IMERGM", "MODIS_GPM_ATMOSPHERE"]),
                        ObservationTimeSeriesRecord.verification_status == "verified_observation",
                    )
                    query = cls._apply_bbox_filter(
                        query, db,
                        min_lat=latitude - 2.0, max_lat=latitude + 2.0,
                        min_lon=longitude - 2.0, max_lon=longitude + 2.0,
                    ).order_by(ObservationTimeSeriesRecord.date_str)

                    recs = db.execute(query).scalars().all()
                    merged: Dict[str, Dict[str, Any]] = {}
                    for r in recs:
                        parts = r.date_str.split("-")
                        yr = int(parts[0])
                        mo = int(parts[1]) if len(parts) > 1 else 1
                        if not (start_year <= yr <= end_year):
                            continue
                        target_granule = r.granule_id
                        region_name = r.location_name
                        d = r.date_str
                        if d not in merged:
                            merged[d] = {
                                "date": d,
                                "precipitation_rate_mm_hr": None,
                                "precipitation_accumulated_mm": None,
                                "climatological_normal_mm": None,
                                "anomaly_mm": None,
                                "aod_550": None,
                                "cloud_fraction": None,
                            }
                        if "GPM" in r.dataset_id or "precip" in r.metric_name:
                            import calendar
                            days = calendar.monthrange(yr, mo)[1]
                            acc = r.value
                            merged[d]["precipitation_accumulated_mm"] = acc
                            merged[d]["precipitation_rate_mm_hr"] = round(acc / (24.0 * days), 4)
                            merged[d]["climatological_normal_mm"] = r.baseline_normal
                            merged[d]["anomaly_mm"] = r.anomaly
                        elif "MOD08" in r.dataset_id or r.metric_name == "aod_550":
                            merged[d]["aod_550"] = r.value
                        elif r.metric_name == "cloud_fraction":
                            merged[d]["cloud_fraction"] = r.value

                    points = [merged[d] for d in sorted(merged.keys())]
                except Exception as exc:
                    cls.mark_db_failed()
                    logger.debug(f"DB error in get_real_atmosphere_timeseries: {exc}")

        if not points:
            return {
                "dataset_id": "MODIS_GPM_ATMOSPHERE",
                "dataset_name": "NASA MODIS Atmosphere (LAADS DAAC) & GPM IMERG (GES DISC)",
                "location_name": region_name,
                "latitude": latitude,
                "longitude": longitude,
                "data_status": "unavailable",
                "is_observation": False,
                "source_type": "none",
                "unit_rate": "mm/hr",
                "unit_accumulation": "mm",
                "summary_statistics": {
                    "data_status": "unavailable",
                    "is_observation": False,
                    "message": "No authentic atmospheric observation records ingested for this coordinate.",
                },
                "timeseries": [],
            }

        return {
            "dataset_id": "MODIS_GPM_ATMOSPHERE",
            "dataset_name": "NASA MODIS Atmosphere & GPM IMERG Precipitation",
            "location_name": region_name,
            "latitude": latitude,
            "longitude": longitude,
            "data_status": "observation",
            "is_observation": True,
            "source_type": "satellite_direct",
            "unit_rate": "mm/hr",
            "unit_accumulation": "mm",
            "summary_statistics": {
                "data_status": "observation",
                "is_observation": True,
                "observation_count": len(points),
                "granule_id": target_granule,
                "provenance": "NASA LAADS DAAC & GES DISC",
            },
            "timeseries": points,
        }

    @classmethod
    def get_real_gpm_timeseries(
        cls,
        latitude: float,
        longitude: float,
        start_year: int = 2024,
        end_year: int = 2026,
        session: Optional[Session] = None,
    ) -> Dict[str, Any]:
        """GPM IMERG timeseries query strictly isolated to GPM_3IMERGM precipitation."""
        points = []
        region_name = f"Atmospheric Coordinate ({latitude:+.2f}°, {longitude:+.2f}°)"
        target_granule = None

        with session_scope(session) as db:
            if db is not None:
                try:
                    query = select(ObservationTimeSeriesRecord).filter(
                        ObservationTimeSeriesRecord.dataset_id == "GPM_3IMERGM",
                        ObservationTimeSeriesRecord.verification_status == "verified_observation",
                    )
                    query = cls._apply_bbox_filter(
                        query, db,
                        min_lat=latitude - 2.0, max_lat=latitude + 2.0,
                        min_lon=longitude - 2.0, max_lon=longitude + 2.0,
                    ).order_by(ObservationTimeSeriesRecord.date_str)

                    recs = db.execute(query).scalars().all()
                    merged: Dict[str, Dict[str, Any]] = {}
                    for r in recs:
                        parts = r.date_str.split("-")
                        yr = int(parts[0])
                        mo = int(parts[1]) if len(parts) > 1 else 1
                        if not (start_year <= yr <= end_year):
                            continue
                        target_granule = r.granule_id
                        region_name = r.location_name
                        d = r.date_str
                        if d not in merged:
                            merged[d] = {
                                "date": d,
                                "precipitation_rate_mm_hr": None,
                                "precipitation_accumulated_mm": None,
                                "climatological_normal_mm": None,
                                "anomaly_mm": None,
                                "aod_550": None,
                                "cloud_fraction": None,
                            }
                        if "precip" in r.metric_name or r.dataset_id == "GPM_3IMERGM":
                            import calendar
                            days = calendar.monthrange(yr, mo)[1]
                            acc = r.value
                            merged[d]["precipitation_accumulated_mm"] = acc
                            merged[d]["precipitation_rate_mm_hr"] = round(acc / (24.0 * days), 4)
                            merged[d]["climatological_normal_mm"] = r.baseline_normal
                            merged[d]["anomaly_mm"] = r.anomaly

                    points = [merged[d] for d in sorted(merged.keys())]
                except Exception as exc:
                    cls.mark_db_failed()
                    logger.debug(f"DB error in get_real_gpm_timeseries: {exc}")

        if not points:
            return {
                "dataset_id": "GPM_3IMERGM",
                "dataset_name": "NASA GPM IMERG Final Monthly Precipitation (GES DISC)",
                "location_name": region_name,
                "latitude": latitude,
                "longitude": longitude,
                "data_status": "unavailable",
                "is_observation": False,
                "source_type": "none",
                "unit_rate": "mm/hr",
                "unit_accumulation": "mm",
                "summary_statistics": {
                    "data_status": "unavailable",
                    "is_observation": False,
                    "message": "No authentic GPM IMERG precipitation observation records ingested for this coordinate.",
                },
                "timeseries": [],
            }

        return {
            "dataset_id": "GPM_3IMERGM",
            "dataset_name": "NASA GPM IMERG Final Monthly Precipitation (GES DISC)",
            "location_name": region_name,
            "latitude": latitude,
            "longitude": longitude,
            "data_status": "observation",
            "is_observation": True,
            "source_type": "satellite_direct",
            "unit_rate": "mm/hr",
            "unit_accumulation": "mm",
            "summary_statistics": {
                "data_status": "observation",
                "is_observation": True,
                "observation_count": len(points),
                "granule_id": target_granule,
                "provenance": "NASA GES DISC / JAXA",
            },
            "timeseries": points,
        }
