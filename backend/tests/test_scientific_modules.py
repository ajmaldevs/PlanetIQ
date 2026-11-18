import pytest
from httpx import ASGITransport, AsyncClient
from app.main import app


@pytest.mark.asyncio
async def test_atmosphere_endpoints():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # Spatial Grid - Auto Mode (Returns genuine satellite observations for 2026-03)
        res = await client.get("/api/v1/atmosphere/grid?date=2026-03")
        assert res.status_code == 200
        data = res.json()
        assert data["type"] == "FeatureCollection"
        assert data["metadata"]["data_status"] in ("observation", "simulated")
        assert len(data["features"]) > 0

        # Verify scientific distinction: rate vs accumulation
        prop = data["features"][0]["properties"]
        assert "precipitation_rate_mm_hr" in prop
        assert "precipitation_accumulated_mm" in prop
        assert prop["rate_unit"] == "mm/hr"
        assert prop["accumulated_unit"] == "mm"
        assert prop["precipitation_accumulated_mm"] > prop["precipitation_rate_mm_hr"]

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
        assert demo_data["metadata"]["data_status"] == "simulated"
        assert demo_data["metadata"]["is_observation"] is False

        # Timeseries - Auto Mode (Returns observation for benchmark coordinate)
        ts_res = await client.get("/api/v1/atmosphere/timeseries?latitude=7.0&longitude=-135.0")
        assert ts_res.status_code == 200
        ts_data = ts_res.json()
        assert ts_data["data_status"] in ("observation", "simulated")
        assert len(ts_data["timeseries"]) > 0
        assert "mean_monthly_accumulation_mm" in ts_data["summary_statistics"]


@pytest.mark.asyncio
async def test_ocean_swot_endpoints():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # Spatial Swaths - Auto Mode (Returns genuine satellite observations for 2026-03)
        res = await client.get("/api/v1/ocean/observations?date=2026-03")
        assert res.status_code == 200
        data = res.json()
        assert data["type"] == "FeatureCollection"
        assert data["metadata"]["data_status"] in ("observation", "simulated")
        assert len(data["features"]) > 0

        prop = data["features"][0]["properties"]
        assert prop["dataset_id"] in ("SWOT_L2_LR_SSH", "MODISA_L3m_CHL", "MODISA_L3m_SST", "MODISA_L3m_OCEAN_SWOT")
        assert "ssh_karin_m" in prop or "ssha_karin_m" in prop or "chlor_a" in prop or "sst" in prop

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
        assert demo_data["metadata"]["data_status"] == "simulated"
        assert demo_data["metadata"]["is_observation"] is False

        # Timeseries - Auto Mode (Returns observation for benchmark coordinate)
        ts_res = await client.get("/api/v1/ocean/timeseries?latitude=28.0&longitude=-65.0")
        assert ts_res.status_code == 200
        ts_data = ts_res.json()
        assert ts_data["data_status"] in ("observation", "simulated")
        assert len(ts_data["timeseries"]) > 0
        assert "mean_ssha_m" in ts_data["summary_statistics"]


@pytest.mark.asyncio
async def test_land_modis_endpoints():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # Spatial Grid - Real Observation (Default/Auto Mode)
        res = await client.get("/api/v1/land/grid?date=2026-03")
        assert res.status_code == 200
        data = res.json()
        assert data["type"] == "FeatureCollection"
        assert data["metadata"]["data_status"] in ("observation", "simulated")
        assert len(data["features"]) > 0

        prop = data["features"][0]["properties"]
        assert prop["dataset_id"] == "MOD13C2"
        assert "ndvi" in prop
        assert "evi" in prop
        assert -0.2 <= prop["ndvi"] <= 1.0
        assert "vci_percent" in prop
        assert "drought_category" in prop
        assert prop["data_status"] in ("observation", "simulated")
        assert prop["is_observation"] in (True, False)
        if prop.get("is_observation"):
            assert "granule_id" in prop
        assert "provenance" in prop

        # Spatial Grid - Explicit Demonstration Mode
        demo_res = await client.get("/api/v1/land/grid?date=2026-03&source_mode=demonstration")
        assert demo_res.status_code == 200
        demo_data = demo_res.json()
        assert demo_data["metadata"]["data_status"] == "simulated"
        assert demo_data["metadata"]["is_observation"] is False

        # Timeseries - Real Observation Mode
        ts_res = await client.get("/api/v1/land/timeseries?latitude=-3.5&longitude=-62.0")
        assert ts_res.status_code == 200
        ts_data = ts_res.json()
        assert ts_data["data_status"] in ("observation", "simulated")
        assert ts_data["dataset_id"] == "MOD13C2"
        assert len(ts_data["timeseries"]) > 0
        assert "mean_ndvi" in ts_data["summary_statistics"]

        # Timeseries - Explicit Demonstration Mode
        demo_ts_res = await client.get("/api/v1/land/timeseries?latitude=-3.5&longitude=-62.0&source_mode=demonstration")
        assert demo_ts_res.status_code == 200
        demo_ts_data = demo_ts_res.json()
        assert demo_ts_data["data_status"] == "simulated"
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
