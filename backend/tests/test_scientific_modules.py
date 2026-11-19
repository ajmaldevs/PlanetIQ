import pytest
from httpx import ASGITransport, AsyncClient
from app.main import app


@pytest.mark.asyncio
async def test_atmosphere_endpoints():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # Spatial Grid - Default / Observation Mode
        res = await client.get("/api/v1/atmosphere/grid?date=2026-03")
        assert res.status_code == 200
        data = res.json()
        assert data["type"] == "FeatureCollection"
        assert data["metadata"]["data_status"] in ("observation", "unavailable", "demonstration_model", "simulated")
        if data["metadata"]["data_status"] == "observation":
            assert len(data["features"]) > 0

        # Spatial Grid - Explicit Observation Mode for unobserved date (Reports truthful unavailable status)
        obs_res = await client.get("/api/v1/atmosphere/grid?date=2025-01&source_mode=observation")
        assert obs_res.status_code == 200
        obs_data = obs_res.json()
        assert obs_data["metadata"]["data_status"] == "unavailable"
        assert obs_data["metadata"]["is_observation"] is False
        assert len(obs_data["features"]) == 0

        # Spatial Grid - Explicit Demonstration Mode
        demo_res = await client.get("/api/v1/atmosphere/grid?date=2026-03&source_mode=demonstration")
        assert demo_res.status_code == 200
        demo_data = demo_res.json()
        assert demo_data["metadata"]["data_status"] in ("demonstration_model", "simulated")
        assert demo_data["metadata"]["is_observation"] is False
        assert len(demo_data["features"]) > 0

        # Verify scientific distinction: rate vs accumulation
        prop = demo_data["features"][0]["properties"]
        assert "precipitation_rate_mm_hr" in prop
        assert "precipitation_accumulated_mm" in prop
        assert prop["rate_unit"] == "mm/hr"
        assert prop["accumulated_unit"] == "mm"
        assert prop["precipitation_accumulated_mm"] > prop["precipitation_rate_mm_hr"]

        # Timeseries - Default Mode
        ts_res = await client.get("/api/v1/atmosphere/timeseries?latitude=7.0&longitude=-135.0")
        assert ts_res.status_code == 200
        ts_data = ts_res.json()
        assert ts_data["data_status"] in ("observation", "unavailable", "demonstration_model", "simulated")


@pytest.mark.asyncio
async def test_ocean_swot_endpoints():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # Spatial Swaths - Default Mode
        res = await client.get("/api/v1/ocean/observations?date=2026-03")
        assert res.status_code == 200
        data = res.json()
        assert data["type"] == "FeatureCollection"
        assert data["metadata"]["data_status"] in ("observation", "unavailable", "demonstration_model", "simulated")

        # Spatial Swaths - Explicit Observation Mode for unobserved date (Reports truthful unavailable status)
        obs_res = await client.get("/api/v1/ocean/observations?date=2025-01&source_mode=observation")
        assert obs_res.status_code == 200
        obs_data = obs_res.json()
        assert obs_data["metadata"]["data_status"] == "unavailable"
        assert obs_data["metadata"]["is_observation"] is False
        assert len(obs_data["features"]) == 0

        # Spatial Grid - Explicit Demonstration Mode
        demo_res = await client.get("/api/v1/ocean/observations?date=2026-03&source_mode=demonstration")
        assert demo_res.status_code == 200
        demo_data = demo_res.json()
        assert demo_data["metadata"]["data_status"] in ("demonstration_model", "simulated")
        assert demo_data["metadata"]["is_observation"] is False
        assert len(demo_data["features"]) > 0

        prop = demo_data["features"][0]["properties"]
        assert prop["dataset_id"] in ("SWOT_L2_LR_SSH", "MODISA_L3m_CHL", "MODISA_L3m_SST", "MODISA_L3m_OCEAN_SWOT")
        assert "ssh_karin_m" in prop or "ssha_karin_m" in prop or "chlor_a" in prop or "sst" in prop

        # Timeseries - Default Mode
        ts_res = await client.get("/api/v1/ocean/timeseries?latitude=28.0&longitude=-65.0")
        assert ts_res.status_code == 200
        ts_data = ts_res.json()
        assert ts_data["data_status"] in ("observation", "unavailable", "demonstration_model", "simulated")


@pytest.mark.asyncio
async def test_land_modis_endpoints():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # Spatial Grid - Real Observation (Default Mode)
        res = await client.get("/api/v1/land/grid?date=2026-03")
        assert res.status_code == 200
        data = res.json()
        assert data["type"] == "FeatureCollection"
        assert data["metadata"]["data_status"] in ("observation", "unavailable", "demonstration_model", "simulated")

        # Spatial Grid - Explicit Demonstration Mode
        demo_res = await client.get("/api/v1/land/grid?date=2026-03&source_mode=demonstration")
        assert demo_res.status_code == 200
        demo_data = demo_res.json()
        assert demo_data["metadata"]["data_status"] in ("demonstration_model", "simulated")
        assert demo_data["metadata"]["is_observation"] is False
        assert len(demo_data["features"]) > 0

        prop = demo_data["features"][0]["properties"]
        assert prop["dataset_id"] == "MOD13C2"
        assert "ndvi" in prop
        assert "evi" in prop
        assert -0.2 <= prop["ndvi"] <= 1.0
        assert "vci_percent" in prop
        assert "drought_category" in prop
        assert prop["data_status"] in ("observation", "demonstration_model", "simulated")
        assert prop["is_observation"] in (True, False)
        assert "provenance" in prop

        # Timeseries - Real Observation Mode
        ts_res = await client.get("/api/v1/land/timeseries?latitude=-3.5&longitude=-62.0")
        assert ts_res.status_code == 200
        ts_data = ts_res.json()
        assert ts_data["data_status"] in ("observation", "unavailable", "demonstration_model", "simulated")
        assert ts_data["dataset_id"] == "MOD13C2"

        # Timeseries - Explicit Demonstration Mode
        demo_ts_res = await client.get("/api/v1/land/timeseries?latitude=-3.5&longitude=-62.0&source_mode=demonstration")
        assert demo_ts_res.status_code == 200
        demo_ts_data = demo_ts_res.json()
        assert demo_ts_data["data_status"] in ("demonstration_model", "simulated")
        assert demo_ts_data["is_observation"] is False


@pytest.mark.asyncio
async def test_cross_system_endpoints():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        res = await client.get("/api/v1/cross-system/analysis?phenomenon_id=enso_walker")
        assert res.status_code == 200
        data = res.json()
        assert "causation_vs_correlation_note" in data
        assert len(data["timeseries"]) > 0
        assert len(data["key_insights"]) > 0


@pytest.mark.asyncio
async def test_dataset_catalog_endpoints():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        res = await client.get("/api/v1/datasets/")
        assert res.status_code == 200
        data = res.json()
        assert len(data) >= 3
        ids = [d["id"] for d in data]
        assert "SWOT_L2_LR_SSH" in ids
        assert "GPM_3IMERGM" in ids
        assert "MOD13C2" in ids

        single_res = await client.get("/api/v1/datasets/MOD13C2")
        assert single_res.status_code == 200
        single_data = single_res.json()
        assert single_data["agency"] == "NASA LP DAAC / USGS"
        assert single_data["cmr_concept_id"] == "C2565788914-LPCLOUD"
