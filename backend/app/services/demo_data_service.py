"""
Isolated Scientific Demonstration Data Service for PlanetIQ.
Contains calibrated mathematical models for offline demonstrations and biophysical illustrations.

CRITICAL SCIENTIFIC INTEGRITY RULE:
Every response produced by this service is strictly labelled with:
- data_status: "simulated"
- is_observation: False
- source_type: "synthetic"
- data_notice: explicit notification that values are modelled/simulated examples.

Simulated values MUST NEVER be presented as genuine NASA satellite observations.
"""

from typing import List, Optional
import calendar
import math
from app.schemas.scientific import (
    GeoJSONFeatureCollection,
    GeoJSONFeature,
    GeoJSONGeometry,
    LandTimeSeriesResponse,
    LandTimeSeriesPoint,
    AtmosphereTimeSeriesResponse,
    AtmosphereTimeSeriesPoint,
    OceanTimeSeriesResponse,
    OceanTimeSeriesPoint,
)
from app.data_processing.quality_control import QualityControl


class DemoDataService:
    """Isolated provider of calibrated mathematical demonstration datasets."""

    # 1. Terrestrial Biome Anchors for Simulated Demonstrations
    LAND_BIOMES = [
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
        },
    ]

    # 2. Meteorological Climatological Profiles for Simulated Demonstrations
    ATMOSPHERE_REGIONS = [
        {
            "id": "itcz_pacific",
            "name": "Intertropical Convergence Zone (Central Pacific)",
            "lat": 6.5,
            "lon": -150.0,
            "base_rate": 0.42,
            "seasonal_amp": 0.15,
            "phase_offset": 5,
        },
        {
            "id": "amazon_basin",
            "name": "Amazon River Basin (Manaus Region)",
            "lat": -3.1,
            "lon": -60.0,
            "base_rate": 0.35,
            "seasonal_amp": 0.22,
            "phase_offset": 1,
        },
        {
            "id": "south_asia_monsoon",
            "name": "South Asian Monsoon (Bay of Bengal / Ganges)",
            "lat": 21.0,
            "lon": 88.5,
            "base_rate": 0.32,
            "seasonal_amp": 0.45,
            "phase_offset": 6,
        },
        {
            "id": "sahel_transition",
            "name": "Sahelian Semi-Arid Transition Belt",
            "lat": 14.5,
            "lon": 2.0,
            "base_rate": 0.08,
            "seasonal_amp": 0.14,
            "phase_offset": 7,
        },
        {
            "id": "north_atlantic_storm",
            "name": "North Atlantic Storm Track",
            "lat": 48.0,
            "lon": -30.0,
            "base_rate": 0.18,
            "seasonal_amp": 0.08,
            "phase_offset": 11,
        },
        {
            "id": "congo_basin",
            "name": "Congo Rainforest Equatorial Basin",
            "lat": 0.5,
            "lon": 23.5,
            "base_rate": 0.26,
            "seasonal_amp": 0.12,
            "phase_offset": 3,
        },
        {
            "id": "california_mediterranean",
            "name": "Western North America (California Coast)",
            "lat": 36.5,
            "lon": -121.0,
            "base_rate": 0.07,
            "seasonal_amp": 0.09,
            "phase_offset": 0,
        },
        {
            "id": "australia_outback",
            "name": "Central Australian Arid Basin",
            "lat": -24.0,
            "lon": 133.5,
            "base_rate": 0.03,
            "seasonal_amp": 0.03,
            "phase_offset": 1,
        },
    ]

    # 3. Oceanographic Dynamic Regimes for Simulated Demonstrations
    OCEAN_REGIONS = [
        {
            "id": "gulf_stream",
            "name": "Gulf Stream Boundary Current & Eddy Field",
            "lat": 36.0,
            "lon": -68.0,
            "mean_ssha": 0.35,
            "seasonal_amp": 0.12,
            "base_eke": 420.0,
        },
        {
            "id": "kuroshio_extension",
            "name": "Kuroshio Extension Current (NW Pacific)",
            "lat": 34.5,
            "lon": 145.0,
            "mean_ssha": 0.28,
            "seasonal_amp": 0.15,
            "base_eke": 390.0,
        },
        {
            "id": "agulhas_retroflection",
            "name": "Agulhas Current Retroflection (South Africa)",
            "lat": -38.5,
            "lon": 20.0,
            "mean_ssha": 0.22,
            "seasonal_amp": 0.08,
            "base_eke": 510.0,
        },
        {
            "id": "pacific_enso_nino34",
            "name": "Equatorial Pacific (Niño 3.4 Kelvin Wave Corridors)",
            "lat": 0.0,
            "lon": -140.0,
            "mean_ssha": 0.05,
            "seasonal_amp": 0.18,
            "base_eke": 180.0,
        },
        {
            "id": "southern_ocean_drake",
            "name": "Antarctic Circumpolar Current (Drake Passage)",
            "lat": -58.0,
            "lon": -62.0,
            "mean_ssha": -0.45,
            "seasonal_amp": 0.06,
            "base_eke": 310.0,
        },
        {
            "id": "california_current",
            "name": "California Coastal Upwelling System",
            "lat": 33.0,
            "lon": -122.0,
            "mean_ssha": -0.05,
            "seasonal_amp": 0.10,
            "base_eke": 195.0,
        },
        {
            "id": "arabian_sea",
            "name": "Arabian Sea Upwelling and Eddy System",
            "lat": 16.0,
            "lon": 64.0,
            "mean_ssha": 0.08,
            "seasonal_amp": 0.14,
            "base_eke": 280.0,
        },
        {
            "id": "bay_of_bengal",
            "name": "Bay of Bengal Freshwater & Eddy Basin",
            "lat": 14.0,
            "lon": 87.0,
            "mean_ssha": 0.12,
            "seasonal_amp": 0.16,
            "base_eke": 250.0,
        },
    ]

    # --- Land Simulation ---

    @classmethod
    def get_simulated_land_grid(
        cls,
        date_str: str = "2026-03",
        min_lat: Optional[float] = None,
        max_lat: Optional[float] = None,
        min_lon: Optional[float] = None,
        max_lon: Optional[float] = None,
    ) -> GeoJSONFeatureCollection:
        """Returns simulated demonstration vegetation features explicitly labeled as synthetic."""
        parts = date_str.split("-")
        month = int(parts[1]) if len(parts) > 1 else 3

        features: List[GeoJSONFeature] = []

        for reg in cls.LAND_BIOMES:
            base_lat = reg["lat"]
            base_lon = reg["lon"]
            base_ndvi = reg["base_ndvi"]
            amp = reg["seasonal_amp"]
            peak = reg["peak_month"]

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

                    month_offset = (month - peak + 6) % 12 - 6
                    phenology = amp * math.cos(math.pi * month_offset / 6.0)
                    spatial_noise = 0.02 * math.sin(d_lat_idx * 2 + d_lon_idx)
                    ndvi_val = max(0.02, min(0.92, round(base_ndvi + phenology + spatial_noise, 3)))
                    evi_val = max(0.01, min(0.75, round(ndvi_val * 0.72, 3)))

                    vci = QualityControl.calculate_vci(ndvi_val, base_ndvi - amp - 0.05, base_ndvi + amp + 0.05)
                    drought_desc = QualityControl.classify_drought_vci(vci)

                    features.append(
                        GeoJSONFeature(
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
                                "sensor": "MODIS Terra/Aqua (Simulation Model)",
                                "data_status": "demonstration_model",
                                "is_observation": False,
                                "source_type": "synthetic",
                                "provenance": "Calibrated Mathematical Simulation Model (Demonstration Only)",
                            },
                        )
                    )

        return GeoJSONFeatureCollection(
            features=features,
            metadata={
                "data_status": "demonstration_model",
                "is_observation": False,
                "source_type": "synthetic",
                "data_notice": "SIMULATED DEMONSTRATION DATA: Calibrated mathematical phenology model. Not genuine satellite observations.",
                "dataset_id": "MOD13C2",
                "agency": "NASA LP DAAC / USGS (Reference Benchmark)",
                "sensor": "Moderate Resolution Imaging Spectroradiometer (Simulation)",
                "date": date_str,
                "feature_count": len(features),
                "measurement_units": "dimensionless index (-0.2000 to +1.0000)",
                "scientific_accuracy": "Simulated demonstration values.",
            },
        )

    @classmethod
    def get_simulated_land_timeseries(
        cls,
        latitude: float,
        longitude: float,
        start_year: int = 2024,
        end_year: int = 2026,
    ) -> LandTimeSeriesResponse:
        """Returns multi-year simulated demonstration NDVI timeseries."""
        closest_region = min(
            cls.LAND_BIOMES,
            key=lambda r: math.hypot(r["lat"] - latitude, r["lon"] - longitude),
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
                        ndvi_anomaly=anomaly,
                    )
                )

        return LandTimeSeriesResponse(
            dataset_id="MOD13C2",
            dataset_name="MODIS Monthly Global Vegetation Indices (Simulated)",
            region_name=closest_region["name"],
            latitude=latitude,
            longitude=longitude,
            unit="dimensionless index (-0.2000 to +1.0000)",
            data_status="demonstration_model",
            is_observation=False,
            summary_statistics={
                "data_status": "demonstration_model",
                "is_observation": False,
                "source_type": "synthetic",
                "mean_ndvi": round(sum(ndvi_values) / max(len(ndvi_values), 1), 3),
                "peak_ndvi_observed": max(ndvi_values),
                "minimum_ndvi_observed": min(ndvi_values),
                "vegetation_cover_type": closest_region["land_cover"],
            },
            timeseries=points,
        )

    # --- Atmosphere Simulation ---

    @classmethod
    def get_simulated_atmosphere_grid(
        cls,
        date_str: str = "2026-03",
        min_lat: Optional[float] = None,
        max_lat: Optional[float] = None,
        min_lon: Optional[float] = None,
        max_lon: Optional[float] = None,
    ) -> GeoJSONFeatureCollection:
        """Returns simulated demonstration precipitation features explicitly labeled as synthetic."""
        parts = date_str.split("-")
        year = int(parts[0]) if len(parts) > 0 else 2026
        month = int(parts[1]) if len(parts) > 1 else 3
        _, days_in_month = calendar.monthrange(year, month)
        hours_in_month = days_in_month * 24.0

        features: List[GeoJSONFeature] = []

        for reg in cls.ATMOSPHERE_REGIONS:
            base_lat = reg["lat"]
            base_lon = reg["lon"]
            base_rate = reg["base_rate"]
            amp = reg["seasonal_amp"]
            phase = reg["phase_offset"]

            for d_lat_idx in range(-1, 2):
                for d_lon_idx in range(-1, 2):
                    lat = round(base_lat + d_lat_idx * 1.5, 3)
                    lon = round(base_lon + d_lon_idx * 1.8, 3)

                    if min_lat is not None and lat < min_lat:
                        continue
                    if max_lat is not None and lat > max_lat:
                        continue
                    if min_lon is not None and lon < min_lon:
                        continue
                    if max_lon is not None and lon > max_lon:
                        continue

                    month_angle = 2.0 * math.pi * ((month - phase) % 12) / 12.0
                    rate_val = max(0.005, round(base_rate + amp * math.sin(month_angle), 4))
                    accum_mm = round(rate_val * hours_in_month, 2)
                    normal_mm = round(base_rate * hours_in_month, 2)
                    anomaly_mm = round(accum_mm - normal_mm, 2)

                    features.append(
                        GeoJSONFeature(
                            geometry=GeoJSONGeometry(type="Point", coordinates=[lon, lat]),
                            properties={
                                "location_name": reg["name"],
                                "region_id": reg["id"],
                                "latitude": lat,
                                "longitude": lon,
                                "date": date_str,
                                "dataset_id": "GPM_3IMERGM",
                                "precipitation_rate_mm_hr": rate_val,
                                "precipitation_accumulated_mm": accum_mm,
                                "climatological_normal_mm": normal_mm,
                                "anomaly_mm": anomaly_mm,
                                "anomaly_percentage": round((anomaly_mm / max(normal_mm, 1.0)) * 100.0, 1),
                                "quality_index": 0.85,
                                "rate_unit": "mm/hr",
                                "accumulated_unit": "mm",
                                "data_status": "demonstration_model",
                                "is_observation": False,
                                "source_type": "synthetic",
                                "provenance": "Calibrated Mathematical Simulation Model (Demonstration Only)",
                            },
                        )
                    )

        return GeoJSONFeatureCollection(
            features=features,
            metadata={
                "data_status": "demonstration_model",
                "is_observation": False,
                "source_type": "synthetic",
                "data_notice": "SIMULATED DEMONSTRATION DATA: Calibrated mathematical precipitation model. Not genuine satellite observations.",
                "dataset_id": "GPM_3IMERGM",
                "agency": "NASA GES DISC (Reference)",
                "date": date_str,
                "feature_count": len(features),
                "units": {"rate": "mm/hr", "accumulation": "mm"},
                "scientific_accuracy": "Simulated demonstration values.",
            },
        )

    @classmethod
    def get_simulated_atmosphere_timeseries(
        cls,
        latitude: float,
        longitude: float,
        start_year: int = 2024,
        end_year: int = 2026,
    ) -> AtmosphereTimeSeriesResponse:
        """Returns simulated demonstration precipitation timeseries."""
        closest_region = min(
            cls.ATMOSPHERE_REGIONS,
            key=lambda r: math.hypot(r["lat"] - latitude, r["lon"] - longitude),
        )

        base_rate = closest_region["base_rate"]
        amp = closest_region["seasonal_amp"]
        phase = closest_region["phase_offset"]

        points: List[AtmosphereTimeSeriesPoint] = []
        total_accum = 0.0
        total_normal = 0.0

        for year in range(start_year, end_year + 1):
            for month in range(1, 13):
                _, days_in_month = calendar.monthrange(year, month)
                hours_in_month = days_in_month * 24.0

                month_angle = 2.0 * math.pi * ((month - phase) % 12) / 12.0
                climatological_rate = max(0.01, base_rate + amp * math.sin(month_angle))
                climatological_normal_mm = round(climatological_rate * hours_in_month, 2)

                interannual_var = 0.04 * math.sin(year * 1.5 + month * 0.5)
                actual_rate = max(0.005, round(climatological_rate + interannual_var, 4))
                actual_accum_mm = round(actual_rate * hours_in_month, 2)
                anomaly_mm = round(actual_accum_mm - climatological_normal_mm, 2)

                points.append(
                    AtmosphereTimeSeriesPoint(
                        date=f"{year:04d}-{month:02d}",
                        precipitation_rate_mm_hr=actual_rate,
                        precipitation_accumulated_mm=actual_accum_mm,
                        climatological_normal_mm=climatological_normal_mm,
                        anomaly_mm=anomaly_mm,
                    )
                )
                total_accum += actual_accum_mm
                total_normal += climatological_normal_mm

        mean_monthly_mm = round(total_accum / max(len(points), 1), 2)
        mean_normal_mm = round(total_normal / max(len(points), 1), 2)
        max_accum_point = max(points, key=lambda p: p.precipitation_accumulated_mm)
        min_accum_point = min(points, key=lambda p: p.precipitation_accumulated_mm)

        return AtmosphereTimeSeriesResponse(
            dataset_id="GPM_3IMERGM",
            dataset_name="GPM IMERG Final Monthly Precipitation (Simulated)",
            location_name=closest_region["name"],
            latitude=latitude,
            longitude=longitude,
            unit_rate="mm/hr",
            unit_accumulation="mm",
            data_status="demonstration_model",
            is_observation=False,
            summary_statistics={
                "data_status": "demonstration_model",
                "is_observation": False,
                "source_type": "synthetic",
                "mean_monthly_accumulation_mm": mean_monthly_mm,
                "climatological_mean_mm": mean_normal_mm,
                "net_anomaly_mm": round(mean_monthly_mm - mean_normal_mm, 2),
                "peak_month_accumulation_mm": max_accum_point.precipitation_accumulated_mm,
                "minimum_month_accumulation_mm": min_accum_point.precipitation_accumulated_mm,
            },
            timeseries=points,
        )

    # --- Ocean Simulation ---

    @classmethod
    def get_simulated_ocean_grid(
        cls,
        date_str: str = "2026-03",
        min_lat: Optional[float] = None,
        max_lat: Optional[float] = None,
        min_lon: Optional[float] = None,
        max_lon: Optional[float] = None,
    ) -> GeoJSONFeatureCollection:
        """Returns simulated demonstration ocean features explicitly labeled as synthetic."""
        parts = date_str.split("-")
        month = int(parts[1]) if len(parts) > 1 else 3

        features: List[GeoJSONFeature] = []

        for reg in cls.OCEAN_REGIONS:
            base_lat = reg["lat"]
            base_lon = reg["lon"]
            mean_ssha = reg["mean_ssha"]
            amp = reg["seasonal_amp"]
            base_eke = reg["base_eke"]

            for d_lat_idx in range(-2, 3):
                for d_lon_idx in range(-2, 3):
                    lat = round(base_lat + d_lat_idx * 1.2, 4)
                    lon = round(base_lon + d_lon_idx * 1.5, 4)

                    if min_lat is not None and lat < min_lat:
                        continue
                    if max_lat is not None and lat > max_lat:
                        continue
                    if min_lon is not None and lon < min_lon:
                        continue
                    if max_lon is not None and lon > max_lon:
                        continue

                    dist = math.hypot(d_lat_idx, d_lon_idx)
                    eddy_perturbation = 0.20 * math.exp(-0.5 * (dist / 1.5) ** 2) * math.cos(dist * 1.8)
                    season_term = amp * math.sin(2.0 * math.pi * (month / 12.0))

                    ssha = round(mean_ssha + season_term + eddy_perturbation, 3)
                    ssh = round(15.20 + ssha, 3)
                    dynamic_topography = round(0.85 + ssha, 3)

                    if eddy_perturbation > 0.08:
                        eddy_type = "anticyclonic_warm_core"
                    elif eddy_perturbation < -0.08:
                        eddy_type = "cyclonic_cold_core"
                    else:
                        eddy_type = "neutral_laminar"

                    features.append(
                        GeoJSONFeature(
                            geometry=GeoJSONGeometry(type="Point", coordinates=[lon, lat]),
                            properties={
                                "region_id": reg["id"],
                                "region_name": reg["name"],
                                "latitude": lat,
                                "longitude": lon,
                                "date": date_str,
                                "dataset_id": "SWOT_L2_LR_SSH",
                                "ssh_karin_m": ssh,
                                "ssha_karin_m": ssha,
                                "dynamic_topography_m": dynamic_topography,
                                "eddy_type": eddy_type,
                                "eddy_kinetic_energy_cm2_s2": round(base_eke + (100.0 * abs(ssha)), 1),
                                "chlor_a_mg_m3": round(max(0.05, 0.42 + 0.18 * math.sin(month * 0.52)), 3),
                                "sst_celsius": round(26.8 + 2.8 * math.cos((month - 5) * math.pi / 6.0), 2),
                                "unit": "meters (m)",
                                "sensor": "KaRIn Interferometer (Simulation Model)",
                                "data_status": "demonstration_model",
                                "is_observation": False,
                                "source_type": "synthetic",
                                "provenance": "Calibrated Mathematical Simulation Model (Demonstration Only)",
                            },
                        )
                    )

        return GeoJSONFeatureCollection(
            features=features,
            metadata={
                "data_status": "demonstration_model",
                "is_observation": False,
                "source_type": "synthetic",
                "data_notice": "SIMULATED DEMONSTRATION DATA: Calibrated mathematical ocean altimetry model. Not genuine satellite observations.",
                "dataset_id": "SWOT_L2_LR_SSH",
                "mission": "Surface Water and Ocean Topography (Simulation)",
                "instrument": "Ka-band Radar Interferometer (Simulation)",
                "date": date_str,
                "feature_count": len(features),
                "measurement_units": "meters (m)",
                "scientific_accuracy": "Simulated demonstration values.",
            },
        )

    @classmethod
    def get_simulated_ocean_timeseries(
        cls,
        latitude: float,
        longitude: float,
        start_year: int = 2024,
        end_year: int = 2026,
    ) -> OceanTimeSeriesResponse:
        """Returns simulated demonstration ocean timeseries."""
        closest_region = min(
            cls.OCEAN_REGIONS,
            key=lambda r: math.hypot(r["lat"] - latitude, r["lon"] - longitude),
        )

        mean_ssha = closest_region["mean_ssha"]
        amp = closest_region["seasonal_amp"]
        base_eke = closest_region["base_eke"]

        points: List[OceanTimeSeriesPoint] = []
        ssha_values = []

        for year in range(start_year, end_year + 1):
            for month in range(1, 13):
                seasonal = amp * math.sin(2.0 * math.pi * (month / 12.0))
                planetary_wave = 0.08 * math.sin((year - 2024) * 2.2 + month * 0.4)
                ssha_val = round(mean_ssha + seasonal + planetary_wave, 3)
                ssha_values.append(ssha_val)

                ssha_min = round(ssha_val - 0.12, 3)
                ssha_max = round(ssha_val + 0.14, 3)
                eke = round(base_eke + (80.0 * abs(ssha_val)), 1)

                points.append(
                    OceanTimeSeriesPoint(
                        date=f"{year:04d}-{month:02d}",
                        ssha_mean_m=ssha_val,
                        ssha_min_m=ssha_min,
                        ssha_max_m=ssha_max,
                        eddy_kinetic_energy_cm2_s2=eke,
                        chlor_a=round(max(0.05, 0.42 + 0.18 * math.sin(month * 0.52)), 3),
                        sst=round(26.8 + 2.8 * math.cos((month - 5) * math.pi / 6.0), 2),
                    )
                )

        return OceanTimeSeriesResponse(
            dataset_id="SWOT_L2_LR_SSH",
            dataset_name="SWOT KaRIn Ocean Sea Surface Height (Simulated)",
            region_name=closest_region["name"],
            latitude=latitude,
            longitude=longitude,
            unit_height="meters (m)",
            data_status="demonstration_model",
            is_observation=False,
            summary_statistics={
                "data_status": "demonstration_model",
                "is_observation": False,
                "source_type": "synthetic",
                "mean_ssha_m": round(sum(ssha_values) / max(len(ssha_values), 1), 3),
                "max_ssha_observed_m": max(ssha_values),
                "min_ssha_observed_m": min(ssha_values),
                "mean_eke_cm2_s2": round(sum(p.eddy_kinetic_energy_cm2_s2 for p in points) / max(len(points), 1), 1),
            },
            timeseries=points,
        )
