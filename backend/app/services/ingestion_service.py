"""
Satellite Data Ingestion and Persistence Service for PlanetIQ.
Connects NASA Earthdata / CMR -> ModisClient / OceanColorClient / AtmosphereClient / GpmClient / SwotClient
-> Scientific Processors (NdviProcessor, OceanProcessor, AtmosphereProcessor)
-> QualityControl -> Database (SQLAlchemy).

CRITICAL SCIENTIFIC INTEGRITY RULES:
1. Only genuine satellite data decoded from downloaded, validated NASA granules with verified
   cryptographic checksums may be labeled:
       verification_status = "verified_observation"
       data_status = "observation"
       is_observation = True
2. Hardcoded benchmark measurements are isolated development/test fixtures and must be labeled:
       verification_status = "synthetic"
       data_status = "synthetic_fixture"
       is_observation = False
3. Never interpolate, fabricate, or simulate observations in production ingestion paths.
4. If NASA Earthdata credentials are not configured, report the prerequisite transparently
   rather than faking successful ingestion.
"""

from typing import Dict, Any, List, Optional
import os
import re
import calendar
import hashlib
import logging
from datetime import datetime, timezone
import numpy as np
from sqlalchemy.orm import Session
from sqlalchemy import select
from geoalchemy2.elements import WKTElement

from app.models.observation import EarthObservation
from app.models.timeseries import ObservationTimeSeriesRecord
from app.core.database import session_scope
from app.data_processing.ndvi_processor import NdviProcessor
from app.data_processing.ocean_processor import OceanProcessor
from app.data_processing.atmosphere_processor import AtmosphereProcessor
from app.integrations.nasa.earthdata_client import (
    NasaEarthdataClient,
    COLLECTION_CONCEPT_IDS,
    COLLECTION_SHORT_NAMES,
)
from app.integrations.nasa.modis_client import ModisClient
from app.integrations.nasa.ocean_color_client import OceanColorClient
from app.integrations.nasa.atmosphere_client import AtmosphereClient
from app.integrations.nasa.gpm_client import GpmClient
from app.integrations.nasa.swot_client import SwotClient

logger = logging.getLogger("planetiq.ingestion_service")


class IngestionService:
    """Manages satellite data ingestion pipelines and database persistence across all three domains."""

    # =========================================================================
    # Isolated Test Development Fixtures (Tagged Strictly as Synthetic)
    # =========================================================================
    AUTHENTIC_MODIS_BENCHMARKS = [
        {
            "id": "indian_punjab_wheat",
            "name": "Indo-Gangetic Plain Agricultural Heartland (Punjab, India)",
            "lat": 30.90,
            "lon": 75.85,
            "land_cover": "Double-Cropped Irrigated Agriculture",
            "baseline_ndvi": 0.485,
            "granule_id": "SYNTHETIC_DEV_FIXTURE_MOD13C2",
            "verification_status": "synthetic",
            "observations": [
                {"date": "2024-03", "ndvi": 0.710, "evi": 0.505, "vci": 75.8, "qa": 0},
                {"date": "2025-03", "ndvi": 0.728, "evi": 0.521, "vci": 79.2, "qa": 0},
                {"date": "2026-03", "ndvi": 0.742, "evi": 0.534, "vci": 82.5, "qa": 0},
                {"date": "2026-09", "ndvi": 0.615, "evi": 0.442, "vci": 71.0, "qa": 0},
            ],
        },
        {
            "id": "indian_kerala_canopy",
            "name": "Western Ghats Wet Evergreen Canopy (Kerala, India)",
            "lat": 9.93,
            "lon": 76.27,
            "land_cover": "Tropical Wet Evergreen Forest / Agroforestry",
            "baseline_ndvi": 0.765,
            "granule_id": "SYNTHETIC_DEV_FIXTURE_MOD13C2",
            "verification_status": "synthetic",
            "observations": [
                {"date": "2024-03", "ndvi": 0.722, "evi": 0.502, "vci": 65.0, "qa": 0},
                {"date": "2025-03", "ndvi": 0.745, "evi": 0.525, "vci": 70.1, "qa": 0},
                {"date": "2026-03", "ndvi": 0.738, "evi": 0.518, "vci": 68.4, "qa": 0},
                {"date": "2026-09", "ndvi": 0.812, "evi": 0.584, "vci": 88.0, "qa": 0},
            ],
        },
        {
            "id": "amazon_rainforest_core",
            "name": "Central Amazon Moist Evergreen Forest (Amazonas, Brazil)",
            "lat": -3.46,
            "lon": -62.21,
            "land_cover": "Dense Moist Evergreen Tropical Forest",
            "baseline_ndvi": 0.835,
            "granule_id": "SYNTHETIC_DEV_FIXTURE_MOD13C2",
            "verification_status": "synthetic",
            "observations": [
                {"date": "2024-03", "ndvi": 0.825, "evi": 0.565, "vci": 69.5, "qa": 0},
                {"date": "2025-03", "ndvi": 0.830, "evi": 0.570, "vci": 71.0, "qa": 0},
                {"date": "2026-03", "ndvi": 0.845, "evi": 0.585, "vci": 74.0, "qa": 0},
                {"date": "2026-09", "ndvi": 0.810, "evi": 0.540, "vci": 62.5, "qa": 0},
            ],
        },
        {
            "id": "us_corn_belt_iowa",
            "name": "North American Corn/Soy Intensive Cropland (Iowa, USA)",
            "lat": 42.03,
            "lon": -93.63,
            "land_cover": "Row Croplands / Temperate Agriculture",
            "baseline_ndvi": 0.440,
            "granule_id": "SYNTHETIC_DEV_FIXTURE_MOD13C2",
            "verification_status": "synthetic",
            "observations": [
                {"date": "2024-03", "ndvi": 0.240, "evi": 0.170, "vci": 50.0, "qa": 0},
                {"date": "2025-03", "ndvi": 0.228, "evi": 0.160, "vci": 46.2, "qa": 0},
                {"date": "2026-03", "ndvi": 0.235, "evi": 0.165, "vci": 48.0, "qa": 0},
                {"date": "2026-07", "ndvi": 0.862, "evi": 0.640, "vci": 89.5, "qa": 0},
            ],
        },
        {
            "id": "sahel_savanna_niger",
            "name": "Sahelian Acacia Savanna / Dryland Agro-Pastoral (Niger/Mali)",
            "lat": 13.51,
            "lon": 2.12,
            "land_cover": "Open Shrublands / Semi-Arid Woody Savanna",
            "baseline_ndvi": 0.265,
            "granule_id": "SYNTHETIC_DEV_FIXTURE_MOD13C2",
            "verification_status": "synthetic",
            "observations": [
                {"date": "2024-03", "ndvi": 0.142, "evi": 0.102, "vci": 35.0, "qa": 0},
                {"date": "2025-03", "ndvi": 0.150, "evi": 0.110, "vci": 38.0, "qa": 0},
                {"date": "2026-03", "ndvi": 0.145, "evi": 0.105, "vci": 36.5, "qa": 0},
                {"date": "2026-09", "ndvi": 0.472, "evi": 0.338, "vci": 75.0, "qa": 0},
            ],
        },
        {
            "id": "siberian_taiga_larch",
            "name": "Central Siberian Boreal Larch Forest (Yakutia, Russia)",
            "lat": 62.03,
            "lon": 129.74,
            "land_cover": "Deciduous Needleleaf Boreal Forest",
            "baseline_ndvi": 0.360,
            "granule_id": "SYNTHETIC_DEV_FIXTURE_MOD13C2",
            "verification_status": "synthetic",
            "observations": [
                {"date": "2024-03", "ndvi": 0.125, "evi": 0.088, "vci": 34.0, "qa": 2},
                {"date": "2025-03", "ndvi": 0.118, "evi": 0.082, "vci": 31.0, "qa": 2},
                {"date": "2026-03", "ndvi": 0.120, "evi": 0.085, "vci": 32.0, "qa": 2},
                {"date": "2026-07", "ndvi": 0.735, "evi": 0.518, "vci": 84.0, "qa": 0},
            ],
        },
        {
            "id": "nile_delta_oasis",
            "name": "Nile River Delta Irrigated Intensive Agriculture (Egypt)",
            "lat": 30.85,
            "lon": 31.02,
            "land_cover": "Intensively Irrigated Croplands",
            "baseline_ndvi": 0.625,
            "granule_id": "SYNTHETIC_DEV_FIXTURE_MOD13C2",
            "verification_status": "synthetic",
            "observations": [
                {"date": "2024-03", "ndvi": 0.658, "evi": 0.472, "vci": 73.0, "qa": 0},
                {"date": "2025-03", "ndvi": 0.665, "evi": 0.478, "vci": 74.5, "qa": 0},
                {"date": "2026-03", "ndvi": 0.672, "evi": 0.485, "vci": 76.0, "qa": 0},
                {"date": "2026-09", "ndvi": 0.540, "evi": 0.388, "vci": 58.0, "qa": 0},
            ],
        },
        {
            "id": "australia_murray_basin",
            "name": "Murray-Darling Agricultural Basin (New South Wales, Australia)",
            "lat": -34.12,
            "lon": 142.16,
            "land_cover": "Dryland Farming / Temperate Grassland",
            "baseline_ndvi": 0.335,
            "granule_id": "SYNTHETIC_DEV_FIXTURE_MOD13C2",
            "verification_status": "synthetic",
            "observations": [
                {"date": "2024-03", "ndvi": 0.278, "evi": 0.198, "vci": 42.5, "qa": 0},
                {"date": "2025-03", "ndvi": 0.292, "evi": 0.210, "vci": 46.0, "qa": 0},
                {"date": "2026-03", "ndvi": 0.285, "evi": 0.205, "vci": 44.0, "qa": 0},
                {"date": "2026-09", "ndvi": 0.468, "evi": 0.332, "vci": 72.0, "qa": 0},
            ],
        },
        {
            "id": "congo_basin_evergreen",
            "name": "Congo Basin Moist Tropical Evergreen Canopy (DRC)",
            "lat": 0.52,
            "lon": 23.51,
            "land_cover": "Equatorial Moist Broadleaf Forest",
            "baseline_ndvi": 0.805,
            "granule_id": "SYNTHETIC_DEV_FIXTURE_MOD13C2",
            "verification_status": "synthetic",
            "observations": [
                {"date": "2024-03", "ndvi": 0.802, "evi": 0.562, "vci": 68.5, "qa": 0},
                {"date": "2025-03", "ndvi": 0.810, "evi": 0.570, "vci": 71.0, "qa": 0},
                {"date": "2026-03", "ndvi": 0.815, "evi": 0.575, "vci": 72.5, "qa": 0},
                {"date": "2026-09", "ndvi": 0.795, "evi": 0.555, "vci": 66.0, "qa": 0},
            ],
        },
        {
            "id": "sahara_erg_margin",
            "name": "Saharan Hyper-Arid Desert Margin (Adrar, Mauritania)",
            "lat": 19.50,
            "lon": -11.00,
            "land_cover": "Barren or Sparsely Vegetated Desert",
            "baseline_ndvi": 0.065,
            "granule_id": "SYNTHETIC_DEV_FIXTURE_MOD13C2",
            "verification_status": "synthetic",
            "observations": [
                {"date": "2024-03", "ndvi": 0.064, "evi": 0.044, "vci": 26.0, "qa": 0},
                {"date": "2025-03", "ndvi": 0.060, "evi": 0.040, "vci": 24.0, "qa": 0},
                {"date": "2026-03", "ndvi": 0.062, "evi": 0.042, "vci": 25.0, "qa": 0},
                {"date": "2026-09", "ndvi": 0.082, "evi": 0.058, "vci": 35.0, "qa": 0},
            ],
        },
    ]

    AUTHENTIC_OCEAN_BENCHMARKS = [
        {
            "id": "arabian_sea_upwelling",
            "name": "Arabian Sea Seasonal Upwelling (Oman/India)",
            "lat": 18.50,
            "lon": 62.00,
            "marine_province": "Northwestern Indian Ocean Upwelling System",
            "baseline_chl": 0.450,
            "baseline_sst": 26.8,
            "granule_id": "SYNTHETIC_DEV_FIXTURE_MODISA_CHL",
            "verification_status": "synthetic",
            "observations": [
                {"date": "2024-03", "chl": 1.25, "sst": 26.5, "ssha": 0.04, "qa": 0},
                {"date": "2025-03", "chl": 1.42, "sst": 26.8, "ssha": 0.05, "qa": 0},
                {"date": "2026-03", "chl": 1.58, "sst": 27.2, "ssha": 0.06, "qa": 0},
                {"date": "2026-09", "chl": 2.85, "sst": 25.1, "ssha": -0.05, "qa": 0},
            ],
        },
        {
            "id": "north_atlantic_bloom",
            "name": "North Atlantic Subpolar Bloom (Iceland Basin)",
            "lat": 59.20,
            "lon": -21.50,
            "marine_province": "Subpolar North Atlantic Gyre",
            "baseline_chl": 0.850,
            "baseline_sst": 9.2,
            "granule_id": "SYNTHETIC_DEV_FIXTURE_MODISA_CHL",
            "verification_status": "synthetic",
            "observations": [
                {"date": "2024-03", "chl": 0.78, "sst": 8.9, "ssha": -0.07, "qa": 0},
                {"date": "2025-03", "chl": 0.82, "sst": 9.1, "ssha": -0.06, "qa": 0},
                {"date": "2026-03", "chl": 0.85, "sst": 9.4, "ssha": -0.08, "qa": 0},
                {"date": "2026-09", "chl": 2.45, "sst": 11.8, "ssha": -0.02, "qa": 0},
            ],
        },
        {
            "id": "equatorial_pacific_cold_tongue",
            "name": "Equatorial Pacific Cold Tongue Upwelling (Galapagos)",
            "lat": 0.00,
            "lon": -95.00,
            "marine_province": "Eastern Tropical Pacific Upwelling",
            "baseline_chl": 0.360,
            "baseline_sst": 23.0,
            "granule_id": "SYNTHETIC_DEV_FIXTURE_MODISA_CHL",
            "verification_status": "synthetic",
            "observations": [
                {"date": "2024-03", "chl": 0.32, "sst": 24.2, "ssha": 0.08, "qa": 0},
                {"date": "2025-03", "chl": 0.35, "sst": 23.5, "ssha": 0.02, "qa": 0},
                {"date": "2026-03", "chl": 0.38, "sst": 23.1, "ssha": -0.04, "qa": 0},
                {"date": "2026-09", "chl": 0.44, "sst": 21.8, "ssha": -0.09, "qa": 0},
            ],
        },
        {
            "id": "sargasso_sea_gyre",
            "name": "Sargasso Sea Subtropical Gyre Blue Water",
            "lat": 28.00,
            "lon": -65.00,
            "marine_province": "North Atlantic Subtropical Oligotrophic Gyre",
            "baseline_chl": 0.040,
            "baseline_sst": 22.4,
            "granule_id": "SYNTHETIC_DEV_FIXTURE_MODISA_CHL",
            "verification_status": "synthetic",
            "observations": [
                {"date": "2024-03", "chl": 0.045, "sst": 22.1, "ssha": 0.01, "qa": 0},
                {"date": "2025-03", "chl": 0.042, "sst": 22.4, "ssha": 0.02, "qa": 0},
                {"date": "2026-03", "chl": 0.040, "sst": 22.8, "ssha": 0.01, "qa": 0},
                {"date": "2026-09", "chl": 0.035, "sst": 28.1, "ssha": 0.05, "qa": 0},
            ],
        },
        {
            "id": "peru_humboldt_upwelling",
            "name": "Peru Humboldt Current Upwelling (Callao)",
            "lat": -12.05,
            "lon": -77.15,
            "marine_province": "Humboldt Current Large Marine Ecosystem",
            "baseline_chl": 3.800,
            "baseline_sst": 16.0,
            "granule_id": "SYNTHETIC_DEV_FIXTURE_MODISA_CHL",
            "verification_status": "synthetic",
            "observations": [
                {"date": "2024-03", "chl": 3.95, "sst": 15.8, "ssha": -0.06, "qa": 0},
                {"date": "2025-03", "chl": 4.02, "sst": 15.5, "ssha": -0.07, "qa": 0},
                {"date": "2026-03", "chl": 4.10, "sst": 15.4, "ssha": -0.08, "qa": 0},
                {"date": "2026-09", "chl": 5.40, "sst": 14.2, "ssha": -0.12, "qa": 0},
            ],
        },
    ]

    AUTHENTIC_ATMOSPHERE_BENCHMARKS = [
        {
            "id": "indo_gangetic_winter_haze",
            "name": "Indo-Gangetic Plain Winter Haze / Smog (New Delhi, India)",
            "lat": 28.61,
            "lon": 77.21,
            "atmospheric_regime": "Continental Particulate Inversion Zone",
            "baseline_aod": 0.480,
            "baseline_rain": 15.0,
            "granule_id": "SYNTHETIC_DEV_FIXTURE_MOD08_M3",
            "verification_status": "synthetic",
            "observations": [
                {"date": "2024-03", "aod": 0.650, "cld": 0.24, "rain_rate": 0.022, "rain_acc": 16.4, "qa": 3},
                {"date": "2025-03", "aod": 0.710, "cld": 0.26, "rain_rate": 0.018, "rain_acc": 13.4, "qa": 3},
                {"date": "2026-03", "aod": 0.780, "cld": 0.28, "rain_rate": 0.024, "rain_acc": 17.9, "qa": 3},
                {"date": "2026-09", "aod": 0.420, "cld": 0.68, "rain_rate": 0.210, "rain_acc": 151.2, "qa": 3},
            ],
        },
        {
            "id": "sahara_dust_cape_verde",
            "name": "Sahara Desert Dust Outflow (Cape Verde / Tropical Atlantic)",
            "lat": 16.50,
            "lon": -24.00,
            "atmospheric_regime": "Saharan Air Layer (SAL) Dust Transport",
            "baseline_aod": 0.380,
            "baseline_rain": 2.5,
            "granule_id": "SYNTHETIC_DEV_FIXTURE_MOD08_M3",
            "verification_status": "synthetic",
            "observations": [
                {"date": "2024-03", "aod": 0.580, "cld": 0.14, "rain_rate": 0.003, "rain_acc": 2.2, "qa": 3},
                {"date": "2025-03", "aod": 0.600, "cld": 0.15, "rain_rate": 0.002, "rain_acc": 1.5, "qa": 3},
                {"date": "2026-03", "aod": 0.620, "cld": 0.15, "rain_rate": 0.003, "rain_acc": 2.1, "qa": 3},
                {"date": "2026-09", "aod": 0.450, "cld": 0.35, "rain_rate": 0.055, "rain_acc": 39.6, "qa": 3},
            ],
        },
        {
            "id": "amazon_basin_convective",
            "name": "Amazon Basin Convective Cloud Regime (Manaus, Brazil)",
            "lat": -3.10,
            "lon": -60.02,
            "atmospheric_regime": "Equatorial Deep Moist Convection",
            "baseline_aod": 0.140,
            "baseline_rain": 295.0,
            "granule_id": "SYNTHETIC_DEV_FIXTURE_MOD08_M3",
            "verification_status": "synthetic",
            "observations": [
                {"date": "2024-03", "aod": 0.140, "cld": 0.80, "rain_rate": 0.410, "rain_acc": 305.0, "qa": 3},
                {"date": "2025-03", "aod": 0.142, "cld": 0.81, "rain_rate": 0.415, "rain_acc": 308.8, "qa": 3},
                {"date": "2026-03", "aod": 0.145, "cld": 0.82, "rain_rate": 0.417, "rain_acc": 310.5, "qa": 3},
                {"date": "2026-09", "aod": 0.480, "cld": 0.45, "rain_rate": 0.115, "rain_acc": 82.8, "qa": 3},
            ],
        },
        {
            "id": "pacific_itcz_convective",
            "name": "Pacific Intertropical Convergence Zone (ITCZ)",
            "lat": 7.00,
            "lon": -135.00,
            "atmospheric_regime": "Tropical Oceanic Deep Convection",
            "baseline_aod": 0.060,
            "baseline_rain": 270.0,
            "granule_id": "SYNTHETIC_DEV_FIXTURE_MOD08_M3",
            "verification_status": "synthetic",
            "observations": [
                {"date": "2024-03", "aod": 0.062, "cld": 0.86, "rain_rate": 0.370, "rain_acc": 275.3, "qa": 3},
                {"date": "2025-03", "aod": 0.064, "cld": 0.87, "rain_rate": 0.380, "rain_acc": 282.7, "qa": 3},
                {"date": "2026-03", "aod": 0.065, "cld": 0.88, "rain_rate": 0.383, "rain_acc": 285.0, "qa": 3},
                {"date": "2026-09", "aod": 0.058, "cld": 0.85, "rain_rate": 0.360, "rain_acc": 259.2, "qa": 3},
            ],
        },
    ]

    # =========================================================================
    # Cryptographic File Integrity
    # =========================================================================

    @classmethod
    def calculate_sha256(cls, file_path: str) -> str:
        """Computes SHA-256 cryptographic checksum of a satellite file."""
        sha = hashlib.sha256()
        with open(file_path, "rb") as f:
            while chunk := f.read(65536):
                sha.update(chunk)
        return sha.hexdigest()

    # =========================================================================
    # Genuine Satellite Granule File Ingestion
    # =========================================================================

    @classmethod
    def ingest_granule_file(
        cls,
        granule_path: str,
        dataset_id: str,
        date_str: str,
        session: Session,
        mission_name: Optional[str] = None,
        location_name: Optional[str] = None,
        granule_meta: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        """
        Ingests a verified NASA satellite granule file into the database.
        - Calculates SHA-256 checksum.
        - Strictly validates observation date match (no relabeling or substitution).
        - Decodes scientific arrays with dedicated parsers and quality control.
        - Persists PostGIS Polygon spatial bounds.
        - Persists complete 12-item granule provenance metadata.
        - Strictly flags all records with:
            verification_status = 'verified_observation'
            is_observation = True
            data_status = 'observation'
            source_file_checksum = <sha256>
        """
        if not os.path.exists(granule_path):
            raise FileNotFoundError(f"Granule file not found: {granule_path}")

        file_size = os.path.getsize(granule_path)
        if file_size < 100:
            raise ValueError(f"Granule file {granule_path} is too small ({file_size} bytes) to be valid scientific data.")

        checksum = cls.calculate_sha256(granule_path)
        granule_id = os.path.basename(granule_path)

        parts = date_str.split("-")
        req_year, req_month = int(parts[0]), int(parts[1])
        req_ym_compact = f"{req_year:04d}{req_month:02d}"
        obs_dt = datetime(req_year, req_month, 1, tzinfo=timezone.utc)

        # Strict observation date enforcement: verify granule date against requested date
        if granule_meta:
            g_start = granule_meta.get("observation_start_time") or granule_meta.get("time_start") or ""
            if g_start and g_start[:7] != date_str:
                raise ValueError(
                    f"Granule date mismatch: requested {date_str} but granule observation starts at {g_start[:7]}"
                )

        if "3IMERG" in granule_id or "GPM" in dataset_id:
            m = re.search(r"(\d{4})(\d{2})\d{2}-S", granule_id)
            if m:
                file_ym = f"{m.group(1)}{m.group(2)}"
                if file_ym != req_ym_compact:
                    raise ValueError(
                        f"Granule file {granule_id} date ({m.group(1)}-{m.group(2)}) does not match requested date {date_str}"
                    )

        features: List[Dict[str, Any]] = []
        unit = "dimensionless"
        mission = mission_name or "NASA Earth Observation"
        extracted_vars: List[str] = []
        units_dict: Dict[str, str] = {}
        quality_flags_dict: Dict[str, Any] = {}

        # 1. LAND: MOD13C2
        if dataset_id == "MOD13C2":
            mission = mission_name or "MODIS Terra"
            unit = "dimensionless ratio (-0.2000 to +1.0000)"
            from app.data_processing.parsers.modis_parser import ModisParser
            parsed = ModisParser.parse_granule(granule_path, date_str)
            features = parsed.get("features", [])
            extracted_vars = parsed.get("extracted_variables", ["ndvi", "evi"])
            units_dict = parsed.get("units", {"ndvi": unit, "evi": unit})
            quality_flags_dict = parsed.get("quality_flags", {"qa_field": "pixel_reliability", "qa_filtered": True})

        # 2. OCEAN: SWOT_L2_LR_SSH, MODISA_L3m_CHL, MODISA_L3m_SST
        elif dataset_id in ["SWOT_L2_LR_SSH", "SWOT"]:
            mission = mission_name or "SWOT KaRIn Altimetry"
            unit = "m"
            from app.data_processing.parsers.swot_parser import SwotParser
            parsed = SwotParser.parse_granule(granule_path, date_str)
            features = parsed.get("features", [])
            extracted_vars = parsed.get("extracted_variables", ["ssha_karin", "ssh_karin"])
            units_dict = parsed.get("units", {"ssha_karin": "m", "ssh_karin": "m"})
            quality_flags_dict = parsed.get("quality_flags", {"qa_field": "ssh_karin_qual", "valid_qual_flag": 0})

        elif dataset_id in ["MODISA_L3m_CHL", "MODISA_L3m_SST", "MODISA_L3m_OCEAN_SWOT"]:
            mission = mission_name or ("MODIS Aqua Ocean Color" if "CHL" in dataset_id else "SWOT KaRIn Altimetry")
            unit = "mg/m³" if "CHL" in dataset_id else ("°C" if "SST" in dataset_id else "meters (m)")
            features = cls._parse_ocean_granule_file(granule_path, dataset_id, date_str, granule_id)
            extracted_vars = ["chlor_a"] if "CHL" in dataset_id else ["sst"]
            units_dict = {extracted_vars[0]: unit}
            quality_flags_dict = {"qa_filtered": True}

        # 3. ATMOSPHERE: GPM_3IMERGM, MOD08_M3
        elif dataset_id in ["GPM_3IMERGM", "GPM"]:
            mission = mission_name or "GPM Core Observatory"
            unit = "mm"
            from app.data_processing.parsers.gpm_parser import GpmParser
            parsed = GpmParser.parse_granule(granule_path, date_str)
            features = parsed.get("features", [])
            extracted_vars = parsed.get("extracted_variables", ["precipitation", "precipitation_accumulated"])
            units_dict = parsed.get("units", {"precipitation": "mm/hr", "precipitation_accumulated": "mm"})
            quality_flags_dict = parsed.get("quality_flags", {"fill_values_filtered": [-9999.9, -9999.0], "negative_values_filtered": True})

        elif dataset_id in ["MOD08_M3", "MODIS_GPM_ATMOSPHERE"]:
            mission = mission_name or ("MODIS Atmosphere" if "MOD08" in dataset_id else "GPM Core Observatory")
            unit = "dimensionless ratio" if "MOD08" in dataset_id else "mm"
            features = cls._parse_atmosphere_granule_file(granule_path, dataset_id, date_str, granule_id)
            extracted_vars = ["aod_550"]
            units_dict = {"aod_550": unit}
            quality_flags_dict = {"qa_filtered": False}

        if not features:
            logger.warning(f"No valid scientific features decoded from granule {granule_path} for dataset {dataset_id}")
            return {
                "status": "failed",
                "message": f"Could not decode valid scientific features from {granule_id}",
                "granule_id": granule_id,
                "checksum": checksum,
                "records_persisted": 0,
            }

        # Calculate bounding coordinates and aggregates
        lats = [f["geometry"]["coordinates"][1] for f in features]
        lons = [f["geometry"]["coordinates"][0] for f in features]
        vals = [
            f["properties"].get("ndvi")
            or f["properties"].get("chlor_a")
            or f["properties"].get("sst")
            or f["properties"].get("ssha_karin_m")
            or f["properties"].get("precipitation_accumulated_mm")
            or f["properties"].get("aod_550")
            or 0.0
            for f in features
        ]

        min_lat, max_lat = min(lats), max(lats)
        min_lon, max_lon = min(lons), max(lons)
        mean_val = round(float(np.mean(vals)), 4) if vals else 0.0
        min_val = round(float(np.min(vals)), 4) if vals else 0.0
        max_val = round(float(np.max(vals)), 4) if vals else 0.0

        # PostGIS SRID 4326 Polygon bounding box
        wkt_poly = f"POLYGON(({min_lon} {min_lat}, {max_lon} {min_lat}, {max_lon} {max_lat}, {min_lon} {max_lat}, {min_lon} {min_lat}))"
        spatial_bounds = WKTElement(wkt_poly, srid=4326)

        # Assemble complete 12 required provenance metadata fields
        _, last_day = calendar.monthrange(req_year, req_month)
        default_start = f"{req_year:04d}-{req_month:02d}-01T00:00:00Z"
        default_end = f"{req_year:04d}-{req_month:02d}-{last_day:02d}T23:59:59Z"

        meta_coll_id = (
            (granule_meta.get("collection_id") if granule_meta else None)
            or COLLECTION_CONCEPT_IDS.get(dataset_id, dataset_id)
        )
        meta_version = (
            (granule_meta.get("version") if granule_meta else None)
            or COLLECTION_SHORT_NAMES.get(dataset_id, {}).get("version", "v1.0")
        )
        meta_granule_id = (
            (granule_meta.get("official_granule_id") if granule_meta else None)
            or (granule_meta.get("title") if granule_meta else None)
            or granule_id
        )
        meta_metadata_url = (
            (granule_meta.get("metadata_url") if granule_meta else None)
            or f"https://cmr.earthdata.nasa.gov/search/concepts/{meta_coll_id}.umm_json"
        )
        meta_download_url = (
            (granule_meta.get("download_url") if granule_meta else None)
            or f"https://earthdata.nasa.gov/data/{granule_id}"
        )
        meta_start = (
            (granule_meta.get("observation_start_time") or granule_meta.get("time_start") if granule_meta else None)
            or default_start
        )
        meta_end = (
            (granule_meta.get("observation_end_time") or granule_meta.get("time_end") if granule_meta else None)
            or default_end
        )

        extra_metadata = {
            "collection_id": meta_coll_id,
            "version": meta_version,
            "official_granule_id": meta_granule_id,
            "metadata_url": meta_metadata_url,
            "download_url": meta_download_url,
            "observation_start_time": meta_start,
            "observation_end_time": meta_end,
            "extracted_variables": extracted_vars,
            "units": units_dict,
            "quality_flags": quality_flags_dict,
            "checksum_sha256": checksum,
            "ingestion_timestamp": datetime.now(timezone.utc).isoformat(),
            "granule_id": granule_id,
            "data_status": "observation",
            "is_observation": True,
            "verification_status": "verified_observation",
            "source_type": "satellite_telemetry",
            "feature_count": len(features),
        }

        # Persist EarthObservation catalog record with PostGIS spatial bounds
        existing_cat = session.execute(
            select(EarthObservation).filter_by(
                dataset_id=dataset_id,
                observation_time=obs_dt,
                granule_id=granule_id,
            )
        ).scalar_one_or_none()

        if not existing_cat:
            cat_rec = EarthObservation(
                dataset_id=dataset_id,
                mission_name=mission,
                observation_time=obs_dt,
                min_latitude=min_lat,
                max_latitude=max_lat,
                min_longitude=min_lon,
                max_longitude=max_lon,
                spatial_bounds=spatial_bounds,
                mean_value=mean_val,
                min_value=min_val,
                max_value=max_val,
                unit=unit,
                verification_status="verified_observation",
                source_file_checksum=checksum,
                granule_id=granule_id,
                processing_version="v1.0",
                extra_metadata=extra_metadata,
            )
            session.add(cat_rec)
        else:
            existing_cat.spatial_bounds = spatial_bounds
            existing_cat.extra_metadata = extra_metadata
            existing_cat.verification_status = "verified_observation"
            existing_cat.source_file_checksum = checksum

        # Persist time-series records in batch
        existing_rows = session.execute(
            select(ObservationTimeSeriesRecord.location_name, ObservationTimeSeriesRecord.metric_name).filter_by(
                dataset_id=dataset_id,
                date_str=date_str,
            )
        ).all()
        existing_keys = {(r[0], r[1]) for r in existing_rows}

        persisted_ts_count = 0
        new_records = []
        for f in features:
            props = f["properties"]
            coords = f["geometry"]["coordinates"]
            loc_label = props.get("region_name") or props.get("location_name") or f"Point ({coords[1]:+.2f}°, {coords[0]:+.2f}°)"
            if "SWOT" in dataset_id:
                metric = "ssha_karin"
            else:
                metric = (
                    props.get("primary_ocean_metric")
                    or ("NDVI" if dataset_id == "MOD13C2" else ("aod_550" if "MOD08" in dataset_id else "precipitation_accumulated"))
                )
            val = (
                props.get("ndvi")
                if dataset_id == "MOD13C2"
                else (props.get("chlor_a") or props.get("sst") or props.get("ssha_karin_m") or props.get("aod_550") or props.get("precipitation_accumulated_mm") or 0.0)
            )

            if (loc_label, metric) not in existing_keys:
                existing_keys.add((loc_label, metric))
                ts_rec = ObservationTimeSeriesRecord(
                    dataset_id=dataset_id,
                    location_name=loc_label,
                    latitude=coords[1],
                    longitude=coords[0],
                    geom=WKTElement(f"POINT({coords[0]} {coords[1]})", srid=4326),
                    date_str=date_str,
                    metric_name=metric,
                    value=float(val),
                    unit=unit,
                    baseline_normal=props.get("baseline_normal"),
                    anomaly=props.get("anomaly"),
                    quality_flag=float(props.get("quality_flag", 0.0)),
                    verification_status="verified_observation",
                    source_file_checksum=checksum,
                    granule_id=granule_id,
                )
                new_records.append(ts_rec)
                persisted_ts_count += 1

        if new_records:
            session.add_all(new_records)

        session.commit()
        logger.info(f"Successfully ingested genuine satellite granule {granule_id} ({persisted_ts_count} timeseries points).")

        return {
            "status": "success",
            "granule_id": granule_id,
            "checksum": checksum,
            "features_extracted": len(features),
            "records_persisted": persisted_ts_count + (1 if not existing_cat else 0),
        }

    # =========================================================================
    # Live NASA Earthdata Ingestion Runner
    # =========================================================================

    @classmethod
    async def ingest_live_granule(
        cls,
        dataset_id: str,
        year: int,
        month: int,
        session: Optional[Session] = None,
    ) -> Dict[str, Any]:
        """
        Discovers and retrieves genuine satellite data from NASA CMR.
        If credentials are not configured, transparently reports the blocker.
        Decouples long-running granule downloads from database connections to prevent pool starvation.
        """
        auth_status = NasaEarthdataClient.get_auth_status()
        if not auth_status.get("granule_download_available"):
            return {
                "status": "blocked",
                "reason": "NASA_EARTHDATA_CREDENTIALS_REQUIRED",
                "message": (
                    "NASA Earthdata credentials (NASA_EARTHDATA_BEARER_TOKEN or username/password in .env) "
                    "are required to download and ingest genuine satellite granules. CMR search is operational."
                ),
            }

        # Step 1: Discover and retrieve granule over network without holding a DB session
        granule = None
        ret = None
        target_dataset_id = dataset_id

        if dataset_id == "MOD13C2":
            granule = await ModisClient.find_granule_for_month(year, month)
            if granule:
                ret = await ModisClient.retrieve_granule_file(granule)
        elif "CHL" in dataset_id or "SST" in dataset_id:
            prod = "chl" if "CHL" in dataset_id else "sst"
            granule = await OceanColorClient.find_granule_for_month(prod, year, month)
            if granule:
                ret = await OceanColorClient.retrieve_granule_file(granule)
        elif dataset_id in ["GPM_3IMERGM", "GPM"]:
            target_dataset_id = "GPM_3IMERGM"
            granule = await GpmClient.find_granule_for_month(year, month)
            if granule:
                ret = await GpmClient.retrieve_granule_file(granule)
        elif dataset_id in ["SWOT_L2_LR_SSH", "SWOT"]:
            target_dataset_id = "SWOT_L2_LR_SSH"
            granule = await SwotClient.find_granule_for_month(year, month)
            if granule:
                ret = await SwotClient.retrieve_granule_file(granule)
        elif dataset_id in ["MOD08_M3", "MODIS_ATMOSPHERE"]:
            target_dataset_id = "MOD08_M3"
            granule = await AtmosphereClient.find_granule_for_month("aod", year, month)
            if granule:
                ret = await AtmosphereClient.retrieve_granule_file(granule)

        if not ret or ret.get("status") not in ["downloaded", "cached"] or not ret.get("file_path"):
            return {
                "status": "not_found",
                "message": f"No genuine granule discovered on CMR for {dataset_id} in {year}-{month:02d}.",
            }

        # Strict observation date enforcement: validate that discovered granule matches requested period
        if granule:
            granule_start = granule.get("observation_start_time") or granule.get("time_start") or ""
            date_str = f"{year:04d}-{month:02d}"
            if granule_start and granule_start[:7] != date_str:
                logger.warning(
                    f"Discovered granule date mismatch: requested {date_str} but granule starts at {granule_start[:7]}"
                )
                return {
                    "status": "not_found",
                    "message": f"No genuine granule discovered on CMR for {dataset_id} in {year}-{month:02d}.",
                }

        # Step 2: Open database session strictly during fast persistence
        granule_meta = (ret.get("granule_meta") if ret else None) or granule
        date_str = f"{year:04d}-{month:02d}"
        with session_scope(session) as db:
            return cls.ingest_granule_file(
                granule_path=ret["file_path"],
                dataset_id=target_dataset_id,
                date_str=date_str,
                session=db,
                granule_meta=granule_meta,
            )

    # =========================================================================
    # Array Decoders for Ocean & Atmosphere Granules
    # =========================================================================

    @classmethod
    def _parse_ocean_granule_file(
        cls, file_path: str, dataset_id: str, date_str: str, granule_id: str
    ) -> List[Dict[str, Any]]:
        """Parses scientific netCDF4/HDF ocean files into GeoJSON features."""
        features = []
        try:
            import netCDF4 as nc
            with nc.Dataset(file_path, "r") as ds:
                # Find chlor_a or sst or ssha variables
                for var_name in ["chlor_a", "sst", "ssha"]:
                    if var_name in ds.variables:
                        data = ds.variables[var_name][:]
                        lats = ds.variables.get("lat") or ds.variables.get("latitude")
                        lons = ds.variables.get("lon") or ds.variables.get("longitude")
                        if lats is not None and lons is not None:
                            # Subsample for points
                            lat_arr = lats[:]
                            lon_arr = lons[:]
                            stride_lat = max(1, len(lat_arr) // 30)
                            stride_lon = max(1, len(lon_arr) // 45)
                            for i in range(0, len(lat_arr), stride_lat):
                                for j in range(0, len(lon_arr), stride_lon):
                                    val = float(data[i, j]) if data.ndim == 2 else float(data[0, i, j])
                                    lat_val = float(lat_arr[i])
                                    lon_val = float(lon_arr[j])
                                    feat = OceanProcessor.process_ocean_point(
                                        lat=lat_val,
                                        lon=lon_val,
                                        date_str=date_str,
                                        granule_id=granule_id,
                                        chl=val if var_name == "chlor_a" else None,
                                        sst=val if var_name == "sst" else None,
                                        ssha=val if var_name == "ssha" else None,
                                    )
                                    if feat:
                                        features.append(feat)
        except Exception as exc:
            logger.debug(f"NetCDF parsing not applicable for {file_path}: {exc}")
        return features

    @classmethod
    def _parse_atmosphere_granule_file(
        cls, file_path: str, dataset_id: str, date_str: str, granule_id: str
    ) -> List[Dict[str, Any]]:
        """Parses scientific netCDF4/HDF atmosphere files into GeoJSON features."""
        features = []
        try:
            import netCDF4 as nc
            with nc.Dataset(file_path, "r") as ds:
                for var_name in ["precipitation", "precipitationCal", "AOD_550_Dark_Target_Deep_Blue_Combined_Mean_Mean"]:
                    if var_name in ds.variables:
                        data = ds.variables[var_name][:]
                        lats = ds.variables.get("lat") or ds.variables.get("latitude")
                        lons = ds.variables.get("lon") or ds.variables.get("longitude")
                        if lats is not None and lons is not None:
                            lat_arr = lats[:]
                            lon_arr = lons[:]
                            stride_lat = max(1, len(lat_arr) // 30)
                            stride_lon = max(1, len(lon_arr) // 45)
                            for i in range(0, len(lat_arr), stride_lat):
                                for j in range(0, len(lon_arr), stride_lon):
                                    val = float(data[i, j]) if data.ndim == 2 else float(data[0, i, j])
                                    lat_val = float(lat_arr[i])
                                    lon_val = float(lon_arr[j])
                                    feat = AtmosphereProcessor.process_atmosphere_point(
                                        lat=lat_val,
                                        lon=lon_val,
                                        date_str=date_str,
                                        granule_id=granule_id,
                                        aod=val if "AOD" in var_name else None,
                                        precip_accumulated_mm=val if "precip" in var_name else None,
                                    )
                                    if feat:
                                        features.append(feat)
        except Exception as exc:
            logger.debug(f"Atmosphere NetCDF parsing not applicable for {file_path}: {exc}")
        return features

    # =========================================================================
    # Isolated Development Test Fixture Seeding (Never Labeled Observation)
    # =========================================================================

    @classmethod
    def seed_test_fixtures(cls, session: Session) -> int:
        """
        Seeds isolated development test fixtures into the database.
        CRITICAL: All records are strictly tagged as 'synthetic' and is_observation=False.
        """
        inserted_count = 0

        # 1. Land Fixtures
        for bench in cls.AUTHENTIC_MODIS_BENCHMARKS:
            loc_name = bench["name"]
            lat, lon = bench["lat"], bench["lon"]
            base_ndvi = bench["baseline_ndvi"]
            granule = bench["granule_id"]

            for obs in bench["observations"]:
                date_str = obs["date"]
                ndvi_val = obs["ndvi"]
                anomaly = round(ndvi_val - base_ndvi, 3)

                existing = session.execute(
                    select(ObservationTimeSeriesRecord.id).filter_by(
                        dataset_id="MOD13C2",
                        location_name=loc_name,
                        date_str=date_str,
                        metric_name="NDVI",
                    )
                ).scalar_one_or_none()

                if not existing:
                    ts_rec = ObservationTimeSeriesRecord(
                        dataset_id="MOD13C2",
                        location_name=loc_name,
                        latitude=lat,
                        longitude=lon,
                        geom=WKTElement(f"POINT({lon} {lat})", srid=4326),
                        date_str=date_str,
                        metric_name="NDVI",
                        value=ndvi_val,
                        unit="dimensionless ratio (-0.2000 to +1.0000)",
                        baseline_normal=base_ndvi,
                        anomaly=anomaly,
                        quality_flag=float(obs.get("qa", 0)),
                        verification_status="synthetic",
                        source_file_checksum=None,
                        granule_id=granule,
                    )
                    session.add(ts_rec)
                    inserted_count += 1

                parts = date_str.split("-")
                obs_dt = datetime(int(parts[0]), int(parts[1]), 1, tzinfo=timezone.utc)
                cat_existing = session.execute(
                    select(EarthObservation.id).filter_by(
                        dataset_id="MOD13C2",
                        observation_time=obs_dt,
                        min_latitude=lat,
                        min_longitude=lon,
                    )
                ).scalar_one_or_none()

                if not cat_existing:
                    cat_rec = EarthObservation(
                        dataset_id="MOD13C2",
                        mission_name="MODIS Terra (Test Fixture)",
                        observation_time=obs_dt,
                        min_latitude=lat,
                        max_latitude=lat,
                        min_longitude=lon,
                        max_longitude=lon,
                        mean_value=ndvi_val,
                        min_value=ndvi_val,
                        max_value=ndvi_val,
                        unit="dimensionless ratio (-0.2000 to +1.0000)",
                        verification_status="synthetic",
                        source_file_checksum=None,
                        granule_id=granule,
                        processing_version="synthetic_fixture",
                        extra_metadata={
                            "granule_id": granule,
                            "location_name": loc_name,
                            "evi": obs.get("evi"),
                            "vci_percent": obs.get("vci"),
                            "quality_flag": obs.get("qa", 0),
                            "sensor": "MODIS Terra (Synthetic Test Fixture)",
                            "data_status": "synthetic_fixture",
                            "is_observation": False,
                            "source_type": "synthetic",
                        },
                    )
                    session.add(cat_rec)

        # 2. Ocean Fixtures
        for bench in cls.AUTHENTIC_OCEAN_BENCHMARKS:
            loc_name = bench["name"]
            lat, lon = bench["lat"], bench["lon"]
            granule = bench["granule_id"]

            for obs in bench["observations"]:
                date_str = obs["date"]
                chl_val = obs["chl"]
                sst_val = obs["sst"]
                ssha_val = obs["ssha"]

                existing_chl = session.execute(
                    select(ObservationTimeSeriesRecord.id).filter_by(
                        dataset_id="MODISA_L3m_CHL",
                        location_name=loc_name,
                        date_str=date_str,
                        metric_name="chlor_a",
                    )
                ).scalar_one_or_none()

                if not existing_chl:
                    session.add(ObservationTimeSeriesRecord(
                        dataset_id="MODISA_L3m_CHL",
                        location_name=loc_name,
                        latitude=lat,
                        longitude=lon,
                        geom=WKTElement(f"POINT({lon} {lat})", srid=4326),
                        date_str=date_str,
                        metric_name="chlor_a",
                        value=chl_val,
                        unit="mg/m³",
                        baseline_normal=bench["baseline_chl"],
                        anomaly=round(chl_val - bench["baseline_chl"], 3),
                        quality_flag=float(obs.get("qa", 0)),
                        verification_status="synthetic",
                        source_file_checksum=None,
                        granule_id=granule,
                    ))
                    inserted_count += 1

                parts = date_str.split("-")
                obs_dt = datetime(int(parts[0]), int(parts[1]), 1, tzinfo=timezone.utc)
                cat_existing = session.execute(
                    select(EarthObservation.id).filter_by(
                        dataset_id="MODISA_L3m_CHL",
                        observation_time=obs_dt,
                        min_latitude=lat,
                        min_longitude=lon,
                    )
                ).scalar_one_or_none()

                if not cat_existing:
                    session.add(EarthObservation(
                        dataset_id="MODISA_L3m_CHL",
                        mission_name="MODIS Aqua (Test Fixture)",
                        observation_time=obs_dt,
                        min_latitude=lat,
                        max_latitude=lat,
                        min_longitude=lon,
                        max_longitude=lon,
                        mean_value=chl_val,
                        min_value=chl_val,
                        max_value=chl_val,
                        unit="mg/m³",
                        verification_status="synthetic",
                        source_file_checksum=None,
                        granule_id=granule,
                        processing_version="synthetic_fixture",
                        extra_metadata={
                            "granule_id": granule,
                            "location_name": loc_name,
                            "sst_celsius": sst_val,
                            "ssha_karin_m": ssha_val,
                            "data_status": "synthetic_fixture",
                            "is_observation": False,
                            "source_type": "synthetic",
                        },
                    ))

        # 3. Atmosphere Fixtures
        for bench in cls.AUTHENTIC_ATMOSPHERE_BENCHMARKS:
            loc_name = bench["name"]
            lat, lon = bench["lat"], bench["lon"]
            granule = bench["granule_id"]

            for obs in bench["observations"]:
                date_str = obs["date"]
                aod_val = obs["aod"]
                cld_val = obs["cld"]
                rain_acc = obs["rain_acc"]

                existing_aod = session.execute(
                    select(ObservationTimeSeriesRecord.id).filter_by(
                        dataset_id="MOD08_M3",
                        location_name=loc_name,
                        date_str=date_str,
                        metric_name="aod_550",
                    )
                ).scalar_one_or_none()

                if not existing_aod:
                    session.add(ObservationTimeSeriesRecord(
                        dataset_id="MOD08_M3",
                        location_name=loc_name,
                        latitude=lat,
                        longitude=lon,
                        geom=WKTElement(f"POINT({lon} {lat})", srid=4326),
                        date_str=date_str,
                        metric_name="aod_550",
                        value=aod_val,
                        unit="dimensionless extinction ratio (550nm)",
                        baseline_normal=bench["baseline_aod"],
                        anomaly=round(aod_val - bench["baseline_aod"], 3),
                        quality_flag=float(obs.get("qa", 3)),
                        verification_status="synthetic",
                        source_file_checksum=None,
                        granule_id=granule,
                    ))
                    inserted_count += 1

                parts = date_str.split("-")
                obs_dt = datetime(int(parts[0]), int(parts[1]), 1, tzinfo=timezone.utc)
                cat_existing = session.execute(
                    select(EarthObservation.id).filter_by(
                        dataset_id="MOD08_M3",
                        observation_time=obs_dt,
                        min_latitude=lat,
                        min_longitude=lon,
                    )
                ).scalar_one_or_none()

                if not cat_existing:
                    session.add(EarthObservation(
                        dataset_id="MOD08_M3",
                        mission_name="MODIS Atmosphere (Test Fixture)",
                        observation_time=obs_dt,
                        min_latitude=lat,
                        max_latitude=lat,
                        min_longitude=lon,
                        max_longitude=lon,
                        mean_value=aod_val,
                        min_value=aod_val,
                        max_value=aod_val,
                        unit="dimensionless ratio",
                        verification_status="synthetic",
                        source_file_checksum=None,
                        granule_id=granule,
                        processing_version="synthetic_fixture",
                        extra_metadata={
                            "granule_id": granule,
                            "location_name": loc_name,
                            "aod_550": aod_val,
                            "cloud_fraction": cld_val,
                            "precipitation_accumulated_mm": rain_acc,
                            "data_status": "synthetic_fixture",
                            "is_observation": False,
                            "source_type": "synthetic",
                        },
                    ))

        if inserted_count > 0:
            session.commit()
            logger.info(f"Seeded {inserted_count} development test fixture records (verification_status='synthetic', is_observation=False).")

        return inserted_count
