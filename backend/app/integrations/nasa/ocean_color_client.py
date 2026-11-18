"""
NASA Ocean Biology DAAC (OB.DAAC) & PO.DAAC Ocean Client.
Handles discovery, caching, and retrieval of:
1. NASA MODIS Aqua Level-3 Mapped Monthly Chlorophyll-a (MODISA_L3m_CHL / chlor_a)
2. NASA MODIS Aqua Level-3 Mapped Monthly Sea Surface Temperature (MODISA_L3m_SST / sst)

Official product specifications:
- Chlorophyll-a: MODISA_L3m_CHL (Resolution: 4.6 km / 0.0416° global mapped netCDF4)
  Units: mg/m³
  Provider: NASA Ocean Biology Processing Group (OBPG) / OB.DAAC
- Sea Surface Temperature: MODISA_L3m_SST (11 µm thermal infrared, 4.6 km mapped)
  Units: degrees Celsius (°C)
  Provider: NASA OB.DAAC & PO.DAAC
"""

from typing import Dict, Any, List, Optional, Tuple
import os
import calendar
import logging
from app.integrations.nasa.earthdata_client import NasaEarthdataClient

logger = logging.getLogger("planetiq.ocean_color_client")


class OceanColorClient:
    """Client for discovering, downloading, and caching NASA MODIS Aqua ocean observations."""

    COLLECTION_CHL = "MODISA_L3m_CHL"
    COLLECTION_SST = "MODISA_L3m_SST"

    DEFAULT_CACHE_DIR = os.path.abspath(
        os.path.join(os.path.dirname(__file__), "..", "..", "..", "data", "cache", "ocean")
    )

    @classmethod
    async def find_granule_for_month(
        cls,
        product: str,  # 'chl' or 'sst'
        year: int,
        month: int,
        bounding_box: Optional[Tuple[float, float, float, float]] = None,
    ) -> Optional[Dict[str, Any]]:
        """
        Discovers the official NASA OB.DAAC granule for the specified product and calendar month.
        Constructs the ISO 8601 temporal range (YYYY-MM-01 to YYYY-MM-lastday).
        """
        collection_id = cls.COLLECTION_CHL if product.lower() == "chl" else cls.COLLECTION_SST
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
        Ensures the ocean NetCDF4/HDF granule file is cached locally.
        If already present and valid, returns cached path.
        Otherwise downloads via Earthdata Login authenticated streaming.
        """
        out_dir = cache_dir or cls.DEFAULT_CACHE_DIR
        os.makedirs(out_dir, exist_ok=True)

        granule_title = granule_meta.get("title", "ocean_granule")
        data_links = granule_meta.get("data_links", [])

        download_url = None
        for link in data_links:
            if link.startswith("http") and (link.endswith(".nc") or link.endswith(".nc4") or "oceandata.sci.gsfc.nasa.gov" in link):
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
            logger.info(f"Using cached ocean granule: {local_path} ({os.path.getsize(local_path)} bytes)")
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
