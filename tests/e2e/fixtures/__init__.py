"""
PlanetIQ E2E Fixtures Package.
"""
from tests.e2e.fixtures.satellite_generators import (
    generate_mock_swot_netcdf,
    generate_mock_gpm_netcdf,
    generate_mock_modis_geotiff,
)
from tests.e2e.fixtures.cmr_responses import (
    create_cmr_granule_entry,
    create_cmr_search_response,
    MOCK_MODIS_CMR_RESPONSE,
    MOCK_GPM_CMR_RESPONSE,
    MOCK_SWOT_CMR_RESPONSE,
)

__all__ = [
    "generate_mock_swot_netcdf",
    "generate_mock_gpm_netcdf",
    "generate_mock_modis_geotiff",
    "create_cmr_granule_entry",
    "create_cmr_search_response",
    "MOCK_MODIS_CMR_RESPONSE",
    "MOCK_GPM_CMR_RESPONSE",
    "MOCK_SWOT_CMR_RESPONSE",
]
