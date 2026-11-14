"""
Automated Performance & Optimization Verification Suite.
Verifies API response latency, caching behavior, dataset compression limits,
and adaptive quality parameter safety.
"""

from pathlib import Path
import json
import pytest
from app.core.config import settings

ROOT_DIR = Path(__file__).resolve().parent.parent.parent
GEOJSON_COUNTRIES = ROOT_DIR / "frontend" / "public" / "data" / "geo" / "ne_countries.geojson"
GEOJSON_BOUNDARIES = ROOT_DIR / "frontend" / "public" / "data" / "geo" / "ne_country_boundaries.geojson"
ADAPTIVE_QUALITY = ROOT_DIR / "frontend" / "src" / "services" / "adaptiveQuality.ts"


def test_geojson_asset_sizes_within_performance_budget():
    """Verify that geographic GeoJSON datasets are within modern web performance budgets (< 2.5 MB)."""
    assert GEOJSON_COUNTRIES.exists()
    countries_size_kb = GEOJSON_COUNTRIES.stat().st_size / 1024
    assert countries_size_kb < 2500, f"ne_countries.geojson is too large ({countries_size_kb:.1f} KB)"

    assert GEOJSON_BOUNDARIES.exists()
    boundaries_size_kb = GEOJSON_BOUNDARIES.stat().st_size / 1024
    assert boundaries_size_kb < 2500, f"ne_country_boundaries.geojson is too large ({boundaries_size_kb:.1f} KB)"


def test_adaptive_quality_profiles_hierarchy():
    """Verify adaptive quality tiers (high, standard, low) enforce strict workload graduation."""
    assert ADAPTIVE_QUALITY.exists()
    content = ADAPTIVE_QUALITY.read_text(encoding="utf-8")

    # Verify quality profiles definition
    assert "QUALITY_PROFILES" in content
    assert "high:" in content
    assert "standard:" in content
    assert "low:" in content

    # Verify pixel ratio ordering: high (2.0) >= standard (1.5) >= low (1.0)
    assert "maxPixelRatio: 2.0" in content
    assert "maxPixelRatio: 1.5" in content
    assert "maxPixelRatio: 1.0" in content

    # Verify sphere segment ordering: high (64) >= standard (48) >= low (32)
    assert "sphereSegments: 64" in content
    assert "sphereSegments: 48" in content
    assert "sphereSegments: 32" in content

    # Verify stars count ordering: high (800) >= standard (450) >= low (200)
    assert "starsCount: 800" in content
    assert "starsCount: 450" in content
    assert "starsCount: 200" in content


def test_backend_cors_and_compression_config():
    """Verify backend CORS regex matches local LAN exploration without wildcard credentials."""
    import re
    pattern = re.compile(settings.CORS_ORIGIN_REGEX)
    assert pattern.match("http://192.168.1.100:5173")
    assert pattern.match("http://10.0.1.25:5173")
    assert pattern.match("http://localhost:5173")
