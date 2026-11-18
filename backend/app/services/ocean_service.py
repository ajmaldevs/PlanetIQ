"""
Scientific Ocean Service for PlanetIQ.
Processes SWOT Ocean Sea Surface Height (Option A).
Implements Ka-band Radar Interferometer (KaRIn) low-rate ocean topography,
meso-scale eddy structures (cyclonic/anticyclonic), SSHA, and dynamic topography.

Preserves strict data source distinction:
- REAL OBSERVATION: Ingested and calibrated from authentic NASA/CNES SWOT granules (planned pipeline).
- SIMULATED DEMONSTRATION DATA: Calibrated mathematical eddy vortex models isolated in DemoDataService.
"""

from typing import List, Dict, Any, Optional
from app.schemas.scientific import (
    GeoJSONFeatureCollection,
    GeoJSONFeature,
    GeoJSONGeometry,
    OceanTimeSeriesResponse,
    OceanTimeSeriesPoint,
)
from app.repositories.observation_repository import ObservationRepository
from app.services.demo_data_service import DemoDataService


class OceanService:
    """
    Scientific service for SWOT Ocean Sea Surface Height (Option A).
    Implements Ka-band Radar Interferometer (KaRIn) low-rate ocean topography.
    """

    OCEAN_REGIONS = DemoDataService.OCEAN_REGIONS

    @classmethod
    def get_spatial_observations(
        cls,
        min_lat: Optional[float] = None,
        max_lat: Optional[float] = None,
        min_lon: Optional[float] = None,
        max_lon: Optional[float] = None,
        date_str: str = "2026-03",
        source_mode: str = "auto",
    ) -> GeoJSONFeatureCollection:
        """
        Delivers SWOT KaRIn Sea Surface Height observations and swath track features.
        - source_mode="observation": Delivers genuine satellite observations or explicit unavailable status.
        - source_mode="demonstration": Delivers calibrated demonstration model from DemoDataService.
        - source_mode="auto": Delivers authentic observations if available; otherwise demonstration model.
        """
        if source_mode == "observation":
            real_data = ObservationRepository.get_real_swot_spatial_grid(
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
            return DemoDataService.get_simulated_ocean_grid(
                date_str=date_str,
                min_lat=min_lat,
                max_lat=max_lat,
                min_lon=min_lon,
                max_lon=max_lon,
            )

        # Auto mode: check if real observations are loaded
        real_data = ObservationRepository.get_real_swot_spatial_grid(
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

        # Fallback to isolated demo model
        return DemoDataService.get_simulated_ocean_grid(
            date_str=date_str,
            min_lat=min_lat,
            max_lat=max_lat,
            min_lon=min_lon,
            max_lon=max_lon,
        )

    @classmethod
    def get_timeseries(
        cls,
        latitude: float,
        longitude: float,
        start_year: int = 2024,
        end_year: int = 2026,
        source_mode: str = "auto",
    ) -> OceanTimeSeriesResponse:
        """
        Calculates multi-year ocean sea surface height anomaly (SSHA) timeseries and eddy kinetic energy.
        """
        if source_mode == "observation":
            real_data = ObservationRepository.get_real_swot_timeseries(
                latitude=latitude,
                longitude=longitude,
                start_year=start_year,
                end_year=end_year,
            )
            points = [
                OceanTimeSeriesPoint(
                    date=p["date"],
                    ssha_mean_m=p["ssha_mean_m"],
                    ssha_min_m=p["ssha_min_m"],
                    ssha_max_m=p["ssha_max_m"],
                    eddy_kinetic_energy_cm2_s2=p["eddy_kinetic_energy_cm2_s2"],
                )
                for p in real_data.get("timeseries", [])
            ]
            return OceanTimeSeriesResponse(
                data_status=real_data.get("data_status", "unavailable"),
                is_observation=real_data.get("is_observation", False),
                dataset_id=real_data.get("dataset_id", "SWOT_L2_LR_SSH"),
                dataset_name=real_data.get("dataset_name", "NASA/CNES SWOT KaRIn Low Rate Ocean Sea Surface Height"),
                region_name=real_data.get("region_name", "SWOT Ocean Swath"),
                latitude=latitude,
                longitude=longitude,
                unit_height="meters (m)",
                summary_statistics=real_data.get("summary_statistics", {}),
                timeseries=points,
            )

        if source_mode == "demonstration":
            return DemoDataService.get_simulated_ocean_timeseries(
                latitude=latitude,
                longitude=longitude,
                start_year=start_year,
                end_year=end_year,
            )

        # Auto mode: try real observations first
        real_data = ObservationRepository.get_real_swot_timeseries(
            latitude=latitude,
            longitude=longitude,
            start_year=start_year,
            end_year=end_year,
        )
        if real_data.get("is_observation") and real_data.get("timeseries"):
            points = [
                OceanTimeSeriesPoint(
                    date=p["date"],
                    ssha_mean_m=p["ssha_mean_m"],
                    ssha_min_m=p["ssha_min_m"],
                    ssha_max_m=p["ssha_max_m"],
                    eddy_kinetic_energy_cm2_s2=p["eddy_kinetic_energy_cm2_s2"],
                )
                for p in real_data.get("timeseries", [])
            ]
            return OceanTimeSeriesResponse(
                data_status="observation",
                is_observation=True,
                dataset_id=real_data.get("dataset_id", "SWOT_L2_LR_SSH"),
                dataset_name=real_data.get("dataset_name", "NASA/CNES SWOT KaRIn Low Rate Ocean Sea Surface Height"),
                region_name=real_data.get("region_name", "SWOT Ocean Swath"),
                latitude=latitude,
                longitude=longitude,
                unit_height="meters (m)",
                summary_statistics=real_data.get("summary_statistics", {}),
                timeseries=points,
            )

        return DemoDataService.get_simulated_ocean_timeseries(
            latitude=latitude,
            longitude=longitude,
            start_year=start_year,
            end_year=end_year,
        )
