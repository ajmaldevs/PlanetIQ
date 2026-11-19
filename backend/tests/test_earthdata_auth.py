"""
Unit and integration tests for NASA Earthdata Authentication & Redirect Security (Milestone M1 / Feature 2).
Verifies:
- Domain whitelisting for trusted NASA hosts.
- Strict detection of AWS S3 URLs and presigned query signatures.
- Stripping of Authorization headers when redirecting to S3 signed URLs (preventing HTTP 400).
- Stripping of Authorization headers when redirecting to untrusted third-party hosts (preventing credential leakage).
- Preservation of BasicAuth on URS and Bearer token on DAACs.
- Redirect loop protection capped at MAX_REDIRECTS (20).
- Safe retry on 401 challenge without calling nonexistent Request.copy().
"""

import pytest
import httpx
from app.integrations.nasa.earthdata_client import EarthdataAuth, TRUSTED_DOMAINS


def test_is_trusted_host_whitelist():
    """Verify is_trusted_host accurately accepts NASA domains and rejects untrusted hosts."""
    # Trusted exact domains and subdomains
    assert EarthdataAuth.is_trusted_host("earthdata.nasa.gov") is True
    assert EarthdataAuth.is_trusted_host("cmr.earthdata.nasa.gov") is True
    assert EarthdataAuth.is_trusted_host("urs.earthdata.nasa.gov") is True
    assert EarthdataAuth.is_trusted_host("data.lpdaac.earthdatacloud.nasa.gov") is True
    assert EarthdataAuth.is_trusted_host("archive.podaac.earthdata.nasa.gov") is True
    assert EarthdataAuth.is_trusted_host("gesdisc.earthdata.nasa.gov") is True
    assert EarthdataAuth.is_trusted_host("nasa.gov") is True
    assert EarthdataAuth.is_trusted_host("podaac.jpl.nasa.gov") is True
    assert EarthdataAuth.is_trusted_host("earthdatacloud.nasa.gov") is True

    # Case insensitivity
    assert EarthdataAuth.is_trusted_host("CMR.EARTHDATA.NASA.GOV") is True
    assert EarthdataAuth.is_trusted_host("DATA.LPDAAC.EARTHDATACLOUD.NASA.GOV") is True

    # Rejection of untrusted / spoofed domains
    assert EarthdataAuth.is_trusted_host("attacker.com") is False
    assert EarthdataAuth.is_trusted_host("fake-earthdata.nasa.gov.attacker.com") is False
    assert EarthdataAuth.is_trusted_host("earthdata.nasa.gov.evil.org") is False
    assert EarthdataAuth.is_trusted_host("s3.amazonaws.com") is False
    assert EarthdataAuth.is_trusted_host("prod-cumulus-protected.s3.amazonaws.com") is False
    assert EarthdataAuth.is_trusted_host("") is False
    assert EarthdataAuth.is_trusted_host(None) is False


def test_is_s3_url_detection():
    """Verify is_s3_url accurately detects AWS S3 host formats and presigned query signatures."""
    # Standard S3 hosts
    assert EarthdataAuth.is_s3_url("https://s3.amazonaws.com/bucket/granule.h5") is True
    assert EarthdataAuth.is_s3_url("https://prod-cumulus-protected.s3.amazonaws.com/granule.h5") is True
    assert EarthdataAuth.is_s3_url("https://archive-podaac.s3.us-west-2.amazonaws.com/swot.nc") is True
    assert EarthdataAuth.is_s3_url("https://mybucket.s3-us-west-2.amazonaws.com/modis.hdf") is True

    # Query string signature indicators
    assert EarthdataAuth.is_s3_url("https://custom-gateway.org/file?AWSAccessKeyId=AKIA123&Signature=abc") is True
    assert EarthdataAuth.is_s3_url("https://custom-gateway.org/file?X-Amz-Signature=abcdef&X-Amz-Algorithm=AWS4-HMAC-SHA256") is True

    # Non-S3 NASA endpoints
    assert EarthdataAuth.is_s3_url("https://cmr.earthdata.nasa.gov/search/granules.json") is False
    assert EarthdataAuth.is_s3_url("https://data.lpdaac.earthdatacloud.nasa.gov/MOD13C2.061/file.hdf") is False
    assert EarthdataAuth.is_s3_url("https://urs.earthdata.nasa.gov/oauth/authorize") is False


def test_direct_request_auth_application():
    """Verify initial request gets auth only when host is trusted and not S3."""
    auth = EarthdataAuth(username="testuser", password="testpassword", bearer_token="test-token-123")

    # 1. Trusted NASA host receives Bearer token
    req_nasa = httpx.Request("GET", "https://data.lpdaac.earthdatacloud.nasa.gov/granule.h5")
    auth._apply_auth(req_nasa)
    assert req_nasa.headers["Authorization"] == "Bearer test-token-123"

    # 2. URS host with username/password receives BasicAuth
    auth_basic = EarthdataAuth(username="myuser", password="mypassword")
    req_urs = httpx.Request("GET", "https://urs.earthdata.nasa.gov/oauth/authorize")
    auth_basic._apply_auth(req_urs)
    assert "Basic " in req_urs.headers["Authorization"]

    # 3. AWS S3 signed URL has Authorization stripped even if credentials configured
    req_s3 = httpx.Request("GET", "https://prod-cumulus-protected.s3.amazonaws.com/granule.h5?AWSAccessKeyId=AKIA123")
    req_s3.headers["Authorization"] = "Bearer pre-existing-leak"
    auth._apply_auth(req_s3)
    assert "Authorization" not in req_s3.headers

    # 4. Untrusted host has Authorization stripped
    req_evil = httpx.Request("GET", "https://attacker.org/file")
    req_evil.headers["Authorization"] = "Bearer pre-existing-leak"
    auth._apply_auth(req_evil)
    assert "Authorization" not in req_evil.headers


def test_redirect_flow_daac_to_urs_to_s3_token_stripping():
    """
    Simulate full NASA Earthdata download redirect chain:
    DAAC (302) -> URS OAuth (302) -> DAAC Download (302) -> AWS S3 Presigned URL (200).
    Verifies that:
    - DAAC requests carry Bearer token.
    - URS request carries Basic Auth.
    - Final S3 request has Authorization stripped (preventing AWS 400 Bad Request).
    """
    recorded_requests = []

    def mock_handler(request: httpx.Request) -> httpx.Response:
        recorded_requests.append({
            "url": str(request.url),
            "host": request.url.host,
            "auth_header": request.headers.get("Authorization"),
        })

        if request.url.host == "data.lpdaac.earthdatacloud.nasa.gov" and request.url.path == "/start":
            return httpx.Response(302, headers={"Location": "https://urs.earthdata.nasa.gov/oauth/authorize"})
        elif request.url.host == "urs.earthdata.nasa.gov":
            return httpx.Response(302, headers={"Location": "https://data.lpdaac.earthdatacloud.nasa.gov/callback"})
        elif request.url.host == "data.lpdaac.earthdatacloud.nasa.gov" and request.url.path == "/callback":
            return httpx.Response(302, headers={"Location": "https://prod-cumulus-protected.s3.amazonaws.com/granule.h5?AWSAccessKeyId=KEY&Signature=SIG"})
        elif "s3.amazonaws.com" in (request.url.host or ""):
            # S3 returns 400 if Authorization header is sent with presigned query parameters
            if "Authorization" in request.headers:
                return httpx.Response(400, text="InvalidArgument: Only one auth mechanism allowed")
            return httpx.Response(200, content=b"HDF5_GENUINE_GRANULE_BINARY_DATA")

        return httpx.Response(404)

    transport = httpx.MockTransport(mock_handler)
    auth = EarthdataAuth(username="my_urs_user", password="my_urs_password", bearer_token="my_bearer_token")

    with httpx.Client(transport=transport, follow_redirects=False, auth=auth) as client:
        resp = client.get("https://data.lpdaac.earthdatacloud.nasa.gov/start")
        assert resp.status_code == 200
        assert resp.content == b"HDF5_GENUINE_GRANULE_BINARY_DATA"

    assert len(recorded_requests) == 4

    # Hop 0: DAAC initial request has Bearer token
    assert recorded_requests[0]["host"] == "data.lpdaac.earthdatacloud.nasa.gov"
    assert recorded_requests[0]["auth_header"] == "Bearer my_bearer_token"

    # Hop 1: URS request has Basic Auth
    assert recorded_requests[1]["host"] == "urs.earthdata.nasa.gov"
    assert recorded_requests[1]["auth_header"] is not None
    assert "Basic " in recorded_requests[1]["auth_header"]

    # Hop 2: DAAC callback request has Bearer token
    assert recorded_requests[2]["host"] == "data.lpdaac.earthdatacloud.nasa.gov"
    assert recorded_requests[2]["auth_header"] == "Bearer my_bearer_token"

    # Hop 3: AWS S3 presigned URL request MUST NOT have Authorization header!
    assert recorded_requests[3]["host"] == "prod-cumulus-protected.s3.amazonaws.com"
    assert recorded_requests[3]["auth_header"] is None


def test_redirect_to_untrusted_domain_strips_credentials():
    """Verify that if a redirect points to an untrusted external host, credentials are not forwarded."""
    recorded_requests = []

    def mock_handler(request: httpx.Request) -> httpx.Response:
        recorded_requests.append({
            "url": str(request.url),
            "host": request.url.host,
            "auth_header": request.headers.get("Authorization"),
        })

        if request.url.host == "cmr.earthdata.nasa.gov":
            return httpx.Response(302, headers={"Location": "https://malicious-phishing.org/leak"})
        else:
            return httpx.Response(200, text="phishing landing page")

    transport = httpx.MockTransport(mock_handler)
    auth = EarthdataAuth(bearer_token="secret-nasa-token-abc")

    with httpx.Client(transport=transport, follow_redirects=False, auth=auth) as client:
        resp = client.get("https://cmr.earthdata.nasa.gov/granule")
        assert resp.status_code == 200

    assert len(recorded_requests) == 2
    # Hop 0: CMR has token
    assert recorded_requests[0]["auth_header"] == "Bearer secret-nasa-token-abc"
    # Hop 1: Malicious host MUST NOT have received the token!
    assert recorded_requests[1]["auth_header"] is None


def test_redirect_loop_prevention():
    """Verify that a circular 302 redirect loop terminates at MAX_REDIRECTS (20)."""
    redirect_count = [0]

    def mock_handler(request: httpx.Request) -> httpx.Response:
        redirect_count[0] += 1
        return httpx.Response(302, headers={"Location": "https://data.lpdaac.earthdatacloud.nasa.gov/loop"})

    transport = httpx.MockTransport(mock_handler)
    auth = EarthdataAuth(bearer_token="token")

    with httpx.Client(transport=transport, follow_redirects=False, auth=auth) as client:
        resp = client.get("https://data.lpdaac.earthdatacloud.nasa.gov/loop")
        assert resp.status_code == 302

    # Should not exceed MAX_REDIRECTS (20) + 1 initial request = 21 requests total
    assert redirect_count[0] <= 21


def test_urs_401_challenge_safe_retry():
    """Verify that a 401 challenge on URS safely retries with fresh Request without crashing."""
    attempts = [0]

    def mock_handler(request: httpx.Request) -> httpx.Response:
        attempts[0] += 1
        if attempts[0] == 1:
            # First attempt returns 401 Challenge
            return httpx.Response(401, headers={"WWW-Authenticate": "Basic realm=URS"})
        # Second attempt succeeds
        return httpx.Response(200, text="authenticated")

    transport = httpx.MockTransport(mock_handler)
    auth = EarthdataAuth(username="testuser", password="testpassword")

    with httpx.Client(transport=transport, follow_redirects=False, auth=auth) as client:
        resp = client.get("https://urs.earthdata.nasa.gov/oauth/authorize")
        assert resp.status_code == 200
        assert resp.text == "authenticated"

    assert attempts[0] == 2
