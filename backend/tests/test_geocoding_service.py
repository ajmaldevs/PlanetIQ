import pytest
from app.services.geocoding_service import GeocodingService


def test_geocoding_country_search_returns_bbox():
    res = GeocodingService.search(query="France", limit=5)
    assert res.total_results > 0
    france = next(r for r in res.results if r.name == "France")
    assert france.category == "Country"
    assert france.iso_a3 == "FRA"
    assert france.bbox is not None
    assert len(france.bbox) == 4
    # Bounding box covers France
    min_lon, min_lat, max_lon, max_lat = france.bbox
    assert min_lon < max_lon
    assert min_lat < max_lat


def test_geocoding_natural_features_search():
    res_everest = GeocodingService.search(query="Everest", limit=3)
    assert any("Everest" in r.name for r in res_everest.results)
    everest = next(r for r in res_everest.results if "Everest" in r.name)
    assert everest.category == "Natural Feature"
    assert 27.9 <= everest.latitude <= 28.1

    res_amazon = GeocodingService.search(query="Amazon River", limit=3)
    assert any("Amazon" in r.name for r in res_amazon.results)


def test_geocoding_duplicate_disambiguation():
    res = GeocodingService.search(query="Paris", limit=5)
    names = [r.name for r in res.results]
    assert "Paris" in names
    # Disambiguation detail present
    paris_fr = next(r for r in res.results if r.parent_country == "France")
    assert "France" in (paris_fr.detail or "")


def test_geocoding_partial_and_alias_search():
    # Searching partial 'kozhi' finds Kozhikode
    res_kozhi = GeocodingService.search(query="kozhi", limit=5)
    assert any("Kozhikode" in r.name for r in res_kozhi.results)

    # Searching 'calicut' finds Kozhikode
    res_calicut = GeocodingService.search(query="calicut", limit=5)
    assert any("Kozhikode" in r.name or "Calicut" in (r.formal_name or "") for r in res_calicut.results)


def test_geocoding_empty_and_whitespace_query():
    res = GeocodingService.search(query="   ", limit=5)
    assert res.total_results == 0
    assert len(res.results) == 0
