"""
Scientific Atmosphere Service for PlanetIQ.
Processes NASA GPM IMERG Final Monthly Precipitation (GPM_3IMERGM v07).
Enforces scientific distinction between precipitation rate (mm/hr) and accumulated precipitation (mm).

Preserves strict data source distinction:
- REAL OBSERVATION: Ingested and calibrated from authentic NASA GPM granules (planned pipeline).
- SIMULATED DEMONSTRATION DATA: Calibrated mathematical precipitation models isolated in DemoDataService.
"""

from typing import Optional
import calendar
from app.schemas.scientific import (
    GeoJSONFeatureCollection,
    GeoJSONFeature,
    GeoJSONGeometry,
    AtmosphereTimeSeriesResponse,
    AtmosphereTimeSeriesPoint,
)
from app.repositories.observation_repository import ObservationRepository
from app.services.demo_data_service import DemoDataService
from app.core.config import settings


class AtmosphereService:
    """
    Scientific service for NASA GPM IMERG Final Monthly Precipitation (GPM_3IMERGM).
    Handles spatial bounding queries, climatological baseline comparisons,
    and distinct handling of rate (mm/hr) versus accumulated depth (mm).
    """

    ATMOSPHERE_REGIONS = DemoDataService.ATMOSPHERE_REGIONS

    @staticmethod
    def _compute_days_in_month(year: int, month: int) -> int:
        return calendar.monthrange(year, month)[1]

    @classmethod
    def calculate_accumulation(cls, rate_mm_hr: float, year: int, month: int) -> float:
        """
        Enforce scientific precision:
        Monthly accumulated precipitation (mm) = precipitation_rate (mm/hr) * 24 (hrs/day) * days_in_month.
        """
        hours_in_month = cls._compute_days_in_month(year, month) * 24.0
        return round(rate_mm_hr * hours_in_month, 2)

    @classmethod
    def get_spatial_grid(
        cls,
        min_lat: Optional[float] = None,
        max_lat: Optional[float] = None,
        min_lon: Optional[float] = None,
        max_lon: Optional[float] = None,
        date_str: str = "2026-03",
        source_mode: str = "auto",
    ) -> GeoJSONFeatureCollection:
        """
        Delivers GPM IMERG Final monthly precipitation features.
        - source_mode="observation": Delivers genuine satellite observations or explicit unavailable status.
        - source_mode="demonstration": Delivers calibrated demonstration model from DemoDataService.
        - source_mode="auto": Delivers authentic observations if available; otherwise demonstration model.
        """
        if source_mode == "observation":
            real_data = ObservationRepository.get_real_gpm_spatial_grid(
                date_str=date_str,
                min_lat=min_lat,
                max_lat=max_lat,
                min_lon=min_lon,
                max_lon=max_lon,
            )
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

        if source_mode == "demonstration":
            return DemoDataService.get_simulated_atmosphere_grid(
                date_str=date_str,
                min_lat=min_lat,
                max_lat=max_lat,
                min_lon=min_lon,
                max_lon=max_lon,
            )

        # Auto mode: check if real observations are loaded
        real_data = ObservationRepository.get_real_gpm_spatial_grid(
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

        if settings.ALLOW_DEMO_FALLBACK:
            return DemoDataService.get_simulated_atmosphere_grid(
                date_str=date_str,
                min_lat=min_lat,
                max_lat=max_lat,
                min_lon=min_lon,
                max_lon=max_lon,
            )

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
        source_mode: str = "auto",
    ) -> AtmosphereTimeSeriesResponse:
        """
        Calculates multi-year monthly timeseries for a specific geographic coordinate.
        """
        if source_mode == "observation":
            real_data = ObservationRepository.get_real_gpm_timeseries(
                latitude=latitude,
                longitude=longitude,
                start_year=start_year,
                end_year=end_year,
            )
            points = [
                AtmosphereTimeSeriesPoint(
                    date=p["date"],
                    precipitation_rate_mm_hr=p["precipitation_rate_mm_hr"],
                    precipitation_accumulated_mm=p["precipitation_accumulated_mm"],
                    climatological_normal_mm=p["climatological_normal_mm"],
                    anomaly_mm=p["anomaly_mm"],
                    aod_550=p.get("aod_550"),
                    cloud_fraction=p.get("cloud_fraction"),
                )
                for p in real_data.get("timeseries", [])
            ]
            return AtmosphereTimeSeriesResponse(
                data_status=real_data.get("data_status", "unavailable"),
                is_observation=real_data.get("is_observation", False),
                dataset_id=real_data.get("dataset_id", "GPM_3IMERGM"),
                dataset_name=real_data.get("dataset_name", "NASA GPM IMERG Final Monthly Precipitation"),
                location_name=real_data.get("location_name", "GPM Observation Site"),
                latitude=latitude,
                longitude=longitude,
                unit_rate="mm/hr",
                unit_accumulation="mm",
                summary_statistics=real_data.get("summary_statistics", {}),
                timeseries=points,
            )

        if source_mode == "demonstration":
            return DemoDataService.get_simulated_atmosphere_timeseries(
                latitude=latitude,
                longitude=longitude,
                start_year=start_year,
                end_year=end_year,
            )

        # Auto mode: try real observations first
        real_data = ObservationRepository.get_real_gpm_timeseries(
            latitude=latitude,
            longitude=longitude,
            start_year=start_year,
            end_year=end_year,
        )
        if real_data.get("is_observation") and real_data.get("timeseries"):
            points = [
                AtmosphereTimeSeriesPoint(
                    date=p["date"],
                    precipitation_rate_mm_hr=p["precipitation_rate_mm_hr"],
                    precipitation_accumulated_mm=p["precipitation_accumulated_mm"],
                    climatological_normal_mm=p["climatological_normal_mm"],
                    anomaly_mm=p["anomaly_mm"],
                    aod_550=p.get("aod_550"),
                    cloud_fraction=p.get("cloud_fraction"),
                )
                for p in real_data.get("timeseries", [])
            ]
            return AtmosphereTimeSeriesResponse(
                data_status="observation",
                is_observation=True,
                dataset_id=real_data.get("dataset_id", "GPM_3IMERGM"),
                dataset_name=real_data.get("dataset_name", "NASA GPM IMERG Final Monthly Precipitation"),
                location_name=real_data.get("location_name", "GPM Observation Site"),
                latitude=latitude,
                longitude=longitude,
                unit_rate="mm/hr",
                unit_accumulation="mm",
                summary_statistics=real_data.get("summary_statistics", {}),
                timeseries=points,
            )

        if settings.ALLOW_DEMO_FALLBACK:
            return DemoDataService.get_simulated_atmosphere_timeseries(
                latitude=latitude,
                longitude=longitude,
                start_year=start_year,
                end_year=end_year,
            )

        return AtmosphereTimeSeriesResponse(
            data_status="unavailable",
            is_observation=False,
            dataset_id=real_data.get("dataset_id", "GPM_3IMERGM"),
            dataset_name=real_data.get("dataset_name", "NASA GPM IMERG Final Monthly Precipitation"),
            location_name=real_data.get("location_name", "GPM Observation Site"),
            latitude=latitude,
            longitude=longitude,
            unit_rate="mm/hr",
            unit_accumulation="mm",
            summary_statistics=real_data.get("summary_statistics", {}),
            timeseries=[],
        )
