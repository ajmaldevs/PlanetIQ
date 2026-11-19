"""
Authoritative Scientific AI Tools for PlanetIQ.
Structured for Google Gen AI SDK (google-genai) tool calling.

Tools:
1. get_ocean_observations(region, latitude, longitude, date, min_lat, max_lat, min_lon, max_lon)
2. get_precipitation_data(region, latitude, longitude, date, min_lat, max_lat, min_lon, max_lon)
3. get_vegetation_indices(region, latitude, longitude, date, min_lat, max_lat, min_lon, max_lon)
4. get_historical_trends(module, region, latitude, longitude, start_date, end_date)
5. compare_regions(module, region_a, region_b, date, lat_a, lon_a, lat_b, lon_b)
6. get_cross_system_analysis(phenomenon_id)
7. get_dataset_metadata(dataset_id)
8. get_data_quality_information(dataset_id, date, region)

Each tool performs rigorous parameter coercion, boundary checking, geocoding resolution,
returns structured results with physical units and provenance, and handles errors safely.
"""

from typing import Dict, Any, List, Optional, Tuple
import calendar
import re
import logging

from app.services.ocean_service import OceanService
from app.services.atmosphere_service import AtmosphereService
from app.services.land_service import LandService
from app.services.demo_data_service import DemoDataService
from app.services.cross_system_service import CrossSystemService
from app.services.dataset_service import DatasetService
from app.services.geocoding_service import GeocodingService
from app.integrations.nasa.earthdata_client import NasaEarthdataClient
from app.services.scientific_analytics import ScientificAnalytics
from app.data_processing.ocean_processor import OceanProcessor

logger = logging.getLogger("planetiq.ai_tools")


# --- Coercion & Resolution Helpers ---

def _coerce_float(val: Any) -> Optional[float]:
    """Coerces strings, ints, or floats to float, parsing coordinate notation (e.g. '20.5°N', '65.2°E')."""
    if val is None:
        return None
    if isinstance(val, (int, float)):
        return float(val)
    if isinstance(val, str):
        clean = val.strip().replace("°", "").replace("deg", "")
        multiplier = 1.0
        if clean.endswith(("S", "s", "W", "w")):
            multiplier = -1.0
            clean = clean[:-1].strip()
        elif clean.endswith(("N", "n", "E", "e")):
            clean = clean[:-1].strip()
        try:
            return float(clean) * multiplier
        except (ValueError, TypeError):
            return None
    return None


def _coerce_date(date_val: Any) -> str:
    """Normalizes date input into YYYY-MM format, defaulting to '2026-03'."""
    if not date_val or not isinstance(date_val, str):
        return "2026-03"
    clean = date_val.strip()
    match = re.search(r"(\d{4})[-/](\d{1,2})", clean)
    if match:
        year, month = int(match.group(1)), int(match.group(2))
        if 2000 <= year <= 2030 and 1 <= month <= 12:
            return f"{year:04d}-{month:02d}"
    # Check 4-digit year only
    y_match = re.search(r"\b(20\d{2})\b", clean)
    if y_match:
        return f"{y_match.group(1)}-03"
    return "2026-03"


def _resolve_coordinates(
    region: Optional[str],
    lat: Any,
    lon: Any,
    default_module: str = "ocean",
) -> Tuple[Optional[float], Optional[float], Optional[List[float]], str]:
    """
    Resolves latitude, longitude, and optional bounding box from input coordinates
    or geocodes a textual region name.
    """
    lat_f = _coerce_float(lat)
    lon_f = _coerce_float(lon)

    if lat_f is not None and lon_f is not None:
        return lat_f, lon_f, None, region or f"Coordinates ({lat_f:+.2f}°, {lon_f:+.2f}°)"

    if region and isinstance(region, str) and region.strip():
        q = region.strip()
        sr = GeocodingService.search(q, limit=1)
        if sr and sr.results:
            top = sr.results[0]
            return float(top.latitude), float(top.longitude), top.bbox, top.name

        # Check known demo anchor names
        q_lower = q.lower()
        if default_module == "ocean":
            for reg in DemoDataService.OCEAN_REGIONS:
                if q_lower in reg["name"].lower() or q_lower in reg["id"]:
                    return float(reg["lat"]), float(reg["lon"]), None, reg["name"]
        elif default_module == "land":
            for reg in DemoDataService.LAND_BIOMES:
                if q_lower in reg["name"].lower() or q_lower in reg["id"]:
                    return float(reg["lat"]), float(reg["lon"]), None, reg["name"]
        elif default_module == "atmosphere":
            for reg in DemoDataService.ATMOSPHERE_REGIONS:
                if q_lower in reg["name"].lower() or q_lower in reg["id"]:
                    return float(reg["lat"]), float(reg["lon"]), None, reg["name"]

    return lat_f, lon_f, None, region or "Default Viewport"


def _validate_lat_lon(lat: Any, lon: Any) -> Optional[str]:
    lat_f = _coerce_float(lat)
    lon_f = _coerce_float(lon)
    if lat is not None and lat_f is None:
        return f"Invalid latitude '{lat}'. Must be numeric."
    if lon is not None and lon_f is None:
        return f"Invalid longitude '{lon}'. Must be numeric."
    if lat_f is not None and not (-90.0 <= lat_f <= 90.0):
        return f"Invalid latitude {lat_f}. Must be between -90.0 and +90.0 degrees."
    if lon_f is not None and not (-180.0 <= lon_f <= 180.0):
        return f"Invalid longitude {lon_f}. Must be between -180.0 and +180.0 degrees."
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
    min_lat: Any, max_lat: Any,
    min_lon: Any, max_lon: Any
) -> Optional[str]:
    min_lat_f = _coerce_float(min_lat)
    max_lat_f = _coerce_float(max_lat)
    min_lon_f = _coerce_float(min_lon)
    max_lon_f = _coerce_float(max_lon)

    for name, val, low, high in [
        ("min_lat", min_lat_f, -90.0, 90.0),
        ("max_lat", max_lat_f, -90.0, 90.0),
        ("min_lon", min_lon_f, -180.0, 180.0),
        ("max_lon", max_lon_f, -180.0, 180.0),
    ]:
        if val is not None and not (low <= val <= high):
            return f"{name} {val} is out of range [{low}, {high}]."

    if min_lat_f is not None and max_lat_f is not None and min_lat_f > max_lat_f:
        return f"min_lat ({min_lat_f}) cannot be greater than max_lat ({max_lat_f})."
    if min_lon_f is not None and max_lon_f is not None and min_lon_f > max_lon_f:
        return f"min_lon ({min_lon_f}) cannot be greater than max_lon ({max_lon_f})."
    return None


# --- Tool Implementations ---

def get_ocean_observations(
    region: Optional[str] = None,
    latitude: Optional[float] = None,
    longitude: Optional[float] = None,
    date: str = "2026-03",
    min_lat: Optional[float] = None,
    max_lat: Optional[float] = None,
    min_lon: Optional[float] = None,
    max_lon: Optional[float] = None,
) -> Dict[str, Any]:
    """
    Retrieve authoritative NASA ocean satellite observations:
    - Chlorophyll-a concentration (MODIS Aqua OB.DAAC, mg/m³) and biological productivity classification.
    - Sea Surface Temperature (SST in degrees Celsius, MODIS Aqua/Terra).
    - Sea Surface Height Anomaly (SSHA in meters, SWOT KaRIn PO.DAAC) and Sea Surface Height (SSH, m).
    - Mesoscale eddy classification (cyclonic cold-core vs anticyclonic warm-core) and Eddy Kinetic Energy (EKE, cm²/s²).

    MANDATORY USAGE RULE:
    ALWAYS use this tool for ANY question about ocean features, marine waters, seas, bays, gulfs
    (e.g., Arabian Sea, Bay of Bengal, Mediterranean Sea, Pacific Ocean, Atlantic Ocean, Gulf Stream, Kuroshio),
    chlorophyll, phytoplankton, sea surface temperature (SST), ocean heat, or ocean altimetry.
    Specify either a geographic 'region' name (e.g. 'Arabian Sea') OR 'latitude' and 'longitude' coordinates.
    """
    date = _coerce_date(date)
    resolved_lat, resolved_lon, bbox, resolved_name = _resolve_coordinates(region, latitude, longitude, default_module="ocean")

    err = _validate_lat_lon(resolved_lat, resolved_lon)
    if err:
        return {"error": err, "status": "validation_failed"}
    err = _validate_date_str(date)
    if err:
        return {"error": err, "status": "validation_failed"}
    err = _validate_bbox(min_lat, max_lat, min_lon, max_lon)
    if err:
        return {"error": err, "status": "validation_failed"}

    # Single point or resolved region lookup
    if resolved_lat is not None and resolved_lon is not None:
        ts = OceanService.get_timeseries(resolved_lat, resolved_lon, start_year=2024, end_year=2026, source_mode="auto")

        # Strict scientific integrity: do not fabricate observations when data is unavailable
        if not ts.timeseries or ts.data_status == "unavailable":
            return {
                "status": "unavailable",
                "data_status": "unavailable",
                "is_observation": False,
                "source_type": "none",
                "region_name": resolved_name,
                "location": {"latitude": resolved_lat, "longitude": resolved_lon},
                "date": date,
                "message": (
                    f"NASA ocean satellite observations for {resolved_name} ({resolved_lat:+.2f}°, {resolved_lon:+.2f}°) "
                    f"in {date} are currently unavailable in the verified local repository. Missing observations are not fabricated."
                ),
                "scientific_explanation": (
                    "Ocean Chlorophyll-a (MODIS Aqua / PACE OCI) and Sea Surface Height Anomaly (SWOT KaRIn) "
                    "require cloud-free optical swaths, valid orbital tracks, and completed DAAC processing pipelines."
                ),
                "provenance": "NASA PO.DAAC / OB.DAAC / CNES",
            }

        pt = next((p for p in ts.timeseries if p.date == date), ts.timeseries[-1] if ts.timeseries else None)
        if not pt:
            return {"status": "unavailable", "data_status": "unavailable", "message": f"No ocean observation at ({resolved_lat}, {resolved_lon}) for {date}"}

        eddy_type, eddy_desc = ScientificAnalytics.classify_ocean_eddy(pt.ssha_mean_m)
        ssh_geoid_ref = getattr(pt, "ssh_m", None)
        adt_ref = getattr(pt, "dynamic_topography_m", None)

        chlor_val = getattr(pt, "chlor_a", None)
        sst_val = getattr(pt, "sst", None)
        eke_val = getattr(pt, "eddy_kinetic_energy_cm2_s2", None)

        measurements = {
            "chlorophyll_a_mg_m3": chlor_val,
            "sea_surface_temp_celsius": sst_val,
            "sea_surface_height_m": ssh_geoid_ref,
            "sea_surface_height_anomaly_m": pt.ssha_mean_m,
            "dynamic_topography_m": adt_ref,
            "eddy_kinetic_energy_cm2_s2": eke_val,
        }

        units = {
            "chlorophyll_a": "mg/m³",
            "sst": "°C",
            "ssh": "meters (m)",
            "ssha": "meters (m)",
            "dynamic_topography": "meters (m)",
            "eke": "cm^2/s^2",
        }

        chlor_regime = OceanProcessor.classify_chlorophyll_regime(chlor_val) if chlor_val is not None else "Unknown (Unobserved)"
        analysis = {
            "chlorophyll_productivity": chlor_regime,
            "eddy_classification": eddy_type,
            "scientific_interpretation": (
                f"{eddy_desc} "
                + (f"Chlorophyll-a concentration of {chlor_val} mg/m³ indicates {chlor_regime}." if chlor_val is not None else "Chlorophyll-a unobserved.")
                + (f" Sea surface temperature is {sst_val}°C." if sst_val is not None else "")
            ),
        }

        return {
            "status": "success",
            "dataset_id": "SWOT_L2_LR_SSH / MODISA_L3m",
            "mission": "Surface Water and Ocean Topography (SWOT) & MODIS Aqua",
            "sensor": "Ka-band Radar Interferometer (KaRIn) & MODIS Ocean Color / SST",
            "data_status": ts.data_status,
            "is_observation": ts.is_observation,
            "source_type": "satellite_direct" if ts.is_observation else "synthetic",
            "region_name": resolved_name,
            "location": {"latitude": resolved_lat, "longitude": resolved_lon},
            "date": pt.date,
            "measurements": measurements,
            "units": units,
            "analysis": analysis,
            "provenance": "NASA PO.DAAC / OB.DAAC / CNES / CSA / UKSA",
            "doi": "https://doi.org/10.5067/SWOT-SSH-L2-LR",
        }

    # Spatial collection query
    min_lat_f = _coerce_float(min_lat) or (bbox[1] if bbox else None)
    max_lat_f = _coerce_float(max_lat) or (bbox[3] if bbox else None)
    min_lon_f = _coerce_float(min_lon) or (bbox[0] if bbox else None)
    max_lon_f = _coerce_float(max_lon) or (bbox[2] if bbox else None)

    fc = OceanService.get_spatial_observations(
        min_lat=min_lat_f, max_lat=max_lat_f, min_lon=min_lon_f, max_lon=max_lon_f, date_str=date, source_mode="auto"
    )
    if not fc.features:
        return {
            "status": "unavailable",
            "data_status": "unavailable",
            "is_observation": False,
            "source_type": "none",
            "date": date,
            "region_name": resolved_name,
            "feature_count": 0,
            "message": f"No genuine NASA ocean observations available for {date} in the specified bounds.",
            "provenance": "NASA PO.DAAC / OB.DAAC",
        }

    features = fc.features[:25]
    ssha_values = [f.properties.get("ssha_karin_m") for f in features if f.properties.get("ssha_karin_m") is not None]
    chl_values = [f.properties.get("chlor_a_mg_m3") for f in features if f.properties.get("chlor_a_mg_m3") is not None]
    sst_values = [f.properties.get("sst_celsius") for f in features if f.properties.get("sst_celsius") is not None]

    mean_ssha = round(sum(ssha_values) / len(ssha_values), 3) if ssha_values else None
    mean_chl = round(sum(chl_values) / len(chl_values), 3) if chl_values else None
    mean_sst = round(sum(sst_values) / len(sst_values), 2) if sst_values else None

    summary = {
        "mean_ssha_m": mean_ssha,
        "mean_chlorophyll_a_mg_m3": mean_chl,
        "mean_sst_celsius": mean_sst,
        "min_ssha_m": min(ssha_values) if ssha_values else None,
        "max_ssha_m": max(ssha_values) if ssha_values else None,
        "units": {"ssha": "meters", "chlorophyll_a": "mg/m³", "sst": "°C"},
    }

    return {
        "status": "success",
        "dataset_id": "SWOT_L2_LR_SSH / MODISA_L3m",
        "mission": "Surface Water and Ocean Topography (SWOT) & MODIS Aqua",
        "sensor": "Ka-band Radar Interferometer (KaRIn) & MODIS Ocean Color",
        "data_status": fc.metadata.get("data_status", "simulated"),
        "is_observation": fc.metadata.get("is_observation", False),
        "source_type": fc.metadata.get("source_type", "synthetic"),
        "date": date,
        "region_name": resolved_name,
        "feature_count": len(features),
        "summary": summary,
        "sample_features": [
            {
                "region": f.properties.get("location_name") or f.properties.get("region_name"),
                "coordinates": f.geometry.coordinates,
                "chlor_a_mg_m3": f.properties.get("chlor_a_mg_m3", mean_chl),
                "sst_celsius": f.properties.get("sst_celsius", mean_sst),
                "ssha_m": f.properties.get("ssha_karin_m"),
                "ssh_m": f.properties.get("ssh_karin_m"),
                "eddy_type": f.properties.get("eddy_type"),
            }
            for f in features[:6]
        ],
        "provenance": "NASA PO.DAAC / OB.DAAC / CNES / CSA / UKSA",
        "doi": "https://doi.org/10.5067/SWOT-SSH-L2-LR",
    }


def get_precipitation_data(
    region: Optional[str] = None,
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

    MANDATORY USAGE RULE:
    ALWAYS use this tool for ANY question about rainfall, precipitation, rain rate, rain accumulation,
    GPM, IMERG, monsoon rainfall, or atmospheric moisture.
    Specify either a geographic 'region' name (e.g. 'Amazon Basin', 'Kerala') OR 'latitude' and 'longitude' coordinates.
    """
    date = _coerce_date(date)
    resolved_lat, resolved_lon, bbox, resolved_name = _resolve_coordinates(region, latitude, longitude, default_module="atmosphere")

    err = _validate_lat_lon(resolved_lat, resolved_lon)
    if err:
        return {"error": err, "status": "validation_failed"}
    err = _validate_date_str(date)
    if err:
        return {"error": err, "status": "validation_failed"}
    err = _validate_bbox(min_lat, max_lat, min_lon, max_lon)
    if err:
        return {"error": err, "status": "validation_failed"}

    # Single location timeseries lookup
    if resolved_lat is not None and resolved_lon is not None:
        ts = AtmosphereService.get_timeseries(resolved_lat, resolved_lon, start_year=2024, end_year=2026, source_mode="auto")
        if not ts.timeseries or ts.data_status == "unavailable":
            return {
                "status": "unavailable",
                "data_status": "unavailable",
                "is_observation": False,
                "source_type": "none",
                "region_name": resolved_name,
                "location": {"latitude": resolved_lat, "longitude": resolved_lon},
                "date": date,
                "message": (
                    f"NASA GPM IMERG precipitation observations for {resolved_name} ({resolved_lat:+.2f}°, {resolved_lon:+.2f}°) "
                    f"in {date} are currently unavailable in the verified local repository. Missing observations are not fabricated."
                ),
                "scientific_explanation": (
                    "GPM IMERG Final Monthly Precipitation (GPM_3IMERGM v07) merges passive microwave constellation "
                    "sensors with DPR radar and ground rain gauge networks from GES DISC, which has a 2-3 month latency."
                ),
                "provenance": "NASA GES DISC / JAXA",
            }

        pt = next((p for p in ts.timeseries if p.date == date), ts.timeseries[-1] if ts.timeseries else None)
        if not pt:
            return {"status": "unavailable", "data_status": "unavailable", "message": f"No GPM atmosphere data at ({resolved_lat}, {resolved_lon}) for {date}"}

        year, month = map(int, pt.date.split("-"))
        _, days_in_month = calendar.monthrange(year, month)
        expected_accum = round(pt.precipitation_rate_mm_hr * 24.0 * days_in_month, 2)

        measurements = {
            "precipitation_rate_mm_hr": pt.precipitation_rate_mm_hr,
            "precipitation_accumulated_mm": pt.precipitation_accumulated_mm,
            "climatological_normal_mm": pt.climatological_normal_mm,
            "precipitation_anomaly_mm": pt.anomaly_mm,
            "gauge_weighting_index": getattr(pt, "gauge_weighting_index", None),
        }
        if getattr(pt, "aod_550", None) is not None:
            measurements["aod_550"] = pt.aod_550
        if getattr(pt, "cloud_fraction", None) is not None:
            measurements["cloud_fraction"] = pt.cloud_fraction

        units = {
            "rate": "mm/hr",
            "accumulated": "mm (total liquid depth)",
            "normal": "mm",
            "anomaly": "mm",
            "aod_550": "dimensionless ratio (columnar optical depth at 550nm)",
            "cloud_fraction": "ratio (0.0 - 1.0)",
        }

        return {
            "status": "success",
            "dataset_id": "GPM_3IMERGM",
            "mission": "Global Precipitation Measurement (GPM) & MODIS Atmosphere",
            "sensor": "DPR Radar and GMI Radiometers (IMERG Final v07) & MODIS Terra/Aqua",
            "data_status": ts.data_status,
            "is_observation": ts.is_observation,
            "source_type": "satellite_direct" if ts.is_observation else "synthetic",
            "region_name": resolved_name,
            "location": {"latitude": resolved_lat, "longitude": resolved_lon},
            "date": pt.date,
            "measurements": measurements,
            "units": units,
            "scientific_note": (
                f"Rate ({pt.precipitation_rate_mm_hr} mm/hr) times 24h * {days_in_month} days "
                f"equals {expected_accum} mm monthly accumulation."
            ),
            "provenance": "NASA GES DISC / LAADS DAAC / JAXA",
            "doi": "https://doi.org/10.5067/GPM/IMERG/3B-MONTH/07",
        }

    # Spatial grid query
    min_lat_f = _coerce_float(min_lat) or (bbox[1] if bbox else None)
    max_lat_f = _coerce_float(max_lat) or (bbox[3] if bbox else None)
    min_lon_f = _coerce_float(min_lon) or (bbox[0] if bbox else None)
    max_lon_f = _coerce_float(max_lon) or (bbox[2] if bbox else None)

    fc = AtmosphereService.get_spatial_grid(
        min_lat=min_lat_f, max_lat=max_lat_f, min_lon=min_lon_f, max_lon=max_lon_f, date_str=date, source_mode="auto"
    )
    if not fc.features:
        return {
            "status": "unavailable",
            "data_status": "unavailable",
            "is_observation": False,
            "source_type": "none",
            "date": date,
            "region_name": resolved_name,
            "feature_count": 0,
            "message": f"No genuine NASA GPM precipitation observations available for {date} in the specified bounds.",
            "provenance": "NASA GES DISC / JAXA",
        }

    features = fc.features[:25]
    accum_vals = [f.properties.get("precipitation_accumulated_mm") for f in features if f.properties.get("precipitation_accumulated_mm") is not None]
    anom_vals = [f.properties.get("precipitation_anomaly_mm") for f in features if f.properties.get("precipitation_anomaly_mm") is not None]
    aod_vals = [f.properties.get("aod_550") for f in features if f.properties.get("aod_550") is not None]

    summary = {
        "mean_accumulated_mm": round(sum(accum_vals) / len(accum_vals), 1) if accum_vals else None,
        "mean_anomaly_mm": round(sum(anom_vals) / len(anom_vals), 1) if anom_vals else None,
        "max_accumulated_mm": max(accum_vals) if accum_vals else None,
        "units": "mm",
    }
    if aod_vals:
        summary["mean_aod_550"] = round(sum(aod_vals) / len(aod_vals), 3)

    return {
        "status": "success",
        "dataset_id": "GPM_3IMERGM",
        "mission": "Global Precipitation Measurement (GPM) & MODIS Atmosphere",
        "sensor": "DPR Radar and GMI Radiometers (IMERG Final v07) & MODIS",
        "data_status": fc.metadata.get("data_status", "simulated"),
        "is_observation": fc.metadata.get("is_observation", False),
        "source_type": fc.metadata.get("source_type", "synthetic"),
        "date": date,
        "region_name": resolved_name,
        "feature_count": len(features),
        "summary": summary,
        "sample_features": [
            {
                "region": f.properties.get("location_name") or f.properties.get("region_name"),
                "coordinates": f.geometry.coordinates,
                "rate_mm_hr": f.properties.get("precipitation_rate_mm_hr"),
                "accumulated_mm": f.properties.get("precipitation_accumulated_mm"),
                "anomaly_mm": f.properties.get("precipitation_anomaly_mm"),
                "aod_550": f.properties.get("aod_550"),
                "cloud_fraction": f.properties.get("cloud_fraction"),
            }
            for f in features[:6]
        ],
        "provenance": "NASA GES DISC / LAADS DAAC / JAXA",
        "doi": "https://doi.org/10.5067/GPM/IMERG/3B-MONTH/07",
    }


def get_vegetation_indices(
    region: Optional[str] = None,
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
    and Vegetation Condition Index (VCI, 0-100%) for terrestrial vegetation, crop health, and agricultural drought analysis.

    MANDATORY USAGE RULE:
    Use this tool ONLY for terrestrial land, agriculture, crops, forests, vegetation health, canopy vitality, or drought.
    NEVER call this tool for ocean or marine water bodies (use get_ocean_observations instead).
    Specify either a geographic 'region' name (e.g. 'Punjab', 'Iowa Corn Belt') OR 'latitude' and 'longitude' coordinates.
    """
    date = _coerce_date(date)
    resolved_lat, resolved_lon, bbox, resolved_name = _resolve_coordinates(region, latitude, longitude, default_module="land")

    err = _validate_lat_lon(resolved_lat, resolved_lon)
    if err:
        return {"error": err, "status": "validation_failed"}
    err = _validate_date_str(date)
    if err:
        return {"error": err, "status": "validation_failed"}
    err = _validate_bbox(min_lat, max_lat, min_lon, max_lon)
    if err:
        return {"error": err, "status": "validation_failed"}

    # Single point timeseries
    if resolved_lat is not None and resolved_lon is not None:
        ts = LandService.get_timeseries(resolved_lat, resolved_lon, start_year=2024, end_year=2026, source_mode="auto")
        if not ts.timeseries or ts.data_status == "unavailable":
            return {
                "status": "unavailable",
                "data_status": "unavailable",
                "is_observation": False,
                "source_type": "none",
                "region_name": resolved_name,
                "location": {"latitude": resolved_lat, "longitude": resolved_lon},
                "date": date,
                "message": (
                    f"NASA MODIS MOD13C2 vegetation observations for {resolved_name} ({resolved_lat:+.2f}°, {resolved_lon:+.2f}°) "
                    f"in {date} are currently unavailable in the verified local repository. Missing observations are not fabricated."
                ),
                "scientific_explanation": (
                    "MODIS Monthly Global Vegetation Indices (MOD13C2 v061) are synthesized from 16-day composite cycles "
                    "applying pixel reliability quality bitmask filtering from NASA LP DAAC."
                ),
                "provenance": "NASA LP DAAC / USGS EROS",
            }

        pt = next((p for p in ts.timeseries if p.date == date), ts.timeseries[-1] if ts.timeseries else None)
        if not pt:
            return {"status": "unavailable", "data_status": "unavailable", "message": f"No MODIS vegetation data at ({resolved_lat}, {resolved_lon}) for {date}"}

        vci_val = getattr(pt, "vci_percent", None)
        canopy_health = (
            ("Optimal Vigorous Canopy" if vci_val >= 60.0 else ("Moderate Moisture Stress" if vci_val >= 40.0 else "Severe Vegetation Drought"))
            if vci_val is not None
            else ("Photosynthetically Active Canopy" if pt.ndvi >= 0.50 else "Dormant / Sparse Canopy")
        )

        return {
            "status": "success",
            "dataset_id": "MOD13C2",
            "mission": "MODIS Terra",
            "sensor": "Moderate Resolution Imaging Spectroradiometer (MOD13C2 v061)",
            "data_status": ts.data_status,
            "is_observation": ts.is_observation,
            "location": {"latitude": resolved_lat, "longitude": resolved_lon},
            "region_name": resolved_name,
            "date": pt.date,
            "measurements": {
                "ndvi": pt.ndvi,
                "evi": pt.evi,
                "vci_percent": vci_val,
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
    min_lat_f = _coerce_float(min_lat) or (bbox[1] if bbox else None)
    max_lat_f = _coerce_float(max_lat) or (bbox[3] if bbox else None)
    min_lon_f = _coerce_float(min_lon) or (bbox[0] if bbox else None)
    max_lon_f = _coerce_float(max_lon) or (bbox[2] if bbox else None)

    fc = LandService.get_spatial_grid(
        min_lat=min_lat_f, max_lat=max_lat_f, min_lon=min_lon_f, max_lon=max_lon_f, date_str=date, source_mode="auto"
    )
    if not fc.features:
        return {
            "status": "unavailable",
            "data_status": "unavailable",
            "is_observation": False,
            "source_type": "none",
            "date": date,
            "region_name": resolved_name,
            "feature_count": 0,
            "message": f"No genuine NASA MODIS MOD13C2 vegetation observations available for {date} in the specified bounds.",
            "provenance": "NASA LP DAAC / USGS EROS",
        }

    features = fc.features[:25]
    ndvi_vals = [f.properties.get("ndvi") for f in features if f.properties.get("ndvi") is not None]
    meta = fc.metadata

    return {
        "status": "success",
        "dataset_id": "MOD13C2",
        "mission": "MODIS Terra",
        "sensor": "Moderate Resolution Imaging Spectroradiometer (MOD13C2 v061)",
        "data_status": meta.get("data_status", "simulated"),
        "is_observation": meta.get("is_observation", False),
        "date": date,
        "region_name": resolved_name,
        "feature_count": len(features),
        "summary": {
            "mean_ndvi": round(sum(ndvi_vals) / len(ndvi_vals), 4) if ndvi_vals else None,
            "min_ndvi": min(ndvi_vals) if ndvi_vals else None,
            "max_ndvi": max(ndvi_vals) if ndvi_vals else None,
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
    region: Optional[str] = None,
    latitude: Optional[float] = None,
    longitude: Optional[float] = None,
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

    resolved_lat, resolved_lon, _, resolved_name = _resolve_coordinates(region, latitude, longitude, default_module=mod)
    if resolved_lat is None or resolved_lon is None:
        resolved_lat, resolved_lon = 0.0, 0.0

    err = _validate_lat_lon(resolved_lat, resolved_lon)
    if err:
        return {"error": err, "status": "validation_failed"}

    start_year = int(_coerce_date(start_date).split("-")[0])
    end_year = int(_coerce_date(end_date).split("-")[0])

    if mod == "ocean":
        ts = OceanService.get_timeseries(resolved_lat, resolved_lon, start_year, end_year, source_mode="auto")
        if not ts.timeseries or ts.data_status == "unavailable":
            return {
                "status": "unavailable",
                "data_status": "unavailable",
                "is_observation": False,
                "module": mod,
                "region_name": resolved_name,
                "location": {"latitude": resolved_lat, "longitude": resolved_lon},
                "period": f"{start_date} to {end_date}",
                "message": f"Historical satellite observations for {resolved_name} ({mod}) are currently unavailable in the local repository. Missing data is not manufactured.",
            }
        pts = [p for p in ts.timeseries if start_date <= p.date <= end_date]
        values = [p.ssha_mean_m for p in pts]
        unit = "meters (m)"
        metric_label = "Sea Surface Height Anomaly (SSHA)"
    elif mod == "atmosphere":
        ts = AtmosphereService.get_timeseries(resolved_lat, resolved_lon, start_year, end_year, source_mode="auto")
        if not ts.timeseries or ts.data_status == "unavailable":
            return {
                "status": "unavailable",
                "data_status": "unavailable",
                "is_observation": False,
                "module": mod,
                "region_name": resolved_name,
                "location": {"latitude": resolved_lat, "longitude": resolved_lon},
                "period": f"{start_date} to {end_date}",
                "message": f"Historical satellite observations for {resolved_name} ({mod}) are currently unavailable in the local repository. Missing data is not manufactured.",
            }
        pts = [p for p in ts.timeseries if start_date <= p.date <= end_date]
        values = [p.precipitation_accumulated_mm for p in pts]
        unit = "mm"
        metric_label = "Monthly Accumulated Precipitation"
    else:
        ts = LandService.get_timeseries(resolved_lat, resolved_lon, start_year, end_year, source_mode="auto")
        if not ts.timeseries or ts.data_status == "unavailable":
            return {
                "status": "unavailable",
                "data_status": "unavailable",
                "is_observation": False,
                "module": mod,
                "region_name": resolved_name,
                "location": {"latitude": resolved_lat, "longitude": resolved_lon},
                "period": f"{start_date} to {end_date}",
                "message": f"Historical satellite observations for {resolved_name} ({mod}) are currently unavailable in the local repository. Missing data is not manufactured.",
            }
        pts = [p for p in ts.timeseries if start_date <= p.date <= end_date]
        values = [p.ndvi for p in pts]
        unit = "dimensionless ratio (-0.2 to 1.0)"
        metric_label = "Normalized Difference Vegetation Index (NDVI)"

    if not values:
        return {"status": "no_data", "message": f"No timeseries points found between {start_date} and {end_date}."}

    mean_val = round(sum(values) / len(values), 3)
    min_val = min(values)
    max_val = max(values)
    trend_slope = round((values[-1] - values[0]) / max(len(values), 1), 4)

    is_obs = ts.is_observation if hasattr(ts, "is_observation") else False
    d_status = ts.data_status if hasattr(ts, "data_status") else "simulated"

    return {
        "status": "success",
        "module": mod,
        "region_name": resolved_name,
        "metric_label": metric_label,
        "unit": unit,
        "location": {"latitude": resolved_lat, "longitude": resolved_lon},
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

    date = _coerce_date(date)
    r_lat_a, r_lon_a, _, name_a = _resolve_coordinates(region_a, lat_a, lon_a, default_module=mod)
    r_lat_b, r_lon_b, _, name_b = _resolve_coordinates(region_b, lat_b, lon_b, default_module=mod)

    if r_lat_a is None or r_lon_a is None:
        r_lat_a, r_lon_a = 0.0, 0.0
    if r_lat_b is None or r_lon_b is None:
        r_lat_b, r_lon_b = 20.0, 0.0

    if mod == "ocean":
        ts_a = OceanService.get_timeseries(r_lat_a, r_lon_a, 2026, 2026, source_mode="auto")
        ts_b = OceanService.get_timeseries(r_lat_b, r_lon_b, 2026, 2026, source_mode="auto")
        if not ts_a.timeseries or ts_a.data_status == "unavailable" or not ts_b.timeseries or ts_b.data_status == "unavailable":
            return {
                "status": "unavailable",
                "data_status": "unavailable",
                "is_observation": False,
                "module": mod,
                "region_a": name_a,
                "region_b": name_b,
                "date": date,
                "message": f"Cannot compare {name_a} and {name_b} because ocean observations are unavailable for {date}.",
            }

        val_a = next((p.ssha_mean_m for p in ts_a.timeseries if p.date == date), None)
        val_b = next((p.ssha_mean_m for p in ts_b.timeseries if p.date == date), None)
        if val_a is None or val_b is None:
            missing_name = name_a if val_a is None else name_b
            return {
                "status": "unavailable",
                "data_status": "unavailable",
                "is_observation": False,
                "module": mod,
                "region_a": name_a,
                "region_b": name_b,
                "date": date,
                "message": f"Cannot compare {name_a} and {name_b} because ocean observations for {missing_name} are unavailable for {date}.",
            }
        unit = "meters (m)"
        metric_label = "Sea Surface Height Anomaly (SSHA)"
    elif mod == "atmosphere":
        ts_a = AtmosphereService.get_timeseries(r_lat_a, r_lon_a, 2026, 2026, source_mode="auto")
        ts_b = AtmosphereService.get_timeseries(r_lat_b, r_lon_b, 2026, 2026, source_mode="auto")
        if not ts_a.timeseries or ts_a.data_status == "unavailable" or not ts_b.timeseries or ts_b.data_status == "unavailable":
            return {
                "status": "unavailable",
                "data_status": "unavailable",
                "is_observation": False,
                "module": mod,
                "region_a": name_a,
                "region_b": name_b,
                "date": date,
                "message": f"Cannot compare {name_a} and {name_b} because atmosphere observations are unavailable for {date}.",
            }

        val_a = next((p.precipitation_accumulated_mm for p in ts_a.timeseries if p.date == date), None)
        val_b = next((p.precipitation_accumulated_mm for p in ts_b.timeseries if p.date == date), None)
        if val_a is None or val_b is None:
            missing_name = name_a if val_a is None else name_b
            return {
                "status": "unavailable",
                "data_status": "unavailable",
                "is_observation": False,
                "module": mod,
                "region_a": name_a,
                "region_b": name_b,
                "date": date,
                "message": f"Cannot compare {name_a} and {name_b} because atmosphere observations for {missing_name} are unavailable for {date}.",
            }
        unit = "mm"
        metric_label = "Monthly Accumulated Precipitation"
    else:
        ts_a = LandService.get_timeseries(r_lat_a, r_lon_a, 2026, 2026, source_mode="auto")
        ts_b = LandService.get_timeseries(r_lat_b, r_lon_b, 2026, 2026, source_mode="auto")
        if not ts_a.timeseries or ts_a.data_status == "unavailable" or not ts_b.timeseries or ts_b.data_status == "unavailable":
            return {
                "status": "unavailable",
                "data_status": "unavailable",
                "is_observation": False,
                "module": mod,
                "region_a": name_a,
                "region_b": name_b,
                "date": date,
                "message": f"Cannot compare {name_a} and {name_b} because land vegetation observations are unavailable for {date}.",
            }

        val_a = next((p.ndvi for p in ts_a.timeseries if p.date == date), None)
        val_b = next((p.ndvi for p in ts_b.timeseries if p.date == date), None)
        if val_a is None or val_b is None:
            missing_name = name_a if val_a is None else name_b
            return {
                "status": "unavailable",
                "data_status": "unavailable",
                "is_observation": False,
                "module": mod,
                "region_a": name_a,
                "region_b": name_b,
                "date": date,
                "message": f"Cannot compare {name_a} and {name_b} because land vegetation observations for {missing_name} are unavailable for {date}.",
            }
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
        "region_a": {"name": name_a, "latitude": r_lat_a, "longitude": r_lon_a, "value": val_a, "unit": unit},
        "region_b": {"name": name_b, "latitude": r_lat_b, "longitude": r_lon_b, "value": val_b, "unit": unit},
        "comparison": diff_info,
        "data_status": d_status,
        "is_observation": is_obs,
    }


def get_cross_system_analysis(phenomenon_id: str = "enso_walker") -> Dict[str, Any]:
    """
    Analyzes coupled Earth system teleconnections linking Ocean (SWOT SSH / SST),
    Atmosphere (GPM IMERG precipitation), and Land (MODIS NDVI canopy greenness).
    Includes strict scientific guardrails emphasizing Correlation != Causation.
    """
    clean_id = (phenomenon_id or "enso_walker").lower().strip()
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
    Supported IDs: SWOT_L2_LR_SSH, GPM_3IMERGM, MOD13C2, MODISA_L3m_CHL, MODISA_L3m_SST.
    """
    clean_id = (dataset_id or "MOD13C2").strip()
    item = DatasetService.get_dataset_by_id(clean_id)
    if not item:
        for d in DatasetService.CATALOG:
            if d.module.lower() == clean_id.lower() or d.id.lower() == clean_id.lower():
                item = d
                break

    if not item:
        return {
            "error": f"Dataset '{dataset_id}' not found. Supported datasets: SWOT_L2_LR_SSH, GPM_3IMERGM, MOD13C2, MODISA_L3m_CHL.",
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
    clean_id = (dataset_id or "MOD13C2").strip()
    auth_status = NasaEarthdataClient.get_auth_status()
    meta = get_dataset_metadata(clean_id)

    limitations = meta.get("scientific_limitations", []) if "scientific_limitations" in meta else [
        "Interpolation needed across nadir gaps or cloud cover",
        "Higher uncertainty near coastal boundaries and rugged topography"
    ]

    return {
        "status": "success",
        "dataset_id": clean_id,
        "data_status": "simulated",
        "is_observation": False,
        "source_type": "synthetic",
        "earthdata_auth": auth_status,
        "data_notice": "Platform provides verified NASA satellite telemetry where ingested, or calibrated demonstration models.",
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
        }.get(clean_id, "Nominal NASA science phase accuracy"),
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
