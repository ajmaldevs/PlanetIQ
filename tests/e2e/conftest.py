"""
tests/e2e/conftest.py
Global pytest configuration and fixtures for PlanetIQ E2E testing.
"""
import os
import sys
from typing import AsyncGenerator, Generator, Dict, Any
from unittest.mock import patch

# Ensure backend directory is importable
BACKEND_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "backend"))
if BACKEND_DIR not in sys.path:
    sys.path.insert(0, BACKEND_DIR)

import pytest
import httpx
from httpx import ASGITransport
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, event
from sqlalchemy.engine import Engine
from sqlalchemy.pool import StaticPool
from sqlalchemy.orm import sessionmaker, Session

from app.main import app
from app.core import database
from app.core.config import settings
from app.models.base import Base
from app.repositories.observation_repository import ObservationRepository
from app.integrations.nasa.earthdata_client import NasaEarthdataClient
from tests.e2e.fixtures.satellite_generators import (
    generate_mock_swot_netcdf,
    generate_mock_gpm_netcdf,
    generate_mock_modis_geotiff,
)


@pytest.fixture(autouse=True)
def setup_test_environment():
    """Configures environment flags for consistent, isolated test execution."""
    old_env = settings.ENVIRONMENT
    old_allow = settings.ALLOW_DEMO_FALLBACK
    settings.ENVIRONMENT = "test"
    settings.ALLOW_DEMO_FALLBACK = False
    try:
        yield
    finally:
        settings.ENVIRONMENT = old_env
        settings.ALLOW_DEMO_FALLBACK = old_allow


@pytest.fixture
def e2e_db() -> Generator[Session, None, None]:
    """
    Isolated in-memory SQLite fixture with StaticPool and SQLite spatial stubs.
    Patches app.core.database.SyncSessionLocal and resets failure flags.
    """
    engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )

    # Register SQLite spatial stubs for GeoAlchemy / PostGIS functions
    @event.listens_for(engine, "connect")
    def _register_sqlite_spatial_stubs(dbapi_conn, record):
        if hasattr(dbapi_conn, "create_function"):
            stubs = [
                "AsEWKB", "ST_AsEWKB", "GeomFromEWKT",
                "RecoverGeometryColumn", "CreateSpatialIndex",
                "ST_Intersects", "ST_MakeEnvelope", "ST_Point",
                "ST_GeomFromText", "ST_AsText", "ST_Area",
                "CheckSpatialIndex", "DisableSpatialIndex", "DiscardGeometryColumn",
            ]
            for stub in stubs:
                try:
                    dbapi_conn.create_function(stub, -1, lambda *args: None)
                except Exception:
                    pass

    Base.metadata.create_all(engine)
    TestSessionLocal = sessionmaker(bind=engine, autocommit=False, autoflush=False)
    session = TestSessionLocal()

    # Save original references
    orig_sync_session_local = database.SyncSessionLocal

    # Patch database session provider and reset failure timestamps
    database.SyncSessionLocal = TestSessionLocal
    database._last_sync_db_failure = 0.0
    ObservationRepository._last_db_failure_time = 0.0

    try:
        yield session
    finally:
        session.close()
        database.SyncSessionLocal = orig_sync_session_local
        database._last_sync_db_failure = 0.0
        ObservationRepository._last_db_failure_time = 0.0
        try:
            Base.metadata.drop_all(engine)
        except Exception:
            pass
        engine.dispose()


@pytest.fixture
async def e2e_client() -> AsyncGenerator[httpx.AsyncClient, None]:
    """Asynchronous HTTP test client bound to the FastAPI application."""
    transport = ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        yield client


@pytest.fixture
def e2e_sync_client() -> Generator[TestClient, None, None]:
    """Synchronous HTTP test client for FastAPI endpoints."""
    with TestClient(app) as client:
        yield client


@pytest.fixture
def mock_nasa_earthdata(tmp_path) -> Generator[Dict[str, Any], None, None]:
    """
    Pytest fixture intercepting NASA CMR search and DAAC downloads via httpx.MockTransport.
    Enables realistic, offline testing of satellite discovery and download pipelines.
    """
    modis_file = str(tmp_path / "MOD13C2.A2026060.061.2026080123456.tif")
    gpm_file = str(tmp_path / "GPM_3IMERGM.20260301-S000000-E235959.03.V07B.nc4")
    swot_file = str(tmp_path / "SWOT_L2_LR_SSH_Expert_032_114_20260305T120000.nc")

    generate_mock_modis_geotiff(modis_file)
    generate_mock_gpm_netcdf(gpm_file)
    generate_mock_swot_netcdf(swot_file)

    def handler(request: httpx.Request) -> httpx.Response:
        url_str = str(request.url)

        # 1. Earthdata Login token endpoint
        if "urs.earthdata.nasa.gov" in url_str:
            return httpx.Response(200, json=[{"access_token": "mock-edl-token-2026"}])

        # 2. CMR Granule Search
        if "cmr.earthdata.nasa.gov/search/granules.json" in url_str:
            temporal = request.url.params.get("temporal", "")
            if temporal:
                covers_march_2026 = "2026-03" in temporal
                if not covers_march_2026 and "," in temporal:
                    parts = temporal.split(",")
                    start = parts[0].strip()
                    end = parts[1].strip() if len(parts) > 1 else ""
                    if (not start or start <= "2026-03-31T23:59:59Z") and (not end or end >= "2026-03-01T00:00:00Z"):
                        covers_march_2026 = True
                if not covers_march_2026:
                    return httpx.Response(200, json={"feed": {"entry": []}})

            concept_id = request.url.params.get("concept_id", "")
            if not concept_id:
                concept_id = request.url.params.get("short_name", "")

            if "GES_DISC" in concept_id or "GPM" in concept_id:
                title = os.path.basename(gpm_file)
                dlink = f"https://gesdisc.earthdata.nasa.gov/data/GPM/{title}"
            elif "POCLOUD" in concept_id or "SWOT" in concept_id:
                title = os.path.basename(swot_file)
                dlink = f"https://archive.podaac.earthdatacloud.nasa.gov/data/SWOT/{title}"
            else:
                title = os.path.basename(modis_file)
                dlink = f"https://data.lpdaac.earthdatacloud.nasa.gov/data/MODIS/{title}"

            cmr_payload = {
                "feed": {
                    "entry": [
                        {
                            "id": f"G_{title}",
                            "title": title,
                            "time_start": "2026-03-01T00:00:00Z",
                            "time_end": "2026-03-31T23:59:59Z",
                            "granule_size": "2.5",
                            "links": [
                                {
                                    "rel": "http://esipfed.org/ns/fedsearch/1.1/data#",
                                    "href": dlink,
                                    "inherited": False,
                                }
                            ],
                        }
                    ]
                }
            }
            return httpx.Response(200, json=cmr_payload)

        # 3. CMR Collection Metadata Search
        if "cmr.earthdata.nasa.gov/search/collections.json" in url_str:
            return httpx.Response(200, json={
                "feed": {
                    "entry": [
                        {
                            "title": "NASA Earth Science Collection",
                            "summary": "Authoritative NASA satellite observation product.",
                            "archive_center": "NASA DAAC",
                        }
                    ]
                }
            })

        # 4. DAAC Granule Downloads
        if "data.lpdaac.earthdatacloud.nasa.gov" in url_str:
            with open(modis_file, "rb") as f:
                return httpx.Response(200, content=f.read())
        if "gesdisc.earthdata.nasa.gov" in url_str:
            with open(gpm_file, "rb") as f:
                return httpx.Response(200, content=f.read())
        if "archive.podaac.earthdatacloud.nasa.gov" in url_str:
            with open(swot_file, "rb") as f:
                return httpx.Response(200, content=f.read())

        return httpx.Response(404, text=f"Not Found: {url_str}")

    mock_transport = httpx.MockTransport(handler)
    orig_init = httpx.AsyncClient.__init__

    def patched_init(self, *args, **kwargs):
        # Only inject mock transport when no custom transport (such as ASGITransport) is provided
        if kwargs.get("transport") is None:
            kwargs["transport"] = mock_transport
        orig_init(self, *args, **kwargs)

    # Configure credentials mock so download_granule proceeds
    old_bearer = settings.NASA_EARTHDATA_BEARER_TOKEN
    old_cached = NasaEarthdataClient._cached_bearer_token
    settings.NASA_EARTHDATA_BEARER_TOKEN = "mock-edl-token-2026"
    NasaEarthdataClient._cached_bearer_token = "mock-edl-token-2026"

    with patch.object(httpx.AsyncClient, "__init__", patched_init):
        try:
            yield {
                "modis_file": modis_file,
                "gpm_file": gpm_file,
                "swot_file": swot_file,
                "tmp_path": str(tmp_path),
            }
        finally:
            settings.NASA_EARTHDATA_BEARER_TOKEN = old_bearer
            NasaEarthdataClient._cached_bearer_token = old_cached
