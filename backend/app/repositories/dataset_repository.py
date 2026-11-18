"""
Dataset Repository for PlanetIQ.
Maintains verified NASA Earth Science dataset metadata, active CMR collection identifiers,
variables, measurement units, physical constraints, and official documentation links.
"""

from typing import List, Optional
from app.schemas.scientific import DatasetCatalogItem


class DatasetRepository:
    """Repository of authoritative Earth observation dataset catalogs."""

    CATALOG: List[DatasetCatalogItem] = [
        DatasetCatalogItem(
            id="SWOT_L2_LR_SSH",
            module="ocean",
            name="SWOT KaRIn Low Rate Ocean Sea Surface Height (Option A)",
            agency="NASA PO.DAAC / CNES / CSA / UKSA",
            sensor="Ka-band Radar Interferometer (KaRIn) and Jason-class nadir altimeter",
            spatial_resolution="2 km gridded / 120 km swath with 20 km nadir gap",
            temporal_resolution="21-day repeat orbit (nominal science phase)",
            variables=[
                {"name": "ssh_karin", "description": "Sea Surface Height relative to WGS84 ellipsoid", "unit": "meters (m)"},
                {"name": "ssha_karin", "description": "Sea Surface Height Anomaly relative to Mean Sea Surface (MSS)", "unit": "meters (m)"},
                {"name": "dynamic_topography", "description": "Absolute Dynamic Topography (SSH minus geoid)", "unit": "meters (m)"},
                {"name": "sig0_karin", "description": "Ka-band radar backscatter coefficient", "unit": "decibels (dB)"},
            ],
            units=["meters (m)", "decibels (dB)"],
            scientific_purpose="High-resolution observation of ocean sub-mesoscale and mesoscale eddies (15-100 km), ocean surface currents, boundary currents, and marine internal waves.",
            scientific_limitations=[
                "Nadir gap of approximately 20 km directly beneath satellite trajectory.",
                "High sensitivity to sea state bias (SSB) and significant wave height corrections.",
                "Tidal model inaccuracies in shallow coastal waters and semi-enclosed seas.",
                "Orbit temporal sampling requires interpolation when studying rapid transient phenomena."
            ],
            cmr_concept_id="C3233945000-POCLOUD",
            documentation_url="https://podaac.jpl.nasa.gov/swot"
        ),
        DatasetCatalogItem(
            id="GPM_3IMERGM",
            module="atmosphere",
            name="GPM IMERG Final Monthly Precipitation (GPM_3IMERGM v07)",
            agency="NASA GES DISC / JAXA",
            sensor="GPM Microwave Imager (GMI), Dual-frequency Precipitation Radar (DPR), and constellation radiometers",
            spatial_resolution="0.1° × 0.1° (~10 km at the equator)",
            temporal_resolution="Monthly (calendar month)",
            variables=[
                {"name": "precipitation", "description": "Monthly average precipitation rate", "unit": "mm/hr"},
                {"name": "precipitation_accumulated", "description": "Monthly total accumulated precipitation (rate * 24h * days_in_month)", "unit": "mm (total liquid depth)"},
                {"name": "climatology_normal", "description": "Historical 1998-2020 climatological monthly baseline", "unit": "mm"},
                {"name": "precipitation_anomaly", "description": "Departure from multi-year monthly normal", "unit": "mm"},
                {"name": "gauge_weighting_index", "description": "Relative weight of ground rain gauge calibration", "unit": "percent (0-100%)"},
            ],
            units=["mm/hr (rate)", "mm (monthly accumulation)"],
            scientific_purpose="Global continuous monitoring of liquid and solid precipitation, seasonal monsoon shifts, tropical cyclone tracks, and drought/flood atmospheric triggers.",
            scientific_limitations=[
                "Precipitation rate (mm/hr) must NOT be confused with monthly accumulated precipitation (mm).",
                "Higher microwave estimation uncertainty over snow- and ice-covered land surfaces.",
                "Infrared morphing propagation errors in areas with sparse passive microwave overpasses.",
                "Rain gauge calibration density is unevenly distributed across oceanic and developing land regions."
            ],
            cmr_concept_id="C2723754851-GES_DISC",
            documentation_url="https://gpm.nasa.gov/data/imerg"
        ),
        DatasetCatalogItem(
            id="MOD13C2",
            module="land",
            name="MODIS Terra/Aqua Monthly Global Vegetation Indices (MOD13C2 v061)",
            agency="NASA LP DAAC / USGS",
            sensor="Moderate Resolution Imaging Spectroradiometer (MODIS)",
            spatial_resolution="0.05° × 0.05° Climate Modeling Grid (~5.6 km at equator)",
            temporal_resolution="Monthly composite (Calendar Month)",
            variables=[
                {"name": "ndvi", "description": "Normalized Difference Vegetation Index (NIR - Red)/(NIR + Red)", "unit": "dimensionless (-0.2000 to +1.0000)"},
                {"name": "evi", "description": "Enhanced Vegetation Index (de-coupled from canopy background & atmosphere)", "unit": "dimensionless (-0.2000 to +1.0000)"},
                {"name": "vci_percent", "description": "Vegetation Condition Index comparing current NDVI to historical range", "unit": "percent (0-100%)"},
                {"name": "pixel_reliability", "description": "MODIS QA cloud/shadow/aerosol contamination flag", "unit": "categorical integer"},
            ],
            units=["dimensionless ratio (-0.2000 to +1.0000)", "percent (%)"],
            scientific_purpose="Global assessment of photosynthetic canopy vitality, vegetative biomass trends, agricultural drought emergence, deforestation tracking, and phenological response to rainfall.",
            scientific_limitations=[
                "Persistent cloud cover during tropical rainy seasons can yield composite gaps or residual contamination.",
                "NDVI reaches optical saturation over dense, multi-canopy equatorial rain forests (EVI should be analyzed as complement).",
                "Sensor degradation over multi-decadal timelines requires rigorous cross-calibration between Terra and Aqua orbits.",
                "Snow cover and high zenith angles in polar winters impede reliable photosynthetic signal capture."
            ],
            cmr_concept_id="C2565788914-LPCLOUD",
            documentation_url="https://lpdaac.usgs.gov/products/mod13c2v061/"
        )
    ]

    @classmethod
    def get_all(cls) -> List[DatasetCatalogItem]:
        return cls.CATALOG

    @classmethod
    def get_by_id(cls, dataset_id: str) -> Optional[DatasetCatalogItem]:
        clean_id = dataset_id.lower().strip()
        for d in cls.CATALOG:
            if d.id.lower() == clean_id or d.module.lower() == clean_id:
                return d
        return None
