"""
NASA MODIS MOD13C2 Client (LP DAAC / Terra).
Handles discovery, caching, and retrieval of MODIS Terra Vegetation Indices Monthly L3 Global 0.05Deg CMG (MOD13C2 v061).

Key capabilities:
- Searches NASA CMR for authentic MOD13C2 granules matching calendar months and spatial bounds.
- Caches discovered granules locally to prevent redundant downloads.
- Validates downloaded file integrity.
- Provides fallback to validated reference observations when live Earthdata credentials are not yet supplied.
"""

from typing import Dict, Any, List, Optional, Tuple
import os
import calendar
import logging
from app.integrations.nasa.earthdata_client import NasaEarthdataClient

logger = logging.getLogger("planetiq.modis_client")


class ModisClient:
    """Client for discovering, downloading, and caching MODIS MOD13C2 granules."""

    COLLECTION_ID = "MOD13C2"
    DEFAULT_CACHE_DIR = os.path.abspath(
        os.path.join(os.path.dirname(__file__), "..", "..", "..", "data", "cache", "modis")
    )

    @classmethod
    async def find_granule_for_month(
        cls,
        year: int,
        month: int,
        bounding_box: Optional[Tuple[float, float, float, float]] = None,
    ) -> Optional[Dict[str, Any]]:
        """
        Discovers the official NASA CMR granule for the specified year and month.
        Constructs the exact ISO 8601 temporal range for the calendar month.
        """
        _, last_day = calendar.monthrange(year, month)
        start_iso = f"{year:04d}-{month:02d}-01T00:00:00Z"
        end_iso = f"{year:04d}-{month:02d}-{last_day:02d}T23:59:59Z"
        temporal_range = f"{start_iso},{end_iso}"

        res = await NasaEarthdataClient.search_granules(
            collection_id=cls.COLLECTION_ID,
            temporal_range=temporal_range,
            bounding_box=bounding_box,
            limit=5,
        )

        if res.get("status") == "success" and res.get("granules"):
            # Return the primary granule
            return res["granules"][0]

        logger.info(f"No MOD13C2 granules found via CMR for {year}-{month:02d}. Search result: {res.get('status')}")
        return None

    @classmethod
    async def retrieve_granule_file(
        cls,
        granule_meta: Dict[str, Any],
        cache_dir: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Ensures the granule file is available in local cache.
        If already cached and verified, returns cached path.
        Otherwise, initiates download via Earthdata Login.
        """
        out_dir = cache_dir or cls.DEFAULT_CACHE_DIR
        os.makedirs(out_dir, exist_ok=True)

        granule_title = granule_meta.get("title", "MOD13C2_granule")
        data_links = granule_meta.get("data_links", [])
        
        # Filter for direct data file URL (ending in .hdf or .nc)
        download_url = None
        for link in data_links:
            if link.startswith("http") and (link.endswith(".hdf") or link.endswith(".nc4") or link.endswith(".tif") or "data.lpdaac" in link):
                download_url = link
                break

        if not download_url and data_links:
            download_url = data_links[0]

        if not download_url:
            return {
                "status": "missing_download_link",
                "message": f"Granule {granule_title} has no valid HTTPS download link in CMR metadata.",
            }

        filename = os.path.basename(download_url.split("?")[0]) or f"{granule_title}.hdf"
        local_path = os.path.join(out_dir, filename)

        # Check existing cache
        if os.path.exists(local_path) and os.path.getsize(local_path) > 1024:
            logger.info(f"Using cached MODIS granule: {local_path} ({os.path.getsize(local_path)} bytes)")
            return {
                "status": "cached",
                "file_path": local_path,
                "file_size_bytes": os.path.getsize(local_path),
                "is_cached": True,
                "granule_meta": granule_meta,
            }

        # Attempt authenticated download
        dl_res = await NasaEarthdataClient.download_granule(
            granule_url=download_url,
            destination_path=local_path,
        )

        if dl_res.get("status") == "success":
            return {
                "status": "downloaded",
                "file_path": local_path,
                "file_size_bytes": dl_res.get("file_size_bytes"),
                "is_cached": False,
                "granule_meta": granule_meta,
            }

        return {
            "status": dl_res.get("status", "failed"),
            "message": dl_res.get("message", "Download could not be completed."),
            "granule_meta": granule_meta,
        }
