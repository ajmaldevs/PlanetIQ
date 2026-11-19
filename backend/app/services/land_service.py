"""
Scientific Land Service for PlanetIQ.
Processes NASA MODIS Monthly Global Vegetation Indices (MOD13C2 v061).
Calculates NDVI, EVI, Vegetation Condition Index (VCI %), and agricultural drought conditions.

Preserves strict data source distinction:
- REAL OBSERVATION: Ingested and calibrated from authentic NASA MODIS MOD13C2 satellite granules.
- SIMULATED DEMONSTRATION DATA: Calibrated mathematical phenology models isolated in DemoDataService.
"""

from typing import Optional
from app.schemas.scientific import (
    GeoJSONFeatureCollection,
    GeoJSONFeature,
    GeoJSONGeometry,
    LandTimeSeriesResponse,
    LandTimeSeriesPoint,
)
from app.repositories.observation_repository import ObservationRepository
from app.services.demo_data_service import DemoDataService
from app.core.config import settings


class LandService:
    """
    Scientific service for NASA MODIS Monthly Global Vegetation Indices (MOD13C2 v061).
    Supports both authentic satellite observations and demonstration modes.
    """

    LAND_REGIONS = DemoDataService.LAND_BIOMES

    @classmethod
    def get_spatial_grid(
        cls,
        min_lat: Optional[float] = None,
        max_lat: Optional[float] = None,
        min_lon: Optional[float] = None,
        max_lon: Optional[float] = None,
        date_str: str = "2026-03",
        source_mode: str = "observation",
    ) -> GeoJSONFeatureCollection:
        """
        Delivers MODIS MOD13C2 vegetation grid.
        - source_mode="observation" (default): Delivers ONLY authentic NASA satellite observations or explicit unavailable state.
        - source_mode="demonstration": Delivers calibrated demonstration model only in isolated non-production environments with explicit opt-in.
        - source_mode="auto": Prefers genuine observations. In production, never falls back to demo data.
        """
        # If demonstration mode explicitly requested
        if source_mode == "demonstration":
            settings.assert_no_demonstration_in_production(source_mode)
            return DemoDataService.get_simulated_land_grid(
                date_str=date_str,
                min_lat=min_lat,
                max_lat=max_lat,
                min_lon=min_lon,
                max_lon=max_lon,
            )

        # Standard observation / auto workflow: query authentic observations
        real_data = ObservationRepository.get_real_modis_spatial_grid(
            date_str=date_str,
            min_lat=min_lat,
            max_lat=max_lat,
            min_lon=min_lon,
            max_lon=max_lon,
        )
        if real_data.get("metadata", {}).get("is_observation") and real_data.get("features"):
            features = [
                GeoJSONFeature(
                    type="Feature",
                    geometry=GeoJSONGeometry(type="Point", coordinates=f["geometry"]["coordinates"]),
                    properties=f["properties"],
                )
                for f in real_data.get("features", [])
            ]
            return GeoJSONFeatureCollection(
                type="FeatureCollection",
                features=features,
                metadata=real_data.get("metadata", {}),
            )

        # In non-production with explicit opt-in only
        if not settings.IS_PRODUCTION and settings.DEMO_FALLBACK_PERMITTED and source_mode == "auto":
            return DemoDataService.get_simulated_land_grid(
                date_str=date_str,
                min_lat=min_lat,
                max_lat=max_lat,
                min_lon=min_lon,
                max_lon=max_lon,
            )

        # Strict scientific integrity: do not fabricate observations
        return GeoJSONFeatureCollection(
            type="FeatureCollection",
            features=[],
            metadata=real_data.get("metadata", {}),
        )

    @classmethod
    def get_timeseries(
        cls,
        latitude: float,
        longitude: float,
        start_year: int = 2024,
        end_year: int = 2026,
        source_mode: str = "observation",
    ) -> LandTimeSeriesResponse:
        """
        Calculates multi-year monthly NDVI timeseries for a given coordinate.
        """
        if source_mode == "demonstration":
            settings.assert_no_demonstration_in_production(source_mode)
            return DemoDataService.get_simulated_land_timeseries(
                latitude=latitude,
                longitude=longitude,
                start_year=start_year,
                end_year=end_year,
            )

        # Standard observation / auto workflow: query real observations
        res = ObservationRepository.get_real_modis_timeseries(
            latitude=latitude,
            longitude=longitude,
            start_year=start_year,
            end_year=end_year,
        )
        if res.get("is_observation") and res.get("timeseries"):
            pts = [
                LandTimeSeriesPoint(
                    date=p["date"],
                    ndvi=p["ndvi"],
                    evi=p["evi"],
                    historical_ndvi_median=p["historical_ndvi_median"],
                    ndvi_anomaly=p["ndvi_anomaly"],
                )
                for p in res.get("timeseries", [])
            ]
            return LandTimeSeriesResponse(
                dataset_id=res["dataset_id"],
                dataset_name=res["dataset_name"],
                region_name=res["region_name"],
                latitude=res["latitude"],
                longitude=res["longitude"],
                unit=res["unit"],
                summary_statistics=res["summary_statistics"],
                data_status="observation",
                is_observation=True,
                timeseries=pts,
            )

        if not settings.IS_PRODUCTION and settings.DEMO_FALLBACK_PERMITTED and source_mode == "auto":
            return DemoDataService.get_simulated_land_timeseries(
                latitude=latitude,
                longitude=longitude,
                start_year=start_year,
                end_year=end_year,
            )

        return LandTimeSeriesResponse(
            dataset_id=res["dataset_id"],
            dataset_name=res["dataset_name"],
            region_name=res["region_name"],
            latitude=res["latitude"],
            longitude=res["longitude"],
            unit=res["unit"],
            summary_statistics=res["summary_statistics"],
            data_status="unavailable",
            is_observation=False,
            timeseries=[],
        )
