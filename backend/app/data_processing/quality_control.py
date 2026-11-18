"""
Scientific Quality Control and Validation Engine for PlanetIQ.
Implements authoritative physical bounds checking, sensor scaling, quality bitmask decoding,
unit validation, and numerical safeguards across Land, Atmosphere, and Ocean products.
"""

from typing import Dict, Any, Tuple, Optional
import calendar
import logging

logger = logging.getLogger("planetiq.quality_control")


class QualityControl:
    """Rigorous scientific quality control filters and conversions."""

    # --- MODIS MOD13C2 Constants & Decoders ---
    MODIS_NDVI_SCALE_FACTOR = 0.0001
    MODIS_NDVI_FILL_VALUE = -3000
    MODIS_NDVI_VALID_MIN = -2000  # Raw scale: -0.2000
    MODIS_NDVI_VALID_MAX = 10000  # Raw scale: +1.0000

    @classmethod
    def decode_raw_modis_ndvi(cls, raw_value: int) -> Tuple[bool, Optional[float]]:
        """
        Applies NASA LP DAAC scale factor (0.0001) to 16-bit signed integer.
        Returns (is_valid, decoded_ndvi).
        """
        if raw_value == cls.MODIS_NDVI_FILL_VALUE:
            return False, None
        if raw_value < cls.MODIS_NDVI_VALID_MIN or raw_value > cls.MODIS_NDVI_VALID_MAX:
            return False, None

        scaled = round(raw_value * cls.MODIS_NDVI_SCALE_FACTOR, 4)
        return True, scaled

    @classmethod
    def decode_modis_pixel_reliability(cls, reliability_flag: int) -> Dict[str, Any]:
        """
        Decodes MODIS MOD13C2 Monthly Pixel Reliability (int8):
        -1: Fill/NoData
         0: Good Data (use with confidence)
         1: Marginal Data (useful, check QA)
         2: Snow / Ice (target covered with snow/ice)
         3: Cloudy (target covered with clouds)
        """
        mapping = {
            -1: {"category": "Fill/NoData", "usable": False, "confidence": 0.0, "code": -1},
            0: {"category": "Good Data (Reliable)", "usable": True, "confidence": 1.0, "code": 0},
            1: {"category": "Marginal Quality (Usable with Caution)", "usable": True, "confidence": 0.65, "code": 1},
            2: {"category": "Snow / Ice Covered", "usable": False, "confidence": 0.20, "code": 2},
            3: {"category": "Cloud Contaminated", "usable": False, "confidence": 0.0, "code": 3},
        }
        return mapping.get(
            reliability_flag,
            {"category": f"Unknown Flag ({reliability_flag})", "usable": False, "confidence": 0.0, "code": reliability_flag}
        )

    @classmethod
    def calculate_vci(
        cls,
        ndvi: float,
        historical_min: Optional[float] = None,
        historical_max: Optional[float] = None,
    ) -> Optional[float]:
        """
        Calculates Vegetation Condition Index (VCI %):
        VCI = 100 * (NDVI - NDVI_min) / (NDVI_max - NDVI_min)
        Requires verified historical min and max climatological baseline bounds.
        If baseline bounds are missing or spread <= 0.001, returns None (unavailable).
        Never synthesizes a baseline or returns arbitrary constants.
        """
        if historical_min is None or historical_max is None:
            return None
        spread = historical_max - historical_min
        if spread <= 0.001:
            return None

        raw_vci = ((ndvi - historical_min) / spread) * 100.0
        return max(0.0, min(100.0, round(raw_vci, 1)))

    @classmethod
    def classify_drought_vci(cls, vci: Optional[float]) -> str:
        """Categorizes VCI into agricultural and ecological drought severity."""
        if vci is None:
            return "Climatological Baseline Unavailable"
        if vci < 20.0:
            return "Extreme Vegetation Stress (Severe Agricultural Drought)"
        elif vci < 35.0:
            return "Moderate Vegetation Stress (Moisture Deficit)"
        elif vci <= 65.0:
            return "Normal Vegetative Vigor"
        else:
            return "Optimal / Abundant Canopy Growth"

    # --- Atmosphere (GPM IMERG) Quality Control ---

    @classmethod
    def calculate_accumulated_precipitation(cls, rate_mm_hr: float, year: int, month: int) -> float:
        """
        Enforces physical law:
        Monthly Accumulated Liquid Depth (mm) = Precipitation Rate (mm/hr) * 24 hours * days_in_month.
        """
        _, days = calendar.monthrange(year, month)
        hours = days * 24.0
        return round(rate_mm_hr * hours, 2)

    @classmethod
    def calculate_precipitation_rate(cls, accumulated_mm: float, year: int, month: int) -> float:
        """Derives hourly rate from monthly accumulation."""
        _, days = calendar.monthrange(year, month)
        hours = days * 24.0
        return round(accumulated_mm / hours, 4)

    @classmethod
    def validate_precipitation_rate(cls, rate_mm_hr: float) -> bool:
        """Validates that rate is physically non-negative and below extreme deluge threshold."""
        return 0.0 <= rate_mm_hr <= 150.0

    # --- Ocean (SWOT SSH) Quality Control ---

    @classmethod
    def validate_ssha(cls, ssha_m: float) -> bool:
        """Validates that Sea Surface Height Anomaly is within physical ocean limits (+/- 2.5m)."""
        return abs(ssha_m) <= 2.5

    @classmethod
    def classify_ocean_eddy(cls, ssha_m: float) -> Tuple[str, str]:
        """
        Categorizes mesoscale eddy vorticity:
        - Anticyclonic (warm core): positive SSHA (> +0.08 m), downward pycnocline depression
        - Cyclonic (cold core): negative SSHA (< -0.08 m), upward pycnocline doming / nutrient upwelling
        - Neutral / Laminar: within +/- 0.08 m
        """
        if ssha_m > 0.08:
            return (
                "anticyclonic_warm_core",
                "Anticyclonic warm-core eddy: downwelling convergent core with elevated steric sea height."
            )
        elif ssha_m < -0.08:
            return (
                "cyclonic_cold_core",
                "Cyclonic cold-core eddy: divergent upwelling core with depressed sea surface height and nutrient enhancement."
            )
        else:
            return (
                "neutral_laminar",
                "Laminar / transition zone: geostrophic flow without dominant mesoscale eddy vorticity."
            )

    # --- Comparative Analytics Guardrails ---

    @classmethod
    def compute_difference_and_percentage(
        cls,
        value_a: float,
        value_b: float,
        metric_name: str = "Metric",
        unit: str = "units",
        threshold: float = 1.0,
    ) -> Dict[str, Any]:
        """
        Calculates absolute difference and guarded percentage change.
        Prevents misleading percentage blow-ups when baseline value_a is near zero.
        """
        abs_diff = round(value_b - value_a, 4)
        if abs(value_a) < threshold:
            return {
                "metric": metric_name,
                "unit": unit,
                "value_a": value_a,
                "value_b": value_b,
                "absolute_difference": abs_diff,
                "percentage_difference": None,
                "percentage_meaningful": False,
                "percentage_note": (
                    f"Baseline {value_a} {unit} is near zero (< {threshold}); "
                    "percentage change is mathematically unbounded and scientifically misleading. "
                    f"Refer to absolute change: {abs_diff:+.3f} {unit}."
                ),
            }

        pct_change = round(((value_b - value_a) / abs(value_a)) * 100.0, 2)
        return {
            "metric": metric_name,
            "unit": unit,
            "value_a": value_a,
            "value_b": value_b,
            "absolute_difference": abs_diff,
            "percentage_difference": pct_change,
            "percentage_meaningful": True,
            "percentage_note": f"{pct_change:+.1f}% change relative to baseline {value_a} {unit}.",
        }
