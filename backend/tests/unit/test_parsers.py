"""
Unit tests for Milestone M2: Dedicated Satellite Product Parsers & Provenance.
Covers:
- MODIS MOD13C2 parser (HDF-EOS/NetCDF4 & GeoTIFF, scale factors, fill values, QA reliability)
- GPM IMERG 3IMERGM parser (Grid navigation, (lon, lat) dimension ordering, rate-to-accumulation, fill values)
- SWOT KaRIn parser (2D swath coordinates, left/right groups, longitude normalization, quality flag gating)
- CMR provenance metadata extraction & PostGIS spatial bounds
- Elimination of GPM date substitution defect & strict date enforcement
"""

import os
import calendar
import pytest
import numpy as np
import rasterio
import netCDF4 as nc
from unittest.mock import patch, MagicMock
from sqlalchemy import create_engine, select
from sqlalchemy.orm import sessionmaker

from app.models.base import Base
from app.models.observation import EarthObservation
from app.data_processing.parsers.modis_parser import ModisParser
from app.data_processing.parsers.gpm_parser import GpmParser
from app.data_processing.parsers.swot_parser import SwotParser
from app.integrations.nasa.earthdata_client import NasaEarthdataClient
from app.integrations.nasa.gpm_client import GpmClient
from app.services.ingestion_service import IngestionService


@pytest.fixture
def db_session():
    """Provides an isolated in-memory SQLite database session."""
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)
    Session = sessionmaker(bind=engine)
    session = Session()
    yield session
    session.close()


# =============================================================================
# 1. MODIS MOD13C2 Parser Tests
# =============================================================================

class TestModisParser:
    """Tests for ModisParser handling HDF-EOS and GeoTIFF granules."""

    def test_modis_decodes_scale_factor_and_fill_value(self):
        """Verifies scale factor 0.0001, fill value -3000, and valid range [-2000, 10000]."""
        # Valid raw NDVI 7420 -> 0.7420
        valid, val = ModisParser.decode_raw_value(7420)
        assert valid is True
        assert val == 0.7420

        # Valid negative NDVI -1500 -> -0.1500
        valid, val = ModisParser.decode_raw_value(-1500)
        assert valid is True
        assert val == -0.1500

        # Fill value -3000 must map to None
        valid, val = ModisParser.decode_raw_value(-3000)
        assert valid is False
        assert val is None

        # Out-of-bounds values
        valid, val = ModisParser.decode_raw_value(-3500)
        assert valid is False
        assert val is None

        valid, val = ModisParser.decode_raw_value(15000)
        assert valid is False
        assert val is None

    def test_modis_pixel_reliability_qa_decoding(self):
        """Verifies decoding of all MOD13C2 pixel reliability ranks."""
        # 0: Good data
        qa0 = ModisParser.decode_pixel_reliability(0)
        assert qa0["usable"] is True
        assert qa0["confidence"] == 1.0
        assert "Good Data" in qa0["category"]

        # 1: Marginal quality
        qa1 = ModisParser.decode_pixel_reliability(1)
        assert qa1["usable"] is True
        assert qa1["confidence"] == 0.65

        # 2: Snow/Ice covered
        qa2 = ModisParser.decode_pixel_reliability(2)
        assert qa2["usable"] is False
        assert "Snow" in qa2["category"]

        # 3: Cloud contaminated
        qa3 = ModisParser.decode_pixel_reliability(3)
        assert qa3["usable"] is False
        assert "Cloud" in qa3["category"]

        # 4: Climatology gap-fill (not authentic observation)
        qa4 = ModisParser.decode_pixel_reliability(4)
        assert qa4["usable"] is False
        assert "Climatology" in qa4["category"]

        # -1: Fill
        qa_neg = ModisParser.decode_pixel_reliability(-1)
        assert qa_neg["usable"] is False

    def test_modis_parser_from_geotiff(self, tmp_path):
        """Verifies ModisParser correctly decodes 3-band GeoTIFF."""
        tif_path = str(tmp_path / "MOD13C2.A2026060.061.test.tif")
        with rasterio.open(
            tif_path, "w", driver="GTiff", height=10, width=10, count=3, dtype="int16"
        ) as dst:
            dst.write(np.full((10, 10), 6500, dtype="int16"), 1)  # NDVI 0.6500
            dst.write(np.full((10, 10), 4200, dtype="int16"), 2)  # EVI 0.4200
            dst.write(np.zeros((10, 10), dtype="int16"), 3)       # QA = 0 (Good)

        res = ModisParser.parse_granule(tif_path, "2026-03")
        assert res["dataset_id"] == "MOD13C2"
        assert res["feature_count"] > 0
        feat0 = res["features"][0]["properties"]
        assert feat0["ndvi"] == 0.65
        assert feat0["evi"] == 0.42
        assert feat0["quality_usable"] is True

    def test_modis_parser_from_netcdf_hdf(self, tmp_path):
        """Verifies ModisParser natively extracts HDF-EOS subdatasets via NetCDF4."""
        nc_path = str(tmp_path / "MOD13C2.A2026060.061.test.nc")
        with nc.Dataset(nc_path, "w", format="NETCDF4") as ds:
            ds.createDimension("lat", 20)
            ds.createDimension("lon", 20)
            v_ndvi = ds.createVariable("CMG 0.05 Deg Monthly NDVI", "i2", ("lat", "lon"), fill_value=-3000)
            v_evi = ds.createVariable("CMG 0.05 Deg Monthly EVI", "i2", ("lat", "lon"), fill_value=-3000)
            v_qa = ds.createVariable("CMG 0.05 Deg Monthly pixel reliability", "i1", ("lat", "lon"), fill_value=-1)

            data_ndvi = np.full((20, 20), 8000, dtype=np.int16)
            data_ndvi[0, 0] = -3000  # Fill value
            v_ndvi[:] = data_ndvi
            v_evi[:] = np.full((20, 20), 5500, dtype=np.int16)
            v_qa[:] = np.zeros((20, 20), dtype=np.int8)

        res = ModisParser.parse_granule(nc_path, "2026-03")
        assert res["dataset_id"] == "MOD13C2"
        assert res["feature_count"] > 0
        assert "ndvi" in res["extracted_variables"]
        assert "evi" in res["extracted_variables"]
        assert "pixel_reliability" in res["extracted_variables"]


# =============================================================================
# 2. GPM IMERG 3IMERGM Parser Tests
# =============================================================================

class TestGpmParser:
    """Tests for GpmParser handling NetCDF4/HDF5 granules and accumulation conversions."""

    def test_gpm_rate_to_monthly_accumulation_conversion(self):
        """Verifies monthly accumulation calculation across 31, 30, and 28/29 day months."""
        rate = 1.5  # mm/hr

        # March (31 days) -> 1.5 * 24 * 31 = 1116.0 mm
        acc_mar = GpmParser.convert_rate_to_accumulation(rate, 2026, 3)
        assert acc_mar == 1116.0

        # April (30 days) -> 1.5 * 24 * 30 = 1080.0 mm
        acc_apr = GpmParser.convert_rate_to_accumulation(rate, 2026, 4)
        assert acc_apr == 1080.0

        # February leap year 2024 (29 days) -> 1.5 * 24 * 29 = 1044.0 mm
        acc_feb_leap = GpmParser.convert_rate_to_accumulation(rate, 2024, 2)
        assert acc_feb_leap == 1044.0

        # February non-leap year 2025 (28 days) -> 1.5 * 24 * 28 = 1008.0 mm
        acc_feb_nonleap = GpmParser.convert_rate_to_accumulation(rate, 2025, 2)
        assert acc_feb_nonleap == 1008.0

    def test_gpm_lon_lat_dimension_ordering_and_grid_navigation(self, tmp_path):
        """
        Verifies GpmParser handles the native HDF5 (lon, lat) dimension ordering
        without IndexError and navigates the /Grid/ group hierarchy.
        """
        nc_path = str(tmp_path / "3B-MO.MS.MRG.3IMERG.20260301-S000000-E235959.03.V07B.HDF5")
        with nc.Dataset(nc_path, "w", format="NETCDF4") as ds:
            grid_grp = ds.createGroup("Grid")
            # In GPM IMERG: lon dimension is 3600 (or subsampled 40), lat is 1800 (subsampled 20)
            n_lon = 40
            n_lat = 20
            grid_grp.createDimension("lon", n_lon)
            grid_grp.createDimension("lat", n_lat)
            grid_grp.createDimension("time", 1)

            v_lon = grid_grp.createVariable("lon", "f4", ("lon",))
            v_lat = grid_grp.createVariable("lat", "f4", ("lat",))
            # Shape is (time, lon, lat) -> (1, 40, 20)
            v_precip = grid_grp.createVariable("precipitation", "f4", ("time", "lon", "lat"), fill_value=-9999.9)

            v_lon[:] = np.linspace(-179.5, 179.5, n_lon)
            v_lat[:] = np.linspace(-89.5, 89.5, n_lat)

            # Assign valid precipitation rate: 2.0 mm/hr
            precip_data = np.full((1, n_lon, n_lat), 2.0, dtype=np.float32)
            # Inject a fill value
            precip_data[0, 5, 5] = -9999.9
            # Inject an invalid negative value
            precip_data[0, 6, 6] = -1.0
            v_precip[:] = precip_data

        res = GpmParser.parse_granule(nc_path, "2026-03", stride_lat=2, stride_lon=2)
        assert res["dataset_id"] == "GPM_3IMERGM"
        assert res["feature_count"] > 0
        feat = res["features"][0]["properties"]
        assert feat["precipitation_rate_mm_hr"] == 2.0
        # For March (31 days): 2.0 * 24 * 31 = 1488.0 mm
        assert feat["precipitation_accumulated_mm"] == 1488.0
        assert feat["is_observation"] is True


# =============================================================================
# 3. SWOT KaRIn 2D Swath Parser Tests
# =============================================================================

class TestSwotParser:
    """Tests for SwotParser handling 2D swath coordinates, quality flags, and groups."""

    def test_swot_2d_swath_coordinates_no_type_error(self, tmp_path):
        """
        Verifies SwotParser extracts 2D swath coordinates (num_lines, num_pixels)
        without raising TypeError (scalar conversion crash).
        """
        nc_path = str(tmp_path / "SWOT_L2_LR_SSH_Expert_20260301.nc")
        num_lines = 15
        num_pixels = 8

        with nc.Dataset(nc_path, "w", format="NETCDF4") as ds:
            # Basic/Expert SWOT puts variables at root
            ds.createDimension("num_lines", num_lines)
            ds.createDimension("num_pixels", num_pixels)

            v_lat = ds.createVariable("latitude", "f4", ("num_lines", "num_pixels"))
            v_lon = ds.createVariable("longitude", "f4", ("num_lines", "num_pixels"))
            v_ssha = ds.createVariable("ssha_karin", "f4", ("num_lines", "num_pixels"))
            v_ssh = ds.createVariable("ssh_karin", "f4", ("num_lines", "num_pixels"))
            v_qual = ds.createVariable("ssh_karin_qual", "u4", ("num_lines", "num_pixels"))

            # Ocean coordinates in North Atlantic
            lats_2d = np.full((num_lines, num_pixels), 35.0, dtype=np.float32)
            lons_2d = np.full((num_lines, num_pixels), -45.0, dtype=np.float32)
            for i in range(num_lines):
                lats_2d[i, :] += i * 0.1
                lons_2d[i, :] += i * 0.05

            v_lat[:] = lats_2d
            v_lon[:] = lons_2d
            v_ssha[:] = np.full((num_lines, num_pixels), 0.12, dtype=np.float32)
            v_ssh[:] = np.full((num_lines, num_pixels), 1.45, dtype=np.float32)
            v_qual[:] = np.zeros((num_lines, num_pixels), dtype=np.uint32)

        res = SwotParser.parse_granule(nc_path, "2026-03", stride_line=1, stride_pixel=1)
        assert res["dataset_id"] == "SWOT_L2_LR_SSH"
        assert res["feature_count"] > 0
        feat = res["features"][0]["properties"]
        assert feat["ssha_karin_m"] == 0.12
        assert feat["quality_flag"] == 0

    def test_swot_quality_flag_gating_rejects_bad_pixels(self, tmp_path):
        """Verifies SwotParser strictly rejects pixels where ssh_karin_qual != 0."""
        nc_path = str(tmp_path / "SWOT_L2_LR_SSH_QualityTest.nc")
        with nc.Dataset(nc_path, "w", format="NETCDF4") as ds:
            ds.createDimension("num_lines", 4)
            ds.createDimension("num_pixels", 4)

            v_lat = ds.createVariable("latitude", "f4", ("num_lines", "num_pixels"))
            v_lon = ds.createVariable("longitude", "f4", ("num_lines", "num_pixels"))
            v_ssha = ds.createVariable("ssha_karin", "f4", ("num_lines", "num_pixels"))
            v_qual = ds.createVariable("ssh_karin_qual", "u4", ("num_lines", "num_pixels"))

            v_lat[:] = np.full((4, 4), 30.0, dtype=np.float32)
            v_lon[:] = np.full((4, 4), -50.0, dtype=np.float32)
            v_ssha[:] = np.full((4, 4), 0.15, dtype=np.float32)

            # Pixel (0, 0) is valid (qual = 0)
            # All other pixels are degraded (qual = 1, 2, 4294967295)
            quals = np.full((4, 4), 1, dtype=np.uint32)
            quals[0, 0] = 0
            quals[1, 1] = 4294967295
            v_qual[:] = quals

        res = SwotParser.parse_granule(nc_path, "2026-03", stride_line=1, stride_pixel=1)
        # Exactly 1 feature should be extracted because only (0, 0) has qual == 0
        assert res["feature_count"] == 1
        assert res["features"][0]["properties"]["ssha_karin_m"] == 0.15

    def test_swot_left_right_group_traversal(self, tmp_path):
        """Verifies SwotParser inspects both /left/ and /right/ swath groups."""
        nc_path = str(tmp_path / "SWOT_L2_LR_SSH_Unsmoothed.nc")
        with nc.Dataset(nc_path, "w", format="NETCDF4") as ds:
            left_grp = ds.createGroup("left")
            right_grp = ds.createGroup("right")

            for grp, base_lon in [(left_grp, -55.0), (right_grp, -50.0)]:
                grp.createDimension("num_lines", 2)
                grp.createDimension("num_pixels", 2)
                v_lat = grp.createVariable("latitude", "f4", ("num_lines", "num_pixels"))
                v_lon = grp.createVariable("longitude", "f4", ("num_lines", "num_pixels"))
                v_ssha = grp.createVariable("ssha_karin", "f4", ("num_lines", "num_pixels"))
                v_qual = grp.createVariable("ssh_karin_qual", "u4", ("num_lines", "num_pixels"))

                v_lat[:] = np.full((2, 2), 25.0, dtype=np.float32)
                v_lon[:] = np.full((2, 2), base_lon, dtype=np.float32)
                v_ssha[:] = np.full((2, 2), 0.08, dtype=np.float32)
                v_qual[:] = np.zeros((2, 2), dtype=np.uint32)

        res = SwotParser.parse_granule(nc_path, "2026-03", stride_line=1, stride_pixel=1)
        # Should extract features from both left and right groups
        assert res["feature_count"] == 8
        lons = [f["geometry"]["coordinates"][0] for f in res["features"]]
        assert any(l < -52.0 for l in lons)  # Left swath
        assert any(l > -52.0 for l in lons)  # Right swath

    def test_swot_longitude_normalization(self):
        """Verifies normalization of 0..360 degree longitudes to -180..180 range."""
        assert SwotParser.normalize_longitude(345.5) == pytest.approx(-14.5)
        assert SwotParser.normalize_longitude(180.0) == pytest.approx(-180.0)
        assert SwotParser.normalize_longitude(0.0) == pytest.approx(0.0)
        assert SwotParser.normalize_longitude(-45.0) == pytest.approx(-45.0)


# =============================================================================
# 4. Feature 4: Elimination of GPM Date Substitution Defect Tests
# =============================================================================

class TestGpmDateSubstitutionElimination:
    """Verifies that GPM date substitution defect is completely eliminated."""

    @pytest.mark.asyncio
    async def test_gpm_no_date_substitution_for_unobserved_month(self, db_session):
        """
        Verifies that when GPM is requested for 2026-06 and CMR has no granule,
        it returns status 'not_found' and NEVER substitutes 2025-09.
        """
        with patch("app.core.config.settings.NASA_EARTHDATA_BEARER_TOKEN", "valid-token-for-test"):
            with patch.object(GpmClient, "find_granule_for_month", return_value=None) as mock_find:
                res = await IngestionService.ingest_live_granule("GPM_3IMERGM", 2026, 6, db_session)

                assert res["status"] == "not_found"
                assert "No genuine granule discovered on CMR for GPM_3IMERGM in 2026-06." in res["message"]

                # Crucial assertion: find_granule_for_month was called ONLY once for (2026, 6), NEVER (2025, 9)
                assert mock_find.call_count == 1
                mock_find.assert_called_once_with(2026, 6)

    def test_ingest_granule_rejects_date_mismatched_filename(self, tmp_path, db_session):
        """
        Verifies that ingest_granule_file strictly raises ValueError if an older granule file
        (e.g. from 2025-09) is submitted with date_str='2026-03'.
        """
        old_gpm_file = tmp_path / "3B-MO.MS.MRG.3IMERG.20250901-S000000-E235959.09.V07B.HDF5"
        old_gpm_file.write_bytes(b"dummy_scientific_data_content" * 50)

        with pytest.raises(ValueError, match="does not match requested date"):
            IngestionService.ingest_granule_file(
                granule_path=str(old_gpm_file),
                dataset_id="GPM_3IMERGM",
                date_str="2026-03",
                session=db_session,
            )

    def test_ingest_granule_rejects_date_mismatched_metadata(self, tmp_path, db_session):
        """
        Verifies that ingest_granule_file strictly raises ValueError if granule_meta observation
        start does not match date_str.
        """
        granule_file = tmp_path / "valid_size_granule.tif"
        with rasterio.open(str(granule_file), "w", driver="GTiff", height=5, width=5, count=3, dtype="int16") as dst:
            dst.write(np.full((5, 5), 7000, dtype="int16"), 1)
            dst.write(np.full((5, 5), 5000, dtype="int16"), 2)
            dst.write(np.zeros((5, 5), dtype="int16"), 3)

        mismatched_meta = {
            "observation_start_time": "2025-09-01T00:00:00Z",
            "observation_end_time": "2025-09-30T23:59:59Z",
        }

        with pytest.raises(ValueError, match="Granule date mismatch"):
            IngestionService.ingest_granule_file(
                granule_path=str(granule_file),
                dataset_id="MOD13C2",
                date_str="2026-03",
                session=db_session,
                granule_meta=mismatched_meta,
            )


# =============================================================================
# 5. Feature 3 & Feature 8: CMR Provenance & PostGIS Spatial Bounds Tests
# =============================================================================

class TestProvenanceAndPostgisBounds:
    """Verifies full 12-item provenance metadata and PostGIS polygon spatial bounds."""

    @pytest.mark.asyncio
    async def test_cmr_search_granules_extracts_provenance_and_geometry(self):
        """Verifies NasaEarthdataClient.search_granules parses all CMR provenance fields."""
        mock_payload = {
            "feed": {
                "entry": [
                    {
                        "id": "G3281475020-GES_DISC",
                        "title": "GPM_3IMERGM.07:3B-MO.MS.MRG.3IMERG.19980101-S000000-E235959.01.V07B.HDF5",
                        "producer_granule_id": "3B-MO.MS.MRG.3IMERG.19980101-S000000-E235959.01.V07B.HDF5",
                        "collection_concept_id": "C2723754851-GES_DISC",
                        "time_start": "1998-01-01T00:00:00.000Z",
                        "time_end": "1998-01-31T23:59:59.999Z",
                        "boxes": ["-90 -180 90 180"],
                        "links": [
                            {
                                "rel": "http://esipfed.org/ns/fedsearch/1.1/data#",
                                "href": "https://data.gesdisc.earthdata.nasa.gov/data/GPM_L3/test.nc4",
                            }
                        ],
                        "granule_size": "25.4",
                    }
                ]
            }
        }
        with patch("httpx.AsyncClient.get") as mock_get:
            mock_resp = MagicMock()
            mock_resp.status_code = 200
            mock_resp.json.return_value = mock_payload
            mock_get.return_value = mock_resp

            res = await NasaEarthdataClient.search_granules("GPM_3IMERGM")
            assert res["status"] == "success"
            assert res["granules_found"] == 1
            granule = res["granules"][0]
            assert granule["official_granule_id"] == "3B-MO.MS.MRG.3IMERG.19980101-S000000-E235959.01.V07B.HDF5"
            assert granule["metadata_url"] == "https://cmr.earthdata.nasa.gov/search/concepts/G3281475020-GES_DISC.umm_json"
            assert granule["download_url"] == "https://data.gesdisc.earthdata.nasa.gov/data/GPM_L3/test.nc4"
            assert granule["observation_start_time"] == "1998-01-01T00:00:00.000Z"
            assert granule["observation_end_time"] == "1998-01-31T23:59:59.999Z"
            assert granule["spatial_bounding_box"] == (-180.0, -90.0, 180.0, 90.0)

    def test_earth_observation_stores_postgis_bounds_and_12_provenance_fields(self, tmp_path, db_session):
        """
        Verifies that ingest_granule_file populates spatial_bounds with a PostGIS Polygon
        and stores all 12 required provenance fields in extra_metadata.
        """
        tif_path = str(tmp_path / "MOD13C2.A2026060.061.provenance_test.tif")
        with rasterio.open(tif_path, "w", driver="GTiff", height=10, width=10, count=3, dtype="int16") as dst:
            dst.write(np.full((10, 10), 7200, dtype="int16"), 1)
            dst.write(np.full((10, 10), 4500, dtype="int16"), 2)
            dst.write(np.zeros((10, 10), dtype="int16"), 3)

        granule_meta = {
            "collection_id": "C2565788914-LPCLOUD",
            "version": "061",
            "official_granule_id": "MOD13C2.A2026060.061.provenance_test.tif",
            "metadata_url": "https://cmr.earthdata.nasa.gov/search/concepts/G2565788914-LPCLOUD.umm_json",
            "download_url": "https://data.lpdaac.earthdatacloud.nasa.gov/MOD13C2.A2026060.061.provenance_test.tif",
            "observation_start_time": "2026-03-01T00:00:00Z",
            "observation_end_time": "2026-03-31T23:59:59Z",
        }

        res = IngestionService.ingest_granule_file(
            granule_path=tif_path,
            dataset_id="MOD13C2",
            date_str="2026-03",
            session=db_session,
            granule_meta=granule_meta,
        )

        assert res["status"] == "success"

        obs = db_session.execute(
            select(EarthObservation).filter_by(granule_id=os.path.basename(tif_path))
        ).scalar_one()

        # 1. PostGIS spatial_bounds check
        assert obs.spatial_bounds is not None
        assert "polygon" in str(obs.spatial_bounds).lower()

        # 2. All 12 required provenance fields in extra_metadata
        meta = obs.extra_metadata
        required_fields = [
            "collection_id",
            "version",
            "official_granule_id",
            "metadata_url",
            "download_url",
            "observation_start_time",
            "observation_end_time",
            "extracted_variables",
            "units",
            "quality_flags",
            "checksum_sha256",
            "ingestion_timestamp",
        ]
        for field in required_fields:
            assert field in meta, f"Provenance field '{field}' missing in extra_metadata"

        assert meta["collection_id"] == "C2565788914-LPCLOUD"
        assert meta["version"] == "061"
        assert meta["official_granule_id"] == "MOD13C2.A2026060.061.provenance_test.tif"
        assert meta["data_status"] == "observation"
        assert meta["is_observation"] is True
        assert meta["verification_status"] == "verified_observation"
