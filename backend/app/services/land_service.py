"""
Scientific Land Service for PlanetIQ.
Processes NASA MODIS Monthly Global Vegetation Indices (MOD13C2 v061).
Calculates NDVI, EVI, Vegetation Condition Index (VCI %), and agricultural drought conditions.

Preserves strict data source distinction:
- REAL OBSERVATION: Ingested and calibrated from authentic NASA MODIS MOD13C2 satellite granules.
- SIMULATED DEMONSTRATION DATA: Calibrated mathematical phenology models for offline demonstrations.
"""

from typing import List, Dict, Any, Optional
import math
from app.schemas.scientific import (
    GeoJSONFeatureCollection,
    GeoJSONFeature,
    GeoJSONGeometry,
    LandTimeSeriesResponse,
    LandTimeSeriesPoint,
)
from app.repositories.observation_repository import ObservationRepository
from app.data_processing.quality_control import QualityControl


class LandService:
    """
    Scientific service for NASA MODIS Monthly Global Vegetation Indices (MOD13C2 v061).
    Supports both authentic satellite observations and demonstration modes.
    """

    LAND_REGIONS = [
        {
            "id": "amazon_rainforest",
            "name": "Amazon Evergreen Rainforest (Brazil)",
            "lat": -3.5,
            "lon": -62.0,
            "base_ndvi": 0.82,
            "seasonal_amp": 0.05,
            "peak_month": 3,
            "land_cover": "Evergreen Broadleaf Forest",
        },
        {
            "id": "great_plains_agriculture",
            "name": "North American Agricultural Corn/Soy Belt (Iowa)",
            "lat": 42.0,
            "lon": -93.5,
            "base_ndvi": 0.45,
            "seasonal_amp": 0.38,
            "peak_month": 7,
            "land_cover": "Croplands / Temperate Grassland",
        },
        {
            "id": "sahel_savanna",
            "name": "Sahelian Acacia Savanna (Mali / Niger)",
            "lat": 13.5,
            "lon": 2.5,
            "base_ndvi": 0.28,
            "seasonal_amp": 0.22,
            "peak_month": 9,
            "land_cover": "Open Shrublands / Woody Savanna",
        },
        {
            "id": "siberian_taiga",
            "name": "Siberian Boreal Larch Forest (Russia)",
            "lat": 62.0,
            "lon": 129.5,
            "base_ndvi": 0.35,
            "seasonal_amp": 0.35,
            "peak_month": 7,
            "land_cover": "Deciduous Needleleaf Boreal Forest",
        },
        {
            "id": "western_europe_deciduous",
            "name": "Central European Deciduous Broadleaf Forest (Germany/France)",
            "lat": 49.5,
            "lon": 8.0,
            "base_ndvi": 0.52,
            "seasonal_amp": 0.30,
            "peak_month": 6,
            "land_cover": "Mixed Temperate Broadleaf Forest",
        },
        {
            "id": "nile_delta_irrigation",
            "name": "Nile River Delta Agricultural Oasis (Egypt)",
            "lat": 30.8,
            "lon": 31.0,
            "base_ndvi": 0.62,
            "seasonal_amp": 0.15,
            "peak_month": 4,
            "land_cover": "Intensively Irrigated Croplands",
        },
        {
            "id": "australia_murray_darling",
            "name": "Murray-Darling Agricultural Basin (Australia)",
            "lat": -34.0,
            "lon": 143.0,
            "base_ndvi": 0.32,
            "seasonal_amp": 0.16,
            "peak_month": 10,
            "land_cover": "Grasslands / Dryland Farming",
        },
        {
            "id": "congo_equatorial_canopy",
            "name": "Congo Basin Moist Tropical Forest (DRC)",
            "lat": 0.0,
            "lon": 21.0,
            "base_ndvi": 0.79,
            "seasonal_amp": 0.06,
            "peak_month": 11,
            "land_cover": "Dense Moist Evergreen Tropical Forest",
        },
        {
            "id": "indian_punjab_wheat",
            "name": "Indo-Gangetic Plain Agricultural Heartland (Punjab)",
            "lat": 30.9,
            "lon": 75.8,
            "base_ndvi": 0.48,
            "seasonal_amp": 0.28,
            "peak_month": 3,
            "land_cover": "Double-Cropped Irrigated Agriculture",
        },
        {
            "id": "sahara_desert_margin",
            "name": "Southern Saharan Hyper-Arid Erg Margin (Mauritania)",
            "lat": 19.5,
            "lon": -11.0,
            "base_ndvi": 0.07,
            "seasonal_amp": 0.02,
            "peak_month": 9,
            "land_cover": "Barren or Sparsely Vegetated Desert",
        }
    ]

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
        Delivers MODIS MOD13C2 vegetation grid.
        - source_mode="observation" or "auto": Delivers authentic NASA satellite observations.
        - source_mode="demonstration": Delivers calibrated demonstration model.
        """
        # If real observations requested or auto mode
        if source_mode in ["auto", "observation"]:
            real_data = ObservationRepository.get_real_modis_spatial_grid(
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

        # Demonstration mode
        parts = date_str.split("-")
        month = int(parts[1]) if len(parts) > 1 else 3

        features: List[GeoJSONFeature] = []

        for reg in cls.LAND_REGIONS:
            base_lat = reg["lat"]
            base_lon = reg["lon"]
            base_ndvi = reg["base_ndvi"]
            amp = reg["seasonal_amp"]
            peak = reg["peak_month"]

            # Create a 2D cluster around each terrestrial biome
            for d_lat_idx in range(-2, 3):
                for d_lon_idx in range(-2, 3):
                    lat = round(base_lat + d_lat_idx * 1.5, 4)
                    lon = round(base_lon + d_lon_idx * 1.8, 4)

                    if min_lat is not None and lat < min_lat:
                        continue
                    if max_lat is not None and lat > max_lat:
                        continue
                    if min_lon is not None and lon < min_lon:
                        continue
                    if max_lon is not None and lon > max_lon:
                        continue

                    # Phenology harmonic modulation
                    month_offset = (month - peak + 6) % 12 - 6
                    phenology = amp * math.cos(math.pi * month_offset / 6.0)
                    spatial_noise = 0.02 * math.sin(d_lat_idx * 2 + d_lon_idx)
                    ndvi_val = max(0.02, min(0.92, round(base_ndvi + phenology + spatial_noise, 3)))
                    evi_val = max(0.01, min(0.75, round(ndvi_val * 0.72, 3)))

                    vci = QualityControl.calculate_vci(ndvi_val, base_ndvi - amp - 0.05, base_ndvi + amp + 0.05)
                    drought_desc = QualityControl.classify_drought_vci(vci)

                    feature = GeoJSONFeature(
                        geometry=GeoJSONGeometry(type="Point", coordinates=[lon, lat]),
                        properties={
                            "region_id": reg["id"],
                            "region_name": reg["name"],
                            "latitude": lat,
                            "longitude": lon,
                            "date": date_str,
                            "dataset_id": "MOD13C2",
                            "ndvi": ndvi_val,
                            "evi": evi_val,
                            "vci_percent": vci,
                            "drought_category": drought_desc,
                            "land_cover_type": reg["land_cover"],
                            "unit": "dimensionless ratio (-0.2000 to +1.0000)",
                            "sensor": "MODIS Terra/Aqua",
                            "data_status": "demonstration_model",
                            "is_observation": False,
                            "provenance": "Calibrated Mathematical Simulation Model",
                        }
                    )
                    features.append(feature)

        return GeoJSONFeatureCollection(
            features=features,
            metadata={
                "data_status": "demonstration_model",
                "is_observation": False,
                "data_notice": "SIMULATED DEMONSTRATION DATA: Calibrated mathematical phenology model.",
                "dataset_id": "MOD13C2",
                "agency": "NASA LP DAAC / USGS",
                "sensor": "Moderate Resolution Imaging Spectroradiometer (MODIS)",
                "date": date_str,
                "feature_count": len(features),
                "measurement_units": "dimensionless index (-0.2000 to +1.0000)",
                "scientific_accuracy": "Simulated demonstration values."
            }
        )

    @classmethod
    def get_timeseries(
        cls,
        latitude: float,
        longitude: float,
        start_year: int = 2024,
        end_year: int = 2026,
        source_mode: str = "auto",
    ) -> LandTimeSeriesResponse:
        """
        Calculates multi-year monthly NDVI timeseries for a given coordinate.
        """
        if source_mode in ["auto", "observation"]:
            res = ObservationRepository.get_real_modis_timeseries(
                latitude=latitude,
                longitude=longitude,
                start_year=start_year,
                end_year=end_year,
            )
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

        # Demonstration mode
        closest_region = min(
            cls.LAND_REGIONS,
            key=lambda r: math.hypot(r["lat"] - latitude, r["lon"] - longitude)
        )

        base_ndvi = closest_region["base_ndvi"]
        amp = closest_region["seasonal_amp"]
        peak = closest_region["peak_month"]

        points: List[LandTimeSeriesPoint] = []
        ndvi_values = []

        for year in range(start_year, end_year + 1):
            for month in range(1, 13):
                month_offset = (month - peak + 6) % 12 - 6
                seasonal = amp * math.cos(math.pi * month_offset / 6.0)
                historical_median = max(0.03, round(base_ndvi + seasonal, 3))

                climatic_perturbation = 0.035 * math.sin((year - 2024) * 2.0 + month * 0.7)
                actual_ndvi = max(0.02, min(0.95, round(historical_median + climatic_perturbation, 3)))
                actual_evi = round(actual_ndvi * 0.72, 3)
                anomaly = round(actual_ndvi - historical_median, 3)

                ndvi_values.append(actual_ndvi)
                points.append(
                    LandTimeSeriesPoint(
                        date=f"{year:04d}-{month:02d}",
                        ndvi=actual_ndvi,
                        evi=actual_evi,
                        historical_ndvi_median=historical_median,
                        ndvi_anomaly=anomaly
                    )
                )

        return LandTimeSeriesResponse(
            dataset_id="MOD13C2",
            dataset_name="MODIS Monthly Global Vegetation Indices",
            region_name=closest_region["name"],
            latitude=latitude,
            longitude=longitude,
            unit="dimensionless index (-0.2000 to +1.0000)",
            data_status="demonstration_model",
            is_observation=False,
            summary_statistics={
                "mean_ndvi": round(sum(ndvi_values) / max(len(ndvi_values), 1), 3),
                "peak_ndvi_observed": max(ndvi_values),
                "minimum_ndvi_observed": min(ndvi_values),
                "vegetation_cover_type": closest_region["land_cover"],
            },
            timeseries=points
        )
