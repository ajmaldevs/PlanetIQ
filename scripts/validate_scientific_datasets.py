#!/usr/bin/env python3
"""
TerraLens Automated Scientific Dataset Validation Suite.
Checks physical unit conformity, sensor bounds, and teleconnection rules:
1. GPM: rate (mm/hr) vs monthly accumulation (mm) calculation.
2. SWOT: SSHA bounds and meters units.
3. MODIS: NDVI range [-0.2, 1.0].
4. Teleconnections: Correlation != causation assertion.
"""

import sys
import os

# Add backend to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "backend"))

from app.services.atmosphere_service import AtmosphereService
from app.services.ocean_service import OceanService
from app.services.land_service import LandService
from app.services.cross_system_service import CrossSystemService
from app.services.dataset_service import DatasetService


def validate_all():
    errors = []
    print("=" * 60)
    print(" TerraLens Scientific Validation Suite")
    print("=" * 60)

    # 1. Dataset Catalog Provenance Check
    print("[1/5] Validating Catalog Provenance...")
    catalog = DatasetService.get_all_datasets()
    assert len(catalog) == 3, f"Expected 3 datasets in catalog, got {len(catalog)}"
    ids = [d.id for d in catalog]
    assert "SWOT_L2_LR_SSH" in ids, "Missing SWOT Option A dataset"
    assert "GPM_3IMERGM" in ids, "Missing GPM IMERG dataset"
    assert "MOD13C2" in ids, "Missing MODIS MOD13C2 dataset"
    print("  -> Passed: SWOT, GPM, and MODIS metadata verified.")

    # 2. Atmosphere GPM IMERG Unit Check
    print("[2/5] Validating Atmosphere GPM IMERG Units...")
    atmo_grid = AtmosphereService.get_spatial_grid(date_str="2026-03")
    for feat in atmo_grid.features:
        p = feat.properties
        rate = p["precipitation_rate_mm_hr"]
        accum = p["precipitation_accumulated_mm"]
        if rate < 0:
            errors.append(f"Negative precipitation rate found: {rate}")
        if accum < 0:
            errors.append(f"Negative accumulated precipitation found: {accum}")
        # Mathematical rule: accum must equal rate * 24 * 31 (for March)
        expected_accum = round(rate * 24.0 * 31.0, 2)
        if abs(accum - expected_accum) > 0.05:
            errors.append(f"Precipitation math inconsistency: rate={rate}, accum={accum}, expected={expected_accum}")
    print(f"  -> Passed: {len(atmo_grid.features)} atmospheric grid points verified for rate/accumulation consistency.")

    # 3. Ocean SWOT KaRIn Physical Checks
    print("[3/5] Validating Ocean SWOT KaRIn Option A Physics...")
    ocean_grid = OceanService.get_spatial_observations(date_str="2026-03")
    for feat in ocean_grid.features:
        p = feat.properties
        ssha = p["ssha_karin_m"]
        unit = p["unit"]
        if unit != "meters (m)":
            errors.append(f"Invalid ocean unit: {unit}")
        if abs(ssha) > 2.0:
            errors.append(f"Unphysical SSHA excursion: {ssha} m")
    print(f"  -> Passed: {len(ocean_grid.features)} SWOT ocean features verified within physical boundaries.")

    # 4. Land MODIS NDVI Radiometric Checks
    print("[4/5] Validating Land MODIS NDVI/EVI Physics...")
    land_grid = LandService.get_spatial_grid(date_str="2026-03")
    for feat in land_grid.features:
        p = feat.properties
        ndvi = p["ndvi"]
        vci = p["vci_percent"]
        if ndvi < -0.2 or ndvi > 1.0:
            errors.append(f"NDVI outside radiometric boundary [-0.2, 1.0]: {ndvi}")
        if vci < 0.0 or vci > 100.0:
            errors.append(f"VCI outside percentage boundary [0, 100]: {vci}")
    print(f"  -> Passed: {len(land_grid.features)} MODIS land features verified.")

    # 5. Cross-System Causation Check
    print("[5/5] Validating Cross-System Scientific Integrity...")
    analysis = CrossSystemService.get_teleconnection_analysis("enso_walker")
    causation_note = analysis.causation_vs_correlation_note
    if "CRITICAL SCIENTIFIC PRINCIPLE" not in causation_note or "correlation" not in causation_note.lower():
        errors.append("Cross-system analysis lacks required causation vs correlation safeguard.")
    print("  -> Passed: Causation vs correlation scientific safeguards active.")

    print("=" * 60)
    if errors:
        print(f"FAILED with {len(errors)} scientific validation errors:")
        for err in errors:
            print(f" - {err}")
        sys.exit(1)
    else:
        print("ALL SCIENTIFIC VALIDATION CRITERIA PASSED SUCCESSFULLY.")
        print("=" * 60)


if __name__ == "__main__":
    validate_all()
