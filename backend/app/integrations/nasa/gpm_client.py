"""
NASA GPM IMERG Client (GES DISC / Precipitation Processing System).
Handles discovery, caching, and retrieval of GPM IMERG Final Monthly Precipitation (GPM_3IMERGM v07).

Official product information:
- Dataset: GPM_3IMERGM (Level 3 Final Monthly Precipitation)
- Spatial resolution: 0.1° x 0.1° global grid
- Units: precipitation (mm/hr) and accumulated precipitation (mm)
- Provider: NASA Goddard Earth Sciences Data and Information Services Center (GES DISC)
"""

from typing import Dict, Any, Optional, Tuple
import os
import calendar
import logging
from app.integrations.nasa.earthdata_client import NasaEarthdataClient

logger = logging.getLogger("planetiq.gpm_client")


class GpmClient:
    """Client for discovering, downloading, and caching NASA GPM IMERG monthly precipitation granules."""

    COLLECTION_ID = "GPM_3IMERGM"
    DEFAULT_CACHE_DIR = os.path.abspath(
        os.path.join(os.path.dirname(__file__), "..", "..", "..", "data", "cache", "gpm")
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

        logger.info(f"No GPM_3IMERGM granules found via CMR for {year}-{month:02d}. Result: {res.get('status')}")
        return None

    @classmethod
    async def retrieve_granule_file(
        cls,
        granule_meta: Dict[str, Any],
        cache_dir: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Ensures the GPM IMERG granule file is available in local cache.
        If already cached and verified, returns cached path.
        Otherwise, initiates download via Earthdata Login.
        """
        out_dir = cache_dir or cls.DEFAULT_CACHE_DIR
        os.makedirs(out_dir, exist_ok=True)

        granule_title = granule_meta.get("title", "GPM_3IMERGM_granule")
        data_links = granule_meta.get("data_links", [])

        download_url = None
        for link in data_links:
            if link.startswith("http") and (link.endswith(".nc4") or link.endswith(".HDF5") or "gesdisc.earthdata.nasa.gov" in link):
                download_url = link
                break

        if not download_url and data_links:
            download_url = data_links[0]

        if not download_url:
            return {
                "status": "missing_download_link",
                "message": f"Granule {granule_title} has no valid HTTPS download link in CMR metadata.",
            }

        filename = os.path.basename(download_url.split("?")[0]) or f"{granule_title}.nc4"
        local_path = os.path.join(out_dir, filename)

        if os.path.exists(local_path) and os.path.getsize(local_path) > 1024:
            logger.info(f"Using cached GPM granule: {local_path} ({os.path.getsize(local_path)} bytes)")
            return {
                "status": "cached",
                "file_path": local_path,
                "granule_id": granule_title,
                "size_bytes": os.path.getsize(local_path),
                "granule_meta": granule_meta,
            }

        dl_res = await NasaEarthdataClient.download_granule(
            granule_url=download_url,
            destination_path=local_path,
        )

        if dl_res.get("status") == "success":
            return {
                "status": "downloaded",
                "file_path": local_path,
                "granule_id": granule_title,
                "size_bytes": os.path.getsize(local_path),
                "granule_meta": granule_meta,
            }

        if isinstance(dl_res, dict):
            dl_res["granule_meta"] = granule_meta
        return dl_res
