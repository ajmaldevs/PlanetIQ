"""
Unit and integration tests for Admin Authentication & Fail-Closed Protection (Milestone M1 / Feature 1).
Verifies:
- Elimination of legacy default secret.
- Fail-closed HTTP 500 when ADMIN_API_KEY is not configured in production or development.
- HTTP 401 when admin authorization header is missing or empty.
- HTTP 403 with constant-time comparison when provided key is invalid / mismatched.
- Successful authentication via X-Admin-Key and Authorization Bearer headers.
- Protection applied to both /api/v1/ingest/trigger and /api/v1/datasets/ingest.
- Public read endpoints remain accessible without admin credentials.
"""

from unittest.mock import AsyncMock, patch
import pytest
from httpx import ASGITransport, AsyncClient

from app.main import app
from app.core.config import settings


@pytest.mark.asyncio
async def test_admin_key_production_fail_closed_500():
    """Verify that when ADMIN_API_KEY is not configured in production, endpoints fail closed with HTTP 500."""
    orig_env = settings.ENVIRONMENT
    orig_key = settings.ADMIN_API_KEY
    try:
        settings.ENVIRONMENT = "production"
        settings.ADMIN_API_KEY = ""

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            # 1. /api/v1/ingest/trigger with header fails closed with 500
            res1 = await client.post(
                "/api/v1/ingest/trigger",
                headers={"X-Admin-Key": "attempted-key"},
                json={"dataset_id": "MOD13C2", "year": 2026, "month": 3},
            )
            assert res1.status_code == 500
            assert "Administrative key not configured" in res1.json()["detail"]

            # 2. /api/v1/ingest/trigger without header in production unconfigured fails closed with 500
            res2 = await client.post(
                "/api/v1/ingest/trigger",
                json={"dataset_id": "MOD13C2", "year": 2026, "month": 3},
            )
            assert res2.status_code == 500
            assert "Administrative key not configured" in res2.json()["detail"]

            # 3. /api/v1/datasets/ingest with header fails closed with 500
            res3 = await client.post(
                "/api/v1/datasets/ingest?dataset_id=MOD13C2&year=2026&month=3",
                headers={"X-Admin-Key": "attempted-key"},
            )
            assert res3.status_code == 500
            assert "Administrative key not configured" in res3.json()["detail"]

            # 4. /api/v1/datasets/ingest without header in production unconfigured fails closed with 500
            res4 = await client.post(
                "/api/v1/datasets/ingest?dataset_id=MOD13C2&year=2026&month=3"
            )
            assert res4.status_code == 500
            assert "Administrative key not configured" in res4.json()["detail"]
    finally:
        settings.ENVIRONMENT = orig_env
        settings.ADMIN_API_KEY = orig_key


@pytest.mark.asyncio
async def test_admin_auth_missing_header_returns_401():
    """Verify endpoints return HTTP 401 when admin authorization header is missing or empty."""
    orig_key = settings.ADMIN_API_KEY
    try:
        settings.ADMIN_API_KEY = "test-secret-2026"
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            # /api/v1/ingest/trigger missing header
            res1 = await client.post(
                "/api/v1/ingest/trigger",
                json={"dataset_id": "MOD13C2", "year": 2026, "month": 3},
            )
            assert res1.status_code == 401
            assert "Admin authorization header required" in res1.json()["detail"]

            # /api/v1/ingest/trigger empty header
            res1_empty = await client.post(
                "/api/v1/ingest/trigger",
                headers={"X-Admin-Key": "   "},
                json={"dataset_id": "MOD13C2", "year": 2026, "month": 3},
            )
            assert res1_empty.status_code == 401
            assert "Admin authorization header required" in res1_empty.json()["detail"]

            # /api/v1/datasets/ingest missing header
            res2 = await client.post(
                "/api/v1/datasets/ingest?dataset_id=MOD13C2&year=2026&month=3"
            )
            assert res2.status_code == 401
            assert "Admin authorization header required" in res2.json()["detail"]

            # /api/v1/datasets/ingest empty header
            res2_empty = await client.post(
                "/api/v1/datasets/ingest?dataset_id=MOD13C2&year=2026&month=3",
                headers={"X-Admin-Key": ""},
            )
            assert res2_empty.status_code == 401
            assert "Admin authorization header required" in res2_empty.json()["detail"]
    finally:
        settings.ADMIN_API_KEY = orig_key


@pytest.mark.asyncio
async def test_admin_auth_wrong_key_returns_403():
    """Verify endpoints return HTTP 403 when provided admin key does not match."""
    orig_key = settings.ADMIN_API_KEY
    try:
        settings.ADMIN_API_KEY = "correct-admin-key-2026"
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            # X-Admin-Key header mismatch on /api/v1/ingest/trigger
            res1 = await client.post(
                "/api/v1/ingest/trigger",
                headers={"X-Admin-Key": "wrong-admin-key"},
                json={"dataset_id": "MOD13C2", "year": 2026, "month": 3},
            )
            assert res1.status_code == 403
            assert "Invalid admin key" in res1.json()["detail"]

            # Legacy key rejection
            res1_legacy = await client.post(
                "/api/v1/ingest/trigger",
                headers={"X-Admin-Key": "planetiq-admin-secret-2026"},
                json={"dataset_id": "MOD13C2", "year": 2026, "month": 3},
            )
            assert res1_legacy.status_code == 403
            assert "Invalid admin key" in res1_legacy.json()["detail"]

            # Authorization: Bearer header mismatch on /api/v1/ingest/trigger
            res2 = await client.post(
                "/api/v1/ingest/trigger",
                headers={"Authorization": "Bearer wrong-admin-key"},
                json={"dataset_id": "MOD13C2", "year": 2026, "month": 3},
            )
            assert res2.status_code == 403
            assert "Invalid admin key" in res2.json()["detail"]

            # X-Admin-Key header mismatch on /api/v1/datasets/ingest
            res3 = await client.post(
                "/api/v1/datasets/ingest?dataset_id=MOD13C2&year=2026&month=3",
                headers={"X-Admin-Key": "wrong-admin-key"},
            )
            assert res3.status_code == 403
            assert "Invalid admin key" in res3.json()["detail"]

            # Authorization: Bearer header mismatch on /api/v1/datasets/ingest
            res4 = await client.post(
                "/api/v1/datasets/ingest?dataset_id=MOD13C2&year=2026&month=3",
                headers={"Authorization": "Bearer wrong-admin-key"},
            )
            assert res4.status_code == 403
            assert "Invalid admin key" in res4.json()["detail"]
    finally:
        settings.ADMIN_API_KEY = orig_key


@pytest.mark.asyncio
async def test_admin_auth_valid_key_accepted():
    """Verify endpoints accept valid admin key via X-Admin-Key and Authorization Bearer."""
    orig_key = settings.ADMIN_API_KEY
    try:
        settings.ADMIN_API_KEY = "correct-admin-key-2026"
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            # Valid X-Admin-Key on /api/v1/ingest/trigger passes auth (422 payload error, not 401/403)
            res1 = await client.post(
                "/api/v1/ingest/trigger",
                headers={"X-Admin-Key": "correct-admin-key-2026"},
                json={"dataset_id": "INVALID_DATASET", "start_date": "2025-01-01", "end_date": "2025-01-31"},
            )
            assert res1.status_code not in (401, 403, 500)

            # Valid Authorization: Bearer on /api/v1/ingest/trigger passes auth
            res2 = await client.post(
                "/api/v1/ingest/trigger",
                headers={"Authorization": "Bearer correct-admin-key-2026"},
                json={"dataset_id": "INVALID_DATASET", "start_date": "2025-01-01", "end_date": "2025-01-31"},
            )
            assert res2.status_code not in (401, 403, 500)

            # Valid X-Admin-Key on /api/v1/datasets/ingest passes auth
            with patch("app.services.ingestion_service.IngestionService.ingest_live_granule", new_callable=AsyncMock) as mock_ingest:
                mock_ingest.return_value = {"status": "success", "granule_id": "test_granule"}
                res3 = await client.post(
                    "/api/v1/datasets/ingest?dataset_id=MOD13C2&year=2026&month=3",
                    headers={"X-Admin-Key": "correct-admin-key-2026"},
                )
                assert res3.status_code == 200
                assert res3.json()["status"] == "success"

            # Valid Authorization: Bearer on /api/v1/datasets/ingest passes auth
            with patch("app.services.ingestion_service.IngestionService.ingest_live_granule", new_callable=AsyncMock) as mock_ingest:
                mock_ingest.return_value = {"status": "success", "granule_id": "test_granule_bearer"}
                res4 = await client.post(
                    "/api/v1/datasets/ingest?dataset_id=MOD13C2&year=2026&month=3",
                    headers={"Authorization": "Bearer correct-admin-key-2026"},
                )
                assert res4.status_code == 200
                assert res4.json()["status"] == "success"
    finally:
        settings.ADMIN_API_KEY = orig_key


@pytest.mark.asyncio
async def test_admin_auth_unconfigured_in_dev_fails_closed_when_key_supplied():
    """Verify that if ADMIN_API_KEY is unset in dev, supplying a key still fails closed with 500."""
    orig_env = settings.ENVIRONMENT
    orig_key = settings.ADMIN_API_KEY
    try:
        settings.ENVIRONMENT = "development"
        settings.ADMIN_API_KEY = ""

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            res = await client.post(
                "/api/v1/ingest/trigger",
                headers={"X-Admin-Key": "some-key"},
                json={"dataset_id": "MOD13C2", "year": 2026, "month": 3},
            )
            assert res.status_code == 500
            assert "Administrative key not configured" in res.json()["detail"]
    finally:
        settings.ENVIRONMENT = orig_env
        settings.ADMIN_API_KEY = orig_key


@pytest.mark.asyncio
async def test_public_endpoints_accessible_without_admin_auth():
    """Verify that public observation inspection and metadata endpoints do not require admin auth."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # 1. /api/v1/ingest/status
        res1 = await client.get("/api/v1/ingest/status")
        assert res1.status_code == 200
        assert "database" in res1.json()

        # 2. /api/v1/datasets/auth-status
        res2 = await client.get("/api/v1/datasets/auth-status")
        assert res2.status_code == 200
        assert "nasa_earthdata" in res2.json()

        # 3. /api/v1/datasets/ingestion-status
        res3 = await client.get("/api/v1/datasets/ingestion-status")
        assert res3.status_code == 200
