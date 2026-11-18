"""
NASA Earthdata & Common Metadata Repository (CMR) Client.
Provides authoritative access to NASA Earth Science collections and granules:
- MODIS: MOD13C2 v061 (Monthly Global Vegetation Indices, C2565788914-LPCLOUD / LP DAAC)
- GPM IMERG: GPM_3IMERGM v07 (Final Monthly Precipitation, C2723754851-GES_DISC)
- SWOT: SWOT_L2_LR_SSH (KaRIn Low Rate Ocean Products, C3233945000-POCLOUD)

Features:
- Validates authentic Earthdata Login (EDL) bearer tokens or basic credentials.
- Public CMR searches without sending unauthenticated placeholder headers.
- Granule discovery filtered by bounding box (WGS84) and observation temporal windows.
- Resilient granule download with streaming, redirects, authentication, and atomic write validation.
"""

from typing import Dict, Any, List, Optional, Tuple
import os
import re
import logging
import httpx
from app.core.config import settings

logger = logging.getLogger("planetiq.nasa_earthdata")

COLLECTION_CONCEPT_IDS = {
    "MOD13C2": "C2565788914-LPCLOUD",
    "GPM_3IMERGM": "C2723754851-GES_DISC",
    "SWOT_L2_LR_SSH": "C3233945000-POCLOUD",
    "MODISA_L3m_CHL": "C3380709133-OB_CLOUD",
    "MODISA_L3m_SST": "C1615905770-OB_DAAC",
    "MOD08_M3": "C1443766359-LAADS",
    "MYD08_M3": "C1443683075-LAADS",
}

COLLECTION_SHORT_NAMES = {
    "MOD13C2": {"short_name": "MOD13C2", "version": "061"},
    "GPM_3IMERGM": {"short_name": "GPM_3IMERGM", "version": "07"},
    "SWOT_L2_LR_SSH": {"short_name": "SWOT_L2_LR_SSH", "version": "D"},
    "MODISA_L3m_CHL": {"short_name": "MODISA_L3m_CHL", "version": "2022.0"},
    "MODISA_L3m_SST": {"short_name": "MODISA_L3m_SST", "version": "R2019.0"},
    "MOD08_M3": {"short_name": "MOD08_M3", "version": "6.1"},
    "MYD08_M3": {"short_name": "MYD08_M3", "version": "6.1"},
}


class EarthdataAuth(httpx.Auth):
    """
    HTTPX Auth handler for NASA Earthdata Login.
    Maintains authentication across 302 redirects to urs.earthdata.nasa.gov
    and handles BasicAuth / Bearer token challenges.
    """
    def __init__(self, username: str = "", password: str = "", bearer_token: str = ""):
        self.username = username.strip() if username else ""
        self.password = password.strip() if password else ""
        self.bearer_token = bearer_token.strip() if bearer_token else ""

    def auth_flow(self, request: httpx.Request):
        if self.bearer_token:
            request.headers["Authorization"] = f"Bearer {self.bearer_token}"
        elif self.username and self.password:
            request.headers["Authorization"] = httpx.BasicAuth(self.username, self.password)._auth_header

        response = yield request

        while response.is_redirect or response.status_code == 401:
            req = response.next_request
            if req is None:
                if response.status_code == 401 and "urs.earthdata.nasa.gov" in str(response.url):
                    req = request.copy()
                    req.url = response.url
                    if self.username and self.password:
                        req.headers["Authorization"] = httpx.BasicAuth(self.username, self.password)._auth_header
                    elif self.bearer_token:
                        req.headers["Authorization"] = f"Bearer {self.bearer_token}"
                    response = yield req
                    continue
                break

            if "urs.earthdata.nasa.gov" in req.url.host:
                if self.username and self.password:
                    req.headers["Authorization"] = httpx.BasicAuth(self.username, self.password)._auth_header
            elif self.bearer_token:
                req.headers["Authorization"] = f"Bearer {self.bearer_token}"
            elif self.username and self.password:
                req.headers["Authorization"] = httpx.BasicAuth(self.username, self.password)._auth_header

            response = yield req


class NasaEarthdataClient:
    """Client for querying NASA Earthdata CMR and retrieving satellite data."""

    COLLECTION_CONCEPT_IDS = COLLECTION_CONCEPT_IDS
    COLLECTION_SHORT_NAMES = COLLECTION_SHORT_NAMES
    CMR_SEARCH_URL = "https://cmr.earthdata.nasa.gov/search"
    _cached_bearer_token: Optional[str] = None

    @classmethod
    def _is_valid_credential(cls, val: Optional[str]) -> bool:
        if not val or not isinstance(val, str):
            return False
        cleaned = val.strip()
        if not cleaned or cleaned.startswith("your_") or len(cleaned) < 3:
            return False
        return True

    @classmethod
    def get_masked_username(cls) -> Optional[str]:
        raw = settings.NASA_EARTHDATA_USERNAME
        if not cls._is_valid_credential(raw):
            return None
        clean = raw.strip()
        if len(clean) <= 3:
            return f"{clean[0]}***"
        return f"{clean[:3]}***{clean[-1]}"

    @classmethod
    def get_auth_status(cls) -> Dict[str, Any]:
        """Returns the current Earthdata authentication readiness status."""
        has_token = cls._is_valid_credential(settings.NASA_EARTHDATA_BEARER_TOKEN) or bool(cls._cached_bearer_token)
        has_user_pass = (
            cls._is_valid_credential(settings.NASA_EARTHDATA_USERNAME)
            and cls._is_valid_credential(settings.NASA_EARTHDATA_PASSWORD)
        )

        authenticated = has_token or has_user_pass
        auth_method = "bearer_token" if has_token else ("basic_auth" if has_user_pass else "none")

        return {
            "authenticated": authenticated,
            "auth_method": auth_method,
            "username_configured": cls.get_masked_username() if has_user_pass else None,
            "cmr_public_search_available": True,
            "granule_download_available": authenticated,
            "notice": (
                "NASA Earthdata credentials configured. Real data retrieval active."
                if authenticated
                else "No active NASA Earthdata credentials configured. "
                     "CMR public search is fully operational; observations use calibrated scientific demonstrations or local granules."
            ),
        }

    @classmethod
    async def fetch_or_create_edl_token(cls) -> Optional[str]:
        """Fetches active EDL bearer token from URS using username/password if available."""
        if cls._cached_bearer_token:
            return cls._cached_bearer_token
        if cls._is_valid_credential(settings.NASA_EARTHDATA_BEARER_TOKEN):
            return settings.NASA_EARTHDATA_BEARER_TOKEN.strip()

        if not (cls._is_valid_credential(settings.NASA_EARTHDATA_USERNAME) and cls._is_valid_credential(settings.NASA_EARTHDATA_PASSWORD)):
            return None

        try:
            auth = httpx.BasicAuth(settings.NASA_EARTHDATA_USERNAME.strip(), settings.NASA_EARTHDATA_PASSWORD.strip())
            async with httpx.AsyncClient(timeout=8.0) as client:
                resp = await client.get("https://urs.earthdata.nasa.gov/api/users/tokens", auth=auth)
                if resp.status_code == 200:
                    tokens = resp.json()
                    if isinstance(tokens, list) and tokens:
                        token_val = tokens[0].get("access_token")
                        if token_val:
                            cls._cached_bearer_token = token_val
                            return token_val
                elif resp.status_code == 404 or (resp.status_code == 200 and not resp.json()):
                    # Create token
                    c_resp = await client.post("https://urs.earthdata.nasa.gov/api/users/token", auth=auth)
                    if c_resp.status_code in (200, 201):
                        data = c_resp.json()
                        token_val = data.get("access_token")
                        if token_val:
                            cls._cached_bearer_token = token_val
                            return token_val
        except Exception as e:
            logger.debug(f"EDL token retrieval notice: {e}")

        return None

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
            "page_size": min(limit, 50),
            "sort_key[]": "-start_date",
        }

        # If concept_id looks like shortname, use short_name parameter
        if not concept_id.startswith("C") and collection_id in COLLECTION_SHORT_NAMES:
            spec = COLLECTION_SHORT_NAMES[collection_id]
            params.pop("concept_id", None)
            params["short_name"] = spec["short_name"]
            params["version"] = spec["version"]

        if temporal_range:
            params["temporal"] = temporal_range

        if bounding_box:
            min_lon, min_lat, max_lon, max_lat = bounding_box
            params["bounding_box"] = f"{min_lon},{min_lat},{max_lon},{max_lat}"

        headers = {"User-Agent": f"PlanetIQ/{settings.VERSION} (NASA Earth Observation Platform)"}
        
        # Only attach Authorization header if a real valid bearer token is configured
        if cls._is_valid_credential(settings.NASA_EARTHDATA_BEARER_TOKEN):
            headers["Authorization"] = f"Bearer {settings.NASA_EARTHDATA_BEARER_TOKEN.strip()}"

        try:
            async with httpx.AsyncClient(timeout=8.0) as client:
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
                        browse_links = [
                            link.get("href")
                            for link in e.get("links", [])
                            if "browse" in link.get("rel", "")
                        ]
                        granules.append({
                            "id": e.get("id"),
                            "title": e.get("title"),
                            "time_start": e.get("time_start"),
                            "time_end": e.get("time_end"),
                            "data_links": links[:4],
                            "browse_links": browse_links[:2],
                            "granule_size_mb": round(float(e.get("granule_size", 0.0)), 2),
                            "day_night_flag": e.get("day_night_flag"),
                            "cloud_cover": e.get("cloud_cover"),
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
        headers = {"User-Agent": f"PlanetIQ/{settings.VERSION}"}

        try:
            async with httpx.AsyncClient(timeout=6.0) as client:
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

    @classmethod
    async def download_granule(
        cls,
        granule_url: str,
        destination_path: str,
        timeout_seconds: float = 120.0,
    ) -> Dict[str, Any]:
        """
        Downloads a granule from NASA Earthdata.
        Handles Earthdata Login (EDL) redirects, authenticates via bearer token or basic auth,
        streams to a temporary file, and performs validation before finalizing.
        """
        auth_status = cls.get_auth_status()
        if not auth_status["granule_download_available"]:
            return {
                "status": "unauthorized",
                "message": "NASA Earthdata credentials not configured. Please supply NASA_EARTHDATA_BEARER_TOKEN or username/password in .env.",
            }

        # Attempt token acquisition if username/password configured
        token = await cls.fetch_or_create_edl_token()

        headers = {"User-Agent": f"PlanetIQ/{settings.VERSION}"}
        auth = EarthdataAuth(
            username=settings.NASA_EARTHDATA_USERNAME,
            password=settings.NASA_EARTHDATA_PASSWORD,
            bearer_token=token or settings.NASA_EARTHDATA_BEARER_TOKEN,
        )

        dest_dir = os.path.dirname(destination_path)
        if dest_dir:
            os.makedirs(dest_dir, exist_ok=True)

        temp_path = f"{destination_path}.part"

        try:
            async with httpx.AsyncClient(timeout=timeout_seconds, follow_redirects=True, auth=auth) as client:
                async with client.stream("GET", granule_url, headers=headers) as resp:
                    if resp.status_code != 200:
                        return {
                            "status": "http_error",
                            "status_code": resp.status_code,
                            "message": f"NASA data server returned HTTP {resp.status_code}",
                        }

                    bytes_downloaded = 0
                    with open(temp_path, "wb") as f:
                        async for chunk in resp.aiter_bytes(chunk_size=65536):
                            if chunk:
                                f.write(chunk)
                                bytes_downloaded += len(chunk)

            # Validate that file was received and is not empty or HTML error page
            if bytes_downloaded < 1024:
                # Check if it was an HTML error
                with open(temp_path, "rb") as f:
                    head = f.read(512)
                if b"<html" in head.lower() or b"<!doctype html" in head.lower():
                    if os.path.exists(temp_path):
                        os.remove(temp_path)
                    return {
                        "status": "authentication_required",
                        "message": "Received HTML login challenge rather than binary satellite granule.",
                    }

            # Atomic rename from .part to destination
            if os.path.exists(destination_path):
                os.remove(destination_path)
            os.rename(temp_path, destination_path)

            return {
                "status": "success",
                "file_path": destination_path,
                "file_size_bytes": bytes_downloaded,
                "file_size_mb": round(bytes_downloaded / (1024 * 1024), 2),
            }

        except Exception as e:
            if os.path.exists(temp_path):
                try:
                    os.remove(temp_path)
                except OSError:
                    pass
            logger.error(f"Download failed for {granule_url}: {e}")
            return {
                "status": "download_failed",
                "message": str(e),
            }
