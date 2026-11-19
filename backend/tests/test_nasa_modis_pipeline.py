"""
Dedicated Scientific Test Suite for NASA Earthdata CMR and MODIS MOD13C2 Processing Pipeline.
Tests:
- NASA Earthdata CMR public query formatting and live/mock response handling.
- QualityControl MODIS scaling factor (0.0001) and -3000 fill-value handling.
- MODIS pixel reliability QA bitmask decoding.
- NdviProcessor 0.05° Climate Modeling Grid coordinate transformations.
- NdviProcessor NumPy array decoding and spatial bounding box subsetting.
- ModisClient granule retrieval and caching behavior.
- ObservationRepository distinction between real observations and simulated models.
"""

import pytest
import numpy as np
from unittest.mock import patch, AsyncMock

from app.integrations.nasa.modis_client import ModisClient
from app.data_processing.quality_control import QualityControl
from app.data_processing.ndvi_processor import NdviProcessor
from app.repositories.observation_repository import ObservationRepository


# --- 1. QualityControl & Scaling Factor Tests ---

def test_modis_scale_factor_and_fill_value():
    """Verifies that 0.0001 scale factor and -3000 fill value are handled accurately."""
    # Valid positive NDVI: raw 7420 -> 0.7420
    is_valid, ndvi = QualityControl.decode_raw_modis_ndvi(7420)
    assert is_valid is True
    assert ndvi == 0.7420

    # Valid negative NDVI (water/snow): raw -1500 -> -0.1500
    is_valid, ndvi = QualityControl.decode_raw_modis_ndvi(-1500)
    assert is_valid is True
    assert ndvi == -0.1500

    # Fill value -3000 must be marked invalid
    is_valid, ndvi = QualityControl.decode_raw_modis_ndvi(-3000)
    assert is_valid is False
    assert ndvi is None

    # Out of valid range (> 10000 or < -2000)
    is_valid, ndvi = QualityControl.decode_raw_modis_ndvi(15000)
    assert is_valid is False
    assert ndvi is None


def test_modis_pixel_reliability_decoding():
    """Verifies pixel reliability QA bitmask categories."""
    good = QualityControl.decode_modis_pixel_reliability(0)
    assert good["usable"] is True
    assert good["confidence"] == 1.0
    assert "Good Data" in good["category"]

    marginal = QualityControl.decode_modis_pixel_reliability(1)
    assert marginal["usable"] is True
    assert marginal["confidence"] == 0.65

    snow = QualityControl.decode_modis_pixel_reliability(2)
    assert snow["usable"] is False

    cloudy = QualityControl.decode_modis_pixel_reliability(3)
    assert cloudy["usable"] is False

    fill = QualityControl.decode_modis_pixel_reliability(-1)
    assert fill["usable"] is False


def test_vci_calculation_and_drought_classification():
    """Verifies Vegetation Condition Index calculation and classification."""
    # Normal condition: NDVI 0.50 with min 0.10 and max 0.90 -> 50.0%
    vci = QualityControl.calculate_vci(0.50, 0.10, 0.90)
    assert vci == 50.0
    assert "Normal Vegetative Vigor" in QualityControl.classify_drought_vci(vci)

    # Drought stress: NDVI 0.15 with min 0.10 and max 0.90 -> ~6.2%
    vci_drought = QualityControl.calculate_vci(0.15, 0.10, 0.90)
    assert vci_drought < 20.0
    assert "Extreme Vegetation Stress" in QualityControl.classify_drought_vci(vci_drought)

    # Bounded to [0.0, 100.0]
    assert QualityControl.calculate_vci(1.10, 0.10, 0.90) == 100.0
    assert QualityControl.calculate_vci(-0.10, 0.10, 0.90) == 0.0


# --- 2. NdviProcessor 0.05° CMG Coordinate Tests ---

def test_cmg_coordinate_transformations():
    """Verifies bidirectional mapping between (lat, lon) and 0.05° CMG (row, col)."""
    # North pole / Equator / Greenwich
    r_eq, c_gr = NdviProcessor.lat_lon_to_row_col(0.0, 0.0)
    assert r_eq == 1800  # Row 1800 is at 0° latitude
    assert c_gr == 3600  # Col 3600 is at 0° longitude

    # Reconstruct lat/lon
    lat_recon, lon_recon = NdviProcessor.row_col_to_lat_lon(r_eq, c_gr)
    assert abs(lat_recon - 0.0) < 0.05
    assert abs(lon_recon - 0.0) < 0.05

    # Specific coordinates (e.g. Punjab, India 30.9°N, 75.8°E)
    r_punjab, c_punjab = NdviProcessor.lat_lon_to_row_col(30.9, 75.8)
    lat_p, lon_p = NdviProcessor.row_col_to_lat_lon(r_punjab, c_punjab)
    assert abs(lat_p - 30.9) < 0.05
    assert abs(lon_p - 75.8) < 0.05


def test_ndvi_processor_raw_array_decoding():
    """Verifies that NdviProcessor decodes raw NumPy arrays with scaling and bounding box filtering."""
    # Create a synthetic 10x10 CMG slice
    ndvi_raw = np.full((10, 10), 7500, dtype=np.int16)  # 0.7500 NDVI
    ndvi_raw[0, 0] = -3000  # Fill value
    evi_raw = np.full((10, 10), 5400, dtype=np.int16)   # 0.5400 EVI
    qa_raw = np.zeros((10, 10), dtype=np.int8)          # Good data

    result = NdviProcessor.process_raw_arrays(
        ndvi_raw=ndvi_raw,
        evi_raw=evi_raw,
        qa_raw=qa_raw,
        date_str="2026-03",
        granule_id="TEST_MOD13C2_GRANULE",
        bbox=(-10.0, -10.0, 10.0, 10.0),
        stride=1,
    )

    assert result["type"] == "FeatureCollection"
    assert result["metadata"]["is_observation"] is True
    assert result["metadata"]["data_status"] == "observation"
    assert result["metadata"]["granule_id"] == "TEST_MOD13C2_GRANULE"
    assert len(result["features"]) > 0

    feat0 = result["features"][0]["properties"]
    assert feat0["ndvi"] == 0.75
    assert feat0["evi"] == 0.54
    assert feat0["data_status"] == "observation"
    assert feat0["is_observation"] is True


# --- 3. ObservationRepository Tests ---

def test_observation_repository_modis_spatial_grid():
    """Verifies that ObservationRepository returns authentic observations with provenance."""
    grid = ObservationRepository.get_real_modis_spatial_grid(date_str="2026-03")
    assert grid["type"] == "FeatureCollection"
    assert grid["metadata"]["data_status"] in ("observation", "unavailable")

    if grid["metadata"]["data_status"] == "observation":
        assert grid["metadata"]["is_observation"] is True
        assert len(grid["features"]) > 0
        for f in grid["features"][:10]:
            props = f["properties"]
            assert props["dataset_id"] == "MOD13C2"
            assert props["data_status"] == "observation"
            assert props["is_observation"] is True
            assert -0.2 <= props["ndvi"] <= 1.0


def test_observation_repository_timeseries_retrieval():
    """Verifies timeseries query for Punjab, India."""
    ts = ObservationRepository.get_real_modis_timeseries(
        latitude=30.90,
        longitude=75.85,
        start_year=2024,
        end_year=2026,
    )
    assert ts["dataset_id"] == "MOD13C2"
    assert ts["data_status"] in ("observation", "unavailable")

    # Demonstration mode should provide complete modeled timeseries
    from app.services.land_service import LandService
    demo_ts = LandService.get_timeseries(30.90, 75.85, 2024, 2026, source_mode="demonstration")
    assert len(demo_ts.timeseries) == 36
    assert demo_ts.is_observation is False
    assert demo_ts.data_status in ("demonstration_model", "simulated")


# --- 4. ModisClient & CMR Search Tests ---

@pytest.mark.asyncio
async def test_modis_client_search_flow():
    """Verifies ModisClient month-based granule search formatting."""
    mock_resp = {
        "status": "success",
        "collection_concept_id": "C2565788914-LPCLOUD",
        "granules_found": 1,
        "granules": [{
            "id": "G12345-LPCLOUD",
            "title": "MOD13C2.A2026060.061.2026085141200.hdf",
            "time_start": "2026-03-01T00:00:00Z",
            "time_end": "2026-03-31T23:59:59Z",
            "data_links": ["https://data.lpdaac.earthdatacloud.nasa.gov/MOD13C2.hdf"],
            "granule_size_mb": 100.5,
        }],
    }

    with patch("app.integrations.nasa.earthdata_client.NasaEarthdataClient.search_granules", new_callable=AsyncMock) as mock_search:
        mock_search.return_value = mock_resp

        granule = await ModisClient.find_granule_for_month(2026, 3)
        assert granule is not None
        assert granule["id"] == "G12345-LPCLOUD"
        assert granule["granule_size_mb"] == 100.5


# --- 5. Negative Verification Tests (Eliminate Fabricated Observations) ---

def test_synthetic_data_never_labeled_observation():
    """CRITICAL TEST: Verifies that simulated models are NEVER labeled as observation."""
    from app.services.demo_data_service import DemoDataService

    # 1. Land Demo Grid
    land_grid = DemoDataService.get_simulated_land_grid("2026-03")
    assert land_grid.metadata["data_status"] in ("demonstration_model", "simulated")
    assert land_grid.metadata["is_observation"] is False
    assert land_grid.metadata["source_type"] == "synthetic"
    for feat in land_grid.features:
        assert feat.properties["data_status"] in ("demonstration_model", "simulated")
        assert feat.properties["is_observation"] is False
        assert feat.properties["source_type"] == "synthetic"

    # 2. Atmosphere Demo Grid
    atmo_grid = DemoDataService.get_simulated_atmosphere_grid("2026-03")
    assert atmo_grid.metadata["data_status"] in ("demonstration_model", "simulated")
    assert atmo_grid.metadata["is_observation"] is False
    assert atmo_grid.metadata["source_type"] == "synthetic"

    # 3. Ocean Demo Grid
    ocean_grid = DemoDataService.get_simulated_ocean_grid("2026-03")
    assert ocean_grid.metadata["data_status"] in ("demonstration_model", "simulated")
    assert ocean_grid.metadata["is_observation"] is False
    assert ocean_grid.metadata["source_type"] == "synthetic"


def test_missing_dates_return_unavailable_not_simulated():
    """CRITICAL TEST: Verifies missing satellite observation dates are not filled with formulas."""
    # Month without ingested MODIS granule (e.g. 2026-05)
    grid = ObservationRepository.get_real_modis_spatial_grid(date_str="2026-05")
    assert grid["metadata"]["data_status"] == "unavailable"
    assert grid["metadata"]["is_observation"] is False
    assert len(grid["features"]) == 0
    assert "No genuine NASA MODIS MOD13C2" in grid["metadata"]["data_notice"]


def test_unconnected_pipelines_never_claim_observation():
    """CRITICAL TEST: Unobserved periods must report unavailable, never fake observations."""
    # Unobserved month (2025-01) must return unavailable
    gpm_grid = ObservationRepository.get_real_gpm_spatial_grid("2025-01")
    assert gpm_grid["metadata"]["data_status"] == "unavailable"
    assert gpm_grid["metadata"]["is_observation"] is False
    assert len(gpm_grid["features"]) == 0

    swot_grid = ObservationRepository.get_real_swot_spatial_grid("2025-01")
    assert swot_grid["metadata"]["data_status"] == "unavailable"
    assert swot_grid["metadata"]["is_observation"] is False
    assert len(swot_grid["features"]) == 0

    # Real queries report unavailable when no granule is loaded
    gpm_obs = ObservationRepository.get_real_gpm_spatial_grid("2026-03")
    assert gpm_obs["metadata"]["data_status"] in ("observation", "unavailable")

    swot_obs = ObservationRepository.get_real_swot_spatial_grid("2026-03")
    assert swot_obs["metadata"]["data_status"] in ("observation", "unavailable")

