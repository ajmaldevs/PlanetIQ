from typing import List, Dict, Any, Optional
import os
import logging
from app.core.config import settings
from app.schemas.scientific import (
    AssistantQueryRequest,
    AssistantQueryResponse,
    ScientificCitation,
)

logger = logging.getLogger("terralens.assistant")

SYSTEM_SCIENTIFIC_INSTRUCTIONS = """You are the TerraLens Scientific Intelligence Assistant, an expert planetary sciences and Earth observation advisor created for NASA Space Apps Challenge 2026.
IMPORTANT DATA LIMITATION: The current TerraLens backend returns modelled demonstration examples, not ingested NASA observations. Never describe current app values as measured, observed, calibrated, or retrieved. Explain NASA product science as general dataset guidance and clearly distinguish it from the app's demonstration values.
You possess deep scientific mastery of three core NASA Earth observation systems and their interconnections:

1. OCEAN (SWOT Mission - Option A):
   - Instrument: Ka-band Radar Interferometer (KaRIn) and nadir altimeter.
   - Dataset: SWOT KaRIn Low Rate Ocean Products (`SWOT_L2_LR_SSH`).
   - Resolution: 2 km gridded ocean products / 120 km swath with 20 km nadir gap.
   - Variables: Sea Surface Height (SSH in meters relative to WGS84 ellipsoid), Sea Surface Height Anomaly (SSHA in meters relative to Mean Sea Surface), Absolute Dynamic Topography (ADT in meters).
   - Core phenomena: Meso-scale and submesoscale eddies (15-100 km), anticyclonic (warm-core) vs cyclonic (cold-core) vortices, ocean boundary currents (Gulf Stream, Kuroshio).

2. ATMOSPHERE (GPM IMERG):
   - Dataset: GPM IMERG Final Monthly Precipitation (`GPM_3IMERGM`, Version 07).
   - Agency: NASA GES DISC / JAXA.
   - Resolution: 0.1° × 0.1° (~10 km at equator), Monthly.
   - CRITICAL SCIENTIFIC RULE: You must NEVER confuse precipitation rate (mm/hr) with monthly accumulated precipitation (mm). Monthly accumulation = rate (mm/hr) * 24 hours * days in month.
   - Variables: Precipitation rate (mm/hr), monthly accumulated precipitation (mm), climatological normal (1998-2020), anomaly (mm).

3. LAND (MODIS Vegetation Indices):
   - Dataset: MODIS Monthly Global Vegetation Indices (`MOD13C2`, Version 6.1).
   - Agency: NASA LP DAAC / USGS.
   - Resolution: 0.05° × 0.05° Climate Modeling Grid (~5.6 km).
   - Variables: NDVI ((NIR - Red)/(NIR + Red), dimensionless range -0.2 to +1.0), EVI (Enhanced Vegetation Index), Vegetation Condition Index (VCI, 0-100%).
   - Phenomena: Canopy phenology, seasonal green-up and senescence, agricultural drought, deforestation, post-fire recovery.

4. CROSS-SYSTEM COUPLING:
   - Understand teleconnections such as El Niño-Southern Oscillation (ENSO) and Indian Ocean Dipole (IOD).
   - CRITICAL SCIENTIFIC PRINCIPLE: Never state that correlation equals causation. Regional precipitation shifts and vegetation changes correlate with ocean temperature/height anomalies via planetary atmospheric waves, but local factors (topography, soil moisture memory, irrigation) fundamentally govern ground impacts.

COMMUNICATION TONE & TARGET AUDIENCE:
- Clear, engaging, and accessible for high school students, college researchers, and the science-curious public.
- Rigorous in terminology, accurate with units, and transparent about instrument uncertainty.
"""


class AssistantService:
    """
    Coordinates AI scientific assistant queries using Google Gemini API
    with fallback to a rich grounded scientific reasoning engine.
    """

    @classmethod
    async def process_query(cls, request: AssistantQueryRequest) -> AssistantQueryResponse:
        user_prompt = request.prompt.strip()
        context = request.context or None
        api_key = settings.GEMINI_API_KEY or os.environ.get("GEMINI_API_KEY", "")

        # Attempt Gemini API if key is supplied and not a dummy template
        if api_key and not api_key.startswith("your_") and len(api_key) > 15:
            try:
                from google import genai
                client = genai.Client(api_key=api_key)
                
                # Assemble contextual prompt
                context_info = ""
                if context:
                    context_info = (
                        f"\nUser Current Viewport Context:\n"
                        f"- Active Module: {context.active_module}\n"
                        f"- Coordinates: Lat {context.latitude}, Lon {context.longitude}\n"
                        f"- Selected Date: {context.selected_date}\n"
                        f"- Region: {context.selected_region}\n"
                    )

                response = client.models.generate_content(
                    model=settings.GEMINI_MODEL or "gemini-1.5-flash",
                    contents=[
                        {"role": "user", "parts": [{"text": f"{SYSTEM_SCIENTIFIC_INSTRUCTIONS}\n{context_info}\nUser Question: {user_prompt}"}]}
                    ]
                )
                if response and response.text:
                    return cls._build_response(response.text, user_prompt, context)
            except Exception as e:
                logger.warning(f"Gemini API request failed, engaging grounded scientific fallback: {e}")

        # Grounded Scientific Engine Fallback
        return cls._grounded_fallback_response(user_prompt, context)

    @classmethod
    def _build_response(
        cls,
        text_content: str,
        user_prompt: str,
        context: Optional[Any]
    ) -> AssistantQueryResponse:
        citations = cls._resolve_citations(user_prompt, context)
        followups = cls._generate_followups(user_prompt, context)
        return AssistantQueryResponse(
            response=text_content,
            scientific_grounding=citations,
            suggested_followups=followups,
            confidence_level="Dataset guidance; current app values are demonstrations"
        )

    @classmethod
    def _grounded_fallback_response(
        cls,
        user_prompt: str,
        context: Optional[Any]
    ) -> AssistantQueryResponse:
        p_lower = user_prompt.lower()

        # SWOT / Ocean questions
        if any(w in p_lower for w in ["ocean", "swot", "ssh", "ssha", "karin", "eddy", "eddies", "sea surface"]):
            resp = (
                "### SWOT Ocean Altimetry Insights (Option A)\n\n"
                "**Mission & Sensor**: NASA / CNES Surface Water and Ocean Topography (SWOT) utilizes the revolutionary **Ka-band Radar Interferometer (KaRIn)** to measure ocean topography at ~2 km spatial resolution, a tenfold increase in resolution over conventional nadir altimeters.\n\n"
                "- **Sea Surface Height (SSH)** is measured in **meters (m)** relative to the reference ellipsoid (WGS84).\n"
                "- **Sea Surface Height Anomaly (SSHA)** represents the departure in **meters (m)** from the multi-year Mean Sea Surface (MSS). Positive anomalies (+0.10 to +0.35 m) often indicate warm-core anticyclonic eddies or thermal ocean expansion, whereas negative anomalies (-0.10 to -0.40 m) characterize cold-core cyclonic upwelling vortices.\n"
                "- **Eddy Dynamics**: SWOT resolves meso-scale and submesoscale eddies (15–100 km) in high-energy regions like the Gulf Stream, Kuroshio Extension, and Agulhas Retroflection, which transport heat, nutrients, and carbon across the global ocean."
            )
        # GPM / Atmosphere questions
        elif any(w in p_lower for w in ["atmosphere", "rain", "precipitation", "gpm", "imerg", "mm/hr", "monsoon", "rainfall"]):
            resp = (
                "### GPM IMERG Precipitation Science (GPM_3IMERGM)\n\n"
                "**Dataset**: NASA's Global Precipitation Measurement (GPM) Integrated Multi-satellitE Retrievals for GPM (**IMERG Final Monthly**, `GPM_3IMERGM v07`) provides global 0.1° × 0.1° (~10 km) monthly precipitation.\n\n"
                "**Crucial Scientific Distinction**:\n"
                "- **Precipitation Rate**: Expressed in **mm/hr**, measuring average rain intensity.\n"
                "- **Monthly Accumulated Precipitation**: Expressed in **mm**, representing total liquid water depth accumulated over the month. For example, an average rate of 0.25 mm/hr in a 31-day month yields: `0.25 × 24 × 31 = 186.0 mm` total accumulation.\n\n"
                "- **Climatological Comparisons**: TerraLens compares current monthly accumulations against the 1998–2020 multi-year normal to compute local precipitation anomalies and detect monsoon shifts or drought precursors."
            )
        # Land / MODIS questions
        elif any(w in p_lower for w in ["land", "modis", "ndvi", "evi", "vegetation", "drought", "canopy", "plant"]):
            resp = (
                "### MODIS Vegetation Canopy Dynamics (MOD13C2)\n\n"
                "**Dataset**: TerraLens utilizes the NASA LP DAAC **MODIS Monthly Global Vegetation Indices** (`MOD13C2 v061`) at 0.05° Climate Modeling Grid (~5.6 km).\n\n"
                "- **Normalized Difference Vegetation Index (NDVI)**: A dimensionless radiometric index calculated as `(NIR - Red) / (NIR + Red)`. Healthy photosynthetic chlorophyll strongly absorbs red light and scatters near-infrared (NIR).\n"
                "- **Scale & Units**: NDVI ranges from **-0.2000 to +1.0000** (dimensionless). Water bodies and snow typically display negative values (< 0), bare soil ranges from 0.05 to 0.15, while dense rainforests and mature crops exceed 0.70 to 0.85.\n"
                "- **Vegetation Condition Index (VCI %)**: Normalizes current NDVI relative to the historical absolute minimum and maximum for that location, enabling agricultural drought detection independent of baseline biome differences."
            )
        # Cross-system / Teleconnections / Interconnections
        elif any(w in p_lower for w in ["cross", "system", "interconnect", "teleconnection", "enso", "el niño", "la niña", "coupling", "causation"]):
            resp = (
                "### Planetary Cross-System Teleconnections\n\n"
                "Earth operates as a single interconnected physical system where the ocean, atmosphere, and land constantly exchange mass, momentum, and heat:\n\n"
                "1. **Oceanic Trigger**: During an El Niño phase, equatorial Pacific oceanic Kelvin waves elevate Sea Surface Height (+0.15 m SSHA) detected by SWOT.\n"
                "2. **Atmospheric Convection**: The eastward movement of warm surface waters reorganizes atmospheric convection (the Walker Circulation), shifting tropical storm tracks and producing negative precipitation anomalies (mm) observed by GPM IMERG across the Amazon and Southeast Asia.\n"
                "3. **Terrestrial Feedback**: Reduced rainfall depletes root-zone soil moisture, leading to vegetative stress and lower MODIS NDVI values after a 30–60 day lag.\n\n"
                "**Scientific Note on Correlation vs. Causation**:\n"
                "Statistical correlations between ocean height anomalies and canopy greenness reflect coupled climate teleconnections, but **correlation does not prove direct causation**. Local land management, soil water retention, and microclimate topographies strongly modulate the actual ecological impact."
            )
        # General Platform & NASA Datasets
        else:
            resp = (
                "### TerraLens Earth Observation Platform\n\n"
                "TerraLens is an integrated planetary observation architecture designed to explore Earth's interconnected spheres using NASA's premier Earth science datasets:\n\n"
                "1. **Ocean Sphere**: SWOT KaRIn Sea Surface Height (`SWOT_L2_LR_SSH`, Option A) tracking meso-scale eddies and dynamic sea topography in **meters**.\n"
                "2. **Atmosphere Sphere**: GPM IMERG Final Monthly Precipitation (`GPM_3IMERGM`) distinguishing instantaneous intensity (**mm/hr**) from accumulated depth (**mm**).\n"
                "3. **Land Sphere**: MODIS Monthly Global Vegetation Indices (`MOD13C2`) tracking terrestrial canopy vitality via **NDVI/EVI**.\n"
                "4. **Cross-System Engine**: Analyzing coupled teleconnections (ENSO, IOD) with scientific caution regarding correlation vs causation.\n\n"
                "Feel free to ask about specific regions (e.g. Amazon, Gulf Stream, Bay of Bengal), scientific measurement units, or how satellite sensors operate!"
            )

        citations = cls._resolve_citations(user_prompt, context)
        followups = cls._generate_followups(user_prompt, context)

        return AssistantQueryResponse(
            response=resp,
            scientific_grounding=citations,
            suggested_followups=followups,
            confidence_level="Dataset guidance; current app values are demonstrations"
        )

    @classmethod
    def _resolve_citations(cls, prompt: str, context: Optional[Any]) -> List[ScientificCitation]:
        citations = []
        p = prompt.lower()
        if any(w in p for w in ["ocean", "swot", "ssh", "karin", "eddy"]) or (context and context.active_module == "ocean"):
            citations.append(
                ScientificCitation(
                    dataset_id="SWOT_L2_LR_SSH",
                    mission="Surface Water and Ocean Topography (SWOT)",
                    variable="Sea Surface Height Anomaly (SSHA)",
                    units="meters (m)",
                    doi_or_url="https://doi.org/10.5067/SWOT-SSH-L2-LR"
                )
            )
        if any(w in p for w in ["atmosphere", "rain", "precipitation", "gpm", "imerg", "mm/hr"]) or (context and context.active_module == "atmosphere"):
            citations.append(
                ScientificCitation(
                    dataset_id="GPM_3IMERGM",
                    mission="Global Precipitation Measurement (GPM)",
                    variable="Precipitation Rate and Monthly Accumulated Precipitation",
                    units="mm/hr and mm",
                    doi_or_url="https://doi.org/10.5067/GPM/IMERG/3B-MONTH/07"
                )
            )
        if any(w in p for w in ["land", "ndvi", "evi", "vegetation", "modis", "drought"]) or (context and context.active_module == "land"):
            citations.append(
                ScientificCitation(
                    dataset_id="MOD13C2",
                    mission="Moderate Resolution Imaging Spectroradiometer (Terra/Aqua)",
                    variable="Normalized Difference Vegetation Index (NDVI)",
                    units="dimensionless (-0.2 to 1.0)",
                    doi_or_url="https://doi.org/10.5067/MODIS/MOD13C2.061"
                )
            )
        if not citations:
            # Add primary platform citations by default
            citations = [
                ScientificCitation(
                    dataset_id="SWOT_L2_LR_SSH",
                    mission="SWOT (NASA/CNES)",
                    variable="Sea Surface Height",
                    units="meters",
                    doi_or_url="https://podaac.jpl.nasa.gov/swot"
                ),
                ScientificCitation(
                    dataset_id="GPM_3IMERGM",
                    mission="GPM (NASA/JAXA)",
                    variable="Final Monthly Precipitation",
                    units="mm and mm/hr",
                    doi_or_url="https://gpm.nasa.gov/data/imerg"
                ),
                ScientificCitation(
                    dataset_id="MOD13C2",
                    mission="MODIS (NASA LP DAAC)",
                    variable="Vegetation Indices (NDVI/EVI)",
                    units="dimensionless",
                    doi_or_url="https://lpdaac.usgs.gov/products/mod13c2v061/"
                )
            ]
        return citations

    @classmethod
    def _generate_followups(cls, prompt: str, context: Optional[Any]) -> List[str]:
        p = prompt.lower()
        if "ocean" in p or "swot" in p:
            return [
                "How does SWOT's KaRIn interferometer differ from standard nadir altimeters?",
                "What causes the difference between cyclonic and anticyclonic eddies?",
                "How does Sea Surface Height in the Pacific relate to El Niño?"
            ]
        elif "precipitation" in p or "atmosphere" in p or "rain" in p:
            return [
                "Why must monthly accumulated precipitation (mm) not be confused with precipitation rate (mm/hr)?",
                "How does GPM combine radar, microwave radiometers, and ground gauges?",
                "What are the limitations of satellite precipitation over snowy regions?"
            ]
        elif "land" in p or "ndvi" in p or "vegetation" in p:
            return [
                "What is the mathematical equation for NDVI and why does it use NIR and Red light?",
                "How does the Enhanced Vegetation Index (EVI) prevent saturation over tropical rainforests?",
                "What is the Vegetation Condition Index (VCI) used for in drought monitoring?"
            ]
        else:
            return [
                "Explain the teleconnection between Pacific sea level anomalies and Amazon rainfall.",
                "How does TerraLens protect against confusing correlation with causation?",
                "What are the exact spatial and temporal resolutions of each dataset?"
            ]
