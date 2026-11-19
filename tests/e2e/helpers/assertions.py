"""
tests/e2e/helpers/assertions.py
Comprehensive opaque-box assertion helper to eliminate synthetic defaults.
"""
from typing import Any, Dict, List, Optional, Union, Tuple, Set
import math


FORBIDDEN_NUMERICAL_DEFAULTS: Dict[float, str] = {
    15.20: "Arbitrary geoid SSH constant (15.20 m) in ai_tools.py:237",
    0.85: "Arbitrary ADT reference constant (0.85 m) in ai_tools.py:238",
    0.38: "Arbitrary default chlorophyll-a (0.38 mg/m3) in ai_tools.py:318",
    26.5: "Arbitrary default SST (26.5 C) in ai_tools.py:319",
    78.5: "Arbitrary gauge weighting index (78.5) in ai_tools.py:428",
}

FORBIDDEN_TELECONNECTION_TUPLES = [
    ("2024-01", 0.16, -42.0, -0.05),
    ("2024-04", 0.11, -35.0, -0.07),
    ("2024-07", 0.02, -10.0, -0.03),
    ("2024-10", -0.08, 22.0, 0.02),
    ("2025-01", -0.14, 55.0, 0.06),
    ("2025-04", -0.10, 38.0, 0.05),
    ("2025-07", -0.03, 12.0, 0.03),
    ("2025-10", 0.01, -4.0, 0.01),
    ("2026-01", 0.06, -18.0, -0.02),
    ("2026-04", 0.09, -24.0, -0.04),
    ("2026-07", 0.13, -36.0, -0.06),
    ("2026-10", 0.15, -48.0, -0.08),
]


def _parse_float(val: Any) -> Optional[float]:
    """Attempts to parse val into a float if it is a float/int or numeric string."""
    if isinstance(val, (int, float)) and not isinstance(val, bool):
        return float(val)
    if isinstance(val, str):
        try:
            return float(val.strip())
        except ValueError:
            return None
    return None


def _is_coordinate_context(context_path: str) -> bool:
    """Returns True if context_path represents a geographic coordinate where 26.5 or 78.5 is legitimate."""
    if not context_path:
        return False
    low = context_path.lower()
    parts = low.replace("[", ".").replace("]", "").split(".")
    field_parts = [p for p in parts if not p.isdigit() and p]
    if not field_parts:
        return False
    last_field = field_parts[-1]
    if last_field in (
        "latitude", "longitude", "lat", "lon", "lng",
        "coordinates", "coords", "bbox", "center"
    ):
        return True
    return False


def _extract_ssha(payload: Dict[str, Any]) -> Optional[float]:
    """Extracts SSHA from common dictionary field names."""
    if not isinstance(payload, dict):
        return None
    lower_dict = {str(k).lower(): v for k, v in payload.items()}
    for key in (
        "ocean_ssha_m",
        "ocean_ssha",
        "sea_surface_height_anomaly_m",
        "ssha_mean_m",
        "ssha",
        "ssha_m",
        "ssha_karin",
        "ssha_karin_m",
    ):
        if key in lower_dict and lower_dict[key] is not None:
            val = _parse_float(lower_dict[key])
            if val is not None:
                return val
    return None


def assert_no_synthetic_defaults(payload: Any, context_path: str = "", current_dataset_id: str = "") -> None:
    """
    Recursively inspects API responses, Pydantic models, or dict/list/set/tuple payloads.
    Fails with AssertionError if any forbidden synthetic default or pattern is detected.
    """
    # Convert Pydantic models to dict if applicable
    if hasattr(payload, "model_dump"):
        payload = payload.model_dump()
    elif hasattr(payload, "dict"):
        payload = payload.dict()

    # 1. Handle scalar numbers (int, float)
    if isinstance(payload, (int, float)) and not isinstance(payload, bool):
        for forbidden_val, reason in FORBIDDEN_NUMERICAL_DEFAULTS.items():
            if abs(payload - forbidden_val) < 1e-4:
                if forbidden_val in (26.5, 78.5) and _is_coordinate_context(context_path):
                    continue
                path_desc = f" at '{context_path}'" if context_path else ""
                raise AssertionError(
                    f"Forbidden synthetic default detected{path_desc}: {payload} ({reason})"
                )
        return

    # 2. Handle string-encoded numbers
    if isinstance(payload, str):
        val_str = payload.strip()
        try:
            num_val = float(val_str)
            for forbidden_val, reason in FORBIDDEN_NUMERICAL_DEFAULTS.items():
                if abs(num_val - forbidden_val) < 1e-4:
                    if forbidden_val in (26.5, 78.5) and _is_coordinate_context(context_path):
                        continue
                    path_desc = f" at '{context_path}'" if context_path else ""
                    raise AssertionError(
                        f"Forbidden synthetic default string detected{path_desc}: '{payload}' ({reason})"
                    )
        except ValueError:
            pass
        return

    # 3. Handle sequences (list, tuple, set)
    if isinstance(payload, (list, tuple, set)):
        # Check if list contains dicts with hardcoded teleconnection values (even short slices)
        for item in payload:
            if isinstance(item, dict):
                date = item.get("date")
                ssha = _extract_ssha(item)
                precip = _parse_float(
                    item.get("atmosphere_precipitation_anomaly_mm")
                    if item.get("atmosphere_precipitation_anomaly_mm") is not None
                    else item.get("precip_anomaly")
                )
                ndvi = _parse_float(
                    item.get("land_ndvi_anomaly")
                    if item.get("land_ndvi_anomaly") is not None
                    else item.get("ndvi_anomaly")
                )
                for (f_date, f_ssha, f_precip, f_ndvi) in FORBIDDEN_TELECONNECTION_TUPLES:
                    if (
                        date == f_date
                        and ssha is not None and abs(ssha - f_ssha) < 1e-3
                        and precip is not None and abs(precip - f_precip) < 1e-3
                        and ndvi is not None and abs(ndvi - f_ndvi) < 1e-3
                    ):
                        raise AssertionError(
                            f"Forbidden hardcoded teleconnection tuple detected at {context_path}: "
                            f"date={date}, ssha={ssha}, precip={precip}, ndvi={ndvi}"
                        )

        for i, item in enumerate(payload):
            sub_path = f"{context_path}[{i}]" if context_path else f"[{i}]"
            assert_no_synthetic_defaults(item, sub_path, current_dataset_id)
        return

    # 4. Handle dictionaries
    if isinstance(payload, dict):
        # 4a. Check for synthetic statuses claimed as observations
        status = payload.get("data_status")
        is_obs = payload.get("is_observation")
        verif_status = payload.get("verification_status")

        if (
            status is not None
            and str(status).strip().lower() in ("simulated", "demonstration_model", "synthetic_fixture", "synthetic")
            and is_obs is True
        ):
            raise AssertionError(
                f"Contradictory scientific metadata at {context_path}: data_status='{status}' "
                f"but is_observation=True"
            )

        if (
            verif_status is not None
            and str(verif_status).strip().lower() in ("synthetic", "simulated", "synthetic_fixture")
            and is_obs is True
        ):
            raise AssertionError(
                f"Synthetic fixture claimed as genuine observation at {context_path}: "
                f"verification_status='{verif_status}' with is_observation=True"
            )

        # 4b. Check for synthetic test granule identifiers claimed as genuine
        granule_id = payload.get("granule_id") or payload.get("granule_ur")
        if isinstance(granule_id, str) and ("SYNTHETIC_" in granule_id or "DEV_FIXTURE" in granule_id):
            if is_obs is True or verif_status == "verified_observation":
                raise AssertionError(
                    f"Synthetic test granule returned as verified observation at {context_path}: {granule_id}"
                )

        # 4c. Check if single dict is a hardcoded teleconnection tuple
        date = payload.get("date")
        ssha = _extract_ssha(payload)
        precip = _parse_float(
            payload.get("atmosphere_precipitation_anomaly_mm")
            if payload.get("atmosphere_precipitation_anomaly_mm") is not None
            else payload.get("precip_anomaly")
        )
        ndvi = _parse_float(
            payload.get("land_ndvi_anomaly")
            if payload.get("land_ndvi_anomaly") is not None
            else payload.get("ndvi_anomaly")
        )
        if date and (ssha is not None or precip is not None or ndvi is not None):
            for (f_date, f_ssha, f_precip, f_ndvi) in FORBIDDEN_TELECONNECTION_TUPLES:
                if (
                    date == f_date
                    and ssha is not None and abs(ssha - f_ssha) < 1e-3
                    and precip is not None and abs(precip - f_precip) < 1e-3
                    and ndvi is not None and abs(ndvi - f_ndvi) < 1e-3
                ):
                    raise AssertionError(
                        f"Forbidden hardcoded teleconnection tuple detected at {context_path}: "
                        f"date={date}, ssha={ssha}, precip={precip}, ndvi={ndvi}"
                    )

        # 4d. Check fields in dict
        dataset_id = str(payload.get("dataset_id") or payload.get("dataset") or payload.get("collection_id") or current_dataset_id or "").strip()

        for field_name, value in payload.items():
            curr_path = f"{context_path}.{field_name}" if context_path else field_name
            num_val = _parse_float(value)

            # Check fabricated derived equations using aliases
            fn_lower = field_name.lower()
            if fn_lower in ("sea_surface_height_m", "ssh_m", "ssh_karin_m", "ssh"):
                field_ssha = _extract_ssha(payload)
                if field_ssha is not None and num_val is not None:
                    expected = 15.20 + field_ssha
                    if abs(num_val - expected) < 1e-4 or abs(num_val - round(expected, 3)) < 1e-4:
                        raise AssertionError(
                            f"Fabricated SSH geoid reference (15.20 + ssha) detected at '{curr_path}': {value}"
                        )

            if fn_lower in ("dynamic_topography_m", "adt_m", "adt"):
                field_ssha = _extract_ssha(payload)
                if field_ssha is not None and num_val is not None:
                    expected = 0.85 + field_ssha
                    if abs(num_val - expected) < 1e-4 or abs(num_val - round(expected, 3)) < 1e-4:
                        raise AssertionError(
                            f"Fabricated ADT reference (0.85 + ssha) detected at '{curr_path}': {value}"
                        )

            if fn_lower in ("eddy_kinetic_energy_cm2_s2", "eke", "eke_cm2_s2"):
                field_ssha = _extract_ssha(payload)
                if field_ssha is not None and num_val is not None:
                    expected = abs(field_ssha) * 120.0
                    if abs(num_val - expected) < 1e-4 or abs(num_val - round(expected, 1)) < 1e-4:
                        raise AssertionError(
                            f"Unphysical heuristic EKE (|ssha| * 120.0) detected at '{curr_path}': {value}"
                        )

            # Check for fake 0.0 on absent variables in observations / cross-contamination
            if fn_lower in ("ssha_mean_m", "ssha_anomaly_m", "sea_surface_height_anomaly_m") and num_val is not None and abs(num_val) < 1e-6:
                if not dataset_id:
                    raise AssertionError(
                        f"Cross-contamination detected at '{curr_path}': missing dataset_id when claiming zero {field_name} (must be null/None)"
                    )
                elif "SWOT" not in dataset_id.upper():
                    raise AssertionError(
                        f"Cross-contamination detected at '{curr_path}': {dataset_id} "
                        f"record injected synthetic 0.0 for {field_name} instead of null/None"
                    )

            if fn_lower in ("precipitation_accumulated_mm", "precipitation_rate_mm_hr") and num_val is not None and abs(num_val) < 1e-6:
                is_gpm = ("GPM" in dataset_id.upper() or "IMERG" in dataset_id.upper())
                if not dataset_id:
                    raise AssertionError(
                        f"Cross-contamination detected at '{curr_path}': missing dataset_id when claiming zero {field_name} (must be null/None)"
                    )
                elif not is_gpm:
                    raise AssertionError(
                        f"Cross-contamination detected at '{curr_path}': {dataset_id} "
                        f"record injected synthetic 0.0 for {field_name} instead of null/None"
                    )

            # Recurse into nested structures
            assert_no_synthetic_defaults(value, curr_path, dataset_id)
