import pytest
from fastapi.testclient import TestClient
from app.main import app
from app.services.comparison_service import ComparisonService
from app.services.atmosphere_service import AtmosphereService
from app.services.ocean_service import OceanService
from app.services.land_service import LandService
from app.services.cross_system_service import CrossSystemService

client = TestClient(app)


def test_comparison_api_endpoint_atmosphere():
    response = client.get(
        "/api/v1/comparison/periods?module=atmosphere&period_a=2024-01&period_b=2026-03&latitude=6.5&longitude=-150.0"
    )
    assert response.status_code == 200
    data = response.json()
    assert data["module"] == "atmosphere"
    assert data["period_a"] == "2024-01"
    assert data["period_b"] == "2026-03"
    assert data["unit"] == "mm"
    assert "observation_a" in data
    assert "observation_b" in data
    assert "absolute_difference" in data
    assert len(data["regional_differences"]) > 0


def test_comparison_api_endpoint_ocean():
    response = client.get(
        "/api/v1/comparison/periods?module=ocean&period_a=2024-06&period_b=2025-06&latitude=36.0&longitude=-68.0"
    )
    assert response.status_code == 200
    data = response.json()
    assert data["module"] == "ocean"
    assert data["unit"] == "m"
    assert data["percentage_meaningful"] is False
    assert "percentage_note" in data
    assert "SWOT KaRIn" in data["interpretation"]


def test_comparison_api_endpoint_land():
    response = client.get(
        "/api/v1/comparison/periods?module=land&period_a=2024-03&period_b=2026-03&latitude=-3.1&longitude=-60.0"
    )
    assert response.status_code == 200
    data = response.json()
    assert data["module"] == "land"
    assert data["unit"] == "NDVI"
    assert 0.0 <= data["observation_a"]["value"] <= 1.0
    assert 0.0 <= data["observation_b"]["value"] <= 1.0
    assert "MODIS" in data["interpretation"]


def test_comparison_api_endpoint_validation():
    # Invalid module
    res = client.get("/api/v1/comparison/periods?module=unknown&period_a=2024-01&period_b=2026-01")
    assert res.status_code == 400


def test_timeline_month_coverage_across_services():
    # Verify earliest month (2024-01) and latest month (2026-12)
    atm_2024 = AtmosphereService.get_spatial_grid(date_str="2024-01")
    atm_2026 = AtmosphereService.get_spatial_grid(date_str="2026-12")
    assert len(atm_2024.features) > 0
    assert len(atm_2026.features) > 0

    ocn_2024 = OceanService.get_spatial_observations(date_str="2024-01")
    ocn_2026 = OceanService.get_spatial_observations(date_str="2026-12")
    assert len(ocn_2024.features) > 0
    assert len(ocn_2026.features) > 0

    lnd_2024 = LandService.get_spatial_grid(date_str="2024-01")
    lnd_2026 = LandService.get_spatial_grid(date_str="2026-12")
    assert len(lnd_2024.features) > 0
    assert len(lnd_2026.features) > 0


def test_cross_system_teleconnection_data():
    enso = CrossSystemService.get_teleconnection_analysis("enso_walker")
    assert "ENSO" in enso.phenomenon_name
    assert len(enso.timeseries) >= 6
    assert enso.causation_vs_correlation_note is not None
    assert "Correlation" in enso.causation_vs_correlation_note or "teleconnection" in enso.causation_vs_correlation_note
