"""
NASA/CNES SWOT KaRIn Ocean Altimetry Client (PO.DAAC).
Handles discovery, caching, and retrieval of SWOT Ka-band Radar Interferometer (KaRIn)
Low Rate Sea Surface Height Ocean Products (SWOT_L2_LR_SSH).

Official product information:
- Dataset: SWOT_L2_LR_SSH (Version D / 2.0)
- Parameter: Sea Surface Height Anomaly (SSHA) & Dynamic Topography
- Spatial resolution: ~2 km pixel grid across 120 km swath with 21-day orbit repeat
- Provider: NASA Physical Oceanography Distributed Active Archive Center (PO.DAAC)
"""

from typing import Dict, Any, List, Optional, Tuple
import os
import calendar
import logging
from app.integrations.nasa.earthdata_client import NasaEarthdataClient

logger = logging.getLogger("planetiq.swot_client")


class SwotClient:
    """Client for discovering, downloading, and caching NASA/CNES SWOT KaRIn ocean altimetry granules."""

    COLLECTION_ID = "SWOT_L2_LR_SSH"
    DEFAULT_CACHE_DIR = os.path.abspath(
        os.path.join(os.path.dirname(__file__), "..", "..", "..", "data", "cache", "swot")
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
        Constructs the ISO 8601 temporal range for the calendar month.
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
            return res["granules"][0]

        logger.info(f"No SWOT_L2_LR_SSH granules found via CMR for {year}-{month:02d}. Result: {res.get('status')}")
        return None

    @classmethod
    async def retrieve_granule_file(
        cls,
        granule_meta: Dict[str, Any],
        cache_dir: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Ensures the SWOT granule file is available in local cache.
        If already cached and verified, returns cached path.
        Otherwise, initiates download via Earthdata Login.
        """
        out_dir = cache_dir or cls.DEFAULT_CACHE_DIR
        os.makedirs(out_dir, exist_ok=True)

        granule_title = granule_meta.get("title", "SWOT_L2_LR_SSH_granule")
        data_links = granule_meta.get("data_links", [])

        download_url = None
        for link in data_links:
            if link.startswith("http") and (link.endswith(".nc") or link.endswith(".nc4") or "podaac.jpl.nasa.gov" in link):
                download_url = link
                break

        if not download_url and data_links:
            download_url = data_links[0]

        if not download_url:
            return {
                "status": "missing_download_link",
                "message": f"Granule {granule_title} has no valid HTTPS download link in CMR metadata.",
            }

        filename = os.path.basename(download_url.split("?")[0]) or f"{granule_title}.nc"
        local_path = os.path.join(out_dir, filename)

        if os.path.exists(local_path) and os.path.getsize(local_path) > 1024:
            logger.info(f"Using cached SWOT granule: {local_path} ({os.path.getsize(local_path)} bytes)")
            return {
                "status": "cached",
                "file_path": local_path,
                "granule_id": granule_title,
                "size_bytes": os.path.getsize(local_path),
            }

        dl_res = await NasaEarthdataClient.download_granule(
            url=download_url,
            destination_path=local_path,
        )

        if dl_res.get("status") == "success":
            return {
                "status": "downloaded",
                "file_path": local_path,
                "granule_id": granule_title,
                "size_bytes": os.path.getsize(local_path),
            }

        return dl_res
