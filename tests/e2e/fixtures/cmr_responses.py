"""
tests/e2e/fixtures/cmr_responses.py
Authoritative NASA CMR UMM-G metadata responses for MODIS, GPM, and SWOT.
"""
from typing import Any, Dict, List, Optional


def create_cmr_granule_entry(
    granule_ur: str,
    title: str,
    download_url: str,
    time_start: str = "2026-03-01T00:00:00Z",
    time_end: str = "2026-03-31T23:59:59Z",
    granule_size_mb: float = 2.5,
    collection_concept_id: str = "C2565788914-LPCLOUD",
) -> Dict[str, Any]:
    """Generates a single authoritative CMR granule JSON entry."""
    return {
        "id": granule_ur,
        "title": title,
        "time_start": time_start,
        "time_end": time_end,
        "granule_size": str(granule_size_mb),
        "collection_concept_id": collection_concept_id,
        "links": [
            {
                "rel": "http://esipfed.org/ns/fedsearch/1.1/data#",
                "type": "application/x-netcdf" if title.endswith((".nc", ".nc4")) else "image/tiff",
                "href": download_url,
                "inherited": False,
            },
            {
                "rel": "http://esipfed.org/ns/fedsearch/1.1/browse#",
                "type": "image/jpeg",
                "href": f"{download_url}.jpg",
                "inherited": False,
            },
        ],
    }


def create_cmr_search_response(entries: List[Dict[str, Any]]) -> Dict[str, Any]:
    """Wraps a list of granule entries into the standard NASA CMR Search API response."""
    return {
        "feed": {
            "updated": "2026-03-01T00:00:00Z",
            "id": "https://cmr.earthdata.nasa.gov/search/granules.json",
            "title": "NASA CMR Granule Search Feed",
            "entry": entries,
        }
    }


# Pre-canned CMR search responses for authentic satellite datasets
MOCK_MODIS_CMR_RESPONSE = create_cmr_search_response([
    create_cmr_granule_entry(
        granule_ur="G2565788914-LPCLOUD",
        title="MOD13C2.A2026060.061.2026080123456.tif",
        download_url="https://data.lpdaac.earthdatacloud.nasa.gov/data/MODIS/MOD13C2.A2026060.061.2026080123456.tif",
        collection_concept_id="C2565788914-LPCLOUD",
    )
])

MOCK_GPM_CMR_RESPONSE = create_cmr_search_response([
    create_cmr_granule_entry(
        granule_ur="G2723754851-GES_DISC",
        title="GPM_3IMERGM.20260301-S000000-E235959.03.V07B.nc4",
        download_url="https://gesdisc.earthdata.nasa.gov/data/GPM/GPM_3IMERGM.20260301-S000000-E235959.03.V07B.nc4",
        collection_concept_id="C2723754851-GES_DISC",
    )
])

MOCK_SWOT_CMR_RESPONSE = create_cmr_search_response([
    create_cmr_granule_entry(
        granule_ur="G3233945000-POCLOUD",
        title="SWOT_L2_LR_SSH_Expert_032_114_20260305T120000.nc",
        download_url="https://archive.podaac.earthdatacloud.nasa.gov/data/SWOT/SWOT_L2_LR_SSH_Expert_032_114_20260305T120000.nc",
        collection_concept_id="C3233945000-POCLOUD",
    )
])
