"""
tests/e2e/test_harness_smoke.py
Smoke test suite validating the Milestone E2E-M1 test harness infrastructure.
"""
import os
import pytest
import rasterio
import netCDF4 as nc
from httpx import AsyncClient
from sqlalchemy.orm import Session

from app.models.timeseries import ObservationTimeSeriesRecord
from app.integrations.nasa.earthdata_client import NasaEarthdataClient
from tests.e2e.helpers.assertions import assert_no_synthetic_defaults


@pytest.mark.asyncio
async def test_smoke_e2e_client_health(e2e_client: AsyncClient):
    """
    Smoke Test A1:
    Verifies that e2e_client connects to FastAPI /api/v1/health and returns 200 OK.
    """
    response = await e2e_client.get("/api/v1/health")
    assert response.status_code == 200, f"Expected 200 OK, got {response.status_code}: {response.text}"
    payload = response.json()
    assert "status" in payload, "Missing 'status' in health response payload"
    assert "scientific_modules" in payload, "Missing 'scientific_modules' in health payload"


def test_smoke_e2e_sync_client_system_info(e2e_sync_client):
    """
    Smoke Test A2:
    Verifies that e2e_sync_client reaches FastAPI /api/v1/system-info and returns 200 OK.
    """
    response = e2e_sync_client.get("/api/v1/system-info")
    assert response.status_code == 200, f"Expected 200 OK, got {response.status_code}: {response.text}"
    payload = response.json()
    assert "project_name" in payload, "Missing 'project_name' in system-info payload"


def test_smoke_e2e_db_isolated(e2e_db: Session):
    """
    Smoke Test B:
    Verifies that e2e_db creates an isolated in-memory SQLite database,
    allows inserting an ObservationTimeSeriesRecord, and accurately queries it back.
    """
    record = ObservationTimeSeriesRecord(
        dataset_id="MOD13C2",
        location_name="Punjab Agricultural Basin",
        latitude=30.90,
        longitude=75.85,
        date_str="2026-03",
        metric_name="NDVI",
        value=0.742,
        unit="ratio",
        verification_status="verified_observation",
        granule_id="MOD13C2.A2026060.061.2026080123456",
        source_file_checksum="a" * 64,
    )
    e2e_db.add(record)
    e2e_db.commit()

    queried = (
        e2e_db.query(ObservationTimeSeriesRecord)
        .filter_by(date_str="2026-03", metric_name="NDVI")
        .first()
    )
    assert queried is not None, "Failed to retrieve inserted record from e2e_db"
    assert queried.value == 0.742, f"Expected value 0.742, got {queried.value}"
    assert queried.verification_status == "verified_observation"
    assert queried.granule_id == "MOD13C2.A2026060.061.2026080123456"


def test_smoke_assert_no_synthetic_defaults_passes_clean():
    """
    Smoke Test C1:
    Verifies that assert_no_synthetic_defaults passes without error on clean scientific data.
    """
    clean_payload = {
        "status": "success",
        "data_status": "observation",
        "is_observation": True,
        "features": [
            {
                "type": "Feature",
                "geometry": {"type": "Point", "coordinates": [-65.0, 28.0]},
                "properties": {
                    "dataset_id": "MODISA_L3m_CHL",
                    "chlor_a_mg_m3": 0.124,
                    "date": "2026-03",
                    "verification_status": "verified_observation",
                },
            }
        ],
    }
    # Should complete cleanly with no AssertionError raised
    assert_no_synthetic_defaults(clean_payload)


@pytest.mark.parametrize(
    "forbidden_val,field_name",
    [
        (15.20, "sea_surface_height_m"),
        (0.85, "dynamic_topography_m"),
        (0.38, "chlorophyll_a_mg_m3"),
        (26.5, "sea_surface_temp_celsius"),
        (78.5, "gauge_weighting_index"),
    ],
)
def test_smoke_assert_no_synthetic_defaults_catches_forbidden_constants(forbidden_val, field_name):
    """
    Smoke Test C2:
    Verifies that assert_no_synthetic_defaults flags each forbidden numerical constant.
    """
    dirty_payload = {
        "data_status": "observation",
        "measurements": {
            field_name: forbidden_val,
        },
    }
    with pytest.raises(AssertionError) as exc_info:
        assert_no_synthetic_defaults(dirty_payload)
    assert str(forbidden_val) in str(exc_info.value), f"Expected {forbidden_val} in error message: {exc_info.value}"


def test_smoke_assert_no_synthetic_defaults_catches_synthetic_zero():
    """
    Smoke Test C3:
    Verifies that assert_no_synthetic_defaults flags synthetic 0.0 injected into missing variables.
    """
    cross_contaminated_payload = {
        "dataset_id": "MODISA_L3m_CHL",
        "metric_name": "chlor_a",
        "ssha_mean_m": 0.0,
    }
    with pytest.raises(AssertionError) as exc_info:
        assert_no_synthetic_defaults(cross_contaminated_payload)
    assert "Cross-contamination detected" in str(exc_info.value)


def test_smoke_assert_catches_root_and_sequence_scalar_numbers():
    """
    Smoke Test C4:
    Verifies that assert_no_synthetic_defaults flags bare scalar numbers and numbers inside
    lists, tuples, and sets at root or nested depth.
    """
    # Bare root floats
    with pytest.raises(AssertionError):
        assert_no_synthetic_defaults(15.20)
    with pytest.raises(AssertionError):
        assert_no_synthetic_defaults(0.85)

    # Lists of bare floats
    with pytest.raises(AssertionError):
        assert_no_synthetic_defaults([15.20, 0.85])

    # Tuples and sets
    with pytest.raises(AssertionError):
        assert_no_synthetic_defaults((15.20, 0.85))
    with pytest.raises(AssertionError):
        assert_no_synthetic_defaults({15.20, 0.85})

    # Dict containing list of floats
    with pytest.raises(AssertionError):
        assert_no_synthetic_defaults({"values": [15.20, 0.85]})

    # Deeply nested sequence
    with pytest.raises(AssertionError):
        assert_no_synthetic_defaults({"level1": {"level2": [[0.38]]}})


def test_smoke_assert_catches_string_encoded_numbers():
    """
    Smoke Test C5:
    Verifies that assert_no_synthetic_defaults parses string-encoded numbers and checks them
    against forbidden constants.
    """
    with pytest.raises(AssertionError):
        assert_no_synthetic_defaults({"sea_surface_height_m": "15.20"})

    with pytest.raises(AssertionError):
        assert_no_synthetic_defaults("15.20")

    with pytest.raises(AssertionError):
        assert_no_synthetic_defaults(["0.85"])

    with pytest.raises(AssertionError):
        assert_no_synthetic_defaults({"measurements": {"gauge": "  78.5  "}})


@pytest.mark.parametrize(
    "dataset_id,field_name",
    [
        ("MOD13C2", "ssha_mean_m"),
        ("MOD08_M3", "ssha_mean_m"),
        ("MODISA_L3m_CHL", "ssha_mean_m"),
        ("MODISA_L3m_SST", "ssha_mean_m"),
        ("", "ssha_mean_m"),
        ("MODISA_L3m_CHL", "precipitation_accumulated_mm"),
        ("MOD13C2", "precipitation_accumulated_mm"),
        ("SWOT_L2_LR_SSH", "precipitation_accumulated_mm"),
        ("MOD08_M3", "precipitation_accumulated_mm"),
        ("", "precipitation_accumulated_mm"),
    ],
)
def test_smoke_assert_catches_synthetic_zero_and_cross_contamination(dataset_id, field_name):
    """
    Smoke Test C6:
    Verifies that assert_no_synthetic_defaults catches 0.0 injected into non-owner datasets
    or when dataset_id is missing.
    """
    payload = {field_name: 0.0}
    if dataset_id:
        payload["dataset_id"] = dataset_id

    with pytest.raises(AssertionError) as exc_info:
        assert_no_synthetic_defaults(payload)
    assert "Cross-contamination detected" in str(exc_info.value)


def test_smoke_assert_allows_legitimate_gpm_zero_precipitation():
    """
    Smoke Test C7:
    Verifies that 0.0 mm precipitation on genuine GPM datasets is allowed (meteorologically valid).
    """
    clean_gpm_payload = {
        "dataset_id": "GPM_3IMERGM",
        "precipitation_accumulated_mm": 0.0,
        "is_observation": True,
    }
    assert_no_synthetic_defaults(clean_gpm_payload)


@pytest.mark.parametrize(
    "alias,derived_val,eq_name",
    [
        ("sea_surface_height_m", 15.25, "SSH"),
        ("ssh_m", 15.25, "SSH"),
        ("ssh_karin_m", 15.25, "SSH"),
        ("ssh", 15.25, "SSH"),
        ("dynamic_topography_m", 0.90, "ADT"),
        ("adt_m", 0.90, "ADT"),
        ("adt", 0.90, "ADT"),
        ("eddy_kinetic_energy_cm2_s2", 6.0, "EKE"),
        ("eke", 6.0, "EKE"),
        ("eke_cm2_s2", 6.0, "EKE"),
    ],
)
def test_smoke_assert_catches_derived_equation_field_aliases(alias, derived_val, eq_name):
    """
    Smoke Test C8:
    Verifies that assert_no_synthetic_defaults catches fabricated derived equations across
    all field aliases.
    """
    payload = {
        alias: derived_val,
        "ssha_mean_m": 0.05,
    }
    with pytest.raises(AssertionError):
        assert_no_synthetic_defaults(payload)


@pytest.mark.parametrize("status", ["simulated", "demonstration_model", "synthetic_fixture", "synthetic"])
def test_smoke_assert_catches_synthetic_status_with_observation(status):
    """
    Smoke Test C9:
    Verifies that assert_no_synthetic_defaults catches contradictory synthetic statuses when
    is_observation=True.
    """
    payload = {
        "data_status": status,
        "is_observation": True,
    }
    with pytest.raises(AssertionError) as exc_info:
        assert_no_synthetic_defaults(payload)
    assert "Contradictory scientific metadata" in str(exc_info.value)


def test_smoke_assert_catches_teleconnection_slices():
    """
    Smoke Test C10:
    Verifies that short slices of the hardcoded teleconnection series are caught even without
    the full 2024-01/2025-01 anchor dates.
    """
    short_slice = [
        {"date": "2024-04", "ocean_ssha_m": 0.11, "atmosphere_precipitation_anomaly_mm": -35.0, "land_ndvi_anomaly": -0.07},
        {"date": "2024-07", "ocean_ssha_m": 0.02, "atmosphere_precipitation_anomaly_mm": -10.0, "land_ndvi_anomaly": -0.03},
    ]
    with pytest.raises(AssertionError) as exc_info:
        assert_no_synthetic_defaults(short_slice)
    assert "Forbidden hardcoded teleconnection tuple detected" in str(exc_info.value)


def test_smoke_assert_allows_genuine_coordinates_and_resists_false_positives():
    """
    Smoke Test C11:
    Verifies that genuine coordinates (e.g. 26.5 N, 78.5 E) and clean GeoJSON are not flagged as false positives.
    """
    assert_no_synthetic_defaults({"latitude": 26.5, "longitude": -80.0})
    assert_no_synthetic_defaults({"lat": 26.5, "lon": -80.0})
    assert_no_synthetic_defaults({"longitude": 78.5})
    assert_no_synthetic_defaults({"lng": 78.5})
    assert_no_synthetic_defaults({"coords": [78.5, 26.5]})
    assert_no_synthetic_defaults({"center": [78.5, 26.5]})
    assert_no_synthetic_defaults({"map_viewport": {"center": [78.5, 26.5]}})
    assert_no_synthetic_defaults({"type": "Point", "coordinates": [78.5, 26.5]})
    assert_no_synthetic_defaults({"bbox": [78.5, 20.0, 80.0, 26.5]})
    assert_no_synthetic_defaults({"latitude": 26.5, "longitude": 78.5})
    assert_no_synthetic_defaults({
        "type": "Feature",
        "geometry": {
            "type": "Point",
            "coordinates": [-80.0, 26.5],
        },
        "properties": {"dataset_id": "MODISA_L3m_SST"}
    })
    assert_no_synthetic_defaults({
        "type": "Feature",
        "geometry": {
            "type": "Polygon",
            "coordinates": [[[-80.0, 26.5], [-79.0, 26.5], [-79.0, 27.0], [-80.0, 26.5]]],
        },
    })
    # Non-coordinate field with 26.5 MUST still raise
    with pytest.raises(AssertionError):
        assert_no_synthetic_defaults({"sea_surface_temp_celsius": 26.5})
    # Non-coordinate fields with 78.5 (e.g. gauge_weighting_index, temperature) MUST still raise
    with pytest.raises(AssertionError):
        assert_no_synthetic_defaults({"gauge_weighting_index": 78.5})
    with pytest.raises(AssertionError):
        assert_no_synthetic_defaults({"temperature": 78.5})
    # EV-FP1-ANCESTOR regressions: non-coordinate fields nested in coordinate containers
    with pytest.raises(AssertionError):
        assert_no_synthetic_defaults({"center": {"gauge_weighting_index": 78.5}})
    with pytest.raises(AssertionError):
        assert_no_synthetic_defaults({"center": {"sea_surface_temp_celsius": 26.5}})
    with pytest.raises(AssertionError):
        assert_no_synthetic_defaults({"coords": {"temperature": 78.5}})
    assert_no_synthetic_defaults({"lng": 78.5, "lat": 26.5})


def test_smoke_assert_catches_whitespace_status_evasion():
    """
    Smoke Test C12 (Regression EV-1):
    Verifies that assert_no_synthetic_defaults catches whitespace-padded synthetic statuses.
    """
    with pytest.raises(AssertionError) as exc_info:
        assert_no_synthetic_defaults({"data_status": "synthetic ", "is_observation": True})
    assert "Contradictory scientific metadata" in str(exc_info.value)

    with pytest.raises(AssertionError) as exc_info2:
        assert_no_synthetic_defaults({"data_status": "  simulated  ", "is_observation": True})
    assert "Contradictory scientific metadata" in str(exc_info2.value)

    with pytest.raises(AssertionError) as exc_info3:
        assert_no_synthetic_defaults({"verification_status": "synthetic ", "is_observation": True})
    assert "Synthetic fixture claimed as genuine observation" in str(exc_info3.value)


def test_smoke_assert_catches_uppercase_derived_equations():
    """
    Smoke Test C13 (Regression EV-2):
    Verifies that assert_no_synthetic_defaults catches case-insensitive derived equations
    such as {'SSH_M': 15.25, 'SSHA_MEAN_M': 0.05}.
    """
    with pytest.raises(AssertionError) as exc_info:
        assert_no_synthetic_defaults({"SSH_M": 15.25, "SSHA_MEAN_M": 0.05})
    assert "Fabricated SSH geoid reference" in str(exc_info.value)

    with pytest.raises(AssertionError) as exc_info2:
        assert_no_synthetic_defaults({"ADT_M": 0.90, "SSHA_MEAN_M": 0.05})
    assert "Fabricated ADT reference" in str(exc_info2.value)

    with pytest.raises(AssertionError) as exc_info3:
        assert_no_synthetic_defaults({"EKE": 6.0, "SSHA_MEAN_M": 0.05})
    assert "Unphysical heuristic EKE" in str(exc_info3.value)


def test_smoke_assert_catches_ancestor_coordinate_evasion():
    """
    Smoke Test C14 (Regression EV-FP1-ANCESTOR):
    Verifies that assert_no_synthetic_defaults does not bypass synthetic default detection
    when non-coordinate measurement fields (e.g. gauge_weighting_index, sea_surface_temp_celsius, temperature)
    are nested inside objects with coordinate-like ancestor names ('center', 'coords', 'bbox', 'coordinates').
    Also confirms genuine coordinates inside such containers continue to pass cleanly.
    """
    # 1. Non-coordinate fields nested in coordinate-named containers must raise AssertionError
    with pytest.raises(AssertionError):
        assert_no_synthetic_defaults({"center": {"gauge_weighting_index": 78.5}})

    with pytest.raises(AssertionError):
        assert_no_synthetic_defaults({"center": {"sea_surface_temp_celsius": 26.5}})

    with pytest.raises(AssertionError):
        assert_no_synthetic_defaults({"coords": {"temperature": 78.5}})

    # 2. Genuine coordinates in coordinate-named containers continue to pass without error
    assert_no_synthetic_defaults({"center": [78.5, 26.5]})
    assert_no_synthetic_defaults({"map_viewport": {"center": [78.5, 26.5]}})
    assert_no_synthetic_defaults({"coords": [78.5, 26.5]})
    assert_no_synthetic_defaults({"lng": 78.5, "lat": 26.5})


@pytest.mark.asyncio
async def test_smoke_mock_nasa_earthdata_interception(mock_nasa_earthdata, tmp_path):
    """
    Smoke Test D:
    Verifies that mock_nasa_earthdata intercepts NASA CMR queries and DAAC downloads,
    producing valid NetCDF4 and GeoTIFF files without requiring live NASA credentials.
    """
    # 1. Verify generated mock granules exist and are valid binary files
    modis_file = mock_nasa_earthdata["modis_file"]
    gpm_file = mock_nasa_earthdata["gpm_file"]
    swot_file = mock_nasa_earthdata["swot_file"]

    assert os.path.exists(modis_file), "MODIS mock file was not generated"
    assert os.path.exists(gpm_file), "GPM mock file was not generated"
    assert os.path.exists(swot_file), "SWOT mock file was not generated"

    # Verify MODIS is valid 3-band GeoTIFF
    with rasterio.open(modis_file) as src:
        assert src.count == 3
        ndvi_arr = src.read(1)
        assert ndvi_arr[0, 0] == 7420

    # Verify GPM is valid NetCDF4
    with nc.Dataset(gpm_file) as ds:
        assert "Grid" in ds.groups or "precipitation" in ds.variables

    # Verify SWOT is valid NetCDF4
    with nc.Dataset(swot_file) as ds:
        assert "ssha_karin" in ds.variables
        assert ds.variables["ssh_karin_qual"][0, 0] == 0

    # 2. Verify CMR Search is intercepted by mock transport
    cmr_result = await NasaEarthdataClient.search_granules(
        collection_id="MOD13C2",
        temporal_range="2026-03-01T00:00:00Z,2026-03-31T23:59:59Z",
    )
    assert cmr_result["status"] == "success", f"CMR search failed: {cmr_result}"
    assert cmr_result["granules_found"] > 0, "No granules returned from mock CMR search"
    granule = cmr_result["granules"][0]
    assert "data_links" in granule and len(granule["data_links"]) > 0

    # 3. Verify DAAC download is intercepted and writes valid file
    download_url = granule["data_links"][0]
    dest_path = str(tmp_path / "downloaded_test_granule.tif")
    download_result = await NasaEarthdataClient.download_granule(
        granule_url=download_url,
        destination_path=dest_path,
    )
    assert download_result["status"] in ("downloaded", "success"), f"Download failed: {download_result}"
    assert os.path.exists(dest_path), "Downloaded file not written to destination path"
    assert os.path.getsize(dest_path) > 0, "Downloaded file is empty"

    # Verify the downloaded file is a valid readable GeoTIFF
    with rasterio.open(dest_path) as downloaded_src:
        assert downloaded_src.count == 3


@pytest.mark.asyncio
async def test_smoke_mock_cmr_temporal_filtering(mock_nasa_earthdata):
    """
    Regression HARNESS-CMR-1:
    Verifies that mock CMR search filters by temporal range:
    - Unobserved dates (e.g. 2030-01, 2026-09) return 0 granules with status 'success'.
    - March 2026 dates (e.g. 2026-03) or unspecified temporal return valid granules.
    """
    # 1. Unobserved date in 2030 returns 0 granules
    res_2030 = await NasaEarthdataClient.search_granules(
        collection_id="MOD13C2",
        temporal_range="2030-01-01T00:00:00Z,2030-01-31T23:59:59Z",
    )
    assert res_2030["status"] == "success"
    assert res_2030["granules_found"] == 0
    assert len(res_2030["granules"]) == 0

    # 2. Unobserved date 2026-09 returns 0 granules
    res_202609 = await NasaEarthdataClient.search_granules(
        collection_id="GPM_3IMERGM",
        temporal_range="2026-09-01T00:00:00Z,2026-09-30T23:59:59Z",
    )
    assert res_202609["status"] == "success"
    assert res_202609["granules_found"] == 0
    assert len(res_202609["granules"]) == 0

    # 3. March 2026 returns valid granules
    res_202603 = await NasaEarthdataClient.search_granules(
        collection_id="MOD13C2",
        temporal_range="2026-03-01T00:00:00Z,2026-03-31T23:59:59Z",
    )
    assert res_202603["status"] == "success"
    assert res_202603["granules_found"] > 0
    assert res_202603["granules"][0]["time_start"].startswith("2026-03")

    # 4. Unspecified temporal returns March 2026 granule
    res_default = await NasaEarthdataClient.search_granules(
        collection_id="SWOT_L2_LR_SSH",
    )
    assert res_default["status"] == "success"
    assert res_default["granules_found"] > 0


@pytest.mark.asyncio
async def test_smoke_cmr_safe_granule_size_parsing():
    """
    Regression EV-CMR-1:
    Verifies that non-numeric or malformed granule_size values in CMR responses
    (e.g. '', '2.5 MB', 'INVALID', None) default safely to 0.0 without raising ValueError/TypeError.
    """
    from unittest.mock import AsyncMock, patch
    import httpx

    test_entries = [
        {"id": "G1", "title": "G1.tif", "granule_size": "2.5 MB", "links": []},
        {"id": "G2", "title": "G2.tif", "granule_size": "", "links": []},
        {"id": "G3", "title": "G3.tif", "granule_size": "INVALID", "links": []},
        {"id": "G4", "title": "G4.tif", "granule_size": None, "links": []},
        {"id": "G5", "title": "G5.tif", "links": []},
        {"id": "G6", "title": "G6.tif", "granule_size": "12.34", "links": []},
    ]

    mock_resp = httpx.Response(200, json={"feed": {"entry": test_entries}})
    with patch.object(httpx.AsyncClient, "get", new_callable=AsyncMock) as mock_get:
        mock_get.return_value = mock_resp
        res = await NasaEarthdataClient.search_granules(collection_id="MOD13C2")
        assert res["status"] == "success"
        granules = res["granules"]
        assert len(granules) == 6
        assert granules[0]["granule_size_mb"] == 0.0
        assert granules[1]["granule_size_mb"] == 0.0
        assert granules[2]["granule_size_mb"] == 0.0
        assert granules[3]["granule_size_mb"] == 0.0
        assert granules[4]["granule_size_mb"] == 0.0
        assert granules[5]["granule_size_mb"] == 12.34


def test_smoke_db_failure_timestamp_clean_reset():
    """
    Regression HARNESS-DB-1:
    Verifies that the e2e_db fixture resets failure timestamps to 0.0 upon teardown,
    preventing stale failure timestamp leakage across tests.
    """
    import time
    from app.core import database
    from app.repositories.observation_repository import ObservationRepository
    from tests.e2e.conftest import e2e_db

    # Access the underlying fixture generator without triggering pytest's direct fixture call warning
    fixture_fn = getattr(e2e_db, "__wrapped__", e2e_db)
    db_gen = fixture_fn()
    session = next(db_gen)

    # Verify initialized to 0.0
    assert database._last_sync_db_failure == 0.0
    assert ObservationRepository._last_db_failure_time == 0.0

    # Simulate a DB failure timestamp during test execution
    database._last_sync_db_failure = time.time() + 1000.0
    ObservationRepository._last_db_failure_time = time.time() + 1000.0

    # Tear down the fixture
    try:
        next(db_gen)
    except StopIteration:
        pass

    # Verify cleanly reset to 0.0 upon teardown
    assert database._last_sync_db_failure == 0.0
    assert ObservationRepository._last_db_failure_time == 0.0
