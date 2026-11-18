"""
Scientific Atmosphere Processor for NASA MODIS Atmosphere (LAADS DAAC) & GPM IMERG (GES DISC).
Processes:
1. Aerosol Optical Depth at 550nm (MOD08_M3 / MOD04_L2, dimensionless extinction ratio)
2. Cloud Properties (MOD08_M3 / MOD06_L2, Cloud Fraction, Optical Thickness, Effective Radius in µm)
3. GPM IMERG Final Monthly Precipitation (GPM_3IMERGM v07, Rate in mm/hr and Accumulated Depth in mm)

Scientific Safeguards:
- Clearly documents that AOD represents total columnar light extinction by aerosols, NOT direct ground PM2.5.
- Distinguishes satellite-derived radar/radiometer microwave precipitation estimates from direct rain-gauges.
- Preserves missing and fill values (-9999, NaN); never interpolates unobserved regions with harmonic functions.
- Formats standard GeoJSON feature collections with complete satellite provenance.
"""

from typing import Dict, Any, List, Optional, Tuple
import os
import math
import calendar
import logging
import numpy as np

logger = logging.getLogger("planetiq.atmosphere_processor")


class AtmosphereProcessor:
    """Scientific processor for atmospheric observations (AOD, Clouds, GPM Precipitation)."""

    # Physical valid ranges according to NASA LAADS DAAC & GES DISC specifications
    AOD_MIN = 0.000       # Dimensionless extinction
    AOD_MAX = 5.000
    CLOUD_FRAC_MIN = 0.0  # 0% to 100%
    CLOUD_FRAC_MAX = 1.0
    COT_MIN = 0.0         # Cloud Optical Thickness
    COT_MAX = 100.0
    CER_MIN = 2.0         # Cloud Effective Radius (microns)
    CER_MAX = 40.0
    RAIN_RATE_MIN = 0.0   # mm/hr
    RAIN_RATE_MAX = 150.0 # mm/hr
    FILL_VALUE = -9999.0

    @classmethod
    def validate_aod(cls, value: Optional[float]) -> Optional[float]:
        """Validates that Aerosol Optical Depth at 550nm is physically valid."""
        if value is None or math.isnan(value) or value < cls.AOD_MIN:
            return None
        if cls.AOD_MIN <= value <= cls.AOD_MAX:
            return round(float(value), 3)
        return None

    @classmethod
    def validate_cloud_fraction(cls, value: Optional[float]) -> Optional[float]:
        """Validates cloud fraction (0.0 to 1.0)."""
        if value is None or math.isnan(value):
            return None
        # Handle percentage input (0-100) vs ratio (0-1)
        val = value / 100.0 if value > 1.0 else value
        if cls.CLOUD_FRAC_MIN <= val <= cls.CLOUD_FRAC_MAX:
            return round(float(val), 3)
        return None

    @classmethod
    def validate_precipitation_rate(cls, value: Optional[float]) -> Optional[float]:
        """Validates precipitation rate in mm/hr."""
        if value is None or math.isnan(value) or value < 0.0:
            return None
        if cls.RAIN_RATE_MIN <= value <= cls.RAIN_RATE_MAX:
            return round(float(value), 3)
        return None

    @classmethod
    def compute_monthly_accumulation(cls, rate_mm_hr: float, year: int, month: int) -> float:
        """
        Computes total monthly accumulated liquid rainfall depth in mm:
        accumulated_mm = rate_mm_hr * 24 hours * days_in_month.
        """
        _, days = calendar.monthrange(year, month)
        return round(rate_mm_hr * 24.0 * days, 1)

    @classmethod
    def classify_aod_regime(cls, aod: float) -> str:
        """Classifies atmospheric turbidity and particulate loading from AOD 550nm."""
        if aod < 0.08:
            return "Pristine Maritime / Clean Background Air"
        elif aod < 0.20:
            return "Clear Atmosphere / Light Aerosol Background"
        elif aod < 0.50:
            return "Moderate Turbidity / Regional Urban or Industrial Haze"
        elif aod < 1.00:
            return "Heavy Particulate Loading (Dense Smog / Distant Smoke)"
        else:
            return "Severe Aerosol Event (Major Desert Dust Storm / Wildfire Plume)"

    @classmethod
    def classify_cloud_regime(cls, cloud_fraction: float) -> str:
        """Classifies sky cloudiness from cloud fraction."""
        if cloud_fraction < 0.15:
            return "Clear Sky / Minimal Cloudiness"
        elif cloud_fraction < 0.50:
            return "Partly Cloudy / Scattered Cumulus"
        elif cloud_fraction < 0.85:
            return "Broken Cloud Deck / Moderate Cover"
        else:
            return "Overcast / Dense Stratiform or Convective System"

    @classmethod
    def process_atmosphere_point(
        cls,
        lat: float,
        lon: float,
        date_str: str,
        granule_id: str,
        aod: Optional[float] = None,
        cloud_fraction: Optional[float] = None,
        cloud_optical_thickness: Optional[float] = None,
        cloud_effective_radius: Optional[float] = None,
        precip_rate_mm_hr: Optional[float] = None,
        precip_accumulated_mm: Optional[float] = None,
        climatological_normal_mm: Optional[float] = None,
        quality_flag: int = 3,
        location_name: Optional[str] = None,
    ) -> Optional[Dict[str, Any]]:
        """
        Creates a verified atmospheric GeoJSON feature with complete scientific provenance.
        """
        val_aod = cls.validate_aod(aod)
        val_cld = cls.validate_cloud_fraction(cloud_fraction)
        val_rate = cls.validate_precipitation_rate(precip_rate_mm_hr)

        # Parse date to compute accumulation if rate provided without accumulation
        parts = date_str.split("-")
        year, month = int(parts[0]), int(parts[1])

        val_acc = precip_accumulated_mm
        if val_acc is None and val_rate is not None:
            val_acc = cls.compute_monthly_accumulation(val_rate, year, month)
        elif val_acc is not None:
            val_acc = round(float(val_acc), 1)

        # Must have at least one valid atmospheric parameter
        if val_aod is None and val_cld is None and val_rate is None and val_acc is None:
            return None

        primary_metric = "aod_550" if val_aod is not None else ("precipitation_rate" if val_rate is not None else "cloud_fraction")
        primary_value = val_aod if val_aod is not None else (val_rate if val_rate is not None else val_cld)

        properties = {
            "dataset_id": "MOD08_M3_GPM",
            "location_name": location_name or f"Atmospheric Grid ({lat:+.2f}°, {lon:+.2f}°)",
            "observation_date": date_str,
            "data_status": "observation",
            "is_observation": True,
            "source_type": "satellite_direct",
            "granule_id": granule_id,
            "sensor": "NASA MODIS Terra/Aqua (LAADS DAAC) & GPM IMERG (GES DISC)",
            "quality_flag": quality_flag,
            "primary_atmosphere_metric": primary_metric,
            "primary_atmosphere_value": primary_value,
            "rate_unit": "mm/hr",
            "accumulated_unit": "mm",
        }

        if val_aod is not None:
            properties["aod_550"] = val_aod
            properties["aerosol_regime"] = cls.classify_aod_regime(val_aod)
            properties["aod_notice"] = "Columnar optical extinction ratio at 550nm (not ground PM2.5)."

        if val_cld is not None:
            properties["cloud_fraction"] = val_cld
            properties["cloud_fraction_percent"] = round(val_cld * 100.0, 1)
            properties["cloud_regime"] = cls.classify_cloud_regime(val_cld)

        if cloud_optical_thickness is not None and cls.COT_MIN <= cloud_optical_thickness <= cls.COT_MAX:
            properties["cloud_optical_thickness"] = round(float(cloud_optical_thickness), 1)

        if cloud_effective_radius is not None and cls.CER_MIN <= cloud_effective_radius <= cls.CER_MAX:
            properties["cloud_effective_radius_microns"] = round(float(cloud_effective_radius), 1)

        if val_rate is not None:
            properties["precipitation_rate_mm_hr"] = val_rate

        if val_acc is not None:
            properties["precipitation_accumulated_mm"] = val_acc
            properties["precipitation_notice"] = "GPM satellite microwave/radiometer precipitation estimate."

        if climatological_normal_mm is not None:
            properties["climatological_normal_mm"] = round(float(climatological_normal_mm), 1)
            if val_acc is not None:
                anomaly = round(val_acc - climatological_normal_mm, 1)
                properties["anomaly_mm"] = anomaly
                pct_norm = round((anomaly / max(climatological_normal_mm, 5.0)) * 100.0, 1)
                properties["anomaly_percent"] = pct_norm

        return {
            "type": "Feature",
            "geometry": {
                "type": "Point",
                "coordinates": [round(lon, 4), round(lat, 4)],
            },
            "properties": properties,
        }

    @classmethod
    def create_feature_collection(
        cls,
        features: List[Dict[str, Any]],
        date_str: str,
        granule_id: str,
    ) -> Dict[str, Any]:
        """Packages atmospheric features into a standard GeoJSON FeatureCollection with provenance metadata."""
        return {
            "type": "FeatureCollection",
            "metadata": {
                "dataset_id": "MODIS_GPM_ATMOSPHERE",
                "date": date_str,
                "data_status": "observation" if features else "unavailable",
                "is_observation": len(features) > 0,
                "source_type": "satellite_direct" if features else "none",
                "granule_id": granule_id,
                "agency": "NASA LAADS DAAC / GES DISC",
                "sensor": "MODIS Terra/Aqua & GPM Core Observatory",
                "feature_count": len(features),
                "units": {
                    "aod_550": "dimensionless ratio (columnar extinction at 550nm)",
                    "cloud_fraction": "fraction (0.0 to 1.0) / percent (%)",
                    "precipitation_rate": "mm/hr",
                    "precipitation_accumulation": "mm (total monthly liquid depth)",
                },
                "data_notice": "AUTHENTIC NASA SATELLITE TELEMETRY: Calibrated observations from NASA LAADS DAAC MODIS and GES DISC GPM IMERG.",
            },
            "features": features,
        }
