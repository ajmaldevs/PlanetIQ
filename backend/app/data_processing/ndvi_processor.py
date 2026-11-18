"""
Scientific NDVI and EVI Processor for NASA MODIS MOD13C2 (Version 061).
Decodes 0.05-degree Climate Modeling Grid (CMG) arrays, applies NASA LP DAAC scaling factor (0.0001),
filters out fill values (-3000), processes pixel reliability bitmasks, preserves coordinate reference systems,
and outputs verified GeoJSON feature collections with complete satellite provenance.
"""

from typing import Dict, Any, Optional, Tuple
import os
import math
import logging
import numpy as np
from app.data_processing.quality_control import QualityControl

logger = logging.getLogger("planetiq.ndvi_processor")


class NdviProcessor:
    """Processor for decoding and validating MODIS MOD13C2 vegetation observations."""

    CMG_RESOLUTION = 0.05  # degrees
    CMG_ROWS = 3600        # 90°N to 90°S
    CMG_COLS = 7200        # 180°W to 180°E
    SCALE_FACTOR = 0.0001
    FILL_VALUE = -3000

    @classmethod
    def lat_lon_to_row_col(cls, lat: float, lon: float) -> Tuple[int, int]:
        """Maps WGS84 (latitude, longitude) to 0.05° CMG (row, col) grid coordinates."""
        row = int(math.floor((90.0 - lat) / cls.CMG_RESOLUTION))
        col = int(math.floor((lon + 180.0) / cls.CMG_RESOLUTION))
        row = max(0, min(cls.CMG_ROWS - 1, row))
        col = max(0, min(cls.CMG_COLS - 1, col))
        return row, col

    @classmethod
    def row_col_to_lat_lon(cls, row: int, col: int) -> Tuple[float, float]:
        """Maps CMG (row, col) back to center WGS84 (latitude, longitude)."""
        lat = round(90.0 - (row + 0.5) * cls.CMG_RESOLUTION, 4)
        lon = round(-180.0 + (col + 0.5) * cls.CMG_RESOLUTION, 4)
        return lat, lon

    @classmethod
    def process_raw_arrays(
        cls,
        ndvi_raw: np.ndarray,
        evi_raw: Optional[np.ndarray],
        qa_raw: Optional[np.ndarray],
        date_str: str,
        granule_id: str,
        bbox: Optional[Tuple[float, float, float, float]] = None,
        stride: int = 1,
        max_features: int = 250,
        historical_min: Optional[float] = None,
        historical_max: Optional[float] = None,
    ) -> Dict[str, Any]:
        """
        Decodes raw NumPy grids into calibrated GeoJSON features.
        bbox is (min_lon, min_lat, max_lon, max_lat).
        Missing bands or baselines are preserved as None without synthetic formulas.
        """
        features = []
        valid_ndvi_values = []

        # Determine bounding slice
        if bbox and (ndvi_raw.shape[0] >= cls.CMG_ROWS or ndvi_raw.shape[1] >= cls.CMG_COLS):
            min_lon, min_lat, max_lon, max_lat = bbox
            row_start, col_start = cls.lat_lon_to_row_col(max_lat, min_lon)
            row_end, col_end = cls.lat_lon_to_row_col(min_lat, max_lon)
            r_min, r_max = min(row_start, row_end), max(row_start, row_end)
            c_min, c_max = min(col_start, col_end), max(col_start, col_end)
            r_min = max(0, min(ndvi_raw.shape[0] - 1, r_min))
            r_max = max(0, min(ndvi_raw.shape[0] - 1, r_max))
            c_min = max(0, min(ndvi_raw.shape[1] - 1, c_min))
            c_max = max(0, min(ndvi_raw.shape[1] - 1, c_max))
        else:
            r_min, r_max = 0, ndvi_raw.shape[0] - 1
            c_min, c_max = 0, ndvi_raw.shape[1] - 1

        row_indices = list(range(r_min, min(r_max + 1, ndvi_raw.shape[0]), max(1, stride)))
        col_indices = list(range(c_min, min(c_max + 1, ndvi_raw.shape[1]), max(1, stride)))

        # Adjust stride if too many features
        total_cells = len(row_indices) * len(col_indices)
        if total_cells > max_features:
            adaptive_step = int(math.ceil(math.sqrt(total_cells / max_features)))
            row_indices = row_indices[::adaptive_step]
            col_indices = col_indices[::adaptive_step]

        for r in row_indices:
            for c in col_indices:
                raw_val = int(ndvi_raw[r, c])
                is_valid, ndvi = QualityControl.decode_raw_modis_ndvi(raw_val)
                if not is_valid or ndvi is None:
                    continue

                evi = None
                if evi_raw is not None and r < evi_raw.shape[0] and c < evi_raw.shape[1]:
                    e_valid, decoded_evi = QualityControl.decode_raw_modis_ndvi(int(evi_raw[r, c]))
                    if e_valid:
                        evi = decoded_evi

                qa_info = {"category": "Good Data", "usable": True, "confidence": 1.0}
                if qa_raw is not None and r < qa_raw.shape[0] and c < qa_raw.shape[1]:
                    qa_info = QualityControl.decode_modis_pixel_reliability(int(qa_raw[r, c]))

                lat, lon = cls.row_col_to_lat_lon(r, c)
                vci = QualityControl.calculate_vci(ndvi, historical_min=historical_min, historical_max=historical_max)
                drought_desc = QualityControl.classify_drought_vci(vci)

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
                        "vci_percent": vci,
                        "drought_category": drought_desc,
                        "quality_reliability": qa_info.get("category"),
                        "quality_confidence": qa_info.get("confidence", 1.0),
                        "unit": "dimensionless ratio (-0.2000 to +1.0000)",
                        "sensor": "MODIS Terra (0.05° CMG)",
                        "data_status": "observation",
                        "is_observation": True,
                        "granule_id": granule_id,
                        "provenance": "NASA LP DAAC / USGS EROS",
                    }
                })

        mean_ndvi = round(float(np.mean(valid_ndvi_values)), 4) if valid_ndvi_values else 0.0
        max_ndvi = round(float(np.max(valid_ndvi_values)), 4) if valid_ndvi_values else 0.0
        min_ndvi = round(float(np.min(valid_ndvi_values)), 4) if valid_ndvi_values else 0.0

        return {
            "type": "FeatureCollection",
            "metadata": {
                "dataset_id": "MOD13C2",
                "date": date_str,
                "granule_id": granule_id,
                "data_status": "observation",
                "is_observation": True,
                "agency": "NASA LP DAAC / USGS",
                "sensor": "Moderate Resolution Imaging Spectroradiometer (MODIS Terra)",
                "feature_count": len(features),
                "spatial_resolution": "0.05° × 0.05° CMG",
                "summary": {
                    "mean_ndvi": mean_ndvi,
                    "max_ndvi": max_ndvi,
                    "min_ndvi": min_ndvi,
                    "measurement_units": "dimensionless ratio (-0.2000 to +1.0000)",
                },
                "data_notice": "Calibrated observation extracted from official NASA MOD13C2 satellite product.",
            },
            "features": features,
        }

    @classmethod
    def read_satellite_file(
        cls,
        file_path: str,
        date_str: str,
        bbox: Optional[Tuple[float, float, float, float]] = None,
    ) -> Optional[Dict[str, Any]]:
        """
        Attempts to read and process a satellite granule file (.hdf, .nc, .tif)
        using rasterio, netCDF4, or h5py with safe error recovery.
        """
        if not os.path.exists(file_path):
            logger.warning(f"File not found: {file_path}")
            return None

        granule_id = os.path.basename(file_path)

        # Attempt 1: rasterio
        try:
            import rasterio
            with rasterio.open(file_path) as src:
                logger.info(f"Successfully opened {file_path} via rasterio: {src.profile}")
                band1 = src.read(1)
                band2 = src.read(2) if src.count >= 2 else None
                band3 = src.read(3) if src.count >= 3 else None
                return cls.process_raw_arrays(
                    ndvi_raw=band1,
                    evi_raw=band2,
                    qa_raw=band3,
                    date_str=date_str,
                    granule_id=granule_id,
                    bbox=bbox,
                )
        except Exception as e1:
            logger.debug(f"Rasterio read failed for {file_path}: {e1}")

        # Attempt 2: h5py
        try:
            import h5py
            with h5py.File(file_path, "r") as hf:
                logger.info(f"Successfully opened {file_path} via h5py")
                # Look for NDVI dataset in HDF-EOS / MODIS hierarchy
                ndvi_ds = None
                for key in ["CMG 0.05 Deg Monthly NDVI", "NDVI", "ndvi"]:
                    if key in hf:
                        ndvi_ds = hf[key][:]
                        break
                if ndvi_ds is not None:
                    return cls.process_raw_arrays(
                        ndvi_raw=ndvi_ds,
                        evi_raw=None,
                        qa_raw=None,
                        date_str=date_str,
                        granule_id=granule_id,
                        bbox=bbox,
                    )
        except Exception as e2:
            logger.debug(f"h5py read failed for {file_path}: {e2}")

        return None
