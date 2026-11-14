from typing import Dict, Any, Optional, List
from app.schemas.scientific import (
    PeriodComparisonResponse,
    PeriodObservation,
    RegionalDiffPoint,
)
from app.services.atmosphere_service import AtmosphereService
from app.services.ocean_service import OceanService
from app.services.land_service import LandService


class ComparisonService:
    """
    Scientific service for comparing Earth system observations across two historical periods (Period A vs Period B).
    Respects physical units, computes absolute differences and valid percentage changes,
    and provides regional geographic difference arrays with grounded scientific interpretations.
    """

    @classmethod
    def compare_periods(
        cls,
        module: str,
        period_a: str,
        period_b: str,
        latitude: float = 0.0,
        longitude: float = 0.0,
    ) -> PeriodComparisonResponse:
        mod = module.lower().strip()
        if mod == "atmosphere":
            return cls._compare_atmosphere(period_a, period_b, latitude, longitude)
        elif mod == "ocean":
            return cls._compare_ocean(period_a, period_b, latitude, longitude)
        elif mod == "land":
            return cls._compare_land(period_a, period_b, latitude, longitude)
        else:
            raise ValueError(f"Unsupported module '{module}'. Choose 'atmosphere', 'ocean', or 'land'.")

    @classmethod
    def _compare_atmosphere(
        cls,
        period_a: str,
        period_b: str,
        lat: float,
        lon: float,
    ) -> PeriodComparisonResponse:
        ts = AtmosphereService.get_timeseries(latitude=lat, longitude=lon, start_year=2024, end_year=2026)
        pts_by_date = {p.date: p for p in ts.timeseries}

        pt_a = pts_by_date.get(period_a) or ts.timeseries[0]
        pt_b = pts_by_date.get(period_b) or ts.timeseries[-1]

        val_a = pt_a.precipitation_accumulated_mm
        val_b = pt_b.precipitation_accumulated_mm
        abs_diff = round(val_b - val_a, 2)

        # Percentage difference calculation with division-by-zero protection
        pct_diff: Optional[float] = None
        pct_meaningful = True
        pct_note = None

        if val_a >= 1.0:
            pct_diff = round(((val_b - val_a) / val_a) * 100.0, 1)
        else:
            pct_meaningful = False
            pct_note = (
                f"Base precipitation in {pt_a.date} is near zero ({val_a:.1f} mm); "
                "percentage change is numerically ill-conditioned. Absolute depth difference (mm) is authoritative."
            )

        # Regional differences across standard GPM benchmark locations
        regional_diffs: List[RegionalDiffPoint] = []
        for reg in AtmosphereService.ATMOSPHERE_REGIONS[:5]:
            reg_ts = AtmosphereService.get_timeseries(reg["lat"], reg["lon"], 2024, 2026)
            reg_pts = {p.date: p for p in reg_ts.timeseries}
            r_a = reg_pts.get(period_a, reg_ts.timeseries[0]).precipitation_accumulated_mm
            r_b = reg_pts.get(period_b, reg_ts.timeseries[-1]).precipitation_accumulated_mm
            delta = round(r_b - r_a, 1)
            if delta > 0:
                interp = f"Precipitation surplus of {delta:.1f} mm relative to {period_a}"
            elif delta < 0:
                interp = f"Precipitation deficit of {abs(delta):.1f} mm relative to {period_a}"
            else:
                interp = f"Precipitation unchanged relative to {period_a}"
            regional_diffs.append(
                RegionalDiffPoint(
                    name=reg["name"],
                    latitude=reg["lat"],
                    longitude=reg["lon"],
                    value_a=r_a,
                    value_b=r_b,
                    delta=delta,
                    unit="mm",
                    interpretation=interp,
                )
            )

        direction = "surplus" if abs_diff >= 0 else "reduction"
        interpretation = (
            f"Precipitation exhibited a net {direction} of {abs(abs_diff):.1f} mm "
            f"({'+' if (pct_diff or 0) > 0 else ''}{pct_diff if pct_diff is not None else 'N/A'}%) "
            f"from {pt_a.date} to {pt_b.date} at {ts.location_name}. "
            f"Observations correspond to NASA GPM IMERG Final monthly calibration (GPM_3IMERGM)."
        )

        return PeriodComparisonResponse(
            module="atmosphere",
            period_a=pt_a.date,
            period_b=pt_b.date,
            location_name=ts.location_name,
            latitude=lat,
            longitude=lon,
            unit="mm",
            metric_label="Monthly Accumulated Precipitation",
            observation_a=PeriodObservation(
                date=pt_a.date,
                value=val_a,
                unit="mm",
                normal_or_baseline=pt_a.climatological_normal_mm,
                anomaly=pt_a.anomaly_mm,
                metadata={"rate_mm_hr": pt_a.precipitation_rate_mm_hr},
            ),
            observation_b=PeriodObservation(
                date=pt_b.date,
                value=val_b,
                unit="mm",
                normal_or_baseline=pt_b.climatological_normal_mm,
                anomaly=pt_b.anomaly_mm,
                metadata={"rate_mm_hr": pt_b.precipitation_rate_mm_hr},
            ),
            absolute_difference=abs_diff,
            percentage_difference=pct_diff,
            percentage_meaningful=pct_meaningful,
            percentage_note=pct_note,
            interpretation=interpretation,
            regional_differences=regional_diffs,
        )

    @classmethod
    def _compare_ocean(
        cls,
        period_a: str,
        period_b: str,
        lat: float,
        lon: float,
    ) -> PeriodComparisonResponse:
        ts = OceanService.get_timeseries(latitude=lat, longitude=lon, start_year=2024, end_year=2026)
        pts_by_date = {p.date: p for p in ts.timeseries}

        pt_a = pts_by_date.get(period_a) or ts.timeseries[0]
        pt_b = pts_by_date.get(period_b) or ts.timeseries[-1]

        val_a = pt_a.ssha_mean_m
        val_b = pt_b.ssha_mean_m
        abs_diff = round(val_b - val_a, 4)

        # SSHA is centered at 0m; percentage difference across zero is mathematically ill-posed
        pct_meaningful = False
        pct_note = (
            "Sea Surface Height Anomaly (SSHA) is an anomaly departure centered around 0.0 m. "
            "Percentage change of an anomaly across zero is non-physical; absolute shift ΔSSHA (in meters or cm) "
            "is the authoritative oceanographic metric."
        )

        regional_diffs: List[RegionalDiffPoint] = []
        for reg in OceanService.OCEAN_REGIONS[:5]:
            reg_ts = OceanService.get_timeseries(reg["lat"], reg["lon"], 2024, 2026)
            reg_pts = {p.date: p for p in reg_ts.timeseries}
            r_a = reg_pts.get(period_a, reg_ts.timeseries[0]).ssha_mean_m
            r_b = reg_pts.get(period_b, reg_ts.timeseries[-1]).ssha_mean_m
            delta = round(r_b - r_a, 4)
            if delta > 0:
                interp = f"Altimetric sea level elevation of {delta * 100.0:+.1f} cm"
            elif delta < 0:
                interp = f"Altimetric sea level depression of {abs(delta * 100.0):.1f} cm"
            else:
                interp = "Stable sea level (Δ = 0.0 cm)"
            regional_diffs.append(
                RegionalDiffPoint(
                    name=reg["name"],
                    latitude=reg["lat"],
                    longitude=reg["lon"],
                    value_a=r_a,
                    value_b=r_b,
                    delta=delta,
                    unit="m",
                    interpretation=interp,
                )
            )

        cm_shift = abs_diff * 100.0
        shift_desc = "steady sea level" if abs_diff == 0 else ("rise / thermal expansion" if abs_diff > 0 else "depression / upwelling cooling")
        interpretation = (
            f"Sea Surface Height Anomaly shifted by {abs_diff:+.4f} m ({cm_shift:+.1f} cm) "
            f"from {pt_a.date} to {pt_b.date} in {ts.region_name}, indicating localized {shift_desc}. "
            f"Measured via NASA/CNES SWOT KaRIn Ka-band radar interferometer (precision ±2.4 cm)."
        )

        return PeriodComparisonResponse(
            module="ocean",
            period_a=pt_a.date,
            period_b=pt_b.date,
            location_name=ts.region_name,
            latitude=lat,
            longitude=lon,
            unit="m",
            metric_label="Sea Surface Height Anomaly (SSHA)",
            observation_a=PeriodObservation(
                date=pt_a.date,
                value=val_a,
                unit="m",
                normal_or_baseline=0.0,
                anomaly=val_a,
                metadata={"ssha_max_m": pt_a.ssha_max_m, "ssha_min_m": pt_a.ssha_min_m},
            ),
            observation_b=PeriodObservation(
                date=pt_b.date,
                value=val_b,
                unit="m",
                normal_or_baseline=0.0,
                anomaly=val_b,
                metadata={"ssha_max_m": pt_b.ssha_max_m, "ssha_min_m": pt_b.ssha_min_m},
            ),
            absolute_difference=abs_diff,
            percentage_difference=None,
            percentage_meaningful=pct_meaningful,
            percentage_note=pct_note,
            interpretation=interpretation,
            regional_differences=regional_diffs,
        )

    @classmethod
    def _compare_land(
        cls,
        period_a: str,
        period_b: str,
        lat: float,
        lon: float,
    ) -> PeriodComparisonResponse:
        ts = LandService.get_timeseries(latitude=lat, longitude=lon, start_year=2024, end_year=2026)
        pts_by_date = {p.date: p for p in ts.timeseries}

        pt_a = pts_by_date.get(period_a) or ts.timeseries[0]
        pt_b = pts_by_date.get(period_b) or ts.timeseries[-1]

        val_a = pt_a.ndvi
        val_b = pt_b.ndvi
        abs_diff = round(val_b - val_a, 3)

        pct_diff: Optional[float] = None
        pct_meaningful = True
        pct_note = None

        if val_a >= 0.05:
            pct_diff = round(((val_b - val_a) / val_a) * 100.0, 1)
        else:
            pct_meaningful = False
            pct_note = (
                f"Base NDVI in {pt_a.date} is near zero ({val_a:.3f}) indicating barren or desert substrate; "
                "ratio percentage is mathematically unstable. Absolute index change ΔNDVI is standard."
            )

        regional_diffs: List[RegionalDiffPoint] = []
        for reg in LandService.LAND_REGIONS[:5]:
            reg_ts = LandService.get_timeseries(reg["lat"], reg["lon"], 2024, 2026)
            reg_pts = {p.date: p for p in reg_ts.timeseries}
            r_a = reg_pts.get(period_a, reg_ts.timeseries[0]).ndvi
            r_b = reg_pts.get(period_b, reg_ts.timeseries[-1]).ndvi
            delta = round(r_b - r_a, 3)
            if delta > 0:
                interp = f"Canopy greening of {delta:+.3f} ΔNDVI"
            elif delta < 0:
                interp = f"Canopy browning / senescence of {abs(delta):.3f} ΔNDVI"
            else:
                interp = "Stable canopy density (Δ 0.000)"
            regional_diffs.append(
                RegionalDiffPoint(
                    name=reg["name"],
                    latitude=reg["lat"],
                    longitude=reg["lon"],
                    value_a=r_a,
                    value_b=r_b,
                    delta=delta,
                    unit="NDVI",
                    interpretation=interp,
                )
            )

        green_desc = "steady canopy state" if abs_diff == 0 else ("canopy greening / photosynthetic expansion" if abs_diff > 0 else "vegetation browning / moisture stress")
        interpretation = (
            f"Canopy vegetation vigor exhibited {abs_diff:+.3f} ΔNDVI "
            f"({'+' if (pct_diff or 0) > 0 else ''}{pct_diff if pct_diff is not None else 'N/A'}%) "
            f"from {pt_a.date} to {pt_b.date} across {ts.region_name}, reflecting {green_desc}. "
            f"Derived from NASA MODIS Terra/Aqua 16-day composite surface reflectance (MOD13C2 v6.1)."
        )

        return PeriodComparisonResponse(
            module="land",
            period_a=pt_a.date,
            period_b=pt_b.date,
            location_name=ts.region_name,
            latitude=lat,
            longitude=lon,
            unit="NDVI",
            metric_label="Normalized Difference Vegetation Index (NDVI)",
            observation_a=PeriodObservation(
                date=pt_a.date,
                value=val_a,
                unit="NDVI",
                normal_or_baseline=pt_a.historical_ndvi_median,
                anomaly=pt_a.ndvi_anomaly,
                metadata={"evi": pt_a.evi},
            ),
            observation_b=PeriodObservation(
                date=pt_b.date,
                value=val_b,
                unit="NDVI",
                normal_or_baseline=pt_b.historical_ndvi_median,
                anomaly=pt_b.ndvi_anomaly,
                metadata={"evi": pt_b.evi},
            ),
            absolute_difference=abs_diff,
            percentage_difference=pct_diff,
            percentage_meaningful=pct_meaningful,
            percentage_note=pct_note,
            interpretation=interpretation,
            regional_differences=regional_diffs,
        )
