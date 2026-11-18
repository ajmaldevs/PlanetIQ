import pytest
from httpx import ASGITransport, AsyncClient
from app.main import app


@pytest.mark.asyncio
async def test_health_endpoint():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get("/api/v1/health")
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "healthy"
        assert "database" in data
        assert "scientific_modules" in data
        assert data["scientific_modules"]["ocean"] == "SWOT KaRIn Sea Surface Height (Option A)"
        assert data["scientific_modules"]["atmosphere"] == "GPM IMERG Final Monthly (GPM_3IMERGM)"
        assert data["scientific_modules"]["land"] == "MODIS Monthly Global NDVI/EVI (MOD13C2)"


@pytest.mark.asyncio
async def test_system_info_endpoint():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get("/api/v1/system-info")
        assert response.status_code == 200
        data = response.json()
        assert data["project_name"] == "PlanetIQ"
        assert data["api_prefix"] == "/api/v1"


@pytest.mark.asyncio
async def test_root_endpoint():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get("/")
        assert response.status_code == 200
        data = response.json()
        assert data["project"] == "PlanetIQ"
