# TerraLens Dataset Catalog & Scientific Provenance

This document records the official datasets used by TerraLens, their sources, spatial and temporal resolutions, measurement units, and known scientific limitations.

---

## 1. Atmosphere MVP: Precipitation
* **Dataset**: GPM IMERG Final Monthly Precipitation
* **Dataset Identifier**: `GPM_3IMERGM` (Version 07)
* **Agency**: NASA GES DISC / JAXA
* **Temporal Resolution**: Monthly (accumulated / averaged)
* **Spatial Resolution**: 0.1° × 0.1° (~10 km)
* **Measurement Units**: mm/hr or total monthly mm
* **Scientific Purpose**: Analyze global precipitation variations, seasonal monsoons, and extreme weather anomalies.
* **Limitations**: Higher uncertainty over snow/ice-covered surfaces and high-latitude mountainous topography.

---

## 2. Ocean MVP: Surface Water and Ocean Topography
* **Dataset**: SWOT Ocean Sea Surface Height (SSH) - Option A
* **Agency**: NASA PO.DAAC / CNES / CSA / UKSA
* **Sensor**: Ka-band Radar Interferometer (KaRIn)
* **Spatial Resolution**: 2 km gridded ocean product / along-track high-rate swath
* **Measurement Units**: Meters (relative to reference ellipsoid / mean sea surface)
* **Scientific Purpose**: High-resolution ocean surface topography, meso-scale eddies, coastal currents.
* **Limitations**: Subject to tidal corrections, orbit phase coverage, and instrument noise.

---

## 3. Land MVP: Terrestrial System
* **Dataset**: MODIS Vegetation Indices Monthly Global (NDVI / EVI)
* **Dataset Identifier**: `MOD13C2` (Version 6.1)
* **Agency**: NASA LP DAAC / USGS
* **Temporal Resolution**: Monthly (Calendar Month composite)
* **Spatial Resolution**: 0.05° × 0.05° Climate Modeling Grid (~5.6 km at equator)
* **Measurement Units**: Dimensionless vegetation index (Valid range: -0.2000 to +1.0000; scale factor 0.0001)
* **Variables**: `CMG 0.05 Deg Monthly NDVI`, `CMG 0.05 Deg Monthly EVI`, pixel reliability metrics
* **Scientific Purpose**: Quantify terrestrial photosynthetic activity, global vegetation canopy dynamics, seasonal phenology, agricultural drought stress, and post-wildfire ecological recovery.
* **Limitations**: Cloud cover contamination in tropical wet seasons; atmospheric aerosol attenuation; saturation over extremely dense tropical rainforests (alleviated via complementary EVI).
* **Data Access Method**: NASA Earthdata CMR, LP DAAC HTTP/OPeNDAP repository, Earthdata Search.
