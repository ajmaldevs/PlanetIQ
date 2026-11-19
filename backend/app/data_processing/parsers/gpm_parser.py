"""
Dedicated parser for NASA GPM IMERG Final Monthly Precipitation (GPM_3IMERGM v07).
Handles:
- NetCDF4/HDF5 format with /Grid/ group navigation
- Dimension ordering detection ((lon, lat) vs (lat, lon)) to prevent IndexError and coordinate transposition
- Conversion of rain rate (mm/hr) to monthly accumulation (mm) via:
    accumulation_mm = round(rate_mm_hr * 24.0 * days_in_month(year, month), 1)
- Fill value filtering (-9999.9, -9999.0, negative values, and non-physical values > 150.0 mm/hr)
"""

from typing import Dict, Any, Optional, Tuple, List
import os
import calendar
import logging
import numpy as np
from app.data_processing.atmosphere_processor import AtmosphereProcessor

logger = logging.getLogger("planetiq.gpm_parser")


class GpmParser:
    """Parser for NASA GPM IMERG 3IMERGM monthly precipitation granules."""

    FILL_VALUES = {-9999.9, -9999.0, -9999}
    MAX_VALID_RATE = 150.0  # mm/hr extreme deluge bound

    @staticmethod
    def get_days_in_month(year: int, month: int) -> int:
        """Returns the number of days in the requested year and month."""
        return calendar.monthrange(year, month)[1]

    @classmethod
    def convert_rate_to_accumulation(cls, rate_mm_hr: float, year: int, month: int) -> float:
        """
        Converts monthly mean precipitation rate (mm/hr) to total accumulated depth (mm)
        using the exact number of days in the specified month.
        """
        days = cls.get_days_in_month(year, month)
        return round(rate_mm_hr * 24.0 * days, 1)

    @classmethod
    def parse_granule(
        cls,
        file_path: str,
        date_str: str,
        bbox: Optional[Tuple[float, float, float, float]] = None,
        stride_lat: int = 15,
        stride_lon: int = 15,
    ) -> Dict[str, Any]:
        """
        Parses GPM 3IMERGM granule and decodes precipitation features.
        Correctly detects grid orientation and converts rate to accumulation depth.
        """
        if not os.path.exists(file_path):
            raise FileNotFoundError(f"GPM granule not found: {file_path}")

        granule_id = os.path.basename(file_path)
        parts = date_str.split("-")
        year, month = int(parts[0]), int(parts[1])
        days_in_m = cls.get_days_in_month(year, month)

        import netCDF4 as nc
        with nc.Dataset(file_path, "r") as ds:
            # 1. Locate Grid group or fallback to root
            target_scope = ds.groups["Grid"] if "Grid" in ds.groups else ds

            # 2. Extract precipitation variable
            precip_var = None
            var_name_found = ""
            for vname in ["precipitation", "precipitationCal"]:
                if vname in target_scope.variables:
                    precip_var = target_scope.variables[vname]
                    var_name_found = vname
                    break

            if precip_var is None:
                raise ValueError(f"No precipitation variable found in GPM granule {file_path}")

            # 3. Extract coordinate vectors
            lats = target_scope.variables.get("lat") or target_scope.variables.get("latitude")
            lons = target_scope.variables.get("lon") or target_scope.variables.get("longitude")
            if lats is None or lons is None:
                raise ValueError(f"Latitude/Longitude coordinate variables missing in {file_path}")

            lat_arr = np.array(lats[:], dtype=np.float32)
            lon_arr = np.array(lons[:], dtype=np.float32)
            raw_data = precip_var[:]

            # Handle 3D (time, ...) by taking slice 0
            if raw_data.ndim == 3:
                raw_data = raw_data[0]

            # 4. Dimension Ordering Detection: (lon, lat) vs (lat, lon)
            # In GPM IMERG, raw_data is typically (3600, 1800) -> (lon, lat)
            is_lon_lat = (raw_data.shape[0] == len(lon_arr) and raw_data.shape[1] == len(lat_arr))
            is_lat_lon = (raw_data.shape[0] == len(lat_arr) and raw_data.shape[1] == len(lon_arr))

            if not (is_lon_lat or is_lat_lon):
                if raw_data.shape[0] > raw_data.shape[1]:
                    is_lon_lat = True
                else:
                    is_lat_lon = True

            features: List[Dict[str, Any]] = []

            # 5. Extract features avoiding index transposition & IndexError
            for i_lat in range(0, len(lat_arr), max(1, stride_lat)):
                lat_val = float(lat_arr[i_lat])
                if bbox and not (bbox[1] <= lat_val <= bbox[3]):
                    continue

                for i_lon in range(0, len(lon_arr), max(1, stride_lon)):
                    lon_val = float(lon_arr[i_lon])
                    if bbox and not (bbox[0] <= lon_val <= bbox[2]):
                        continue

                    raw_rate = raw_data[i_lon, i_lat] if is_lon_lat else raw_data[i_lat, i_lon]

                    # Filter fill values & masked elements
                    if np.ma.is_masked(raw_rate) or np.isnan(raw_rate):
                        continue
                    rate = float(raw_rate)
                    if rate < 0.0 or rate in cls.FILL_VALUES or rate > cls.MAX_VALID_RATE:
                        continue

                    # Rate to monthly accumulation
                    accumulation_mm = round(rate * 24.0 * days_in_m, 1)

                    feat = AtmosphereProcessor.process_atmosphere_point(
                        lat=lat_val,
                        lon=lon_val,
                        date_str=date_str,
                        granule_id=granule_id,
                        precip_rate_mm_hr=round(rate, 3),
                        precip_accumulated_mm=accumulation_mm,
                    )
                    if feat:
                        features.append(feat)

        if features:
            lats_f = [f["geometry"]["coordinates"][1] for f in features]
            lons_f = [f["geometry"]["coordinates"][0] for f in features]
            spatial_bbox = (min(lons_f), min(lats_f), max(lons_f), max(lats_f))
        else:
            spatial_bbox = (-180.0, -90.0, 180.0, 90.0)

        return {
            "dataset_id": "GPM_3IMERGM",
            "granule_id": granule_id,
            "date": date_str,
            "feature_count": len(features),
            "features": features,
            "extracted_variables": [var_name_found or "precipitation", "precipitation_accumulated"],
            "units": {"precipitation_rate": "mm/hr", "precipitation_accumulated": "mm"},
            "quality_flags": {"fill_values_filtered": [-9999.9, -9999.0], "negative_values_filtered": True},
            "spatial_bounding_box": spatial_bbox,
        }
