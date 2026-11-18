"""
Tests for NASA GPM IMERG and SWOT Ocean Data Pipelines.
Verifies CMR discovery, caching, observation repository, source_mode discrimination, and FastAPI endpoints.
"""

import pytest
import os
from unittest.mock import patch
from httpx import ASGITransport, AsyncClient

from app.main import app
from app.integrations.nasa.gpm_client import GpmClient
from app.integrations.nasa.swot_client import SwotClient
from app.integrations.nasa.earthdata_client import NasaEarthdataClient
from app.repositories.observation_repository import ObservationRepository
from app.services.atmosphere_service import AtmosphereService
from app.services.ocean_service import OceanService


class TestGpmPipeline:
    """Test suite for NASA GPM IMERG Final Monthly Precipitation."""

    def test_gpm_collection_id(self):
        assert GpmClient.COLLECTION_ID == "GPM_3IMERGM"
        assert NasaEarthdataClient.COLLECTION_CONCEPT_IDS["GPM_3IMERGM"] == "C2723754851-GES_DISC"

    @pytest.mark.asyncio
    async def test_gpm_find_granule_mocked(self):
        mock_cmr_response = {
            "status": "success",
            "count": 1,
            "granules": [
                {
                    "granule_ur": "GPM_3IMERGM.20260301-S000000-E235959.03.V07B.HDF5",
                    "title": "GPM_3IMERGM.20260301-S000000-E235959.03.V07B.HDF5",
                    "data_links": ["https://gesdisc.earthdata.nasa.gov/data/GPM_L3/GPM_3IMERGM.07/2026/03/test.nc4"],
                }
            ],
        }
        with patch.object(NasaEarthdataClient, "search_granules", return_value=mock_cmr_response):
            granule = await GpmClient.find_granule_for_month(2026, 3)
            assert granule is not None
            assert "GPM_3IMERGM" in granule["title"]

    @pytest.mark.asyncio
    async def test_gpm_cache_retrieval(self, tmp_path):
        test_file = tmp_path / "test_gpm.nc4"
        test_file.write_bytes(b"mock_gpm_netcdf4_bytes" * 100)

        meta = {
            "title": "test_gpm_granule",
            "data_links": [f"https://gesdisc.earthdata.nasa.gov/{test_file.name}"],
        }

        res = await GpmClient.retrieve_granule_file(meta, cache_dir=str(tmp_path))
        assert res["status"] == "cached"
        assert os.path.exists(res["file_path"])


class TestSwotPipeline:
    """Test suite for NASA/CNES SWOT KaRIn Ocean Altimetry."""

    def test_swot_collection_id(self):
        assert SwotClient.COLLECTION_ID == "SWOT_L2_LR_SSH"
        assert NasaEarthdataClient.COLLECTION_CONCEPT_IDS["SWOT_L2_LR_SSH"] == "C3233945000-POCLOUD"

    @pytest.mark.asyncio
    async def test_swot_find_granule_mocked(self):
        mock_cmr_response = {
            "status": "success",
            "count": 1,
            "granules": [
                {
                    "granule_ur": "SWOT_L2_LR_SSH_Expert_584_012_20260305T120000.nc",
                    "title": "SWOT_L2_LR_SSH_Expert_584_012_20260305T120000.nc",
                    "data_links": ["https://podaac.jpl.nasa.gov/data/swot/test.nc"],
                }
            ],
        }
        with patch.object(NasaEarthdataClient, "search_granules", return_value=mock_cmr_response):
            granule = await SwotClient.find_granule_for_month(2026, 3)
            assert granule is not None
            assert "SWOT_L2_LR_SSH" in granule["title"]


class TestObservationRepositoryExpansion:
    """Verifies GPM and SWOT methods in ObservationRepository."""

    def test_gpm_spatial_grid(self):
        grid = ObservationRepository.get_real_gpm_spatial_grid("2026-03")
        assert grid["metadata"]["data_status"] == "observation"
        assert grid["metadata"]["is_observation"] is True
        assert len(grid["features"]) > 0

        first_feat = grid["features"][0]
        assert "precipitation_rate_mm_hr" in first_feat["properties"]
        assert "precipitation_accumulated_mm" in first_feat["properties"]
        assert first_feat["properties"]["is_observation"] is True

    def test_gpm_timeseries(self):
        ts = ObservationRepository.get_real_gpm_timeseries(9.93, 76.27, 2024, 2026)
        assert ts["data_status"] == "observation"
        assert ts["is_observation"] is True
        assert len(ts["timeseries"]) == 36
        assert ts["timeseries"][0]["precipitation_accumulated_mm"] > 0

    def test_swot_spatial_grid(self):
        grid = ObservationRepository.get_real_swot_spatial_grid("2026-03")
        assert grid["metadata"]["data_status"] == "observation"
        assert grid["metadata"]["is_observation"] is True
        assert len(grid["features"]) > 0

        first_feat = grid["features"][0]
        assert "ssha_karin_m" in first_feat["properties"]
        assert "eddy_kinetic_energy_cm2_s2" in first_feat["properties"]
        assert first_feat["properties"]["is_observation"] is True

    def test_swot_timeseries(self):
        ts = ObservationRepository.get_real_swot_timeseries(36.0, -68.0, 2024, 2026)
        assert ts["data_status"] == "observation"
        assert ts["is_observation"] is True
        assert len(ts["timeseries"]) == 36


class TestScientificServicesSourceMode:
    """Verifies that services obey source_mode='auto'|'observation'|'demonstration'."""

    def test_atmosphere_service_source_mode(self):
        obs_grid = AtmosphereService.get_spatial_grid(date_str="2026-03", source_mode="observation")
        assert obs_grid.metadata.get("data_status") == "observation"
        assert obs_grid.metadata.get("is_observation") is True

        demo_grid = AtmosphereService.get_spatial_grid(date_str="2026-03", source_mode="demonstration")
        assert demo_grid.metadata.get("data_status") == "demonstration_model"
        assert demo_grid.metadata.get("is_observation") is False

        auto_grid = AtmosphereService.get_spatial_grid(date_str="2026-03", source_mode="auto")
        assert auto_grid.metadata.get("data_status") == "observation"

    def test_ocean_service_source_mode(self):
        obs_grid = OceanService.get_spatial_observations(date_str="2026-03", source_mode="observation")
        assert obs_grid.metadata.get("data_status") == "observation"
        assert obs_grid.metadata.get("is_observation") is True

        demo_grid = OceanService.get_spatial_observations(date_str="2026-03", source_mode="demonstration")
        assert demo_grid.metadata.get("data_status") == "demonstration_model"
        assert demo_grid.metadata.get("is_observation") is False

        auto_grid = OceanService.get_spatial_observations(date_str="2026-03", source_mode="auto")
        assert auto_grid.metadata.get("data_status") == "observation"


class TestApiEndpointsSourceMode:
    """Verifies API endpoints propagate source_mode properly."""

    @pytest.mark.asyncio
    async def test_atmosphere_endpoints(self):
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            res_obs = await client.get("/api/v1/atmosphere/grid?source_mode=observation")
            assert res_obs.status_code == 200
            data_obs = res_obs.json()
            assert data_obs["metadata"]["data_status"] == "observation"

            res_demo = await client.get("/api/v1/atmosphere/grid?source_mode=demonstration")
            assert res_demo.status_code == 200
            data_demo = res_demo.json()
            assert data_demo["metadata"]["data_status"] == "demonstration_model"

            res_ts = await client.get("/api/v1/atmosphere/timeseries?latitude=9.93&longitude=76.27&source_mode=observation")
            assert res_ts.status_code == 200
            data_ts = res_ts.json()
            assert data_ts["data_status"] == "observation"

    @pytest.mark.asyncio
    async def test_ocean_endpoints(self):
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            res_obs = await client.get("/api/v1/ocean/observations?source_mode=observation")
            assert res_obs.status_code == 200
            data_obs = res_obs.json()
            assert data_obs["metadata"]["data_status"] == "observation"

            res_demo = await client.get("/api/v1/ocean/observations?source_mode=demonstration")
            assert res_demo.status_code == 200
            data_demo = res_demo.json()
            assert data_demo["metadata"]["data_status"] == "demonstration_model"

            res_ts = await client.get("/api/v1/ocean/timeseries?latitude=36.0&longitude=-68.0&source_mode=observation")
            assert res_ts.status_code == 200
            data_ts = res_ts.json()
            assert data_ts["data_status"] == "observation"
