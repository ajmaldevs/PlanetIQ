"""
Dedicated parser for NASA MODIS MOD13C2 (Version 061) Vegetation Indices.
Supports HDF4/HDF-EOS2 (via netCDF4) and Cloud-Optimized GeoTIFF (via rasterio).
Extracts:
- CMG 0.05 Deg Monthly NDVI (scale factor 0.0001, fill -3000, valid range -2000 to 10000)
- CMG 0.05 Deg Monthly EVI (scale factor 0.0001, fill -3000, valid range -2000 to 10000)
- CMG 0.05 Deg Monthly pixel reliability (QA flags: 0=Good, 1=Marginal, 2=Snow/Ice, 3=Cloud, 4=Climatology, -1=Fill)
"""

from typing import Dict, Any, Optional, Tuple, List
import os
import math
import logging
import numpy as np

logger = logging.getLogger("planetiq.modis_parser")


class ModisParser:
    """Parser for MODIS MOD13C2 HDF4/HDF-EOS2 and GeoTIFF granules."""

    CMG_RESOLUTION = 0.05
    CMG_ROWS = 3600
    CMG_COLS = 7200
    SCALE_FACTOR = 0.0001
    FILL_VALUE = -3000
    VALID_MIN = -2000
    VALID_MAX = 10000

    @classmethod
    def lat_lon_to_row_col(cls, lat: float, lon: float) -> Tuple[int, int]:
        """Maps WGS84 geographic coordinate to 0.05° CMG (row, col) grid indices."""
        row = int(math.floor((90.0 - lat) / cls.CMG_RESOLUTION))
        col = int(math.floor((lon + 180.0) / cls.CMG_RESOLUTION))
        return max(0, min(cls.CMG_ROWS - 1, row)), max(0, min(cls.CMG_COLS - 1, col))

    @classmethod
    def row_col_to_lat_lon(cls, row: int, col: int) -> Tuple[float, float]:
        """Calculates pixel-center WGS84 coordinate from 0.05° CMG (row, col) indices."""
        lat = round(90.0 - (row + 0.5) * cls.CMG_RESOLUTION, 4)
        lon = round(-180.0 + (col + 0.5) * cls.CMG_RESOLUTION, 4)
        return lat, lon

    @classmethod
    def decode_raw_value(cls, raw_val: int) -> Tuple[bool, Optional[float]]:
        """
        Applies NASA LP DAAC scale factor (0.0001) to 16-bit signed integer.
        Maps fill value (-3000) and out-of-range values to None.
        Returns (is_valid, scaled_float).
        """
        if raw_val == cls.FILL_VALUE or raw_val < cls.VALID_MIN or raw_val > cls.VALID_MAX:
            return False, None
        return True, round(raw_val * cls.SCALE_FACTOR, 4)

    @classmethod
    def decode_pixel_reliability(cls, flag: int) -> Dict[str, Any]:
        """
        Decodes MODIS MOD13C2 Monthly Pixel Reliability (int8):
        -1: Fill/NoData
         0: Good Data (use with confidence)
         1: Marginal Data (useful, check QA)
         2: Snow / Ice (target covered with snow/ice)
         3: Cloudy (target covered with clouds)
         4: Climatology / Estimated (historical gap-fill; not real observation)
        """
        mapping = {
            -1: {"category": "Fill/NoData", "usable": False, "confidence": 0.0, "code": -1},
            0: {"category": "Good Data (Reliable)", "usable": True, "confidence": 1.0, "code": 0},
            1: {"category": "Marginal Quality (Usable with Caution)", "usable": True, "confidence": 0.65, "code": 1},
            2: {"category": "Snow / Ice Covered", "usable": False, "confidence": 0.20, "code": 2},
            3: {"category": "Cloud Contaminated", "usable": False, "confidence": 0.0, "code": 3},
            4: {"category": "Climatology / Estimated", "usable": False, "confidence": 0.50, "code": 4},
        }
        return mapping.get(
            flag,
            {"category": f"Unknown Flag ({flag})", "usable": False, "confidence": 0.0, "code": flag},
        )

    @classmethod
    def parse_granule(
        cls,
        file_path: str,
        date_str: str,
        bbox: Optional[Tuple[float, float, float, float]] = None,
        stride: int = 1,
        max_features: int = 250,
    ) -> Dict[str, Any]:
        """
        Parses MOD13C2 granule from HDF4/HDF-EOS2 or GeoTIFF.
        Returns dictionary with features, spatial bounding box, metadata, and variables extracted.
        """
        if not os.path.exists(file_path):
            raise FileNotFoundError(f"MODIS granule not found: {file_path}")

        granule_id = os.path.basename(file_path)
        ndvi_arr: Optional[np.ndarray] = None
        evi_arr: Optional[np.ndarray] = None
        qa_arr: Optional[np.ndarray] = None

        # 1. Attempt NetCDF4 (natively decodes HDF4/HDF-EOS2)
        try:
            import netCDF4 as nc
            with nc.Dataset(file_path, "r") as ds:
                ds.set_auto_maskandscale(False)
                for k in ds.variables.keys():
                    k_lower = k.lower()
                    if "ndvi" in k_lower and "std" not in k_lower and ndvi_arr is None:
                        ndvi_arr = np.array(ds.variables[k][:], dtype=np.int16)
                    elif "evi" in k_lower and "std" not in k_lower and evi_arr is None:
                        evi_arr = np.array(ds.variables[k][:], dtype=np.int16)
                    elif ("pixel reliability" in k_lower or "pixel_reliability" in k_lower) and qa_arr is None:
                        qa_arr = np.array(ds.variables[k][:], dtype=np.int8)
                if ndvi_arr is not None:
                    logger.info(f"Successfully decoded MODIS HDF-EOS subdatasets via netCDF4: {file_path}")
        except Exception as e:
            logger.debug(f"NetCDF4 reading of MODIS file failed: {e}")

        # 2. Attempt Rasterio (for GeoTIFF / COG)
        if ndvi_arr is None:
            try:
                import rasterio
                with rasterio.open(file_path) as src:
                    if src.count >= 1:
                        ndvi_arr = src.read(1)
                    if src.count >= 2:
                        evi_arr = src.read(2)
                    if src.count >= 3:
                        qa_arr = src.read(3)
                    logger.info(f"Successfully decoded MODIS GeoTIFF via rasterio: {file_path}")
            except Exception as e:
                logger.debug(f"Rasterio reading of MODIS file failed: {e}")

        if ndvi_arr is None:
            raise ValueError(f"Could not extract MODIS NDVI subdataset from {file_path}")

        # Decode features with spatial slicing & scale factor
        features: List[Dict[str, Any]] = []
        valid_ndvi_values: List[float] = []

        if bbox:
            min_lon, min_lat, max_lon, max_lat = bbox
            r_start, c_start = cls.lat_lon_to_row_col(max_lat, min_lon)
            r_end, c_end = cls.lat_lon_to_row_col(min_lat, max_lon)
            r_min, r_max = min(r_start, r_end), max(r_start, r_end)
            c_min, c_max = min(c_start, c_end), max(c_start, c_end)
        else:
            r_min, r_max = 0, ndvi_arr.shape[0] - 1
            c_min, c_max = 0, ndvi_arr.shape[1] - 1

        row_indices = list(range(r_min, min(r_max + 1, ndvi_arr.shape[0]), max(1, stride)))
        col_indices = list(range(c_min, min(c_max + 1, ndvi_arr.shape[1]), max(1, stride)))

        total = len(row_indices) * len(col_indices)
        if total > max_features:
            step = int(math.ceil(math.sqrt(total / max_features)))
            row_indices = row_indices[::step]
            col_indices = col_indices[::step]

        for r in row_indices:
            for c in col_indices:
                raw_ndvi = int(ndvi_arr[r, c])
                is_valid, ndvi = cls.decode_raw_value(raw_ndvi)
                if not is_valid or ndvi is None:
                    continue

                evi = None
                if evi_arr is not None and r < evi_arr.shape[0] and c < evi_arr.shape[1]:
                    e_valid, dec_evi = cls.decode_raw_value(int(evi_arr[r, c]))
                    if e_valid:
                        evi = dec_evi

                qa_info = {"category": "Good Data (Reliable)", "usable": True, "confidence": 1.0, "code": 0}
                if qa_arr is not None and r < qa_arr.shape[0] and c < qa_arr.shape[1]:
                    qa_info = cls.decode_pixel_reliability(int(qa_arr[r, c]))

                lat, lon = cls.row_col_to_lat_lon(r, c)
                valid_ndvi_values.append(ndvi)
                features.append({
                    "type": "Feature",
                    "geometry": {"type": "Point", "coordinates": [lon, lat]},
                    "properties": {
                        "dataset_id": "MOD13C2",
                        "date": date_str,
                        "latitude": lat,
                        "longitude": lon,
                        "ndvi": ndvi,
                        "evi": evi,
                        "quality_reliability": qa_info.get("category"),
                        "quality_usable": qa_info.get("usable", True),
                        "unit": "dimensionless ratio (-0.2000 to +1.0000)",
                        "sensor": "MODIS Terra (0.05° CMG)",
                        "data_status": "observation",
                        "is_observation": True,
                        "granule_id": granule_id,
                    },
                })

        extracted_vars = ["ndvi"]
        if evi_arr is not None:
            extracted_vars.append("evi")
        if qa_arr is not None:
            extracted_vars.append("pixel_reliability")

        # Spatial bounding box
        if features:
            lats = [f["geometry"]["coordinates"][1] for f in features]
            lons = [f["geometry"]["coordinates"][0] for f in features]
            spatial_bbox = (min(lons), min(lats), max(lons), max(lats))
        else:
            spatial_bbox = (-180.0, -90.0, 180.0, 90.0)

        return {
            "dataset_id": "MOD13C2",
            "granule_id": granule_id,
            "date": date_str,
            "feature_count": len(features),
            "features": features,
            "extracted_variables": extracted_vars,
            "units": {"ndvi": "dimensionless ratio (-0.2000 to +1.0000)", "evi": "dimensionless ratio (-0.2000 to +1.0000)"},
            "quality_flags": {"pixel_reliability_decoded": qa_arr is not None},
            "spatial_bounding_box": spatial_bbox,
        }
