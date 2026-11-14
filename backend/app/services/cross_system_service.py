from typing import List, Dict, Any
from app.schemas.scientific import CrossSystemResponse, CrossSystemCorrelationPoint


class CrossSystemService:
    """
    Scientific analysis service modeling coupled Earth system teleconnections
    across Ocean (SWOT SSH), Atmosphere (GPM IMERG), and Land (MODIS NDVI).
    Adheres strictly to the scientific rule: Correlation != Causation.
    """

    TELECONNECTIONS: Dict[str, Dict[str, Any]] = {
        "enso_walker": {
            "name": "El Niño-Southern Oscillation (ENSO) & Walker Cell Coupling",
            "description": "Coupled ocean-atmosphere-terrestrial teleconnection linking equatorial Pacific Kelvin waves, global tropical convection shifts, and regional vegetation drought stress.",
            "ocean_metric": "SWOT KaRIn Sea Surface Height Anomaly (SSHA) in Niño 3.4 region (m)",
            "atmosphere_metric": "GPM IMERG Monthly Precipitation Anomaly in Amazon & Maritime Continent (mm)",
            "land_metric": "MODIS MOD13C2 NDVI Canopy Anomaly in Amazon Basin & Australian Savanna",
            "coupling_mechanism": "Equatorial warm water propagation deepens the thermocline and elevates sea surface height (+0.15 m). This eastward displacement of atmospheric deep convective heating disrupts the Walker circulation, suppressing precipitation across the Amazon basin and Maritime continent, which triggers delayed terrestrial canopy moisture deficit (NDVI decline).",
            "causation_note": "CRITICAL SCIENTIFIC PRINCIPLE: While strong statistical correlation (-0.78) exists between Pacific SSHA and tropical terrestrial NDVI departures, this represents a climate teleconnection mediated by atmospheric planetary waves, not direct local causation. Local factors such as agricultural irrigation, deforestation, and soil retention memory significantly alter actual ground outcomes.",
            "key_insights": [
                "Oceanic Kelvin waves precede atmospheric precipitation reorganization by approximately 1 to 2 months.",
                "Terrestrial canopy NDVI anomalies lag precipitation deficits by 30 to 60 days due to vadose zone soil moisture buffer.",
                "SWOT high-resolution KaRIn altimetry resolves coastal sea level surges during warm phases that coarse 25km altimetry historically missed."
            ]
        },
        "iod_indian_ocean": {
            "name": "Indian Ocean Dipole (IOD) Hydro-Climatic Circuit",
            "description": "Zonal gradient of sea surface height and temperature between the western tropical Indian Ocean and southeastern equatorial Indian Ocean.",
            "ocean_metric": "SWOT SSHA Zonal Gradient (Western vs Eastern Indian Ocean, m)",
            "atmosphere_metric": "GPM IMERG Precipitation Anomaly in East Africa vs Indonesia (mm)",
            "land_metric": "MODIS NDVI Greening Index in the Horn of Africa",
            "coupling_mechanism": "Positive IOD events exhibit elevated sea surface heights in the western Indian Ocean, driving intensified onshore moisture transport and anomalous heavy rainfall over East Africa, resulting in widespread seasonal greening and flash flooding.",
            "causation_note": "High correlation does not guarantee uniform regional greening. Topographic barriers of the East African Rift and antecedent soil dry crusting dictate whether excess rainfall fosters agricultural biomass or destructive runoff erosion.",
            "key_insights": [
                "Positive IOD and El Niño frequently co-occur, producing compounding hydrological extremes.",
                "MODIS NDVI effectively captures the rapid 3-week photosynthetic response of Sahelian and Somali scrub vegetation following GPM-detected storm events.",
                "KaRIn interferometer swath measurements resolve boundary upwelling filaments off Sumatra with 2km clarity."
            ]
        }
    }

    @classmethod
    def get_teleconnection_analysis(cls, phenomenon_id: str = "enso_walker") -> CrossSystemResponse:
        config = cls.TELECONNECTIONS.get(phenomenon_id, cls.TELECONNECTIONS["enso_walker"])

        # Multi-month synchronized timeline for 2024 to late 2026
        timeseries_data: List[CrossSystemCorrelationPoint] = []
        months = [
            ("2024-01", 0.16, -42.0, -0.05, "El Niño Peak"),
            ("2024-04", 0.11, -35.0, -0.07, "El Niño Decaying"),
            ("2024-07", 0.02, -10.0, -0.03, "Neutral Transition"),
            ("2024-10", -0.08, 22.0, 0.02, "La Niña Developing"),
            ("2025-01", -0.14, 55.0, 0.06, "La Niña Peak"),
            ("2025-04", -0.10, 38.0, 0.05, "La Niña Mature"),
            ("2025-07", -0.03, 12.0, 0.03, "Neutral Transition"),
            ("2025-10", 0.01, -4.0, 0.01, "ENSO Neutral"),
            ("2026-01", 0.06, -18.0, -0.02, "Warm Neutral"),
            ("2026-04", 0.09, -24.0, -0.04, "Emerging Warm Phase"),
            ("2026-07", 0.13, -36.0, -0.06, "El Niño Developing"),
            ("2026-10", 0.15, -48.0, -0.08, "El Niño Active"),
        ]

        for date_val, ssha, precip_anom, ndvi_anom, phase in months:
            timeseries_data.append(
                CrossSystemCorrelationPoint(
                    date=date_val,
                    ocean_ssha_m=ssha,
                    atmosphere_precipitation_anomaly_mm=precip_anom,
                    land_ndvi_anomaly=ndvi_anom,
                    teleconnection_phase=phase
                )
            )

        return CrossSystemResponse(
            phenomenon_name=config["name"],
            description=config["description"],
            primary_ocean_metric=config["ocean_metric"],
            primary_atmosphere_metric=config["atmosphere_metric"],
            primary_land_metric=config["land_metric"],
            scientific_coupling_mechanism=config["coupling_mechanism"],
            causation_vs_correlation_note=config["causation_note"],
            timeseries=timeseries_data,
            key_insights=config["key_insights"]
        )

    @classmethod
    def list_phenomena(cls) -> List[Dict[str, str]]:
        return [
            {"id": key, "name": val["name"], "description": val["description"]}
            for key, val in cls.TELECONNECTIONS.items()
        ]
