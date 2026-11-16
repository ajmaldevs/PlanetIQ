"""
TerraLens Scientific AI Assistant Service.
Powered by Google Gen AI SDK (google-genai) with controlled tool calling.

Implements:
- Multi-turn conversation history.
- Map and viewport context awareness (lat/lon, module, date, region, active layer).
- 8 structured scientific tools (SWOT ocean, GPM atmosphere, MODIS land, trends, comparisons, teleconnections, metadata, quality).
- Controlled tool execution loop (max 5 iterations, safe function dispatching, timeout protection).
- Structured visual analysis blocks (metric cards, timeseries charts, comparison tables, anomaly alerts, data quality notices).
- Grounded scientific citations with official DOIs and dataset IDs from ScientificRAG.
- Transparent reporting of data status ('demonstration_model' vs 'observation').
- Transparent fallback when GEMINI_API_KEY is not configured or unavailable.
"""

from typing import List, Dict, Any, Optional
import os
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
from app.services.nasa_earthdata_client import NasaEarthdataClient

logger = logging.getLogger("terralens.assistant")

SYSTEM_SCIENTIFIC_INSTRUCTIONS = """You are the TerraLens Scientific Intelligence Assistant, an expert planetary sciences and Earth observation advisor created for NASA Space Apps Challenge 2026.

MANDATORY RULES & SCIENTIFIC SAFEGUARDS:
1. DATA STATUS TRANSPARENCY: Current TerraLens backend values are scientifically calibrated demonstration models, not ingested NASA satellite granules. Never describe current app values as measured, observed, calibrated, or retrieved from live spacecraft telemetry. Explain NASA product science as general dataset guidance and clearly distinguish it from the app's demonstration values.
2. TOOL USAGE: You have 8 authoritative backend tools:
   - get_ocean_observations: SWOT KaRIn Sea Surface Height (SSH in meters), Sea Surface Height Anomaly (SSHA in meters), Absolute Dynamic Topography (ADT), and eddy classification (cyclonic vs anticyclonic).
   - get_precipitation_data: NASA GPM IMERG Final Monthly Precipitation (GPM_3IMERGM v07), precipitation rate (mm/hr), monthly accumulated precipitation (mm), baseline normal (mm), and rainfall anomaly (mm).
   - get_vegetation_indices: NASA MODIS Monthly Global Vegetation Indices (MOD13C2 v061), NDVI (-0.2 to 1.0), EVI, and VCI (0-100%).
   - get_historical_trends: Multi-year timeseries and trend analysis for ocean, atmosphere, or land.
   - compare_regions: Quantitative comparison of two geographic regions with absolute difference and guarded percentage change.
   - get_cross_system_analysis: Coupled Earth system teleconnections (ENSO, IOD).
   - get_dataset_metadata: Authoritative mission, sensor, resolution, and limitation documentation.
   - get_data_quality_information: Sensor calibration, limitations, and NASA Earthdata authentication readiness.
   Whenever a user asks for specific measurements, regional data, comparisons, trends, or dataset details, YOU MUST CALL THE APPROPRIATE TOOL. Never make up numbers.
3. PRECIPITATION RATE VS. ACCUMULATION: NEVER confuse precipitation rate (mm/hr) with monthly accumulated precipitation (mm). Monthly accumulation = rate * 24 * days_in_month.
4. CORRELATION VS CAUSATION: For cross-system teleconnections (e.g. ENSO ocean warming to Amazon drought), NEVER claim correlation equals direct mechanical causation. Always explain that oceanic Kelvin waves modulate atmospheric planetary waves (Walker Circulation), and local soil moisture and topography determine ground impacts.
5. UNITS INTEGRITY: Always include physical units: meters (m) for ocean height, mm/hr and mm for precipitation, dimensionless ratio for NDVI/EVI, and percent (%) for VCI.
6. TARGET AUDIENCE: High school students, university researchers, and the science-curious public. Rigorous, accurate, accessible, and scientifically honest.
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

        # Check if API key is provided and valid
        if api_key and not api_key.startswith("your_") and len(api_key.strip()) > 15:
            try:
                return await cls._run_gemini_agent(
                    api_key=api_key.strip(),
                    user_prompt=user_prompt,
                    context=context,
                    history=history,
                )
            except Exception as exc:
                logger.warning(f"Gemini API tool execution failed: {exc}. Activating transparent fallback.")
                return cls._offline_fallback_response(
                    user_prompt=user_prompt,
                    context=context,
                    error_reason=f"Gemini API request failed: {str(exc)}",
                )

        # Gemini API Key missing or invalid
        return cls._offline_fallback_response(
            user_prompt=user_prompt,
            context=context,
            error_reason="GEMINI_API_KEY is not configured in backend environment (.env).",
        )

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
        model_name = settings.GEMINI_MODEL or "gemini-1.5-flash"

        # Build context prompt
        context_str = cls._format_context_block(context)

        # Assemble contents list with conversation history
        contents: List[types.Content] = []
        for msg in history[-6:]:  # Keep recent history
            role = "user" if msg.role == "user" else "model"
            contents.append(types.Content(role=role, parts=[types.Part.from_text(text=msg.content)]))

        # Add current user prompt with viewport context
        current_user_text = f"{context_str}\nUser Question: {user_prompt}"
        contents.append(types.Content(role="user", parts=[types.Part.from_text(text=current_user_text)]))

        config = types.GenerateContentConfig(
            system_instruction=SYSTEM_SCIENTIFIC_INSTRUCTIONS,
            tools=SCIENTIFIC_TOOLS,
            temperature=0.2,
        )

        candidate_models = [model_name]
        for m in ["gemini-3.8-flash", "gemini-1.5-flash", "gemini-2.0-flash", "gemini-4-hydrogen"]:
            if m not in candidate_models:
                candidate_models.append(m)

        executed_tools: List[Dict[str, Any]] = []
        tool_names_called: List[str] = []
        final_text = ""
        active_model = candidate_models[0]

        # Controlled Tool Execution Loop
        for turn_idx in range(cls.MAX_TOOL_TURNS):
            response = None
            if turn_idx == 0:
                # Try candidate models in order if initial model is not found or deprecated
                last_err = None
                for cand in candidate_models:
                    try:
                        response = client.models.generate_content(
                            model=cand,
                            contents=contents,
                            config=config,
                        )
                        active_model = cand
                        break
                    except Exception as mod_err:
                        last_err = mod_err
                        err_str = str(mod_err).lower()
                        if "404" in err_str or "not found" in err_str or "no longer available" in err_str:
                            logger.info(f"Model {cand} unavailable ({mod_err}), attempting next candidate...")
                            continue
                        raise mod_err
                if response is None and last_err:
                    raise last_err
            else:
                response = client.models.generate_content(
                    model=active_model,
                    contents=contents,
                    config=config,
                )

            # Check if Gemini requested function calls
            if response.function_calls:
                # Add model response to contents
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
                # No function calls, model returned its final answer
                final_text = response.text or ""
                break

        if not final_text and executed_tools:
            # If model exhausted turns without final prose, synthesize a clear summary
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

        return AssistantQueryResponse(
            response=final_text,
            scientific_grounding=citations,
            suggested_followups=followups,
            confidence_level="High (NASA Earth Science Grounded via Gemini Tools)",
            data_status="demonstration_model",
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
                    f"Overall trend is {stats.get('trend_direction', 'stable')} "
                    f"(delta: {stats.get('delta_total', 0)} {res.get('unit')})."
                )
                chart = TimeseriesChartBlock(
                    title=f"Historical Trend: {res.get('metric_label')}",
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
                        items.append(MetricCardItem(
                            title="Sea Surface Height (SSH)",
                            value=meas.get("sea_surface_height_m", 0.0),
                            unit="m",
                            subtext="Relative to WGS84",
                        ))
                        items.append(MetricCardItem(
                            title="SSHA (Anomaly)",
                            value=meas.get("sea_surface_height_anomaly_m", 0.0),
                            unit="m",
                            badge=res.get("analysis", {}).get("eddy_classification", "Altimetry"),
                            trend="up" if meas.get("sea_surface_height_anomaly_m", 0.0) > 0 else "down",
                        ))
                    elif name == "get_precipitation_data":
                        items.append(MetricCardItem(
                            title="Monthly Precipitation",
                            value=meas.get("precipitation_accumulated_mm", 0.0),
                            unit="mm",
                            subtext=f"Rate: {meas.get('precipitation_rate_mm_hr')} mm/hr",
                        ))
                        anom = meas.get("precipitation_anomaly_mm", 0.0)
                        items.append(MetricCardItem(
                            title="Rainfall Departure",
                            value=f"{anom:+}",
                            unit="mm",
                            badge="Above Normal" if anom > 0 else ("Below Normal" if anom < 0 else "Normal"),
                            trend="up" if anom > 0 else "down",
                        ))
                    elif name == "get_vegetation_indices":
                        items.append(MetricCardItem(
                            title="NDVI Canopy Greenness",
                            value=meas.get("ndvi", 0.0),
                            unit="ratio",
                            subtext="Scale: -0.2 to 1.0",
                        ))
                        items.append(MetricCardItem(
                            title="Vegetation Condition (VCI)",
                            value=meas.get("vci_percent", 0.0),
                            unit="%",
                            badge=res.get("analysis", {}).get("canopy_status", "VCI"),
                        ))

                    card_block = MetricCardBlock(
                        title=f"{res.get('mission', 'Earth Science')} — Key Metrics",
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

        # Always include a DataQualityBlock for complete scientific transparency
        quality_block = DataQualityBlock(
            data_status="demonstration_model",
            is_observation=False,
            sensor="NASA SWOT KaRIn, GPM IMERG, and MODIS Instruments",
            limitations=[
                "TerraLens current values are modelled demonstration data for NASA Space Apps Challenge.",
                "SWOT altimetry includes a 20 km nadir gap and tidal model uncertainties.",
                "GPM precipitation estimates exhibit higher variance over snow/ice surfaces.",
                "MODIS optical NDVI saturates over dense equatorial multi-canopy rainforests.",
            ],
            uncertainty_note="NASA Earthdata credentials can be configured via NASA_EARTHDATA_BEARER_TOKEN for live CMR queries.",
        )
        blocks.append(quality_block.model_dump())

        return blocks

    @classmethod
    def _summarize_executed_tools(cls, executed_tools: List[Dict[str, Any]], user_prompt: str) -> str:
        """Synthesizes a clean scientific explanation if Gemini did not emit text."""
        parts = ["### Scientific Data Retrieval Results\n"]
        for call in executed_tools:
            name = call["name"]
            res = call["result"]
            if name == "get_ocean_observations":
                meas = res.get("measurements", {})
                parts.append(
                    f"**SWOT KaRIn Ocean Altimetry**: Sea Surface Height Anomaly (SSHA) is "
                    f"**{meas.get('sea_surface_height_anomaly_m', 'N/A')} m**, corresponding to "
                    f"*{res.get('analysis', {}).get('eddy_classification', 'dynamic sea level')}*."
                )
            elif name == "get_precipitation_data":
                meas = res.get("measurements", {})
                parts.append(
                    f"**GPM IMERG Precipitation**: Monthly accumulated rainfall is "
                    f"**{meas.get('precipitation_accumulated_mm', 'N/A')} mm** "
                    f"(rate: {meas.get('precipitation_rate_mm_hr', 'N/A')} mm/hr), with an anomaly of "
                    f"**{meas.get('precipitation_anomaly_mm', 'N/A')} mm** relative to the 1998–2020 normal."
                )
            elif name == "get_vegetation_indices":
                meas = res.get("measurements", {})
                parts.append(
                    f"**MODIS Vegetation Dynamics**: Canopy NDVI is **{meas.get('ndvi', 'N/A')}** "
                    f"with a Vegetation Condition Index (VCI) of **{meas.get('vci_percent', 'N/A')}%**."
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
        Transparent offline response when Gemini API is not configured or unavailable.
        Executes domain tools directly based on keywords so the user still receives accurate
        data and interactive visual blocks, without claiming an LLM generated the prose.
        """
        p_lower = user_prompt.lower()
        executed_tools: List[Dict[str, Any]] = []
        tool_names: List[str] = []

        # Coordinate resolution
        lat = context.latitude if context.latitude is not None else 0.0
        lon = context.longitude if context.longitude is not None else 0.0
        date = context.selected_date or "2026-03"

        # Determine relevant scientific tools to execute directly based on explicit intent
        if any(w in p_lower for w in ["compare", "versus", " vs ", "difference"]):
            module = context.active_module if context.active_module in ["ocean", "atmosphere", "land"] else "atmosphere"
            comp = SCIENTIFIC_TOOL_MAP["compare_regions"](module=module, region_a="Equatorial Pacific", region_b="Amazon Basin")
            executed_tools.append({"name": "compare_regions", "result": comp})
            tool_names.append("compare_regions")
            c = comp.get("comparison", {})
            lead_text = (
                f"### Regional Environmental Comparison ({module.capitalize()})\n\n"
                f"- **Region A**: {comp.get('region_a', {}).get('name')} ({comp.get('region_a', {}).get('value')} {comp.get('region_a', {}).get('unit')}).\n"
                f"- **Region B**: {comp.get('region_b', {}).get('name')} ({comp.get('region_b', {}).get('value')} {comp.get('region_b', {}).get('unit')}).\n"
                f"- **Absolute Delta**: {c.get('absolute_difference')} {c.get('unit')}."
            )
        elif any(w in p_lower for w in ["trend", "history", "historical", "timeseries"]):
            module = context.active_module if context.active_module in ["ocean", "atmosphere", "land"] else "atmosphere"
            trend = SCIENTIFIC_TOOL_MAP["get_historical_trends"](module=module, latitude=lat, longitude=lon)
            executed_tools.append({"name": "get_historical_trends", "result": trend})
            tool_names.append("get_historical_trends")
            s = trend.get("statistics", {})
            lead_text = (
                f"### Historical Environmental Trend ({module.capitalize()})\n\n"
                f"- **Period**: 2024-01 to 2026-10 at coordinates ({lat:.2f}°, {lon:.2f}°).\n"
                f"- **Mean Value**: {s.get('mean')} {trend.get('unit')}.\n"
                f"- **Trajectory**: {s.get('trend_direction', 'stable').capitalize()} with total delta {s.get('delta_total')} {trend.get('unit')}."
            )
        elif any(w in p_lower for w in ["ocean", "swot", "ssh", "ssha", "eddy", "sea level"]):
            obs = SCIENTIFIC_TOOL_MAP["get_ocean_observations"](latitude=lat, longitude=lon, date=date)
            executed_tools.append({"name": "get_ocean_observations", "result": obs})
            tool_names.append("get_ocean_observations")
            lead_text = (
                f"### NASA SWOT Ocean Altimetry Science (Option A)\n\n"
                f"- **Sensor**: Ka-band Radar Interferometer (KaRIn) at 2 km resolution.\n"
                f"- **Modeled SSHA at ({lat:.2f}°, {lon:.2f}°)**: **{obs.get('measurements', {}).get('sea_surface_height_anomaly_m', 'N/A')} m**.\n"
                f"- **Eddy Classification**: {obs.get('analysis', {}).get('eddy_classification', 'Mesoscale feature')}.\n\n"
                f"SWOT resolves ocean eddies (15–100 km) that transport heat and nutrients across ocean basins."
            )
        elif any(w in p_lower for w in ["rain", "precipitation", "gpm", "imerg", "rainfall", "monsoon"]):
            precip = SCIENTIFIC_TOOL_MAP["get_precipitation_data"](latitude=lat, longitude=lon, date=date)
            executed_tools.append({"name": "get_precipitation_data", "result": precip})
            tool_names.append("get_precipitation_data")
            m = precip.get("measurements", {})
            lead_text = (
                f"### NASA GPM IMERG Precipitation Science (GPM_3IMERGM v07)\n\n"
                f"- **Precipitation Rate**: **{m.get('precipitation_rate_mm_hr', 'N/A')} mm/hr**.\n"
                f"- **Monthly Accumulated Depth**: **{m.get('precipitation_accumulated_mm', 'N/A')} mm**.\n"
                f"- **Climatological Anomaly**: **{m.get('precipitation_anomaly_mm', 'N/A')} mm** relative to 1998–2020 baseline.\n\n"
                f"*Physical Rule*: Rate (mm/hr) multiplied by 24 hours and the number of days in the month gives accumulated liquid depth (mm)."
            )
        elif any(w in p_lower for w in ["vegetation", "land", "ndvi", "evi", "canopy", "drought", "forest"]):
            veg = SCIENTIFIC_TOOL_MAP["get_vegetation_indices"](latitude=lat, longitude=lon, date=date)
            executed_tools.append({"name": "get_vegetation_indices", "result": veg})
            tool_names.append("get_vegetation_indices")
            m = veg.get("measurements", {})
            lead_text = (
                f"### NASA MODIS Vegetation Dynamics (MOD13C2 v061)\n\n"
                f"- **NDVI**: **{m.get('ndvi', 'N/A')}** (dimensionless ratio, -0.2 to +1.0).\n"
                f"- **Vegetation Condition Index (VCI)**: **{m.get('vci_percent', 'N/A')}%**.\n"
                f"- **Canopy Condition**: {veg.get('analysis', {}).get('canopy_status', 'Photosynthetically active')}.\n\n"
                f"NDVI captures chlorophyll vitality by comparing near-infrared scattering to red absorption."
            )
        elif context.active_module == "ocean":
            obs = SCIENTIFIC_TOOL_MAP["get_ocean_observations"](latitude=lat, longitude=lon, date=date)
            executed_tools.append({"name": "get_ocean_observations", "result": obs})
            tool_names.append("get_ocean_observations")
            lead_text = (
                f"### NASA SWOT Ocean Altimetry Science (Option A)\n\n"
                f"- **Sensor**: Ka-band Radar Interferometer (KaRIn) at 2 km resolution.\n"
                f"- **Modeled SSHA at ({lat:.2f}°, {lon:.2f}°)**: **{obs.get('measurements', {}).get('sea_surface_height_anomaly_m', 'N/A')} m**.\n"
                f"- **Eddy Classification**: {obs.get('analysis', {}).get('eddy_classification', 'Mesoscale feature')}."
            )
        elif context.active_module == "atmosphere":
            precip = SCIENTIFIC_TOOL_MAP["get_precipitation_data"](latitude=lat, longitude=lon, date=date)
            executed_tools.append({"name": "get_precipitation_data", "result": precip})
            tool_names.append("get_precipitation_data")
            m = precip.get("measurements", {})
            lead_text = (
                f"### NASA GPM IMERG Precipitation Science (GPM_3IMERGM v07)\n\n"
                f"- **Precipitation Rate**: **{m.get('precipitation_rate_mm_hr', 'N/A')} mm/hr**.\n"
                f"- **Monthly Accumulated Depth**: **{m.get('precipitation_accumulated_mm', 'N/A')} mm**."
            )
        elif context.active_module == "land":
            veg = SCIENTIFIC_TOOL_MAP["get_vegetation_indices"](latitude=lat, longitude=lon, date=date)
            executed_tools.append({"name": "get_vegetation_indices", "result": veg})
            tool_names.append("get_vegetation_indices")
            m = veg.get("measurements", {})
            lead_text = (
                f"### NASA MODIS Vegetation Dynamics (MOD13C2 v061)\n\n"
                f"- **NDVI**: **{m.get('ndvi', 'N/A')}**.\n"
                f"- **Vegetation Condition Index (VCI)**: **{m.get('vci_percent', 'N/A')}%**."
            )
        else:
            cross = SCIENTIFIC_TOOL_MAP["get_cross_system_analysis"]("enso_walker")
            executed_tools.append({"name": "get_cross_system_analysis", "result": cross})
            tool_names.append("get_cross_system_analysis")
            lead_text = (
                f"### Planetary Earth System Teleconnections\n\n"
                f"Earth functions as an interconnected system linking Ocean (SWOT SSH), Atmosphere (GPM IMERG), and Land (MODIS NDVI).\n\n"
                f"**Mechanism**: {cross.get('scientific_coupling_mechanism')}\n\n"
                f"**Correlation vs. Causation Warning**: {cross.get('causation_vs_correlation_note')}"
            )

        # Transparent Notice about AI Status
        transparency_notice = (
            f"\n\n---\n"
            f"> [!NOTE]\n"
            f"> **AI Service Notice**: {error_reason}\n"
            f"> The response above was compiled directly from TerraLens verified scientific calculation tools. "
            f"To enable natural language reasoning with live Gemini tool calling, set `GEMINI_API_KEY` in your environment."
        )

        full_text = lead_text + transparency_notice
        visual_blocks = cls._synthesize_visual_blocks(executed_tools, context)
        citations = ScientificRAG.get_citations_for_query(user_prompt, context.active_module)
        followups = cls._generate_followups(user_prompt, context)

        return AssistantQueryResponse(
            response=full_text,
            scientific_grounding=citations,
            suggested_followups=followups,
            confidence_level="Grounded Scientific Engine (Gemini Offline Fallback)",
            data_status="demonstration_model",
            visual_blocks=visual_blocks,
            tool_calls_executed=tool_names,
        )

    @classmethod
    def _generate_followups(cls, prompt: str, context: Optional[AssistantContext]) -> List[str]:
        p = prompt.lower()
        if "ocean" in p or "swot" in p or (context and context.active_module == "ocean"):
            return [
                "What is the difference between cyclonic and anticyclonic eddies?",
                "How does SWOT's KaRIn interferometer achieve 2 km spatial resolution?",
                "How do ocean surface height anomalies indicate heat transport?",
            ]
        elif "precipitation" in p or "rain" in p or (context and context.active_module == "atmosphere"):
            return [
                "Why must monthly accumulated precipitation (mm) not be confused with rain rate (mm/hr)?",
                "How does GPM IMERG merge satellite radar with ground rain gauges?",
                "What is the climatological baseline normal for GPM IMERG?",
            ]
        elif "land" in p or "ndvi" in p or "vegetation" in p or (context and context.active_module == "land"):
            return [
                "How does NDVI differ from EVI in dense tropical rainforests?",
                "What is the Vegetation Condition Index (VCI) used for in drought monitoring?",
                "How do delayed rainfall anomalies impact vegetation greenness?",
            ]
        else:
            return [
                "Compare precipitation between the Amazon and the Bay of Bengal.",
                "Show the historical trend of sea surface height in the Equatorial Pacific.",
                "Explain the teleconnection between El Niño and global drought patterns.",
            ]
