"""
Isolated Synthetic Benchmark Fixtures for PlanetIQ Testing.
Strictly designated for offline development, local unit testing, and test assertions.
All fixtures are explicitly marked:
  - data_status: "synthetic_fixture"
  - is_observation: False
  - verification_status: "synthetic"
NEVER imported into production retrieval paths or seeded as authentic observations.
"""

SYNTHETIC_MODIS_BENCHMARKS = [
    {
        "id": "indian_punjab_wheat",
        "name": "Indo-Gangetic Plain Agricultural Heartland (Punjab, India)",
        "lat": 30.90,
        "lon": 75.85,
        "land_cover": "Double-Cropped Irrigated Agriculture",
        "baseline_ndvi": 0.485,
        "granule_id": "SYNTHETIC_TEST_MOD13C2",
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
        "granule_id": "SYNTHETIC_TEST_MOD13C2",
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
        "granule_id": "SYNTHETIC_TEST_MOD13C2",
        "verification_status": "synthetic",
        "observations": [
            {"date": "2024-03", "ndvi": 0.825, "evi": 0.565, "vci": 69.5, "qa": 0},
            {"date": "2025-03", "ndvi": 0.830, "evi": 0.570, "vci": 71.0, "qa": 0},
            {"date": "2026-03", "ndvi": 0.845, "evi": 0.585, "vci": 74.0, "qa": 0},
            {"date": "2026-09", "ndvi": 0.810, "evi": 0.540, "vci": 62.5, "qa": 0},
        ],
    },
]

SYNTHETIC_OCEAN_BENCHMARKS = [
    {
        "id": "arabian_sea_upwelling",
        "name": "Arabian Sea Seasonal Upwelling (Oman/India)",
        "lat": 18.50,
        "lon": 62.00,
        "marine_province": "Northwestern Indian Ocean Upwelling System",
        "baseline_chl": 0.450,
        "baseline_sst": 26.8,
        "granule_id": "SYNTHETIC_TEST_MODISA_CHL",
        "verification_status": "synthetic",
        "observations": [
            {"date": "2024-03", "chl": 1.25, "sst": 26.5, "ssha": 0.04, "qa": 0},
            {"date": "2025-03", "chl": 1.42, "sst": 26.8, "ssha": 0.05, "qa": 0},
            {"date": "2026-03", "chl": 1.58, "sst": 27.2, "ssha": 0.06, "qa": 0},
            {"date": "2026-09", "chl": 2.85, "sst": 25.1, "ssha": -0.05, "qa": 0},
        ],
    },
]

SYNTHETIC_ATMOSPHERE_BENCHMARKS = [
    {
        "id": "indo_gangetic_winter_haze",
        "name": "Indo-Gangetic Plain Winter Haze / Smog (New Delhi, India)",
        "lat": 28.61,
        "lon": 77.21,
        "atmospheric_regime": "Continental Particulate Inversion Zone",
        "baseline_aod": 0.480,
        "baseline_rain": 15.0,
        "granule_id": "SYNTHETIC_TEST_MOD08_M3",
        "verification_status": "synthetic",
        "observations": [
            {"date": "2024-03", "aod": 0.650, "cld": 0.24, "rain_rate": 0.022, "rain_acc": 16.4, "qa": 3},
            {"date": "2025-03", "aod": 0.710, "cld": 0.26, "rain_rate": 0.018, "rain_acc": 13.4, "qa": 3},
            {"date": "2026-03", "aod": 0.780, "cld": 0.28, "rain_rate": 0.024, "rain_acc": 17.9, "qa": 3},
            {"date": "2026-09", "aod": 0.420, "cld": 0.68, "rain_rate": 0.210, "rain_acc": 151.2, "qa": 3},
        ],
    },
]
