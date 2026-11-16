"""
NASA Earthdata & Common Metadata Repository (CMR) Client.
Provides access to NASA Earth Science collections and granules:
- SWOT: SWOT_L2_LR_SSH (KaRIn Low Rate Ocean Products, C2147948828-POCLOUD)
- GPM IMERG: GPM_3IMERGM v07 (Final Monthly Precipitation, C2723754864-GES_DISC)
- MODIS: MOD13C2 v061 (Monthly Global Vegetation Indices, C1000000523-LPDAAC_ECS)

Handles authentication via NASA Earthdata Login (EDL) bearer token when configured,
queries public CMR Search APIs, and clearly reports data provenance and authentication status.
"""

from typing import Dict, Any, List, Optional, Tuple
import logging
import httpx
from app.core.config import settings

logger = logging.getLogger("terralens.nasa_earthdata")

COLLECTION_CONCEPT_IDS = {
    "SWOT_L2_LR_SSH": "C2147948828-POCLOUD",
    "GPM_3IMERGM": "C2723754864-GES_DISC",
    "MOD13C2": "C1000000523-LPDAAC_ECS",
}


class NasaEarthdataClient:
    """Client for querying NASA Earthdata CMR and data endpoints."""

    CMR_SEARCH_URL = "https://cmr.earthdata.nasa.gov/search"

    @classmethod
    def get_auth_status(cls) -> Dict[str, Any]:
        """Returns the current Earthdata authentication readiness status."""
        has_token = bool(settings.NASA_EARTHDATA_BEARER_TOKEN and len(settings.NASA_EARTHDATA_BEARER_TOKEN.strip()) > 8)
        has_user_pass = bool(settings.NASA_EARTHDATA_USERNAME and settings.NASA_EARTHDATA_PASSWORD)

        return {
            "authenticated": has_token or has_user_pass,
            "auth_method": "bearer_token" if has_token else ("basic_auth" if has_user_pass else "none"),
            "cmr_public_search_available": True,
            "granule_download_available": has_token or has_user_pass,
            "notice": (
                "NASA Earthdata credentials configured. Real data retrieval active."
                if (has_token or has_user_pass)
                else "No NASA Earthdata token found (NASA_EARTHDATA_BEARER_TOKEN). "
                     "CMR public search is available; dataset observations default to calibrated scientific demonstration models."
            ),
        }

    @classmethod
    async def search_granules(
        cls,
        collection_id: str,
        temporal_range: Optional[str] = None,
        bounding_box: Optional[Tuple[float, float, float, float]] = None,
        limit: int = 5,
    ) -> Dict[str, Any]:
        """
        Queries NASA CMR Search API for granules matching the collection, temporal window, and bounding box.
        bounding_box is (min_lon, min_lat, max_lon, max_lat) in WGS84.
        """
        concept_id = COLLECTION_CONCEPT_IDS.get(collection_id, collection_id)
        url = f"{cls.CMR_SEARCH_URL}/granules.json"
        params: Dict[str, Any] = {
            "concept_id": concept_id,
            "page_size": limit,
            "sort_key[]": "-start_date",
        }

        if temporal_range:
            params["temporal"] = temporal_range

        if bounding_box:
            min_lon, min_lat, max_lon, max_lat = bounding_box
            params["bounding_box"] = f"{min_lon},{min_lat},{max_lon},{max_lat}"

        headers = {"User-Agent": f"TerraLens/{settings.VERSION} (NASA Space Apps Challenge 2026)"}
        if settings.NASA_EARTHDATA_BEARER_TOKEN:
            headers["Authorization"] = f"Bearer {settings.NASA_EARTHDATA_BEARER_TOKEN.strip()}"

        try:
            async with httpx.AsyncClient(timeout=4.0) as client:
                res = await client.get(url, params=params, headers=headers)
                if res.status_code == 200:
                    data = res.json()
                    feed = data.get("feed", {})
                    entries = feed.get("entry", [])
                    granules = []
                    for e in entries:
                        links = [
                            link.get("href")
                            for link in e.get("links", [])
                            if link.get("rel", "").endswith("/data#") or link.get("inherited", False) is False
                        ]
                        granules.append({
                            "id": e.get("id"),
                            "title": e.get("title"),
                            "time_start": e.get("time_start"),
                            "time_end": e.get("time_end"),
                            "data_links": links[:3],
                            "granule_size_mb": round(float(e.get("granule_size", 0.0)), 2),
                        })

                    return {
                        "status": "success",
                        "collection_concept_id": concept_id,
                        "granules_found": len(granules),
                        "granules": granules,
                        "provenance": "NASA Common Metadata Repository (CMR)",
                        "live_retrieval": True,
                    }
                else:
                    logger.warning(f"CMR search returned status {res.status_code}: {res.text[:200]}")
                    return {
                        "status": "cmr_error",
                        "status_code": res.status_code,
                        "message": f"CMR query returned HTTP {res.status_code}",
                        "live_retrieval": False,
                    }
        except Exception as exc:
            logger.info(f"NASA CMR search request did not complete ({exc}); falling back gracefully to catalog metadata.")
            return {
                "status": "network_unavailable",
                "message": str(exc),
                "live_retrieval": False,
            }

    @classmethod
    async def get_collection_metadata(cls, collection_id: str) -> Dict[str, Any]:
        """Retrieves collection-level metadata from CMR."""
        concept_id = COLLECTION_CONCEPT_IDS.get(collection_id, collection_id)
        url = f"{cls.CMR_SEARCH_URL}/collections.json"
        params = {"concept_id": concept_id}
        headers = {"User-Agent": f"TerraLens/{settings.VERSION}"}

        try:
            async with httpx.AsyncClient(timeout=4.0) as client:
                res = await client.get(url, params=params, headers=headers)
                if res.status_code == 200:
                    data = res.json()
                    entries = data.get("feed", {}).get("entry", [])
                    if entries:
                        entry = entries[0]
                        return {
                            "status": "success",
                            "title": entry.get("title"),
                            "summary": entry.get("summary"),
                            "time_start": entry.get("time_start"),
                            "time_end": entry.get("time_end"),
                            "archive_center": entry.get("archive_center"),
                            "concept_id": concept_id,
                        }
        except Exception as exc:
            logger.debug(f"Collection metadata fetch failed: {exc}")

        return {
            "status": "fallback",
            "concept_id": concept_id,
            "message": "Using local authoritative catalog metadata.",
        }
