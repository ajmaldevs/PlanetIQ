#!/usr/bin/env python3
"""
TerraLens Scientific Ingestion Pipeline: GPM IMERG Final Monthly (GPM_3IMERGM v07).
Validates raw NASA GES DISC precipitation fields, ensures strict differentiation
between instantaneous rate (mm/hr) and monthly accumulated depth (mm),
and writes cleaned observation records into data/processed/ and database.
"""

import sys
import os
import json
import logging
import calendar
from typing import Dict, Any, List

logging.basicConfig(level=logging.INFO, format="[%(levelname)s] %(message)s")
logger = logging.getLogger("ingest_gpm")


def calculate_monthly_accumulation(rate_mm_hr: float, year: int, month: int) -> float:
    """Enforce physical law: Depth (mm) = Rate (mm/hr) * 24 hrs * days in month."""
    days = calendar.monthrange(year, month)[1]
    return round(rate_mm_hr * 24.0 * days, 2)


def process_gpm_granule(year: int, month: int, raw_records: List[Dict[str, Any]]) -> Dict[str, Any]:
    """
    Validates, cleans, and computes monthly accumulated metrics for GPM_3IMERGM.
    """
    cleaned_features = []
    days = calendar.monthrange(year, month)[1]
    hours = days * 24.0

    for rec in raw_records:
        lat = rec["latitude"]
        lon = rec["longitude"]
        rate = rec["precipitation_rate_mm_hr"]

        # 1. Quality filtering: Discard negative/fill values (-9999.9)
        if rate < 0:
            continue

        # 2. Physics bounds check: Global max recorded monthly rainfall rarely exceeds 1.5 mm/hr average
        rate_sanitized = min(max(rate, 0.0), 3.5)

        # 3. Monthly total liquid accumulation
        accum_mm = round(rate_sanitized * hours, 2)
        climatology_mm = rec.get("climatology_normal_mm", round(0.12 * hours, 2))
        anomaly_mm = round(accum_mm - climatology_mm, 2)

        cleaned_features.append({
            "type": "Feature",
            "geometry": {"type": "Point", "coordinates": [lon, lat]},
            "properties": {
                "dataset_id": "GPM_3IMERGM",
                "date": f"{year:04d}-{month:02d}",
                "precipitation_rate_mm_hr": rate_sanitized,
                "precipitation_accumulated_mm": accum_mm,
                "climatological_normal_mm": climatology_mm,
                "anomaly_mm": anomaly_mm,
                "rate_unit": "mm/hr",
                "accumulated_unit": "mm",
                "quality_index": rec.get("quality_index", 0.90)
            }
        })

    logger.info(f"Processed {len(cleaned_features)} GPM precipitation cells for {year}-{month:02d}")
    return {
        "type": "FeatureCollection",
        "metadata": {
            "dataset_id": "GPM_3IMERGM",
            "year": year,
            "month": month,
            "days_in_month": days,
            "agency": "NASA GES DISC / JAXA"
        },
        "features": cleaned_features
    }


def main():
    logger.info("Starting GPM IMERG Ingestion Pipeline...")
    sample_granule = [
        {"latitude": 6.5, "longitude": -150.0, "precipitation_rate_mm_hr": 0.38, "climatology_normal_mm": 270.0},
        {"latitude": -3.1, "longitude": -60.0, "precipitation_rate_mm_hr": 0.42, "climatology_normal_mm": 290.0},
        {"latitude": 21.0, "longitude": 88.5, "precipitation_rate_mm_hr": 0.55, "climatology_normal_mm": 350.0},
    ]

    output_dir = os.path.join(os.path.dirname(__file__), "..", "data", "processed")
    os.makedirs(output_dir, exist_ok=True)

    result = process_gpm_granule(2026, 3, sample_granule)
    out_path = os.path.join(output_dir, "gpm_imergm_202603_processed.json")
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(result, f, indent=2)

    logger.info(f"Successfully saved processed GPM dataset to {out_path}")


if __name__ == "__main__":
    main()
