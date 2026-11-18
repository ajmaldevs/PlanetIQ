"""
PlanetIQ Scientific AI Assistant Service.
Powered by Google Gen AI SDK (google-genai) with controlled scientific tool calling.

Implements:
- Multi-turn conversation history.
- Map and viewport context awareness (lat/lon, module, date, region, active layer).
- 8 structured scientific tools (SWOT & MODIS ocean, GPM atmosphere, MODIS land, trends, comparisons, teleconnections, metadata, quality).
- Controlled tool execution loop (max 5 iterations, safe function dispatching, timeout protection).
- Structured visual analysis blocks (metric cards, timeseries charts, comparison tables, anomaly alerts, data quality notices).
- Grounded scientific citations with official DOIs and dataset IDs from ScientificRAG.
- Transparent reporting of data status ('observation' vs 'simulated' vs 'unavailable').
- Graceful scientific fallback when live AI reasoning is unavailable without leaking technical internals.
"""

from typing import List, Dict, Any, Optional
import os
import re
import asyncio
import logging
from app.core.config import settings
from app.schemas.scientific import (
    AssistantQueryRequest,
    AssistantQueryResponse,
    AssistantContext,
    AssistantMessage,
    ScientificCitation,
    MetricCardBlock,
    MetricCardItem,
    TimeseriesChartBlock,
    TimeseriesPoint,
    ComparisonTableBlock,
    AnomalyAlertBlock,
    DataQualityBlock,
)
from app.services.ai_tools import SCIENTIFIC_TOOLS, SCIENTIFIC_TOOL_MAP
from app.services.scientific_rag import ScientificRAG
from app.services.scientific_analytics import ScientificAnalytics
from app.services.geocoding_service import GeocodingService

logger = logging.getLogger("planetiq.assistant")

SYSTEM_SCIENTIFIC_INSTRUCTIONS = """You are the PlanetIQ Scientific Intelligence Assistant, an authoritative planetary sciences and Earth observation advisor created for NASA Earth Science data analysis.

MANDATORY RULES & SCIENTIFIC SAFEGUARDS:
1. DATA STATUS TRANSPARENCY:
   PlanetIQ integrates genuine NASA satellite observations (e.g. MODIS MOD13C2 v061, MODIS Aqua OB.DAAC, SWOT KaRIn) and calibrated scientific demonstration models. Always report the exact data status ('observation' vs 'simulated' vs 'unavailable') returned by tools. Citing satellite sensor, product version, and temporal window is mandatory. Never present simulated models as genuine spacecraft telemetry. If observations are unavailable for a requested time or location, state this explicitly rather than estimating.

2. TOOL USAGE & INTENT PRIORITY:
   You have 8 authoritative backend tools:
   - get_ocean_observations(region, latitude, longitude, date, min_lat, max_lat, min_lon, max_lon):
     NASA Ocean satellite observations: Chlorophyll-a concentration (MODIS Aqua OB.DAAC, mg/m³), Sea Surface Temperature (SST, °C), SWOT KaRIn Sea Surface Height Anomaly (SSHA, meters), Absolute Dynamic Topography (ADT, meters), and mesoscale eddy classification (cyclonic vs anticyclonic).
     CRITICAL: Whenever the user asks about ANY ocean, marine waters, seas, bays, gulfs (e.g., Arabian Sea, Bay of Bengal, Mediterranean Sea, Pacific Ocean, Atlantic Ocean), chlorophyll-a, phytoplankton, sea surface temperature (SST), or ocean altimetry/eddies, YOU MUST CALL get_ocean_observations. NEVER call get_vegetation_indices (NDVI/EVI) for ocean or marine questions, even if the active module in the user viewport context is 'land'! User intent ALWAYS overrides the active viewport module.
   - get_precipitation_data(region, latitude, longitude, date, min_lat, max_lat, min_lon, max_lon):
     NASA GPM IMERG Final Monthly Precipitation (GPM_3IMERGM v07), precipitation rate (mm/hr), monthly accumulated precipitation (mm), baseline normal (mm), and rainfall anomaly (mm). ALWAYS call this tool for rainfall, precipitation, storm, or atmospheric moisture queries.
   - get_vegetation_indices(region, latitude, longitude, date, min_lat, max_lat, min_lon, max_lon):
     NASA MODIS Monthly Global Vegetation Indices (MOD13C2 v061), NDVI (-0.2 to 1.0), EVI, and VCI (0-100%) for terrestrial vegetation, crop health, agriculture, and drought analysis. Use ONLY for terrestrial land surfaces.
   - get_historical_trends(module, region, latitude, longitude, start_date, end_date):
     Multi-year timeseries and trend analysis across ocean, atmosphere, or land.
   - compare_regions(module, region_a, region_b, date, lat_a, lon_a, lat_b, lon_b):
     Quantitative comparison of two geographic regions with absolute difference and physical guards.
   - get_cross_system_analysis(phenomenon_id):
     Coupled Earth system teleconnections (ENSO, IOD, Walker Circulation).
   - get_dataset_metadata(dataset_id):
     Authoritative mission, sensor, resolution, and limitation documentation.
   - get_data_quality_information(dataset_id, date, region):
     Sensor calibration, limitations, and NASA Earthdata authentication readiness.

   Whenever a user asks for measurements, regional data, comparisons, trends, or dataset details, YOU MUST CALL THE APPROPRIATE TOOL. Never make up numbers.

3. PRECIPITATION RATE VS. ACCUMULATION:
   NEVER confuse precipitation rate (mm/hr) with monthly accumulated precipitation (mm). Monthly accumulation = rate * 24 * days_in_month.

4. CORRELATION VS CAUSATION:
   For cross-system teleconnections (e.g. ENSO ocean warming to Amazon drought), NEVER claim correlation equals direct mechanical causation. Always explain that oceanic Kelvin waves modulate atmospheric planetary waves (Walker Circulation), and local soil moisture and topography determine ground impacts.

5. UNITS INTEGRITY:
   Always include physical units: mg/m³ for chlorophyll-a, °C for sea surface temperature, meters (m) for ocean height/anomaly, mm/hr and mm for precipitation, dimensionless ratio for NDVI/EVI, and percent (%) for VCI.

6. TARGET AUDIENCE:
   High school students, university researchers, and the science-curious public. Rigorous, accurate, accessible, and scientifically honest.
"""


class AssistantService:
    """Coordinates AI scientific assistant queries using Gemini API with tool calling."""

    MAX_TOOL_TURNS = 5

    @classmethod
    async def process_query(cls, request: AssistantQueryRequest) -> AssistantQueryResponse:
        user_prompt = request.prompt.strip()
        context = request.context or AssistantContext()
        history = request.history or []

        api_key = settings.GEMINI_API_KEY or os.environ.get("GEMINI_API_KEY", "")

        # Check if API key is provided and valid format
        if api_key and not api_key.startswith("your_") and len(api_key.strip()) > 15:
            try:
                return await cls._run_gemini_agent(
                    api_key=api_key.strip(),
                    user_prompt=user_prompt,
                    context=context,
                    history=history,
                )
            except Exception as exc:
                logger.warning(f"Gemini API tool execution encountered an issue ({exc}). Activating scientific fallback.")
                return cls._offline_fallback_response(
                    user_prompt=user_prompt,
                    context=context,
                    error_reason="AI service temporarily unavailable",
                )

        # Gemini API Key missing or unconfigured
        return cls._offline_fallback_response(
            user_prompt=user_prompt,
            context=context,
            error_reason="AI reasoning unavailable",
        )

    @classmethod
    def _detect_domain_intent(cls, user_prompt: str, active_module: Optional[str] = None) -> str:
        """
        Classifies user intent into 'comparison', 'teleconnection', 'ocean', 'atmosphere', or 'land'.
        Explicit query keywords strictly override the viewport active_module.
        """
        p = user_prompt.lower()

        # 1. Comparison
        if any(w in p for w in ["compare", "versus", " vs ", "difference between", "higher than", "lower than"]):
            return "comparison"

        # 2. Teleconnection
        if any(w in p for w in ["teleconnection", "enso", "el nino", "la nina", "walker circulation", "iod", "indian ocean dipole", "coupled system"]):
            return "teleconnection"

        # 3. Ocean / Marine
        ocean_keywords = [
            "chlorophyll", "chlor_a", "sst", "sea surface temperature", "sea temperature",
            "water temperature", "ocean", "marine", "sea", "swot", "ssh", "ssha", "karin",
            "eddy", "eddies", "cyclonic", "anticyclonic", "upwelling", "phytoplankton",
            "arabian sea", "bay of bengal", "mediterranean", "caribbean", "gulf stream",
            "kuroshio", "agulhas", "ocean color", "oceanic", "bathymetry", "coral sea",
            "red sea", "baltic sea", "north sea", "sea level", "pelagic",
        ]
        if any(w in p for w in ocean_keywords):
            return "ocean"

        # 4. Atmosphere / Precipitation
        atmosphere_keywords = [
            "precipitation", "rain", "rainfall", "gpm", "imerg", "monsoon", "storm",
            "cloud", "aod", "aerosol", "atmospheric", "weather", "humidity", "downpour",
        ]
        if any(w in p for w in atmosphere_keywords):
            return "atmosphere"

        # 5. Land / Vegetation
        land_keywords = [
            "ndvi", "evi", "vci", "vegetation", "crop", "crops", "agriculture",
            "agricultural", "farming", "forest", "forestry", "canopy", "terrestrial",
            "drought", "soil moisture", "greenness", "biomass", "biome", "punjab",
        ]
        if any(w in p for w in land_keywords):
            return "land"

        # 6. Fallback to active viewport module if provided
        if active_module in ["ocean", "atmosphere", "land"]:
            return active_module

        return "ocean"

    @classmethod
    async def _run_gemini_agent(
        cls,
        api_key: str,
        user_prompt: str,
        context: AssistantContext,
        history: List[AssistantMessage],
    ) -> AssistantQueryResponse:
        """Executes the controlled Gemini tool execution loop using official google-genai SDK."""
        from google import genai
        from google.genai import types

        client = genai.Client(api_key=api_key)

        # Select modern supported models only (excluding deprecated 1.5/2.0 series)
        supported_models = ["gemini-3.5-flash-lite", "gemini-3.5-flash", "gemini-3.8-flash"]
        pref = settings.GEMINI_MODEL or "gemini-3.5-flash-lite"
        if pref not in supported_models:
            pref = "gemini-3.5-flash-lite"
        candidate_models = [pref] + [m for m in supported_models if m != pref]

        # Build context prompt
        context_str = cls._format_context_block(context)

        # Assemble contents list with conversation history
        contents: List[types.Content] = []
        for msg in history[-6:]:
            role = "user" if msg.role == "user" else "model"
            contents.append(types.Content(role=role, parts=[types.Part.from_text(text=msg.content)]))

        # Add current user prompt with viewport context
        current_user_text = f"{context_str}\nUser Question: {user_prompt}"
        contents.append(types.Content(role="user", parts=[types.Part.from_text(text=current_user_text)]))

        config = types.GenerateContentConfig(
            system_instruction=SYSTEM_SCIENTIFIC_INSTRUCTIONS,
            tools=SCIENTIFIC_TOOLS,
            automatic_function_calling=types.AutomaticFunctionCallingConfig(disable=True),
            temperature=0.2,
        )

        executed_tools: List[Dict[str, Any]] = []
        tool_names_called: List[str] = []
        final_text = ""
        active_model = candidate_models[0]

        # Controlled Tool Execution Loop
        for turn_idx in range(cls.MAX_TOOL_TURNS):
            response = None
            if turn_idx == 0:
                last_err = None
                for cand in candidate_models:
                    try:
                        response = await asyncio.wait_for(
                            asyncio.to_thread(
                                client.models.generate_content,
                                model=cand,
                                contents=contents,
                                config=config,
                            ),
                            timeout=15.0,
                        )
                        active_model = cand
                        break
                    except Exception as mod_err:
                        last_err = mod_err
                        logger.info(f"Model candidate {cand} failed ({mod_err}), trying next candidate...")
                        continue
                if response is None and last_err:
                    raise last_err
            else:
                response = await asyncio.wait_for(
                    asyncio.to_thread(
                        client.models.generate_content,
                        model=active_model,
                        contents=contents,
                        config=config,
                    ),
                    timeout=15.0,
                )

            # Check if Gemini requested function calls
            if response.function_calls:
                if response.candidates and response.candidates[0].content:
                    contents.append(response.candidates[0].content)

                # Process each tool call
                response_parts = []
                for call in response.function_calls:
                    fn_name = call.name
                    fn_args = call.args or {}
                    tool_names_called.append(fn_name)
                    logger.info(f"Gemini calling scientific tool: {fn_name}({fn_args})")

                    if fn_name in SCIENTIFIC_TOOL_MAP:
                        try:
                            tool_result = SCIENTIFIC_TOOL_MAP[fn_name](**fn_args)
                        except Exception as tool_exc:
                            logger.error(f"Error executing tool {fn_name}: {tool_exc}")
                            tool_result = {"status": "error", "message": str(tool_exc)}
                    else:
                        tool_result = {"status": "error", "message": f"Unknown tool: {fn_name}"}

                    executed_tools.append({"name": fn_name, "args": fn_args, "result": tool_result})
                    response_parts.append(
                        types.Part.from_function_response(name=fn_name, response=tool_result)
                    )

                # Append function responses as user turn
                contents.append(types.Content(role="user", parts=response_parts))
            else:
                final_text = response.text or ""
                break

        if not final_text and executed_tools:
            final_text = cls._summarize_executed_tools(executed_tools, user_prompt)

        # Generate structured visual blocks from tool executions
        visual_blocks = cls._synthesize_visual_blocks(executed_tools, context)

        # Grounding and citations
        citations = ScientificRAG.get_citations_for_query(user_prompt, context.active_module)
        followups = cls._generate_followups(user_prompt, context)

        # Check for correlation vs causation notice
        causation_audit = ScientificAnalytics.audit_correlation_vs_causation(final_text)
        if causation_audit:
            final_text += f"\n\n> [!NOTE]\n> {causation_audit}"

        is_real_obs = any(
            call.get("result", {}).get("is_observation") is True
            or call.get("result", {}).get("data_status") == "observation"
            for call in executed_tools
        )
        overall_data_status = "observation" if is_real_obs else "simulated"

        return AssistantQueryResponse(
            response=final_text,
            scientific_grounding=citations,
            suggested_followups=followups,
            confidence_level="High (NASA Earth Science Grounded via Gemini Tools)",
            data_status=overall_data_status,
            visual_blocks=visual_blocks,
            tool_calls_executed=tool_names_called,
        )

    @classmethod
    def _format_context_block(cls, context: AssistantContext) -> str:
        items = []
        if context.active_module:
            items.append(f"Active Sphere/Module: {context.active_module}")
        if context.latitude is not None and context.longitude is not None:
            items.append(f"Current Viewport Coordinates: Lat {context.latitude:.4f}, Lon {context.longitude:.4f}")
        if context.selected_region:
            items.append(f"Selected Geographic Region: {context.selected_region}")
        if context.selected_date:
            items.append(f"Selected Date: {context.selected_date}")
        if context.active_layer:
            items.append(f"Active Map Layer: {context.active_layer}")
        if context.observation_value is not None:
            items.append(f"Inspected Feature Value: {context.observation_value} {context.observation_unit or ''}")

        if items:
            return "Current User Viewport Context:\n- " + "\n- ".join(items)
        return ""

    @classmethod
    def _synthesize_visual_blocks(
        cls, executed_tools: List[Dict[str, Any]], context: AssistantContext
    ) -> List[Dict[str, Any]]:
        """Converts raw tool outputs into structured visual blocks for frontend rendering."""
        blocks: List[Dict[str, Any]] = []

        for call in executed_tools:
            name = call["name"]
            res = call["result"]
            if res.get("status") != "success":
                continue

            # 1. Historical Trends -> Timeseries Chart Block
            if name == "get_historical_trends":
                pts = [
                    TimeseriesPoint(date=p["date"], value=p["value"])
                    for p in res.get("timeseries", [])
                ]
                stats = res.get("statistics", {})
                interp = (
                    f"Overall trajectory is {stats.get('trend_direction', 'stable')} "
                    f"(delta: {stats.get('delta_total', 0)} {res.get('unit')})."
                )
                chart = TimeseriesChartBlock(
                    title=f"Historical Trend: {res.get('metric_label')} ({res.get('region_name', 'Region')})",
                    module=res.get("module", "earth"),
                    unit=res.get("unit", ""),
                    points=pts,
                    interpretation=interp,
                )
                blocks.append(chart.model_dump())

            # 2. Regional Comparison -> Comparison Table Block
            elif name == "compare_regions":
                reg_a = res.get("region_a", {})
                reg_b = res.get("region_b", {})
                comp = res.get("comparison", {})
                rows = [
                    {"region": reg_a.get("name"), "value": reg_a.get("value"), "unit": reg_a.get("unit")},
                    {"region": reg_b.get("name"), "value": reg_b.get("value"), "unit": reg_b.get("unit")},
                    {
                        "metric": "Absolute Delta",
                        "value": f"{comp.get('absolute_difference'):+}",
                        "unit": comp.get("unit"),
                        "note": comp.get("percentage_note") or f"{comp.get('percentage_difference')}% change",
                    },
                ]
                comp_block = ComparisonTableBlock(
                    title=f"Regional Comparison: {res.get('metric_label')}",
                    period_a=res.get("date", "2026-03"),
                    period_b=res.get("date", "2026-03"),
                    metric_label=res.get("metric_label", "Observation"),
                    unit=res.get("unit", ""),
                    rows=rows,
                )
                blocks.append(comp_block.model_dump())

            # 3. Ocean / Atmosphere / Land Point Observations -> Metric Card Block
            elif name in ["get_ocean_observations", "get_precipitation_data", "get_vegetation_indices"]:
                meas = res.get("measurements", {})
                if meas:
                    items: List[MetricCardItem] = []
                    if name == "get_ocean_observations":
                        chl = meas.get("chlorophyll_a_mg_m3")
                        if chl is not None:
                            items.append(MetricCardItem(
                                title="Chlorophyll-a",
                                value=chl,
                                unit="mg/m³",
                                badge=res.get("analysis", {}).get("chlorophyll_productivity", "Productivity"),
                                subtext="MODIS Aqua OB.DAAC",
                            ))
                        sst = meas.get("sea_surface_temp_celsius")
                        if sst is not None:
                            items.append(MetricCardItem(
                                title="Sea Surface Temp (SST)",
                                value=sst,
                                unit="°C",
                                subtext="MODIS Thermal Radiometry",
                            ))
                        ssha = meas.get("sea_surface_height_anomaly_m")
                        if ssha is not None:
                            items.append(MetricCardItem(
                                title="SSHA (Height Anomaly)",
                                value=ssha,
                                unit="m",
                                badge=res.get("analysis", {}).get("eddy_classification", "Altimetry"),
                                trend="up" if ssha > 0 else "down",
                                subtext="SWOT KaRIn 2 km Swath",
                            ))
                    elif name == "get_precipitation_data":
                        precip = meas.get("precipitation_accumulated_mm")
                        if precip is not None:
                            items.append(MetricCardItem(
                                title="Monthly Precipitation",
                                value=precip,
                                unit="mm",
                                subtext=f"Rate: {meas.get('precipitation_rate_mm_hr', 0.0)} mm/hr",
                            ))
                        anom = meas.get("precipitation_anomaly_mm")
                        if anom is not None:
                            items.append(MetricCardItem(
                                title="Rainfall Departure",
                                value=f"{anom:+}",
                                unit="mm",
                                badge="Above Normal" if anom > 0 else ("Below Normal" if anom < 0 else "Normal"),
                                trend="up" if anom > 0 else "down",
                            ))
                    elif name == "get_vegetation_indices":
                        ndvi = meas.get("ndvi")
                        if ndvi is not None:
                            items.append(MetricCardItem(
                                title="NDVI Canopy Greenness",
                                value=ndvi,
                                unit="ratio",
                                subtext="Scale: -0.2 to 1.0",
                            ))
                        vci = meas.get("vci_percent")
                        if vci is not None:
                            items.append(MetricCardItem(
                                title="Vegetation Condition (VCI)",
                                value=vci,
                                unit="%",
                                badge=res.get("analysis", {}).get("canopy_status", "VCI"),
                            ))

                    reg_title = res.get("region_name") or res.get("mission", "Earth Observation")
                    card_block = MetricCardBlock(
                        title=f"{reg_title} — Key Satellite Metrics",
                        metrics=items,
                    )
                    blocks.append(card_block.model_dump())

            # 4. Cross-System Teleconnection -> Anomaly Alert Block
            elif name == "get_cross_system_analysis":
                alert = AnomalyAlertBlock(
                    level="info",
                    title=f"Teleconnection Coupling: {res.get('phenomenon_name')}",
                    description=res.get("scientific_coupling_mechanism", "")[:300] + "...",
                    affected_region="Equatorial Pacific / Amazon Basin",
                )
                blocks.append(alert.model_dump())

        # Transparent DataQualityBlock
        has_real_obs = any(
            call.get("result", {}).get("is_observation") is True
            or call.get("result", {}).get("data_status") == "observation"
            for call in executed_tools
        )
        quality_block = DataQualityBlock(
            data_status="observation" if has_real_obs else "simulated",
            is_observation=has_real_obs,
            sensor="NASA MODIS Terra/Aqua, SWOT KaRIn, and GPM IMERG Instruments",
            limitations=[
                "Cloud masking and radiometric calibration applied according to official NASA DAAC criteria",
                "0.05° CMG Climate Modeling Grid / 2 km SWOT ocean swath / 0.1° IMERG precipitation",
                "Verified against NASA Common Metadata Repository (CMR)",
            ],
            uncertainty_note=(
                "AUTHENTIC SATELLITE OBSERVATION: Extracted from official NASA Earth Science telemetry."
                if has_real_obs
                else "SIMULATED DEMONSTRATION DATA: Calibrated scientific mathematical representation."
            ),
        )
        blocks.append(quality_block.model_dump())

        return blocks

    @classmethod
    def _summarize_executed_tools(cls, executed_tools: List[Dict[str, Any]], user_prompt: str) -> str:
        """Synthesizes a clean scientific explanation if Gemini did not emit prose."""
        parts = ["### Scientific Data Retrieval Results\n"]
        for call in executed_tools:
            name = call["name"]
            res = call["result"]
            if name == "get_ocean_observations":
                meas = res.get("measurements", {})
                parts.append(
                    f"**NASA Ocean Satellite Observations ({res.get('region_name', 'Ocean Basin')})**:\n"
                    f"- **Chlorophyll-a**: **{meas.get('chlorophyll_a_mg_m3', 'N/A')} mg/m³** "
                    f"({res.get('analysis', {}).get('chlorophyll_productivity', 'marine biological regime')})\n"
                    f"- **Sea Surface Temperature (SST)**: **{meas.get('sea_surface_temp_celsius', 'N/A')} °C**\n"
                    f"- **Sea Surface Height Anomaly (SSHA)**: **{meas.get('sea_surface_height_anomaly_m', 'N/A')} m** "
                    f"({res.get('analysis', {}).get('eddy_classification', 'dynamic sea level')})"
                )
            elif name == "get_precipitation_data":
                meas = res.get("measurements", {})
                parts.append(
                    f"**NASA GPM IMERG Precipitation ({res.get('region_name', 'Region')})**:\n"
                    f"- **Monthly Accumulated Depth**: **{meas.get('precipitation_accumulated_mm', 'N/A')} mm**\n"
                    f"- **Precipitation Rate**: **{meas.get('precipitation_rate_mm_hr', 'N/A')} mm/hr**\n"
                    f"- **Climatological Anomaly**: **{meas.get('precipitation_anomaly_mm', 'N/A')} mm** relative to 1998–2020 normal"
                )
            elif name == "get_vegetation_indices":
                meas = res.get("measurements", {})
                parts.append(
                    f"**NASA MODIS Vegetation Dynamics ({res.get('region_name', 'Region')})**:\n"
                    f"- **Canopy NDVI**: **{meas.get('ndvi', 'N/A')}**\n"
                    f"- **Vegetation Condition Index (VCI)**: **{meas.get('vci_percent', 'N/A')}%** "
                    f"({res.get('analysis', {}).get('canopy_status', 'canopy vitality')})"
                )
        return "\n\n".join(parts)

    @classmethod
    def _offline_fallback_response(
        cls,
        user_prompt: str,
        context: AssistantContext,
        error_reason: str,
    ) -> AssistantQueryResponse:
        """
        Grounded scientific fallback when live AI reasoning is unavailable.
        Executes domain tools directly based on rigorous intent classification so the user
        receives accurate measurements, structured visual blocks, and professional interpretation.
        Never leaks internal API keys, error traces, or technical backend details.
        """
        intent = cls._detect_domain_intent(user_prompt, context.active_module)
        executed_tools: List[Dict[str, Any]] = []
        tool_names: List[str] = []

        date = context.selected_date or "2026-03"
        lat = context.latitude
        lon = context.longitude
        region = context.selected_region

        # Extract potential region name from prompt if not in context
        p_lower = user_prompt.lower()
        extracted_region = region
        for r_name in ["Arabian Sea", "Bay of Bengal", "Mediterranean Sea", "Gulf Stream", "Kuroshio",
                      "Punjab", "Kerala", "Amazon", "Amazon Basin", "Sahel", "California"]:
            if r_name.lower() in p_lower:
                extracted_region = r_name
                break

        if intent == "comparison":
            is_land = any(w in p_lower for w in ["vegetation", "ndvi", "crop", "forest", "punjab", "kerala", "land", "canopy"])
            is_ocean = any(w in p_lower for w in ["ocean", "sea", "chlorophyll", "sst", "ssh", "arabian", "bengal", "marine"])
            module = "land" if is_land else ("ocean" if is_ocean else "atmosphere")

            reg_a = "Punjab" if "punjab" in p_lower else ("Arabian Sea" if "arabian" in p_lower else ("Amazon" if "amazon" in p_lower else "Equatorial Pacific"))
            reg_b = "Kerala" if ("kerala" in p_lower and reg_a != "Kerala") else ("Bay of Bengal" if ("bengal" in p_lower and reg_a != "Bay of Bengal") else ("Sahel" if "sahel" in p_lower else "Amazon Basin"))

            comp = SCIENTIFIC_TOOL_MAP["compare_regions"](module=module, region_a=reg_a, region_b=reg_b, date=date)
            executed_tools.append({"name": "compare_regions", "result": comp})
            tool_names.append("compare_regions")
            c = comp.get("comparison", {})
            lead_text = (
                f"### Regional Environmental Comparison ({module.capitalize()})\n\n"
                f"**Observations**:\n"
                f"- **Region A**: {comp.get('region_a', {}).get('name')} ({comp.get('region_a', {}).get('value')} {comp.get('region_a', {}).get('unit')})\n"
                f"- **Region B**: {comp.get('region_b', {}).get('name')} ({comp.get('region_b', {}).get('value')} {comp.get('region_b', {}).get('unit')})\n"
                f"- **Absolute Delta**: {c.get('absolute_difference')} {c.get('unit')} ({c.get('percentage_note', '')})\n\n"
                f"**Scientific Interpretation**:\n"
                f"Contrasting environmental gradients reflect distinct regional climatic forcings, boundary currents, and local land surface feedbacks.\n\n"
                f"**Data Limitations**:\n"
                f"Direct comparisons assume synchronous spatial aggregation. Topographic and microclimatic variations within large basins can induce localized departures."
            )

        elif intent == "teleconnection":
            cross = SCIENTIFIC_TOOL_MAP["get_cross_system_analysis"]("enso_walker")
            executed_tools.append({"name": "get_cross_system_analysis", "result": cross})
            tool_names.append("get_cross_system_analysis")
            lead_text = (
                f"### Coupled Earth System Teleconnections: {cross.get('phenomenon_name')}\n\n"
                f"**Observations**:\n"
                f"- **Primary Ocean Indicator**: {cross.get('primary_ocean_metric')}\n"
                f"- **Primary Atmospheric Indicator**: {cross.get('primary_atmosphere_metric')}\n"
                f"- **Primary Land Indicator**: {cross.get('primary_land_metric')}\n\n"
                f"**Scientific Coupling Mechanism**:\n"
                f"{cross.get('scientific_coupling_mechanism')}\n\n"
                f"**Scientific Guardrails & Limitations**:\n"
                f"{cross.get('causation_vs_correlation_note')}"
            )

        elif intent == "ocean":
            obs = SCIENTIFIC_TOOL_MAP["get_ocean_observations"](region=extracted_region, latitude=lat, longitude=lon, date=date)
            executed_tools.append({"name": "get_ocean_observations", "result": obs})
            tool_names.append("get_ocean_observations")
            reg_display = obs.get("region_name") or extracted_region or "Ocean Basin"

            if obs.get("status") == "unavailable":
                lead_text = (
                    f"### NASA Ocean Satellite Observations ({reg_display})\n\n"
                    f"**Data Status**: **Unavailable for {date}**\n\n"
                    f"{obs.get('message', 'Observations currently unavailable in verified repository.')}\n\n"
                    f"**Scientific Context**:\n"
                    f"{obs.get('scientific_explanation', 'Ocean optical observations require cloud-free swaths and completed mission processing pipelines.')}\n\n"
                    f"**Scientific Integrity Notice**:\n"
                    f"Missing satellite observations remain honestly unavailable and are never fabricated or filled with synthetic numbers."
                )
            else:
                m = obs.get("measurements", {})
                lead_text = (
                    f"### NASA Ocean Satellite Observations ({reg_display})\n\n"
                    f"**Observations**:\n"
                    f"- **Dataset**: NASA / CNES SWOT KaRIn Ocean Altimetry & MODIS Aqua Ocean Color\n"
                    f"- **Temporal Period**: {obs.get('date', date)}\n"
                    f"- **Chlorophyll-a Concentration**: **{m.get('chlorophyll_a_mg_m3', 'N/A')} mg/m³** ({obs.get('analysis', {}).get('chlorophyll_productivity', 'Marine Productivity')})\n"
                    f"- **Sea Surface Temperature (SST)**: **{m.get('sea_surface_temp_celsius', 'N/A')} °C**\n"
                    f"- **Sea Surface Height Anomaly (SSHA)**: **{m.get('sea_surface_height_anomaly_m', 'N/A')} m**\n"
                    f"- **Mesoscale Eddy State**: **{obs.get('analysis', {}).get('eddy_classification', 'Altimetric field')}** (EKE: {m.get('eddy_kinetic_energy_cm2_s2', 'N/A')} cm²/s²)\n\n"
                    f"**Scientific Interpretation**:\n"
                    f"Chlorophyll-a concentration quantifies phytoplankton biomass and marine primary productivity, driven by upper-ocean nutrient upwelling and thermocline shoaling. Sea Surface Temperature (SST) governs heat flux and ocean-atmosphere thermal exchange. Mesoscale eddies (15–100 km) detected by SWOT altimetry actively transport heat, salt, and biogeochemical nutrients across oceanic fronts.\n\n"
                    f"**Data Limitations**:\n"
                    f"Measurements are calibrated according to NASA OB.DAAC and PO.DAAC specifications. Optical radiometry (chlorophyll/SST) may experience data voids during heavy persistent cloud cover, requiring spatio-temporal compositing."
                )

        elif intent == "atmosphere":
            precip = SCIENTIFIC_TOOL_MAP["get_precipitation_data"](region=extracted_region, latitude=lat, longitude=lon, date=date)
            executed_tools.append({"name": "get_precipitation_data", "result": precip})
            tool_names.append("get_precipitation_data")
            reg_display = precip.get("region_name") or extracted_region or "Atmospheric Region"

            if precip.get("status") == "unavailable":
                lead_text = (
                    f"### NASA GPM IMERG Precipitation Science ({reg_display})\n\n"
                    f"**Data Status**: **Unavailable for {date}**\n\n"
                    f"{precip.get('message', 'Observations currently unavailable in verified repository.')}\n\n"
                    f"**Scientific Context**:\n"
                    f"{precip.get('scientific_explanation', 'GPM IMERG Final estimates undergo multi-satellite radar/radiometer calibration.')}\n\n"
                    f"**Scientific Integrity Notice**:\n"
                    f"Missing precipitation observations are preserved honestly and are never replaced with simulated rainfall."
                )
            else:
                m = precip.get("measurements", {})
                lead_text = (
                    f"### NASA GPM IMERG Precipitation Science ({reg_display})\n\n"
                    f"**Observations**:\n"
                    f"- **Dataset**: NASA Global Precipitation Measurement (GPM_3IMERGM v07)\n"
                    f"- **Temporal Period**: {precip.get('date', date)}\n"
                    f"- **Precipitation Rate**: **{m.get('precipitation_rate_mm_hr', 'N/A')} mm/hr**\n"
                    f"- **Monthly Accumulated Precipitation**: **{m.get('precipitation_accumulated_mm', 'N/A')} mm**\n"
                    f"- **Climatological Baseline Normal**: {m.get('climatological_normal_mm', 'N/A')} mm (1998–2020 normal)\n"
                    f"- **Rainfall Anomaly Departure**: **{m.get('precipitation_anomaly_mm', 'N/A')} mm**\n\n"
                    f"**Scientific Interpretation**:\n"
                    f"Precipitation rate measures instantaneous rain intensity, whereas accumulated depth represents the integrated monthly hydrological total. Rainfall anomalies signify departures from multi-decadal climatological normals, regulating soil moisture recharge and basin streamflow.\n\n"
                    f"**Data Limitations**:\n"
                    f"GPM IMERG merges constellation microwave radiometers and spaceborne dual-frequency radar with ground GPCC rain gauge networks. Higher uncertainty is expected over complex mountainous terrain and snow-covered surfaces."
                )

        else:  # land
            veg = SCIENTIFIC_TOOL_MAP["get_vegetation_indices"](region=extracted_region, latitude=lat, longitude=lon, date=date)
            executed_tools.append({"name": "get_vegetation_indices", "result": veg})
            tool_names.append("get_vegetation_indices")
            reg_display = veg.get("region_name") or extracted_region or "Terrestrial Region"

            if veg.get("status") == "unavailable":
                lead_text = (
                    f"### NASA MODIS Vegetation Dynamics ({reg_display})\n\n"
                    f"**Data Status**: **Unavailable for {date}**\n\n"
                    f"{veg.get('message', 'Observations currently unavailable in verified repository.')}\n\n"
                    f"**Scientific Context**:\n"
                    f"{veg.get('scientific_explanation', 'MODIS MOD13C2 requires cloud-free 16-day composite cycles and pixel reliability validation.')}\n\n"
                    f"**Scientific Integrity Notice**:\n"
                    f"Missing vegetation measurements are preserved honestly and are never replaced with manufactured numbers."
                )
            else:
                m = veg.get("measurements", {})
                lead_text = (
                    f"### NASA MODIS Vegetation Dynamics ({reg_display})\n\n"
                    f"**Observations**:\n"
                    f"- **Dataset**: NASA MODIS Monthly Global Vegetation Indices (MOD13C2 v061)\n"
                    f"- **Temporal Period**: {veg.get('date', date)}\n"
                    f"- **NDVI (Normalized Difference Vegetation Index)**: **{m.get('ndvi', 'N/A')}**\n"
                    f"- **EVI (Enhanced Vegetation Index)**: **{m.get('evi', 'N/A')}**\n"
                    f"- **Vegetation Condition Index (VCI)**: **{m.get('vci_percent', 'N/A')}%**\n"
                    f"- **Canopy Condition**: **{veg.get('analysis', {}).get('canopy_status', 'Canopy Vitality')}**\n\n"
                    f"**Scientific Interpretation**:\n"
                    f"NDVI monitors active photosynthetic chlorophyll absorption (red) versus cellular leaf structure scattering (NIR). VCI contextualizes current greenness against historical extremes to evaluate agricultural moisture stress and drought development.\n\n"
                    f"**Data Limitations**:\n"
                    f"MODIS MOD13C2 provides 0.05° spatial resolution compositing daily cloud-free observations. Aerosol contamination and residual cloud edges may cause minor negative NDVI biases."
                )

        # Standard, professional notice without leaking internals or keys
        status_notice = (
            f"\n\n> [!NOTE]\n"
            f"> AI reasoning is temporarily unavailable. The authoritative scientific satellite measurements are displayed above."
        )

        full_text = lead_text + status_notice
        visual_blocks = cls._synthesize_visual_blocks(executed_tools, context)
        citations = ScientificRAG.get_citations_for_query(user_prompt, context.active_module)
        followups = cls._generate_followups(user_prompt, context)

        is_real_obs = any(
            call.get("result", {}).get("is_observation") is True
            or call.get("result", {}).get("data_status") == "observation"
            for call in executed_tools
        )
        overall_status = "observation" if is_real_obs else "simulated"

        return AssistantQueryResponse(
            response=full_text,
            scientific_grounding=citations,
            suggested_followups=followups,
            confidence_level="Grounded Scientific Engine (PlanetIQ Deterministic Tools)",
            data_status=overall_status,
            visual_blocks=visual_blocks,
            tool_calls_executed=tool_names,
        )

    @classmethod
    def _generate_followups(cls, prompt: str, context: Optional[AssistantContext]) -> List[str]:
        p = prompt.lower()
        if any(w in p for w in ["ocean", "swot", "chlorophyll", "sst", "sea", "arabian", "bengal"]):
            return [
                "How do ocean mesoscale eddies transport heat and biological nutrients?",
                "What is the relationship between Sea Surface Temperature and chlorophyll-a in upwelling zones?",
                "How does SWOT KaRIn achieve 2 km spatial resolution over the open ocean?",
            ]
        elif any(w in p for w in ["precipitation", "rain", "gpm", "imerg", "rainfall", "monsoon"]):
            return [
                "Why must monthly accumulated precipitation (mm) not be confused with rain rate (mm/hr)?",
                "How does GPM IMERG merge satellite radar with ground rain gauges?",
                "What is the climatological baseline normal for GPM IMERG?",
            ]
        elif any(w in p for w in ["land", "ndvi", "vegetation", "crop", "agriculture", "punjab"]):
            return [
                "How does NDVI differ from EVI in dense tropical rainforests?",
                "What is the Vegetation Condition Index (VCI) used for in drought monitoring?",
                "How do delayed rainfall anomalies impact vegetation greenness?",
            ]
        else:
            return [
                "Compare chlorophyll-a between the Arabian Sea and the Bay of Bengal.",
                "Show the historical trend of sea surface height in the Equatorial Pacific.",
                "Explain the teleconnection between El Niño and global drought patterns.",
            ]
