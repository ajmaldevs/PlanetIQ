import pytest
from httpx import ASGITransport, AsyncClient
from app.main import app
from app.core.config import settings
from app.services.ingestion_service import IngestionService
from app.services.land_service import LandService
from app.services.ocean_service import OceanService
from app.services.atmosphere_service import AtmosphereService
from app.services.comparison_service import ComparisonService


def test_seed_authoritative_satellite_observations_strictly_removed():
    """Verify fabricated seeder method is completely eliminated from the codebase."""
    assert not hasattr(IngestionService, "seed_authoritative_satellite_observations")
    assert not hasattr(IngestionService, "seed_initial_observations")


def test_production_guard_rejects_demonstration():
    """Verify that settings.assert_no_demonstration_in_production raises ValueError in production."""
    original_env = settings.ENVIRONMENT
    try:
        settings.ENVIRONMENT = "production"
        with pytest.raises(ValueError, match="Demonstration data mode is strictly prohibited in production"):
            settings.assert_no_demonstration_in_production("demonstration")

        # Observation mode must be accepted
        settings.assert_no_demonstration_in_production("observation")
        settings.assert_no_demonstration_in_production("auto")
    finally:
        settings.ENVIRONMENT = original_env


@pytest.mark.asyncio
async def test_api_endpoints_reject_demonstration_in_production():
    """Verify API routes reject source_mode=demonstration with HTTP 400 when IS_PRODUCTION is true."""
    original_env = settings.ENVIRONMENT
    try:
        settings.ENVIRONMENT = "production"
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            # Land endpoint (/api/v1/land/grid)
            r_land = await client.get("/api/v1/land/grid?source_mode=demonstration")
            assert r_land.status_code == 400
            assert "Demonstration data mode is disabled in production" in r_land.json()["detail"]

            # Ocean endpoint (/api/v1/ocean/grid)
            r_ocean = await client.get("/api/v1/ocean/grid?source_mode=demonstration")
            assert r_ocean.status_code == 400
            assert "Demonstration data mode is disabled in production" in r_ocean.json()["detail"]

            # Atmosphere endpoint (/api/v1/atmosphere/grid)
            r_atmo = await client.get("/api/v1/atmosphere/grid?source_mode=demonstration")
            assert r_atmo.status_code == 400
            assert "Demonstration data mode is disabled in production" in r_atmo.json()["detail"]

            # Comparison endpoint (/api/v1/comparison/periods)
            r_comp = await client.get("/api/v1/comparison/periods?module=ocean&period_a=2024-01&period_b=2024-02&source_mode=demonstration")
            assert r_comp.status_code == 400
            assert "Demonstration data mode is disabled in production" in r_comp.json()["detail"]
    finally:
        settings.ENVIRONMENT = original_env


def test_missing_observations_return_unavailable_dataset():
    """Verify that when no observations exist in DB, services return honest unavailable status and empty features."""
    original_env = settings.ENVIRONMENT
    try:
        settings.ENVIRONMENT = "production"
        
        # Test Land Service
        land_grid = LandService.get_spatial_grid("1990-01", source_mode="observation")
        assert land_grid.metadata["data_status"] == "unavailable"
        assert land_grid.metadata["is_observation"] is False
        assert len(land_grid.features) == 0

        # Test Ocean Service
        ocean_grid = OceanService.get_spatial_observations("1990-01", source_mode="observation")
        assert ocean_grid.metadata["data_status"] == "unavailable"
        assert ocean_grid.metadata["is_observation"] is False
        assert len(ocean_grid.features) == 0

        # Test Atmosphere Service
        atmo_grid = AtmosphereService.get_spatial_grid("1990-01", source_mode="observation")
        assert atmo_grid.metadata["data_status"] == "unavailable"
        assert atmo_grid.metadata["is_observation"] is False
        assert len(atmo_grid.features) == 0
    finally:
        settings.ENVIRONMENT = original_env


def test_comparison_service_refuses_to_invent_data_in_production():
    """Verify that comparisons fail with explicit error when observations are missing in production."""
    original_env = settings.ENVIRONMENT
    try:
        settings.ENVIRONMENT = "production"
        with pytest.raises(ValueError, match="Missing observations are not fabricated in production"):
            ComparisonService.compare_periods(
                module="ocean",
                period_a="1990-01",
                period_b="1990-02",
                source_mode="observation",
            )
    finally:
        settings.ENVIRONMENT = original_env


@pytest.mark.asyncio
async def test_ingest_status_endpoint():
    """Verify GET /api/v1/ingest/status reports configuration, database connectivity, and observation counts."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get("/api/v1/ingest/status")
        assert response.status_code == 200
        data = response.json()
        assert "database" in data
        assert "postgis_available" in data["database"]
        assert "nasa_earthdata" in data
        assert "authentication_configured" in data["nasa_earthdata"]
        assert "scientific_observations" in data
        assert "verified_record_counts" in data["scientific_observations"]


@pytest.mark.asyncio
async def test_ingest_trigger_endpoint_authentication():
    """Verify POST /api/v1/ingest/trigger requires valid X-Admin-Key."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # Request without header
        r1 = await client.post("/api/v1/ingest/trigger", json={
            "dataset_id": "MOD13C2",
            "start_date": "2025-01-01",
            "end_date": "2025-01-31"
        })
        assert r1.status_code == 401
        assert "requires administrative authentication" in r1.json()["detail"]

        # Request with incorrect header
        r2 = await client.post(
            "/api/v1/ingest/trigger",
            headers={"X-Admin-Key": "wrong-key"},
            json={
                "dataset_id": "MOD13C2",
                "start_date": "2025-01-01",
                "end_date": "2025-01-31"
            }
        )
        assert r2.status_code == 403
        assert "Invalid admin key" in r2.json()["detail"]

        # Request with correct header but invalid dataset
        r3 = await client.post(
            "/api/v1/ingest/trigger",
            headers={"X-Admin-Key": settings.ADMIN_API_KEY},
            json={
                "dataset_id": "INVALID_DATASET",
                "start_date": "2025-01-01",
                "end_date": "2025-01-31"
            }
        )
        assert r3.status_code == 422
