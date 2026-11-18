"""
Scientific Analytics Engine for TerraLens.
Provides rigorous calculations for:
- Historical climatological baselines and anomaly detection.
- Physical unit integrity (e.g. GPM rate mm/hr vs accumulated mm).
- Percentage change safeguards against division-by-zero and ill-conditioned scales.
- Teleconnection correlation vs. causation validation.
"""

from typing import Dict, Any, Optional, Tuple
import calendar


class ScientificAnalytics:
    """Scientific calculations, anomaly scoring, and unit validation."""

    @staticmethod
    def calculate_accumulated_precipitation(rate_mm_per_hr: float, year: int, month: int) -> float:
        """
        Converts instantaneous/average precipitation rate (mm/hr) to monthly accumulated depth (mm).
        Formula: depth (mm) = rate (mm/hr) * 24 hours * days_in_month.
        """
        _, days = calendar.monthrange(year, month)
        accum = rate_mm_per_hr * 24.0 * days
        return round(accum, 2)

    @staticmethod
    def calculate_precipitation_rate(accumulated_mm: float, year: int, month: int) -> float:
        """Converts monthly accumulated depth (mm) back to average hourly rate (mm/hr)."""
        _, days = calendar.monthrange(year, month)
        rate = accumulated_mm / (24.0 * days)
        return round(rate, 4)

    @staticmethod
    def compute_anomaly(
        observed_value: float,
        baseline_value: float,
        std_dev: Optional[float] = None
    ) -> Dict[str, Any]:
        """
        Computes absolute anomaly and optional z-score relative to a multi-year climatological normal.
        """
        abs_anomaly = round(observed_value - baseline_value, 4)
        z_score: Optional[float] = None
        severity = "normal"

        if std_dev and std_dev > 1e-6:
            z_score = round(abs_anomaly / std_dev, 2)
            if abs(z_score) >= 2.5:
                severity = "extreme"
            elif abs(z_score) >= 1.5:
                severity = "moderate"
            elif abs(z_score) >= 0.8:
                severity = "mild"

        return {
            "observed": observed_value,
            "baseline": baseline_value,
            "absolute_anomaly": abs_anomaly,
            "z_score": z_score,
            "anomaly_level": severity,
            "direction": "positive" if abs_anomaly > 0 else ("negative" if abs_anomaly < 0 else "zero"),
        }

    @staticmethod
    def compute_difference_and_percentage(
        value_a: float,
        value_b: float,
        metric_name: str,
        unit: str,
        min_meaningful_baseline: float = 1.0,
    ) -> Dict[str, Any]:
        """
        Computes absolute and percentage difference with physical guards.
        Avoids misleading percentage calculations for near-zero or dimensionless numbers.
        """
        abs_diff = round(value_b - value_a, 4)
        pct_diff: Optional[float] = None
        meaningful = True
        note: Optional[str] = None

        # Check for near-zero baseline
        if abs(value_a) < min_meaningful_baseline:
            meaningful = False
            pct_diff = None
            note = (
                f"Base value for {metric_name} ({value_a} {unit}) is near zero (< {min_meaningful_baseline} {unit}); "
                f"percentage change is numerically unstable. Absolute difference of {abs_diff:+} {unit} is authoritative."
            )
        else:
            pct_diff = round(((value_b - value_a) / abs(value_a)) * 100.0, 1)

        return {
            "absolute_difference": abs_diff,
            "percentage_difference": pct_diff,
            "percentage_meaningful": meaningful,
            "percentage_note": note,
            "unit": unit,
        }

    @staticmethod
    def audit_correlation_vs_causation(text: str) -> Optional[str]:
        """
        Inspects text for causal claims between teleconnected earth systems (e.g. ocean to land)
        and returns a scientific correction notice if direct causation was asserted.
        """
        text_lower = text.lower()
        causal_triggers = [
            "caused the drought", "directly caused", "proves that ocean height causes",
            "is the sole cause of", "causes rainfall to drop in"
        ]
        has_causal_claim = any(trigger in text_lower for trigger in causal_triggers)
        if has_causal_claim:
            return (
                "SCIENTIFIC NOTICE ON TELECONNECTIONS: Statistical correlation between ocean anomalies (e.g. Pacific SSHA) "
                "and terrestrial impacts (e.g. Amazon NDVI) reflects planetary wave coupling, not direct mechanical causation. "
                "Local hydrological memory, soil characteristics, and microtopography govern ground outcomes."
            )
        return None

    @staticmethod
    def classify_ocean_eddy(ssha_m: float) -> Tuple[str, str]:
        """
        Classifies SWOT ocean altimetry signature based on SSHA departure.
        Returns (eddy_type, scientific_description).
        """
        if ssha_m >= 0.10:
            return (
                "Warm-Core Anticyclonic Eddy",
                "Positive sea surface height anomaly indicates downwelling, clockwise circulation in Northern Hemisphere, and elevated heat content."
            )
        elif ssha_m <= -0.10:
            return (
                "Cold-Core Cyclonic Eddy",
                "Negative sea surface height anomaly indicates divergent upwelling, counter-clockwise rotation in Northern Hemisphere, and nutrient enrichment."
            )
        else:
            return (
                "Laminar / Neutral Dynamic Flow",
                "Nominal sea level within expected background variability."
            )
