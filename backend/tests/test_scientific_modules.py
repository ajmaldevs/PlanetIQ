import pytest
from httpx import ASGITransport, AsyncClient
from app.main import app


@pytest.mark.asyncio
async def test_atmosphere_endpoints():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # Spatial Grid
        res = await client.get("/api/v1/atmosphere/grid?date=2026-03")
        assert res.status_code == 200
        data = res.json()
        assert data["type"] == "FeatureCollection"
        assert data["metadata"]["data_status"] == "demonstration_model"
        assert data["metadata"]["is_observation"] is False
        assert len(data["features"]) > 0
        
        # Verify scientific distinction: rate vs accumulation
        prop = data["features"][0]["properties"]
        assert "precipitation_rate_mm_hr" in prop
        assert "precipitation_accumulated_mm" in prop
        assert prop["rate_unit"] == "mm/hr"
        assert prop["accumulated_unit"] == "mm"
        # Monthly accumulation must be significantly larger than hourly rate (rate * 24 * 31)
        assert prop["precipitation_accumulated_mm"] > prop["precipitation_rate_mm_hr"]

        # Timeseries
        ts_res = await client.get("/api/v1/atmosphere/timeseries?latitude=6.5&longitude=-150.0")
        assert ts_res.status_code == 200
        ts_data = ts_res.json()
        assert ts_data["data_status"] == "demonstration_model"
        assert ts_data["is_observation"] is False
        assert ts_data["dataset_id"] == "GPM_3IMERGM"
        assert len(ts_data["timeseries"]) > 0
        assert "mean_monthly_accumulation_mm" in ts_data["summary_statistics"]


@pytest.mark.asyncio
async def test_ocean_swot_endpoints():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # Spatial Swaths
        res = await client.get("/api/v1/ocean/observations?date=2026-03")
        assert res.status_code == 200
        data = res.json()
        assert data["type"] == "FeatureCollection"
        assert data["metadata"]["data_status"] == "demonstration_model"
        assert data["metadata"]["is_observation"] is False
        assert len(data["features"]) > 0

        prop = data["features"][0]["properties"]
        assert prop["dataset_id"] == "SWOT_L2_LR_SSH"
        assert "ssh_karin_m" in prop
        assert "ssha_karin_m" in prop
        assert "dynamic_topography_m" in prop
        assert prop["unit"] == "meters (m)"

        # Timeseries
        ts_res = await client.get("/api/v1/ocean/timeseries?latitude=36.0&longitude=-68.0")
        assert ts_res.status_code == 200
        ts_data = ts_res.json()
        assert ts_data["data_status"] == "demonstration_model"
        assert ts_data["is_observation"] is False
        assert ts_data["dataset_id"] == "SWOT_L2_LR_SSH"
        assert len(ts_data["timeseries"]) > 0
        assert "mean_ssha_m" in ts_data["summary_statistics"]


@pytest.mark.asyncio
async def test_land_modis_endpoints():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # Spatial Grid
        res = await client.get("/api/v1/land/grid?date=2026-03")
        assert res.status_code == 200
        data = res.json()
        assert data["type"] == "FeatureCollection"
        assert data["metadata"]["data_status"] == "demonstration_model"
        assert data["metadata"]["is_observation"] is False
        assert len(data["features"]) > 0

        prop = data["features"][0]["properties"]
        assert prop["dataset_id"] == "MOD13C2"
        assert "ndvi" in prop
        assert "evi" in prop
        assert -0.2 <= prop["ndvi"] <= 1.0
        assert "vci_percent" in prop
        assert "drought_category" in prop

        # Timeseries
        ts_res = await client.get("/api/v1/land/timeseries?latitude=-3.5&longitude=-62.0")
        assert ts_res.status_code == 200
        ts_data = ts_res.json()
        assert ts_data["data_status"] == "demonstration_model"
        assert ts_data["is_observation"] is False
        assert ts_data["dataset_id"] == "MOD13C2"
        assert len(ts_data["timeseries"]) > 0
        assert "mean_ndvi" in ts_data["summary_statistics"]


@pytest.mark.asyncio
async def test_cross_system_endpoints():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        res = await client.get("/api/v1/cross-system/analysis?phenomenon_id=enso_walker")
        assert res.status_code == 200
        data = res.json()
        assert "causation_vs_correlation_note" in data
        assert "CRITICAL SCIENTIFIC PRINCIPLE" in data["causation_vs_correlation_note"]
        assert len(data["timeseries"]) > 0
        assert "ocean_ssha_m" in data["timeseries"][0]
        assert "atmosphere_precipitation_anomaly_mm" in data["timeseries"][0]
        assert "land_ndvi_anomaly" in data["timeseries"][0]


@pytest.mark.asyncio
async def test_assistant_endpoint():
    from unittest.mock import patch
    with patch("app.core.config.settings.GEMINI_API_KEY", ""):
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            payload = {
                "prompt": "How does SWOT measure sea surface height and what are the units?",
                "context": {"active_module": "ocean"}
            }
            res = await client.post("/api/v1/assistant/query", json=payload)
            assert res.status_code == 200
            data = res.json()
            assert "response" in data
            assert "scientific_grounding" in data
            assert len(data["scientific_grounding"]) > 0
            assert any(c["units"] == "meters (m)" for c in data["scientific_grounding"])


@pytest.mark.asyncio
async def test_invalid_calendar_month_is_rejected():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        for endpoint in ("atmosphere/grid", "ocean/observations", "land/grid"):
            response = await client.get(f"/api/v1/{endpoint}?date=2026-13")
            assert response.status_code == 422


@pytest.mark.asyncio
async def test_dataset_catalog_endpoints():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        res = await client.get("/api/v1/datasets/")
        assert res.status_code == 200
        datasets = res.json()
        assert len(datasets) == 3
        ids = [d["id"] for d in datasets]
        assert "SWOT_L2_LR_SSH" in ids
        assert "GPM_3IMERGM" in ids
        assert "MOD13C2" in ids

        single_res = await client.get("/api/v1/datasets/GPM_3IMERGM")
        assert single_res.status_code == 200
        assert single_res.json()["name"] == "GPM IMERG Final Monthly Precipitation (GPM_3IMERGM v07)"
