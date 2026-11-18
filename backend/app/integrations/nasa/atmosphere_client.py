"""
NASA LAADS DAAC & GES DISC Atmosphere Client.
Handles discovery, caching, and retrieval of:
1. NASA MODIS Terra/Aqua Level-3 Monthly Atmospheric Composition (MOD08_M3 / MYD08_M3)
   - Aerosol Optical Depth (AOD 550nm)
   - Cloud Optical Thickness, Cloud Effective Radius, Cloud Fraction
2. NASA GPM IMERG Final Monthly Precipitation (GPM_3IMERGM v07 via GES DISC)

Official product specifications:
- MOD08_M3 / MYD08_M3: 1° × 1° global atmospheric grid
  Provider: NASA Level-1 and Atmosphere Archive & Distribution System (LAADS) DAAC
- GPM_3IMERGM: 0.1° × 0.1° precipitation grid
  Provider: NASA Goddard Earth Sciences Data and Information Services Center (GES DISC)
"""

from typing import Dict, Any, Optional, Tuple
import os
import calendar
import logging
from app.integrations.nasa.earthdata_client import NasaEarthdataClient

logger = logging.getLogger("planetiq.atmosphere_client")


class AtmosphereClient:
    """Client for discovering, downloading, and caching NASA atmospheric observations."""

    COLLECTION_TERRA_ATMO = "MOD08_M3"
    COLLECTION_AQUA_ATMO = "MYD08_M3"
    COLLECTION_GPM = "GPM_3IMERGM"

    DEFAULT_CACHE_DIR = os.path.abspath(
        os.path.join(os.path.dirname(__file__), "..", "..", "..", "data", "cache", "atmosphere")
    )

    @classmethod
    async def find_granule_for_month(
        cls,
        product: str,  # 'aod', 'cloud', 'gpm'
        year: int,
        month: int,
        bounding_box: Optional[Tuple[float, float, float, float]] = None,
    ) -> Optional[Dict[str, Any]]:
        """
        Discovers the official NASA CMR granule for atmospheric parameters for a given month.
        Constructs the ISO 8601 temporal range.
        """
        if product.lower() == "gpm":
            collection_id = cls.COLLECTION_GPM
        elif product.lower() in ["aqua_aod", "aqua_cloud"]:
            collection_id = cls.COLLECTION_AQUA_ATMO
        else:
            collection_id = cls.COLLECTION_TERRA_ATMO

        _, last_day = calendar.monthrange(year, month)
        start_iso = f"{year:04d}-{month:02d}-01T00:00:00Z"
        end_iso = f"{year:04d}-{month:02d}-{last_day:02d}T23:59:59Z"
        temporal_range = f"{start_iso},{end_iso}"

        res = await NasaEarthdataClient.search_granules(
            collection_id=collection_id,
            temporal_range=temporal_range,
            bounding_box=bounding_box,
            limit=5,
        )

        if res.get("status") == "success" and res.get("granules"):
            return res["granules"][0]

        logger.info(f"No {collection_id} granules found via CMR for {year}-{month:02d}. Status: {res.get('status')}")
        return None

    @classmethod
    async def retrieve_granule_file(
        cls,
        granule_meta: Dict[str, Any],
        cache_dir: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Ensures the atmospheric HDF4/HDF5/NetCDF4 granule file is available in local cache.
        If already present and valid, returns cached path.
        Otherwise downloads via Earthdata Login.
        """
        out_dir = cache_dir or cls.DEFAULT_CACHE_DIR
        os.makedirs(out_dir, exist_ok=True)

        granule_title = granule_meta.get("title", "atmosphere_granule")
        data_links = granule_meta.get("data_links", [])

        download_url = None
        for link in data_links:
            if link.startswith("http") and (link.endswith(".hdf") or link.endswith(".nc4") or link.endswith(".HDF5") or "ladsweb" in link or "gesdisc" in link):
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
            logger.info(f"Using cached atmosphere granule: {local_path} ({os.path.getsize(local_path)} bytes)")
            return {
                "status": "cached",
                "file_path": local_path,
                "granule_id": granule_title,
                "size_bytes": os.path.getsize(local_path),
            }

        # Download from NASA Earthdata
        logger.info(f"Initiating authenticated download for {granule_title} from {download_url}")
        dl_res = await NasaEarthdataClient.download_granule(
            granule_url=download_url,
            destination_path=local_path,
        )

        if dl_res.get("status") == "success":
            return {
                "status": "downloaded",
                "file_path": local_path,
                "granule_id": granule_title,
                "size_bytes": dl_res.get("bytes_written", 0),
            }

        return dl_res
