"""
tests/e2e/fixtures/satellite_generators.py
Generates authentic, minimal, valid NetCDF4 and GeoTIFF files for testing.
"""
import os
import tempfile
from typing import Optional
import numpy as np
import netCDF4 as nc
import rasterio
from rasterio.transform import from_bounds


def generate_mock_swot_netcdf(file_path: str, cycle: int = 32, pass_id: int = 114) -> str:
    """
    Generates a valid SWOT KaRIn 2D swath NetCDF4 file.
    Contains official KaRIn ocean product variables: latitude, longitude,
    ssh_karin, ssha_karin, ssh_karin_qual, ssh_karin_uncert.
    """
    os.makedirs(os.path.dirname(os.path.abspath(file_path)), exist_ok=True)
    with nc.Dataset(file_path, "w", format="NETCDF4") as ds:
        ds.cycle_number = cycle
        ds.pass_number = pass_id
        ds.title = "SWOT Level 2 Low Rate Sea Surface Height"
        ds.institution = "NASA/CNES"
        ds.createDimension("num_lines", 30)
        ds.createDimension("num_pixels", 20)

        lat_var = ds.createVariable("latitude", "f4", ("num_lines", "num_pixels"))
        lon_var = ds.createVariable("longitude", "f4", ("num_lines", "num_pixels"))
        ssh_var = ds.createVariable("ssh_karin", "f4", ("num_lines", "num_pixels"), fill_value=-9999.0)
        ssha_var = ds.createVariable("ssha_karin", "f4", ("num_lines", "num_pixels"), fill_value=-9999.0)
        qual_var = ds.createVariable("ssh_karin_qual", "i4", ("num_lines", "num_pixels"))
        uncert_var = ds.createVariable("ssh_karin_uncert", "f4", ("num_lines", "num_pixels"))

        lats, lons = np.meshgrid(np.linspace(34.0, 38.0, 20), np.linspace(-70.0, -66.0, 30))
        lat_var[:] = lats
        lon_var[:] = lons
        ssh_var[:] = 15.45 + np.random.uniform(-0.1, 0.1, (30, 20))
        ssha_var[:] = 0.25 + np.random.uniform(-0.05, 0.05, (30, 20))
        qual_var[:] = 0  # 0 = Good Data quality flag
        uncert_var[:] = 0.024
    return file_path


def generate_mock_gpm_netcdf(file_path: str, days_in_month: int = 31) -> str:
    """
    Generates a valid GPM IMERG Final Monthly Precipitation NetCDF4 file.
    Provides precipitation rate in mm/hr in both the official /Grid group
    and the root group for flexible parsing.
    """
    os.makedirs(os.path.dirname(os.path.abspath(file_path)), exist_ok=True)
    with nc.Dataset(file_path, "w", format="NETCDF4") as ds:
        ds.title = "GPM IMERG Final Monthly Precipitation"
        ds.institution = "NASA GES DISC"

        # 1. Official GPM Group structure
        grid = ds.createGroup("Grid")
        grid.createDimension("lat", 20)
        grid.createDimension("lon", 30)
        grid.createDimension("time", 1)

        lat_var = grid.createVariable("lat", "f4", ("lat",))
        lon_var = grid.createVariable("lon", "f4", ("lon",))
        precip_var = grid.createVariable("precipitation", "f4", ("time", "lon", "lat"), fill_value=-9999.9)

        lat_vals = np.linspace(-30.0, 30.0, 20)
        lon_vals = np.linspace(-100.0, 100.0, 30)
        lat_var[:] = lat_vals
        lon_var[:] = lon_vals
        precip_var[0, :, :] = 0.42 + np.random.uniform(-0.05, 0.05, (30, 20))

        # 2. Root group variables for flat NetCDF readers
        ds.createDimension("lat", 20)
        ds.createDimension("lon", 30)
        ds.createDimension("time", 1)
        r_lat = ds.createVariable("latitude", "f4", ("lat",))
        r_lon = ds.createVariable("longitude", "f4", ("lon",))
        r_precip = ds.createVariable("precipitation", "f4", ("lat", "lon"), fill_value=-9999.9)
        r_lat[:] = lat_vals
        r_lon[:] = lon_vals
        r_precip[:] = 0.42 + np.random.uniform(-0.05, 0.05, (20, 30))

    return file_path


def generate_mock_modis_geotiff(file_path: str) -> str:
    """
    Generates a valid georeferenced MODIS MOD13C2 3-band GeoTIFF.
    Band 1: NDVI (raw int16 scaled by 0.0001, 7420 = 0.7420)
    Band 2: EVI  (raw int16 scaled by 0.0001, 5200 = 0.5200)
    Band 3: Pixel Reliability QA (0 = Good Data)
    """
    os.makedirs(os.path.dirname(os.path.abspath(file_path)), exist_ok=True)
    transform = from_bounds(-180, -90, 180, 90, 40, 40)
    with rasterio.open(
        file_path,
        "w",
        driver="GTiff",
        height=40,
        width=40,
        count=3,
        dtype="int16",
        crs="EPSG:4326",
        transform=transform,
    ) as dst:
        dst.write(np.full((40, 40), 7420, dtype="int16"), 1)  # NDVI: 0.7420
        dst.write(np.full((40, 40), 5200, dtype="int16"), 2)  # EVI: 0.5200
        dst.write(np.zeros((40, 40), dtype="int16"), 3)       # QA: 0 (Good Data)
    return file_path
