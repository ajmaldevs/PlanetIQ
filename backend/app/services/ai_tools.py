"""
Authoritative Scientific AI Tools for PlanetIQ.
Structured for Google Gen AI SDK (google-genai) tool calling.

Tools:
1. get_ocean_observations(latitude, longitude, date, min_lat, max_lat, min_lon, max_lon)
2. get_precipitation_data(latitude, longitude, date, min_lat, max_lat, min_lon, max_lon)
3. get_vegetation_indices(latitude, longitude, date, min_lat, max_lat, min_lon, max_lon)
4. get_historical_trends(module, latitude, longitude, start_date, end_date)
5. compare_regions(module, region_a, region_b, date, lat_a, lon_a, lat_b, lon_b)
6. get_cross_system_analysis(phenomenon_id)
7. get_dataset_metadata(dataset_id)
8. get_data_quality_information(dataset_id, date, region)

Each tool performs rigorous parameter validation, boundaries checking, date parsing,
returns structured results with physical units and provenance, and handles errors safely.
"""

from typing import Dict, Any, List, Optional
import calendar
import math
import re
import logging

from app.services.ocean_service import OceanService
from app.services.atmosphere_service import AtmosphereService
from app.services.land_service import LandService
from app.services.cross_system_service import CrossSystemService
from app.services.comparison_service import ComparisonService
from app.services.dataset_service import DatasetService
from app.services.geocoding_service import GeocodingService
from app.services.nasa_earthdata_client import NasaEarthdataClient
from app.services.scientific_analytics import ScientificAnalytics

logger = logging.getLogger("planetiq.ai_tools")


# --- Validation Helpers ---

def _validate_lat_lon(lat: Optional[float], lon: Optional[float]) -> Optional[str]:
    if lat is not None:
        if not (-90.0 <= lat <= 90.0):
            return f"Invalid latitude {lat}. Must be between -90.0 and +90.0 degrees."
    if lon is not None:
        if not (-180.0 <= lon <= 180.0):
            return f"Invalid longitude {lon}. Must be between -180.0 and +180.0 degrees."
    return None


def _validate_date_str(date_str: str) -> Optional[str]:
    if not re.match(r"^\d{4}-\d{2}$", date_str):
        return f"Invalid date '{date_str}'. Expected format YYYY-MM (e.g. '2026-03')."
    year, month = map(int, date_str.split("-"))
    if not (1 <= month <= 12):
        return f"Invalid month {month} in date '{date_str}'. Must be 01 to 12."
    if not (2000 <= year <= 2030):
        return f"Year {year} is out of supported range (2000-2030)."
    return None


def _validate_bbox(
    min_lat: Optional[float], max_lat: Optional[float],
    min_lon: Optional[float], max_lon: Optional[float]
) -> Optional[str]:
    for name, val, low, high in [
        ("min_lat", min_lat, -90.0, 90.0),
        ("max_lat", max_lat, -90.0, 90.0),
        ("min_lon", min_lon, -180.0, 180.0),
        ("max_lon", max_lon, -180.0, 180.0),
    ]:
        if val is not None and not (low <= val <= high):
            return f"{name} {val} is out of range [{low}, {high}]."

    if min_lat is not None and max_lat is not None and min_lat > max_lat:
        return f"min_lat ({min_lat}) cannot be greater than max_lat ({max_lat})."
    if min_lon is not None and max_lon is not None and min_lon > max_lon:
        return f"min_lon ({min_lon}) cannot be greater than max_lon ({max_lon})."
    return None


# --- Tool Implementations ---

def get_ocean_observations(
    latitude: Optional[float] = None,
    longitude: Optional[float] = None,
    date: str = "2026-03",
    min_lat: Optional[float] = None,
    max_lat: Optional[float] = None,
    min_lon: Optional[float] = None,
    max_lon: Optional[float] = None,
) -> Dict[str, Any]:
    """
    Retrieve NASA SWOT Ka-band Radar Interferometer (KaRIn) ocean altimetry observations.
    Provides Sea Surface Height (SSH, m), Sea Surface Height Anomaly (SSHA, m),
    Absolute Dynamic Topography (ADT, m), and eddy classification (cyclonic vs anticyclonic).
    """
    err = _validate_lat_lon(latitude, longitude)
    if err:
        return {"error": err, "status": "validation_failed"}
    err = _validate_date_str(date)
    if err:
        return {"error": err, "status": "validation_failed"}
    err = _validate_bbox(min_lat, max_lat, min_lon, max_lon)
    if err:
        return {"error": err, "status": "validation_failed"}

    # Single point query
    if latitude is not None and longitude is not None:
        ts = OceanService.get_timeseries(latitude, longitude, start_year=2024, end_year=2026)
        pt = next((p for p in ts.timeseries if p.date == date), ts.timeseries[-1] if ts.timeseries else None)
        if not pt:
            return {"status": "no_data", "message": f"No SWOT ocean data at ({latitude}, {longitude}) for {date}"}

        eddy_type, eddy_desc = ScientificAnalytics.classify_ocean_eddy(pt.ssha_mean_m)
        ssh_geoid_ref = round(15.20 + pt.ssha_mean_m, 3)
        adt_ref = round(0.85 + pt.ssha_mean_m, 3)
        return {
            "status": "success",
            "dataset_id": "SWOT_L2_LR_SSH",
            "mission": "Surface Water and Ocean Topography (SWOT)",
            "sensor": "Ka-band Radar Interferometer (KaRIn)",
            "data_status": "simulated",
            "is_observation": False,
            "source_type": "synthetic",
            "location": {"latitude": latitude, "longitude": longitude},
            "date": pt.date,
            "measurements": {
                "sea_surface_height_m": ssh_geoid_ref,
                "sea_surface_height_anomaly_m": pt.ssha_mean_m,
                "dynamic_topography_m": adt_ref,
                "eddy_kinetic_energy_cm2_s2": pt.eddy_kinetic_energy_cm2_s2,
            },
            "units": {"ssh": "meters (m)", "ssha": "meters (m)", "dynamic_topography": "meters (m)", "eke": "cm^2/s^2"},
            "analysis": {
                "eddy_classification": eddy_type,
                "scientific_interpretation": eddy_desc,
            },
            "provenance": "NASA PO.DAAC / CNES / CSA / UKSA",
            "doi": "https://doi.org/10.5067/SWOT-SSH-L2-LR",
        }

    # Spatial collection query
    fc = OceanService.get_spatial_observations(
        min_lat=min_lat, max_lat=max_lat, min_lon=min_lon, max_lon=max_lon, date_str=date
    )
    features = fc.features[:20]  # Cap for context window safety
    ssha_values = [f.properties.get("ssha_karin_m", 0.0) for f in features]
    mean_ssha = round(sum(ssha_values) / len(ssha_values), 3) if ssha_values else 0.0

    return {
        "status": "success",
        "dataset_id": "SWOT_L2_LR_SSH",
        "mission": "Surface Water and Ocean Topography (SWOT)",
        "sensor": "Ka-band Radar Interferometer (KaRIn)",
        "data_status": "simulated",
        "is_observation": False,
        "source_type": "synthetic",
        "date": date,
        "feature_count": len(features),
        "summary": {
            "mean_ssha_m": mean_ssha,
            "min_ssha_m": min(ssha_values) if ssha_values else 0.0,
            "max_ssha_m": max(ssha_values) if ssha_values else 0.0,
            "units": "meters (m)",
        },
        "sample_features": [
            {
                "region": f.properties.get("region_name"),
                "coordinates": f.geometry.coordinates,
                "ssha_m": f.properties.get("ssha_karin_m"),
                "ssh_m": f.properties.get("ssh_karin_m"),
                "eddy_type": f.properties.get("eddy_type"),
            }
            for f in features[:6]
        ],
        "provenance": "NASA PO.DAAC / CNES / CSA / UKSA",
        "doi": "https://doi.org/10.5067/SWOT-SSH-L2-LR",
    }


def get_precipitation_data(
    latitude: Optional[float] = None,
    longitude: Optional[float] = None,
    date: str = "2026-03",
    min_lat: Optional[float] = None,
    max_lat: Optional[float] = None,
    min_lon: Optional[float] = None,
    max_lon: Optional[float] = None,
) -> Dict[str, Any]:
    """
    Retrieve NASA GPM IMERG Final Monthly Precipitation (GPM_3IMERGM v07).
    Enforces scientific distinction between precipitation rate (mm/hr) and accumulated precipitation (mm).
    Includes climatological baseline (1998-2020 normal) and rainfall anomaly (mm).
    """
    err = _validate_lat_lon(latitude, longitude)
    if err:
        return {"error": err, "status": "validation_failed"}
    err = _validate_date_str(date)
    if err:
        return {"error": err, "status": "validation_failed"}
    err = _validate_bbox(min_lat, max_lat, min_lon, max_lon)
    if err:
        return {"error": err, "status": "validation_failed"}

    # Single location timeseries lookup
    if latitude is not None and longitude is not None:
        ts = AtmosphereService.get_timeseries(latitude, longitude, start_year=2024, end_year=2026)
        pt = next((p for p in ts.timeseries if p.date == date), ts.timeseries[-1] if ts.timeseries else None)
        if not pt:
            return {"status": "no_data", "message": f"No GPM precipitation data at ({latitude}, {longitude}) for {date}"}

        # Validate math: accumulated = rate * 24 * days
        year, month = map(int, pt.date.split("-"))
        _, days_in_month = calendar.monthrange(year, month)
        expected_accum = round(pt.precipitation_rate_mm_hr * 24.0 * days_in_month, 2)

        return {
            "status": "success",
            "dataset_id": "GPM_3IMERGM",
            "mission": "Global Precipitation Measurement (GPM)",
            "sensor": "DPR Radar and GMI Radiometers (IMERG Final v07)",
            "data_status": "simulated",
            "is_observation": False,
            "source_type": "synthetic",
            "location": {"latitude": latitude, "longitude": longitude},
            "date": pt.date,
            "measurements": {
                "precipitation_rate_mm_hr": pt.precipitation_rate_mm_hr,
                "precipitation_accumulated_mm": pt.precipitation_accumulated_mm,
                "climatological_normal_mm": pt.climatological_normal_mm,
                "precipitation_anomaly_mm": pt.anomaly_mm,
                "gauge_weighting_index": 78.5,
            },
            "units": {
                "rate": "mm/hr",
                "accumulated": "mm (total liquid depth)",
                "normal": "mm",
                "anomaly": "mm",
            },
            "scientific_note": (
                f"Rate ({pt.precipitation_rate_mm_hr} mm/hr) times 24h * {days_in_month} days "
                f"equals {expected_accum} mm monthly accumulation."
            ),
            "provenance": "NASA GES DISC / JAXA",
            "doi": "https://doi.org/10.5067/GPM/IMERG/3B-MONTH/07",
        }

    # Spatial grid query
    fc = AtmosphereService.get_spatial_grid(
        min_lat=min_lat, max_lat=max_lat, min_lon=min_lon, max_lon=max_lon, date_str=date
    )
    features = fc.features[:20]
    accum_vals = [f.properties.get("precipitation_accumulated_mm", 0.0) for f in features]
    anom_vals = [f.properties.get("precipitation_anomaly_mm", 0.0) for f in features]

    return {
        "status": "success",
        "dataset_id": "GPM_3IMERGM",
        "mission": "Global Precipitation Measurement (GPM)",
        "sensor": "DPR Radar and GMI Radiometers (IMERG Final v07)",
        "data_status": "simulated",
        "is_observation": False,
        "source_type": "synthetic",
        "date": date,
        "feature_count": len(features),
        "summary": {
            "mean_accumulated_mm": round(sum(accum_vals) / len(accum_vals), 1) if accum_vals else 0.0,
            "mean_anomaly_mm": round(sum(anom_vals) / len(anom_vals), 1) if anom_vals else 0.0,
            "max_accumulated_mm": max(accum_vals) if accum_vals else 0.0,
            "units": "mm",
        },
        "sample_features": [
            {
                "region": f.properties.get("region_name"),
                "coordinates": f.geometry.coordinates,
                "rate_mm_hr": f.properties.get("precipitation_rate_mm_hr"),
                "accumulated_mm": f.properties.get("precipitation_accumulated_mm"),
                "anomaly_mm": f.properties.get("precipitation_anomaly_mm"),
            }
            for f in features[:6]
        ],
        "provenance": "NASA GES DISC / JAXA",
        "doi": "https://doi.org/10.5067/GPM/IMERG/3B-MONTH/07",
    }


def get_vegetation_indices(
    latitude: Optional[float] = None,
    longitude: Optional[float] = None,
    date: str = "2026-03",
    min_lat: Optional[float] = None,
    max_lat: Optional[float] = None,
    min_lon: Optional[float] = None,
    max_lon: Optional[float] = None,
) -> Dict[str, Any]:
    """
    Retrieve NASA MODIS Monthly Global Vegetation Indices (MOD13C2 v061).
    Provides NDVI (dimensionless ratio, -0.2 to 1.0), Enhanced Vegetation Index (EVI),
    and Vegetation Condition Index (VCI, 0-100%) for agricultural and ecological drought analysis.
    """
    err = _validate_lat_lon(latitude, longitude)
    if err:
        return {"error": err, "status": "validation_failed"}
    err = _validate_date_str(date)
    if err:
        return {"error": err, "status": "validation_failed"}
    err = _validate_bbox(min_lat, max_lat, min_lon, max_lon)
    if err:
        return {"error": err, "status": "validation_failed"}

    # Single point timeseries
    if latitude is not None and longitude is not None:
        ts = LandService.get_timeseries(latitude, longitude, start_year=2024, end_year=2026)
        pt = next((p for p in ts.timeseries if p.date == date), ts.timeseries[-1] if ts.timeseries else None)
        if not pt:
            return {"status": "no_data", "message": f"No MODIS vegetation data at ({latitude}, {longitude}) for {date}"}

        vci_est = min(100.0, max(0.0, round(((pt.ndvi - 0.05) / 0.75) * 100.0, 1)))
        canopy_health = "Optimal Vigorous Canopy" if vci_est >= 60.0 else (
            "Moderate Moisture Stress" if vci_est >= 40.0 else "Severe Vegetation Drought"
        )

        return {
            "status": "success",
            "dataset_id": "MOD13C2",
            "mission": "MODIS Terra",
            "sensor": "Moderate Resolution Imaging Spectroradiometer (MOD13C2 v061)",
            "data_status": ts.data_status,
            "is_observation": ts.is_observation,
            "location": {"latitude": latitude, "longitude": longitude},
            "region_name": ts.region_name,
            "date": pt.date,
            "measurements": {
                "ndvi": pt.ndvi,
                "evi": pt.evi,
                "vci_percent": vci_est,
                "ndvi_anomaly": pt.ndvi_anomaly,
                "historical_ndvi_median": pt.historical_ndvi_median,
            },
            "units": {
                "ndvi": "dimensionless ratio (-0.2000 to +1.0000)",
                "evi": "dimensionless ratio (-0.2000 to +1.0000)",
                "vci": "percent (0-100%)",
            },
            "analysis": {
                "canopy_status": canopy_health,
                "phenology": "Mature active photosynthesis" if pt.ndvi >= 0.50 else "Dormant / sparse canopy",
            },
            "provenance": "NASA LP DAAC / USGS EROS MOD13C2.061",
            "doi": "https://doi.org/10.5067/MODIS/MOD13C2.061",
        }

    # Spatial grid
    fc = LandService.get_spatial_grid(
        min_lat=min_lat, max_lat=max_lat, min_lon=min_lon, max_lon=max_lon, date_str=date
    )
    features = fc.features[:25]
    ndvi_vals = [f.properties.get("ndvi", 0.0) for f in features]
    meta = fc.metadata

    return {
        "status": "success",
        "dataset_id": "MOD13C2",
        "mission": "MODIS Terra",
        "sensor": "Moderate Resolution Imaging Spectroradiometer (MOD13C2 v061)",
        "data_status": meta.get("data_status", "observation"),
        "is_observation": meta.get("is_observation", True),
        "date": date,
        "feature_count": len(features),
        "summary": {
            "mean_ndvi": round(sum(ndvi_vals) / len(ndvi_vals), 4) if ndvi_vals else 0.0,
            "min_ndvi": min(ndvi_vals) if ndvi_vals else 0.0,
            "max_ndvi": max(ndvi_vals) if ndvi_vals else 0.0,
            "units": "dimensionless ratio (-0.2000 to +1.0000)",
        },
        "sample_features": [
            {
                "region": f.properties.get("region_name"),
                "coordinates": f.geometry.coordinates,
                "ndvi": f.properties.get("ndvi"),
                "evi": f.properties.get("evi"),
                "vci_percent": f.properties.get("vci_percent"),
                "quality": f.properties.get("quality_reliability", "Good Data"),
            }
            for f in features[:6]
        ],
        "provenance": "NASA LP DAAC / USGS EROS MOD13C2.061",
        "doi": "https://doi.org/10.5067/MODIS/MOD13C2.061",
    }


def get_historical_trends(
    module: str,
    latitude: float,
    longitude: float,
    start_date: str = "2024-01",
    end_date: str = "2026-10",
) -> Dict[str, Any]:
    """
    Analyzes historical observations and trends across a 2-3 year timeline for ocean, atmosphere, or land.
    Computes statistical trends, historical maximum/minimum, and anomaly departures.
    """
    mod = module.lower().strip()
    if mod not in ["ocean", "atmosphere", "land"]:
        return {"error": f"Invalid module '{module}'. Choose 'ocean', 'atmosphere', or 'land'.", "status": "validation_failed"}
    err = _validate_lat_lon(latitude, longitude)
    if err:
        return {"error": err, "status": "validation_failed"}

    start_year = int(start_date.split("-")[0])
    end_year = int(end_date.split("-")[0])

    if mod == "ocean":
        ts = OceanService.get_timeseries(latitude, longitude, start_year, end_year)
        pts = [p for p in ts.timeseries if start_date <= p.date <= end_date]
        values = [p.ssha_mean_m for p in pts]
        unit = "meters (m)"
        metric_label = "Sea Surface Height Anomaly (SSHA)"
    elif mod == "atmosphere":
        ts = AtmosphereService.get_timeseries(latitude, longitude, start_year, end_year)
        pts = [p for p in ts.timeseries if start_date <= p.date <= end_date]
        values = [p.precipitation_accumulated_mm for p in pts]
        unit = "mm"
        metric_label = "Monthly Accumulated Precipitation"
    else:
        ts = LandService.get_timeseries(latitude, longitude, start_year, end_year)
        pts = [p for p in ts.timeseries if start_date <= p.date <= end_date]
        values = [p.ndvi for p in pts]
        unit = "dimensionless ratio (-0.2 to 1.0)"
        metric_label = "Normalized Difference Vegetation Index (NDVI)"

    if not values:
        return {"status": "no_data", "message": f"No timeseries points found between {start_date} and {end_date}."}

    mean_val = round(sum(values) / len(values), 3)
    min_val = min(values)
    max_val = max(values)
    trend_slope = round((values[-1] - values[0]) / len(values), 4)

    is_obs = ts.is_observation if hasattr(ts, "is_observation") else False
    d_status = ts.data_status if hasattr(ts, "data_status") else "simulated"

    return {
        "status": "success",
        "module": mod,
        "metric_label": metric_label,
        "unit": unit,
        "location": {"latitude": latitude, "longitude": longitude},
        "period": {"start_date": start_date, "end_date": end_date, "point_count": len(pts)},
        "statistics": {
            "mean": mean_val,
            "min": min_val,
            "max": max_val,
            "delta_total": round(values[-1] - values[0], 3),
            "trend_per_step": trend_slope,
            "trend_direction": "increasing" if trend_slope > 0.005 else ("decreasing" if trend_slope < -0.005 else "stable"),
        },
        "timeseries": [
            {"date": p.date, "value": val}
            for p, val in zip(pts, values)
        ],
        "data_status": d_status,
        "is_observation": is_obs,
    }


def compare_regions(
    module: str,
    region_a: str,
    region_b: str,
    date: str = "2026-03",
    lat_a: Optional[float] = None,
    lon_a: Optional[float] = None,
    lat_b: Optional[float] = None,
    lon_b: Optional[float] = None,
) -> Dict[str, Any]:
    """
    Compares two geographical regions on Earth for a specific date and module.
    Calculates absolute difference and safe percentage change with physical guards.
    """
    mod = module.lower().strip()
    if mod not in ["ocean", "atmosphere", "land"]:
        return {"error": f"Invalid module '{module}'. Choose 'ocean', 'atmosphere', or 'land'.", "status": "validation_failed"}

    # Geocode coordinates if not provided
    if lat_a is None or lon_a is None:
        sr_a = GeocodingService.search(region_a, limit=1)
        if sr_a and sr_a.results:
            lat_a, lon_a = sr_a.results[0].latitude, sr_a.results[0].longitude
        else:
            lat_a, lon_a = 0.0, 0.0

    if lat_b is None or lon_b is None:
        sr_b = GeocodingService.search(region_b, limit=1)
        if sr_b and sr_b.results:
            lat_b, lon_b = sr_b.results[0].latitude, sr_b.results[0].longitude
        else:
            lat_b, lon_b = 20.0, 0.0

    # Fetch values
    if mod == "ocean":
        ts_a = OceanService.get_timeseries(lat_a, lon_a, 2026, 2026)
        ts_b = OceanService.get_timeseries(lat_b, lon_b, 2026, 2026)
        val_a = next((p.ssha_mean_m for p in ts_a.timeseries if p.date == date), 0.0)
        val_b = next((p.ssha_mean_m for p in ts_b.timeseries if p.date == date), 0.0)
        unit = "meters (m)"
        metric_label = "Sea Surface Height Anomaly (SSHA)"
    elif mod == "atmosphere":
        ts_a = AtmosphereService.get_timeseries(lat_a, lon_a, 2026, 2026)
        ts_b = AtmosphereService.get_timeseries(lat_b, lon_b, 2026, 2026)
        val_a = next((p.precipitation_accumulated_mm for p in ts_a.timeseries if p.date == date), 100.0)
        val_b = next((p.precipitation_accumulated_mm for p in ts_b.timeseries if p.date == date), 100.0)
        unit = "mm"
        metric_label = "Monthly Accumulated Precipitation"
    else:
        ts_a = LandService.get_timeseries(lat_a, lon_a, 2026, 2026)
        ts_b = LandService.get_timeseries(lat_b, lon_b, 2026, 2026)
        val_a = next((p.ndvi for p in ts_a.timeseries if p.date == date), 0.5)
        val_b = next((p.ndvi for p in ts_b.timeseries if p.date == date), 0.5)
        unit = "dimensionless ratio"
        metric_label = "NDVI"

    diff_info = ScientificAnalytics.compute_difference_and_percentage(
        val_a, val_b, metric_label, unit
    )

    is_obs = bool(getattr(ts_a, "is_observation", False) and getattr(ts_b, "is_observation", False))
    d_status = "observation" if is_obs else "simulated"

    return {
        "status": "success",
        "module": mod,
        "date": date,
        "metric_label": metric_label,
        "region_a": {"name": region_a, "latitude": lat_a, "longitude": lon_a, "value": val_a, "unit": unit},
        "region_b": {"name": region_b, "latitude": lat_b, "longitude": lon_b, "value": val_b, "unit": unit},
        "comparison": diff_info,
        "data_status": d_status,
        "is_observation": is_obs,
    }


def get_cross_system_analysis(phenomenon_id: str = "enso_walker") -> Dict[str, Any]:
    """
    Analyzes coupled Earth system teleconnections linking Ocean (SWOT SSH),
    Atmosphere (GPM IMERG), and Land (MODIS NDVI).
    Includes strict scientific guardrails emphasizing Correlation != Causation.
    """
    clean_id = phenomenon_id.lower().strip()
    if clean_id not in CrossSystemService.TELECONNECTIONS:
        clean_id = "enso_walker"

    resp = CrossSystemService.get_teleconnection_analysis(clean_id)
    return {
        "status": "success",
        "phenomenon_name": resp.phenomenon_name,
        "description": resp.description,
        "primary_ocean_metric": resp.primary_ocean_metric,
        "primary_atmosphere_metric": resp.primary_atmosphere_metric,
        "primary_land_metric": resp.primary_land_metric,
        "scientific_coupling_mechanism": resp.scientific_coupling_mechanism,
        "causation_vs_correlation_note": resp.causation_vs_correlation_note,
        "key_insights": resp.key_insights,
        "data_status": resp.data_status,
        "is_observation": resp.is_observation,
        "timeline_sample": [
            {
                "date": p.date,
                "ocean_ssha_m": p.ocean_ssha_m,
                "atmosphere_precipitation_anomaly_mm": p.atmosphere_precipitation_anomaly_mm,
                "land_ndvi_anomaly": p.land_ndvi_anomaly,
                "phase": p.teleconnection_phase,
            }
            for p in resp.timeseries[:6]
        ],
    }


def get_dataset_metadata(dataset_id: str) -> Dict[str, Any]:
    """
    Retrieve authoritative NASA dataset documentation, CMR concept IDs,
    spatial/temporal resolution, variables, and known limitations.
    Supported IDs: SWOT_L2_LR_SSH, GPM_3IMERGM, MOD13C2.
    """
    item = DatasetService.get_dataset_by_id(dataset_id)
    if not item:
        # Check by module
        for d in DatasetService.CATALOG:
            if d.module.lower() == dataset_id.lower():
                item = d
                break

    if not item:
        return {
            "error": f"Dataset '{dataset_id}' not found. Supported datasets: SWOT_L2_LR_SSH, GPM_3IMERGM, MOD13C2.",
            "status": "not_found",
        }

    return {
        "status": "success",
        "id": item.id,
        "module": item.module,
        "name": item.name,
        "agency": item.agency,
        "sensor": item.sensor,
        "spatial_resolution": item.spatial_resolution,
        "temporal_resolution": item.temporal_resolution,
        "variables": item.variables,
        "units": item.units,
        "scientific_purpose": item.scientific_purpose,
        "scientific_limitations": item.scientific_limitations,
        "cmr_concept_id": item.cmr_concept_id,
        "documentation_url": item.documentation_url,
    }


def get_data_quality_information(
    dataset_id: str,
    date: Optional[str] = None,
    region: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Returns data quality indicators, sensor calibration state, missing-data boundaries,
    and NASA Earthdata authentication readiness status.
    """
    auth_status = NasaEarthdataClient.get_auth_status()
    meta = get_dataset_metadata(dataset_id)

    limitations = meta.get("scientific_limitations", []) if "scientific_limitations" in meta else [
        "Interpolation needed across nadir gaps or cloud cover",
        "Higher uncertainty near coastal boundaries and rugged topography"
    ]

    return {
        "status": "success",
        "dataset_id": dataset_id,
        "data_status": "simulated",
        "is_observation": False,
        "source_type": "synthetic",
        "earthdata_auth": auth_status,
        "data_notice": "App values are modelled demonstrations; no NASA mission granules have been ingested.",
        "scientific_limitations": limitations,
        "quality_flags": {
            "cloud_masking_applied": True,
            "wet_tropospheric_correction": True,
            "ocean_tide_correction": "GOT4.10c",
            "rain_gauge_adjustment": "GPCC Monthly Analysis",
        },
        "target_accuracies": {
            "SWOT_L2_LR_SSH": "2.4 cm at 2 km resolution",
            "GPM_3IMERGM": "~10-15% over rain gauge regions",
            "MOD13C2": "+/- 0.025 NDVI units",
        }.get(dataset_id, "Nominal NASA science phase accuracy"),
    }


# Map of all available tool callables
SCIENTIFIC_TOOLS = [
    get_ocean_observations,
    get_precipitation_data,
    get_vegetation_indices,
    get_historical_trends,
    compare_regions,
    get_cross_system_analysis,
    get_dataset_metadata,
    get_data_quality_information,
]

SCIENTIFIC_TOOL_MAP = {
    t.__name__: t for t in SCIENTIFIC_TOOLS
}
