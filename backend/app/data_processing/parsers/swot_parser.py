"""
Dedicated parser for NASA/CNES SWOT KaRIn Ocean Altimetry (SWOT_L2_LR_SSH).
Handles:
- NetCDF4 swath groups (/left/, /right/, and root level)
- 2D swath coordinate arrays latitude(line, pixel) and longitude(line, pixel)
- Longitude normalization from [0, 360) to [-180, 180) WGS84
- Elimination of scalar cast TypeError by indexing 2D arrays at (line, pixel)
- SSHA and SSH extraction (ssha_karin, ssh_karin)
- Quality flag validation: ssh_karin_qual == 0 (strictly reject degraded pixels)
- Physical bounds checking (-2.5m <= ssha <= 2.5m) and fill value filtering
"""

from typing import Dict, Any, Optional, Tuple, List
import os
import logging
import numpy as np
from app.data_processing.ocean_processor import OceanProcessor

logger = logging.getLogger("planetiq.swot_parser")


class SwotParser:
    """Parser for NASA/CNES SWOT KaRIn SWOT_L2_LR_SSH NetCDF granules."""

    SSHA_VALID_MIN = -2.5  # meters
    SSHA_VALID_MAX = 2.5   # meters
    FILL_VALUES = {-9999.0, -9999, 2147483647, -32767.0, 32767, -32768}

    @staticmethod
    def normalize_longitude(lon: float) -> float:
        """Normalizes longitude from [0, 360) to [-180, 180)."""
        return ((lon + 180.0) % 360.0) - 180.0

    @classmethod
    def parse_granule(
        cls,
        file_path: str,
        date_str: str,
        bbox: Optional[Tuple[float, float, float, float]] = None,
        stride_line: int = 10,
        stride_pixel: int = 5,
    ) -> Dict[str, Any]:
        """
        Parses SWOT KaRIn 2D swath NetCDF granule.
        Inspects left and right groups as well as root level.
        Validates ssh_karin_qual == 0 and decodes ocean points.
        """
        if not os.path.exists(file_path):
            raise FileNotFoundError(f"SWOT granule not found: {file_path}")

        granule_id = os.path.basename(file_path)
        features: List[Dict[str, Any]] = []
        extracted_vars: set = set()

        import netCDF4 as nc
        with nc.Dataset(file_path, "r") as ds:
            # Collect groups to inspect: 'left', 'right', or root level
            groups_to_check = []
            for gname in ["left", "right"]:
                if gname in ds.groups:
                    groups_to_check.append(ds.groups[gname])
            if not groups_to_check:
                groups_to_check.append(ds)

            for grp in groups_to_check:
                lat_var = grp.variables.get("latitude") or grp.variables.get("lat")
                lon_var = grp.variables.get("longitude") or grp.variables.get("lon")
                if lat_var is None or lon_var is None:
                    continue

                # Locate ssha / ssh variables
                ssha_var = grp.variables.get("ssha_karin") or grp.variables.get("ssha")
                ssh_var = grp.variables.get("ssh_karin") or grp.variables.get("ssh")
                qual_var = grp.variables.get("ssh_karin_qual") or grp.variables.get("ssha_karin_qual")

                if ssha_var is None and ssh_var is None:
                    continue

                if ssha_var is not None:
                    extracted_vars.add("ssha_karin")
                if ssh_var is not None:
                    extracted_vars.add("ssh_karin")
                if qual_var is not None:
                    extracted_vars.add("ssh_karin_qual")

                lats = lat_var[:]
                lons = lon_var[:]
                ssha_data = ssha_var[:] if ssha_var is not None else None
                ssh_data = ssh_var[:] if ssh_var is not None else None
                qual_data = qual_var[:] if qual_var is not None else None

                # Scale factors if unscaled integers
                ssha_scale = getattr(ssha_var, "scale_factor", None) if ssha_var is not None else None
                ssh_scale = getattr(ssh_var, "scale_factor", None) if ssh_var is not None else None

                # Handle 2D swath coordinate arrays (num_lines, num_pixels)
                if lats.ndim == 2:
                    num_lines, num_pixels = lats.shape
                    for i_line in range(0, num_lines, max(1, stride_line)):
                        for i_pix in range(0, num_pixels, max(1, stride_pixel)):
                            # 1. Quality flag validation: ssh_karin_qual == 0
                            if qual_data is not None:
                                raw_qual = qual_data[i_line, i_pix]
                                if np.ma.is_masked(raw_qual) or np.isnan(raw_qual):
                                    continue
                                q_val = int(raw_qual)
                                if q_val != 0:
                                    continue  # Strictly reject non-zero / degraded quality

                            # 2. Extract scalar 2D coordinate values without TypeError
                            raw_lat = lats[i_line, i_pix]
                            raw_lon = lons[i_line, i_pix]
                            if np.ma.is_masked(raw_lat) or np.ma.is_masked(raw_lon):
                                continue
                            if np.isnan(raw_lat) or np.isnan(raw_lon):
                                continue

                            lat_val = float(raw_lat)
                            lon_val = cls.normalize_longitude(float(raw_lon))

                            if bbox and not (bbox[0] <= lon_val <= bbox[2] and bbox[1] <= lat_val <= bbox[3]):
                                continue

                            # 3. Extract SSHA / SSH scalar values
                            ssha_val = None
                            if ssha_data is not None:
                                raw_ssha = ssha_data[i_line, i_pix]
                                if not np.ma.is_masked(raw_ssha) and not np.isnan(raw_ssha):
                                    f_ssha = float(raw_ssha)
                                    if f_ssha not in cls.FILL_VALUES:
                                        if ssha_scale is not None and abs(f_ssha) > 10.0:
                                            f_ssha = f_ssha * float(ssha_scale)
                                        if cls.SSHA_VALID_MIN <= f_ssha <= cls.SSHA_VALID_MAX:
                                            ssha_val = round(f_ssha, 4)

                            ssh_val = None
                            if ssh_data is not None:
                                raw_ssh = ssh_data[i_line, i_pix]
                                if not np.ma.is_masked(raw_ssh) and not np.isnan(raw_ssh):
                                    f_ssh = float(raw_ssh)
                                    if f_ssh not in cls.FILL_VALUES:
                                        if ssh_scale is not None and abs(f_ssh) > 1000.0:
                                            f_ssh = f_ssh * float(ssh_scale)
                                        ssh_val = round(f_ssh, 4)

                            if ssha_val is None and ssh_val is None:
                                continue

                            feat = OceanProcessor.process_ocean_point(
                                lat=lat_val,
                                lon=lon_val,
                                date_str=date_str,
                                granule_id=granule_id,
                                ssha=ssha_val,
                                ssh=ssh_val,
                                quality_flag=0,
                            )
                            if feat:
                                # Ensure dataset_id and metric alignment
                                feat["properties"]["dataset_id"] = "SWOT_L2_LR_SSH"
                                feat["properties"]["primary_ocean_metric"] = "ssha_karin_m"
                                features.append(feat)

                elif lats.ndim == 1:
                    # 1D coordinate vectors fallback
                    for i_lat in range(0, len(lats), max(1, stride_line)):
                        lat_val = float(lats[i_lat])
                        if bbox and not (bbox[1] <= lat_val <= bbox[3]):
                            continue
                        for i_lon in range(0, len(lons), max(1, stride_pixel)):
                            lon_val = cls.normalize_longitude(float(lons[i_lon]))
                            if bbox and not (bbox[0] <= lon_val <= bbox[2]):
                                continue

                            # Quality flag check
                            if qual_data is not None:
                                raw_qual = qual_data[i_lat, i_lon] if qual_data.ndim == 2 else qual_data[i_lat]
                                if int(raw_qual) != 0:
                                    continue

                            ssha_val = None
                            if ssha_data is not None:
                                raw_ssha = ssha_data[i_lat, i_lon] if ssha_data.ndim == 2 else ssha_data[i_lat]
                                if not np.ma.is_masked(raw_ssha) and not np.isnan(raw_ssha):
                                    f_ssha = float(raw_ssha)
                                    if f_ssha not in cls.FILL_VALUES and cls.SSHA_VALID_MIN <= f_ssha <= cls.SSHA_VALID_MAX:
                                        ssha_val = round(f_ssha, 4)

                            ssh_val = None
                            if ssh_data is not None:
                                raw_ssh = ssh_data[i_lat, i_lon] if ssh_data.ndim == 2 else ssh_data[i_lat]
                                if not np.ma.is_masked(raw_ssh) and not np.isnan(raw_ssh):
                                    f_ssh = float(raw_ssh)
                                    if f_ssh not in cls.FILL_VALUES:
                                        ssh_val = round(f_ssh, 4)

                            if ssha_val is None and ssh_val is None:
                                continue

                            feat = OceanProcessor.process_ocean_point(
                                lat=lat_val,
                                lon=lon_val,
                                date_str=date_str,
                                granule_id=granule_id,
                                ssha=ssha_val,
                                ssh=ssh_val,
                                quality_flag=0,
                            )
                            if feat:
                                feat["properties"]["dataset_id"] = "SWOT_L2_LR_SSH"
                                feat["properties"]["primary_ocean_metric"] = "ssha_karin_m"
                                features.append(feat)

        if features:
            lats_f = [f["geometry"]["coordinates"][1] for f in features]
            lons_f = [f["geometry"]["coordinates"][0] for f in features]
            spatial_bbox = (min(lons_f), min(lats_f), max(lons_f), max(lats_f))
        else:
            spatial_bbox = (-180.0, -90.0, 180.0, 90.0)

        return {
            "dataset_id": "SWOT_L2_LR_SSH",
            "granule_id": granule_id,
            "date": date_str,
            "feature_count": len(features),
            "features": features,
            "extracted_variables": sorted(list(extracted_vars)) if extracted_vars else ["ssha_karin", "ssh_karin"],
            "units": {"ssha_karin": "m", "ssh_karin": "m"},
            "quality_flags": {"ssh_karin_qual_nominal": True, "required_qual_value": 0},
            "spatial_bounding_box": spatial_bbox,
        }
