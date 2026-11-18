from typing import List, Dict, Any, Optional
import calendar
import math
from app.schemas.scientific import (
    GeoJSONFeatureCollection,
    GeoJSONFeature,
    GeoJSONGeometry,
    AtmosphereTimeSeriesResponse,
    AtmosphereTimeSeriesPoint,
    PrecipitationGridPoint,
)
from app.repositories.observation_repository import ObservationRepository


class AtmosphereService:
    """
    Scientific service for NASA GPM IMERG Final Monthly Precipitation (GPM_3IMERGM).
    Handles spatial bounding queries, climatological baseline comparisons,
    and distinct handling of rate (mm/hr) versus accumulated depth (mm).
    """

    # Reference climatological regions across the globe with coordinates and meteorological profiles
    ATMOSPHERE_REGIONS = [
        {
            "id": "itcz_pacific",
            "name": "Intertropical Convergence Zone (Central Pacific)",
            "lat": 6.5,
            "lon": -150.0,
            "base_rate": 0.42,  # mm/hr
            "seasonal_amp": 0.15,
            "phase_offset": 5,
            "climatology_annual_mm": 2850.0,
        },
        {
            "id": "amazon_basin",
            "name": "Amazon River Basin (Manaus Region)",
            "lat": -3.1,
            "lon": -60.0,
            "base_rate": 0.35,  # mm/hr
            "seasonal_amp": 0.22,
            "phase_offset": 1,
            "climatology_annual_mm": 2420.0,
        },
        {
            "id": "south_asia_monsoon",
            "name": "South Asian Monsoon (Bay of Bengal / Ganges)",
            "lat": 21.0,
            "lon": 88.5,
            "base_rate": 0.32,  # mm/hr
            "seasonal_amp": 0.45,
            "phase_offset": 6,
            "climatology_annual_mm": 2100.0,
        },
        {
            "id": "sahel_transition",
            "name": "Sahelian Semi-Arid Transition Belt",
            "lat": 14.5,
            "lon": 2.0,
            "base_rate": 0.08,  # mm/hr
            "seasonal_amp": 0.14,
            "phase_offset": 7,
            "climatology_annual_mm": 480.0,
        },
        {
            "id": "north_atlantic_storm",
            "name": "North Atlantic Storm Track",
            "lat": 48.0,
            "lon": -30.0,
            "base_rate": 0.18,  # mm/hr
            "seasonal_amp": 0.08,
            "phase_offset": 11,
            "climatology_annual_mm": 1350.0,
        },
        {
            "id": "congo_basin",
            "name": "Congo Rainforest Equatorial Basin",
            "lat": 0.5,
            "lon": 23.5,
            "base_rate": 0.26,  # mm/hr
            "seasonal_amp": 0.12,
            "phase_offset": 3,
            "climatology_annual_mm": 1850.0,
        },
        {
            "id": "california_mediterranean",
            "name": "Western North America (California Coast)",
            "lat": 36.5,
            "lon": -121.0,
            "base_rate": 0.07,  # mm/hr
            "seasonal_amp": 0.09,
            "phase_offset": 0,
            "climatology_annual_mm": 560.0,
        },
        {
            "id": "australia_outback",
            "name": "Central Australian Arid Basin",
            "lat": -24.0,
            "lon": 133.5,
            "base_rate": 0.03,  # mm/hr
            "seasonal_amp": 0.03,
            "phase_offset": 1,
            "climatology_annual_mm": 220.0,
        },
        {
            "id": "southeast_asia_archipelago",
            "name": "Maritime Continent (Indonesia / Malaysia)",
            "lat": -1.5,
            "lon": 115.0,
            "base_rate": 0.38,  # mm/hr
            "seasonal_amp": 0.14,
            "phase_offset": 11,
            "climatology_annual_mm": 2980.0,
        },
        {
            "id": "western_europe",
            "name": "Temperate Western Europe (Rhine Valley)",
            "lat": 50.0,
            "lon": 7.5,
            "base_rate": 0.11,  # mm/hr
            "seasonal_amp": 0.03,
            "phase_offset": 6,
            "climatology_annual_mm": 810.0,
        }
    ]

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
        - source_mode="observation" or "auto": Delivers authentic NASA satellite observations.
        - source_mode="demonstration": Delivers calibrated demonstration model.
        """
        if source_mode in ["auto", "observation"]:
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

        parts = date_str.split("-")
        year = int(parts[0]) if len(parts) > 0 else 2026
        month = int(parts[1]) if len(parts) > 1 else 3
        days_in_month = cls._compute_days_in_month(year, month)
        hours_in_month = days_in_month * 24.0

        features: List[GeoJSONFeature] = []

        # Generate a structured global synthetic-calibrated grid from 60S to 60N and 180W to 180E
        lat_step = 15.0
        lon_step = 20.0
        
        # Also include explicit anchor stations
        active_points = []
        for reg in cls.ATMOSPHERE_REGIONS:
            active_points.append((reg["lat"], reg["lon"], reg["name"], reg["base_rate"], reg["seasonal_amp"], reg["phase_offset"]))

        # Add gridded background points
        for lat_idx in range(-4, 5):
            lat_val = lat_idx * lat_step
            for lon_idx in range(-8, 9):
                lon_val = lon_idx * lon_step
                # Equatorial ITCZ bell curve
                itcz_factor = math.exp(-0.5 * ((lat_val - 5.0) / 12.0) ** 2)
                base_rate = max(0.01, 0.05 + 0.30 * itcz_factor)
                seasonal_amp = 0.12 * itcz_factor
                phase = 6 if lat_val >= 0 else 0
                active_points.append((lat_val, lon_val, f"Global Grid ({lat_val:+.1f}°, {lon_val:+.1f}°)", base_rate, seasonal_amp, phase))

        for lat, lon, name, base_rate, amp, phase in active_points:
            # Apply Bounding Box Filter if requested
            if min_lat is not None and lat < min_lat:
                continue
            if max_lat is not None and lat > max_lat:
                continue
            if min_lon is not None and lon < min_lon:
                continue
            if max_lon is not None and lon > max_lon:
                continue

            # Compute seasonal rate modulation: harmonic model
            month_angle = 2.0 * math.pi * ((month - phase) % 12) / 12.0
            rate_val = max(0.005, base_rate + amp * math.sin(month_angle))
            
            # Climate anomaly modulation based on multi-year index (e.g. 2026 ENSO neutral/warm)
            anomaly_bias = 0.03 * math.sin(lon * 0.05 + month)
            observed_rate = max(0.002, round(rate_val + anomaly_bias, 4))
            
            # Accumulated depth in mm
            accumulated_mm = round(observed_rate * hours_in_month, 2)
            climatological_normal_mm = round(base_rate * hours_in_month, 2)
            anomaly_mm = round(accumulated_mm - climatological_normal_mm, 2)

            quality_weight = 0.88 if abs(lat) < 50 else 0.72

            feature = GeoJSONFeature(
                geometry=GeoJSONGeometry(type="Point", coordinates=[lon, lat]),
                properties={
                    "location_name": name,
                    "latitude": lat,
                    "longitude": lon,
                    "date": date_str,
                    "dataset_id": "GPM_3IMERGM",
                    "precipitation_rate_mm_hr": observed_rate,
                    "precipitation_accumulated_mm": accumulated_mm,
                    "climatological_normal_mm": climatological_normal_mm,
                    "anomaly_mm": anomaly_mm,
                    "anomaly_percentage": round((anomaly_mm / max(climatological_normal_mm, 1.0)) * 100.0, 1),
                    "quality_index": quality_weight,
                    "rate_unit": "mm/hr",
                    "accumulated_unit": "mm",
                }
            )
            features.append(feature)

        return GeoJSONFeatureCollection(
            features=features,
            metadata={
                "data_status": "demonstration_model",
                "is_observation": False,
                "data_notice": "Generated seasonal example values; no NASA granules are loaded.",
                "dataset_id": "GPM_3IMERGM",
                "agency": "NASA GES DISC",
                "temporal_resolution": "Monthly",
                "date": date_str,
                "feature_count": len(features),
                "units": {
                    "rate": "mm/hr",
                    "accumulation": "mm"
                },
                "scientific_rule": "Precipitation rate (mm/hr) represents instantaneous intensity. Monthly accumulated precipitation (mm) represents total water depth over month duration."
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
    ) -> AtmosphereTimeSeriesResponse:
        """
        Calculates multi-year monthly timeseries for a specific geographic coordinate.
        - source_mode="observation" or "auto": Delivers authentic NASA satellite observations.
        - source_mode="demonstration": Delivers calibrated demonstration model.
        """
        if source_mode in ["auto", "observation"]:
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

        # Find closest reference profile or interpolate
        closest_region = min(
            cls.ATMOSPHERE_REGIONS,
            key=lambda r: math.hypot(r["lat"] - latitude, r["lon"] - longitude)
        )

        base_rate = closest_region["base_rate"]
        amp = closest_region["seasonal_amp"]
        phase = closest_region["phase_offset"]

        points: List[AtmosphereTimeSeriesPoint] = []
        total_accum = 0.0
        total_normal = 0.0

        for year in range(start_year, end_year + 1):
            max_month = 12
            for month in range(1, max_month + 1):
                days_in_month = cls._compute_days_in_month(year, month)
                hours_in_month = days_in_month * 24.0

                month_angle = 2.0 * math.pi * ((month - phase) % 12) / 12.0
                climatological_rate = max(0.01, base_rate + amp * math.sin(month_angle))
                climatological_normal_mm = round(climatological_rate * hours_in_month, 2)

                # Simulated real-world teleconnection anomaly (e.g. 2024-2025 climate anomaly)
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
            dataset_name="GPM IMERG Final Monthly Precipitation",
            location_name=closest_region["name"],
            latitude=latitude,
            longitude=longitude,
            unit_rate="mm/hr",
            unit_accumulation="mm",
            summary_statistics={
                "mean_monthly_accumulation_mm": mean_monthly_mm,
                "climatological_mean_mm": mean_normal_mm,
                "net_anomaly_mm": round(mean_monthly_mm - mean_normal_mm, 2),
                "peak_month_accumulation_mm": max_accum_point.precipitation_accumulated_mm,
                "minimum_month_accumulation_mm": min_accum_point.precipitation_accumulated_mm,
            },
            timeseries=points
        )
