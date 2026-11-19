import pytest
from app.services.comparison_service import ComparisonService


def test_atmosphere_period_comparison():
    res = ComparisonService.compare_periods(
        module="atmosphere",
        period_a="2024-03",
        period_b="2026-03",
        latitude=6.5,
        longitude=-150.0,
        source_mode="demonstration",
    )
    assert res.module == "atmosphere"
    assert res.period_a == "2024-03"
    assert res.period_b == "2026-03"
    assert res.unit == "mm"
    assert res.observation_a.value > 0
    assert res.observation_b.value > 0
    assert isinstance(res.absolute_difference, float)
    assert len(res.regional_differences) > 0
    assert "NASA GPM IMERG" in res.interpretation

    # Verify observation mode raises ValueError when observations are missing
    with pytest.raises(ValueError, match="Missing observations are not fabricated in production"):
        ComparisonService.compare_periods(
            module="atmosphere",
            period_a="2024-03",
            period_b="2026-03",
            latitude=6.5,
            longitude=-150.0,
            source_mode="observation",
        )


def test_ocean_period_comparison():
    res = ComparisonService.compare_periods(
        module="ocean",
        period_a="2024-06",
        period_b="2025-06",
        latitude=36.0,
        longitude=-68.0,
        source_mode="demonstration",
    )
    assert res.module == "ocean"
    assert res.period_a == "2024-06"
    assert res.period_b == "2025-06"
    assert res.unit == "m"
    assert res.percentage_meaningful is False
    assert res.percentage_note is not None
    assert isinstance(res.absolute_difference, float)
    assert len(res.regional_differences) > 0
    assert "SWOT KaRIn" in res.interpretation


def test_land_period_comparison():
    res = ComparisonService.compare_periods(
        module="land",
        period_a="2024-01",
        period_b="2026-01",
        latitude=-3.1,
        longitude=-60.0,
        source_mode="demonstration",
    )
    assert res.module == "land"
    assert res.period_a == "2024-01"
    assert res.period_b == "2026-01"
    assert res.unit == "NDVI"
    assert 0.0 <= res.observation_a.value <= 1.0
    assert 0.0 <= res.observation_b.value <= 1.0
    assert isinstance(res.absolute_difference, float)
    assert len(res.regional_differences) > 0
    assert "MODIS" in res.interpretation


def test_invalid_module_comparison():
    with pytest.raises(ValueError):
        ComparisonService.compare_periods(
            module="invalid_module",
            period_a="2024-01",
            period_b="2026-01",
        )
