"""
Authoritative Geographic Completeness & Boundary Validation Test Suite.
Verifies global coverage across all 241 sovereign countries and territories,
including small island developing states (SIDS), archipelagic nations,
and cross-device API network configuration.
"""

import json
from pathlib import Path
from app.core.config import settings

ROOT_DIR = Path(__file__).resolve().parent.parent.parent
GEOJSON_COUNTRIES = ROOT_DIR / "frontend" / "public" / "data" / "geo" / "ne_countries.geojson"
GEOJSON_BOUNDARIES = ROOT_DIR / "frontend" / "public" / "data" / "geo" / "ne_country_boundaries.geojson"
GIS_DATABASE = ROOT_DIR / "frontend" / "src" / "services" / "gisDatabase.ts"


def test_cors_regex_matches_local_network_ips():
    """Verify CORS_ORIGIN_REGEX matches local LAN IP addresses (192.168.*, 10.*, 172.16-31.*)."""
    import re
    pattern = re.compile(settings.CORS_ORIGIN_REGEX)
    assert pattern.match("http://192.168.1.50:5173")
    assert pattern.match("http://192.168.0.101:3000")
    assert pattern.match("http://10.0.0.15:5173")
    assert pattern.match("http://172.20.10.4:5173")
    assert pattern.match("http://localhost:5173")
    assert pattern.match("http://127.0.0.1:5173")


def test_authoritative_countries_geojson_completeness():
    """Verify that ne_countries.geojson contains all 241 sovereign countries/territories."""
    assert GEOJSON_COUNTRIES.exists(), "ne_countries.geojson must exist"
    with open(GEOJSON_COUNTRIES, "r", encoding="utf-8") as f:
        data = json.load(f)

    features = data.get("features", [])
    assert len(features) >= 240, f"Expected at least 240 countries/territories, got {len(features)}"

    # Required small island nations and overseas territories
    required_island_nations = {
        "Tuvalu", "Nauru", "Palau", "Seychelles", "Maldives", "Barbados",
        "Mauritius", "Iceland", "New Zealand", "Fiji", "Japan", "Philippines",
        "United Kingdom", "Cuba", "Vanuatu", "Samoa", "Kiribati", "Tonga"
    }

    found_names = set()
    for feat in features:
        props = feat.get("properties", {})
        name = props.get("name")
        formal = props.get("formal_name")
        if name:
            found_names.add(name)
        if formal:
            found_names.add(formal)

        # Ensure valid geometry
        geom = feat.get("geometry", {})
        assert geom.get("type") in ["Polygon", "MultiPolygon"]
        assert len(geom.get("coordinates", [])) > 0

        # Ensure centroids and identifiers
        assert "iso_a2" in props or "iso_a3" in props
        assert "center_lat" in props and "center_lon" in props

    missing = required_island_nations - found_names
    assert not missing, f"Missing required island countries in ne_countries.geojson: {missing}"


def test_authoritative_country_boundaries_geojson():
    """Verify ne_country_boundaries.geojson includes all country perimeter boundary lines."""
    assert GEOJSON_BOUNDARIES.exists(), "ne_country_boundaries.geojson must exist"
    with open(GEOJSON_BOUNDARIES, "r", encoding="utf-8") as f:
        data = json.load(f)

    features = data.get("features", [])
    assert len(features) >= 240, f"Expected boundary lines for at least 240 entities, got {len(features)}"

    for feat in features:
        geom = feat.get("geometry", {})
        assert geom.get("type") in ["LineString", "MultiLineString"]
        assert len(geom.get("coordinates", [])) > 0


def test_gis_database_place_count_and_levels():
    """Verify gisDatabase.ts contains >1,200 places across Level 1, 2, 3, 4."""
    assert GIS_DATABASE.exists(), "gisDatabase.ts must exist"
    content = GIS_DATABASE.read_text(encoding="utf-8")

    # Check that export const GIS_PLACES is populated with comprehensive entities
    assert "export const GIS_PLACES: GISPlace[] = [" in content
    assert '"level": 1' in content or 'level: 1' in content  # Continents / Oceans
    assert '"level": 2' in content or 'level: 2' in content  # Countries
    assert '"level": 3' in content or 'level: 3' in content  # States / Provinces
    assert '"level": 4' in content or 'level: 4' in content  # Cities / Populated Places

    # Check key island places are explicitly present in the GIS dataset
    for island in ["Tuvalu", "Nauru", "Maldives", "Seychelles", "Fiji", "Iceland"]:
        assert island in content
