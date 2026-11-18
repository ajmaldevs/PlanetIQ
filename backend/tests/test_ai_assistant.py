"""
Comprehensive Test Suite for TerraLens AI Assistant & Scientific Grounding.
Tests:
- Scientific Tools (ocean, atmosphere, land, trends, comparisons, teleconnections, metadata, quality)
- Input Validation (coordinates, dates, bounding boxes)
- Scientific Analytics (unit conversions, percentage guards, anomaly detection, causality audit)
- Scientific RAG & Citations
- NASA Earthdata CMR Client
- AssistantService Offline Grounded Execution
- AssistantService Mock Gemini Tool Calling Loop
- FastAPI /api/v1/assistant/query endpoint
"""

import pytest
from unittest.mock import MagicMock, patch, AsyncMock
from fastapi.testclient import TestClient

from app.main import app
from app.schemas.scientific import (
    AssistantQueryRequest,
    AssistantContext,
)
from app.services.ai_tools import (
    get_ocean_observations,
    get_precipitation_data,
    get_vegetation_indices,
    get_historical_trends,
    compare_regions,
    get_cross_system_analysis,
    get_dataset_metadata,
    get_data_quality_information,
    _validate_lat_lon,
    _validate_date_str,
    _validate_bbox,
)
from app.services.scientific_analytics import ScientificAnalytics
from app.services.scientific_rag import ScientificRAG
from app.services.nasa_earthdata_client import NasaEarthdataClient
from app.services.assistant_service import AssistantService


client = TestClient(app)


# --- 1. Scientific Analytics & Physical Unit Tests ---

def test_precipitation_accumulation_math():
    """Verifies that accumulated depth (mm) = rate (mm/hr) * 24 * days."""
    rate = 0.25  # mm/hr
    # March has 31 days
    accum_mar = ScientificAnalytics.calculate_accumulated_precipitation(rate, 2026, 3)
    assert accum_mar == round(0.25 * 24 * 31, 2)
    assert accum_mar == 186.0

    # April has 30 days
    accum_apr = ScientificAnalytics.calculate_accumulated_precipitation(rate, 2026, 4)
    assert accum_apr == round(0.25 * 24 * 30, 2)
    assert accum_apr == 180.0

    # Converting back to rate
    calc_rate = ScientificAnalytics.calculate_precipitation_rate(accum_mar, 2026, 3)
    assert calc_rate == rate


def test_percentage_change_safeguards():
    """Verifies percentage change safeguards against division by near-zero baseline."""
    # Near zero baseline (< 1.0 mm)
    res_zero = ScientificAnalytics.compute_difference_and_percentage(
        value_a=0.2, value_b=4.5, metric_name="Rainfall", unit="mm"
    )
    assert res_zero["percentage_meaningful"] is False
    assert res_zero["percentage_difference"] is None
    assert "near zero" in res_zero["percentage_note"]
    assert res_zero["absolute_difference"] == 4.3

    # Meaningful baseline
    res_valid = ScientificAnalytics.compute_difference_and_percentage(
        value_a=100.0, value_b=150.0, metric_name="Rainfall", unit="mm"
    )
    assert res_valid["percentage_meaningful"] is True
    assert res_valid["percentage_difference"] == 50.0
    assert res_valid["absolute_difference"] == 50.0


def test_correlation_vs_causation_audit():
    """Verifies that claims of direct teleconnection causality are flagged with scientific caveats."""
    causal_text = "The Pacific warming caused the drought directly in the Amazon."
    audit = ScientificAnalytics.audit_correlation_vs_causation(causal_text)
    assert audit is not None
    assert "SCIENTIFIC NOTICE ON TELECONNECTIONS" in audit
    assert "planetary wave coupling" in audit

    benign_text = "Pacific sea level anomalies correlate with atmospheric circulation patterns."
    assert ScientificAnalytics.audit_correlation_vs_causation(benign_text) is None


# --- 2. Tool Parameter Validation Tests ---

def test_tool_input_validation():
    """Tests coordinate, date, and bounding box validation."""
    assert _validate_lat_lon(95.0, 0.0) is not None
    assert _validate_lat_lon(-95.0, 0.0) is not None
    assert _validate_lat_lon(0.0, 190.0) is not None
    assert _validate_lat_lon(45.0, -120.0) is None

    assert _validate_date_str("2026-13") is not None
    assert _validate_date_str("invalid") is not None
    assert _validate_date_str("2026-03") is None

    assert _validate_bbox(min_lat=50.0, max_lat=20.0, min_lon=0.0, max_lon=10.0) is not None
    assert _validate_bbox(min_lat=-10.0, max_lat=10.0, min_lon=-20.0, max_lon=20.0) is None


# --- 3. Scientific Tools Execution Tests ---

def test_tool_get_ocean_observations():
    """Tests SWOT & MODIS Aqua ocean observations tool."""
    res = get_ocean_observations(latitude=36.0, longitude=-68.0, date="2026-03")
    assert res["status"] == "success"
    assert "SWOT" in res["dataset_id"]
    assert "sea_surface_height_anomaly_m" in res["measurements"]
    assert "chlorophyll_a_mg_m3" in res["measurements"]
    assert "sea_surface_temp_celsius" in res["measurements"]
    assert "eddy_classification" in res["analysis"]
    assert res["data_status"] in ("observation", "simulated")

    # Region query
    res_reg = get_ocean_observations(region="Arabian Sea")
    assert res_reg["status"] == "success"
    assert "Arabian Sea" in res_reg["region_name"]
    assert res_reg["measurements"]["chlorophyll_a_mg_m3"] is not None

    # Spatial query
    res_spatial = get_ocean_observations(min_lat=20.0, max_lat=40.0, min_lon=-80.0, max_lon=-50.0)
    assert res_spatial["status"] == "success"
    assert "summary" in res_spatial


def test_tool_get_precipitation_data():
    """Tests GPM IMERG precipitation data tool."""
    res = get_precipitation_data(latitude=-3.1, longitude=-60.0, date="2026-03")
    assert res["status"] == "success"
    assert res["dataset_id"] == "GPM_3IMERGM"
    assert "precipitation_rate_mm_hr" in res["measurements"]
    assert "precipitation_accumulated_mm" in res["measurements"]
    assert "precipitation_anomaly_mm" in res["measurements"]
    assert res["units"]["rate"] == "mm/hr"
    assert res["units"]["accumulated"] == "mm (total liquid depth)"


def test_tool_get_vegetation_indices():
    """Tests MODIS vegetation indices tool."""
    res = get_vegetation_indices(latitude=0.5, longitude=23.5, date="2026-03")
    assert res["status"] == "success"
    assert res["dataset_id"] == "MOD13C2"
    assert "ndvi" in res["measurements"]
    assert "vci_percent" in res["measurements"]
    assert -0.2 <= res["measurements"]["ndvi"] <= 1.0


def test_tool_get_historical_trends():
    """Tests multi-year historical trend calculation."""
    res = get_historical_trends(module="ocean", latitude=36.0, longitude=-68.0, start_date="2024-01", end_date="2026-10")
    assert res["status"] == "success"
    assert len(res["timeseries"]) > 10
    assert "trend_direction" in res["statistics"]
    assert "delta_total" in res["statistics"]


def test_tool_compare_regions():
    """Tests regional comparison tool."""
    res = compare_regions(module="atmosphere", region_a="Amazon", region_b="Sahel", date="2026-03")
    assert res["status"] == "success"
    assert "region_a" in res
    assert "region_b" in res
    assert "absolute_difference" in res["comparison"]


def test_tool_cross_system_analysis():
    """Tests coupled teleconnection analysis."""
    res = get_cross_system_analysis("enso_walker")
    assert res["status"] == "success"
    assert "causation_vs_correlation_note" in res
    assert len(res["timeline_sample"]) > 0


def test_tool_dataset_metadata_and_quality():
    """Tests dataset metadata catalog and data quality information."""
    meta = get_dataset_metadata("SWOT_L2_LR_SSH")
    assert meta["status"] == "success"
    assert meta["cmr_concept_id"] == "C3233945000-POCLOUD"

    qual = get_data_quality_information("SWOT_L2_LR_SSH")
    assert qual["status"] == "success"
    assert qual["data_status"] == "simulated"
    assert "scientific_limitations" in qual


# --- 4. Scientific RAG & Citations Tests ---

def test_scientific_rag_retrieval():
    """Tests RAG search and citation generation."""
    citations = ScientificRAG.get_citations_for_query("How does SWOT KaRIn measure eddies?")
    assert len(citations) >= 1
    swot_cit = next((c for c in citations if c.dataset_id == "SWOT_L2_LR_SSH"), None)
    assert swot_cit is not None
    assert "podaac" in swot_cit.doi_or_url or "doi.org" in swot_cit.doi_or_url


# --- 5. NASA Earthdata Client Tests ---

def test_nasa_earthdata_client_auth_status():
    """Verifies that NASA Earthdata authentication readiness is accurately reported."""
    status = NasaEarthdataClient.get_auth_status()
    assert "authenticated" in status
    assert "cmr_public_search_available" in status
    assert status["cmr_public_search_available"] is True


@pytest.mark.asyncio
async def test_nasa_earthdata_mock_granule_search():
    """Tests CMR search with mocked httpx response."""
    mock_cmr_payload = {
        "feed": {
            "entry": [
                {
                    "id": "G12345678-POCLOUD",
                    "title": "SWOT_L2_LR_SSH_Expert_032_014_20260301.nc",
                    "time_start": "2026-03-01T00:00:00Z",
                    "time_end": "2026-03-01T00:58:00Z",
                    "granule_size": "42.5",
                    "links": [{"href": "https://data.podaac.earthdata.nasa.gov/swot.nc"}],
                }
            ]
        }
    }

    with patch("httpx.AsyncClient.get", new_callable=AsyncMock) as mock_get:
        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.json.return_value = mock_cmr_payload
        mock_get.return_value = mock_resp

        res = await NasaEarthdataClient.search_granules("SWOT_L2_LR_SSH")
        assert res["status"] == "success"
        assert res["granules_found"] == 1
        assert res["granules"][0]["id"] == "G12345678-POCLOUD"


# --- 6. AssistantService Tests (Offline Grounded Fallback) ---

@pytest.mark.asyncio
async def test_assistant_offline_fallback():
    """Tests the transparent offline assistant execution when GEMINI_API_KEY is not configured."""
    with patch("app.core.config.settings.GEMINI_API_KEY", ""):
        req = AssistantQueryRequest(
            prompt="What is the precipitation in the Amazon?",
            context=AssistantContext(active_module="atmosphere", latitude=-3.1, longitude=-60.0),
        )
        res = await AssistantService.process_query(req)

        assert res.data_status in ("observation", "simulated")
        assert "Grounded Scientific Engine" in res.confidence_level
        assert "get_precipitation_data" in res.tool_calls_executed
        assert len(res.visual_blocks) >= 1
        assert any(b["type"] == "metric_card" for b in res.visual_blocks)
        assert any(b["type"] == "data_quality" for b in res.visual_blocks)
        assert len(res.scientific_grounding) > 0


# --- 7. AssistantService Mock Gemini Tool Calling Loop ---

@pytest.mark.asyncio
async def test_assistant_mock_gemini_tool_loop():
    """Tests the controlled Gemini tool execution loop with mocked google.genai Client."""
    from google.genai import types

    # Mock tool call request from Gemini
    mock_call = types.FunctionCall(
        name="get_ocean_observations",
        args={"latitude": 36.0, "longitude": -68.0, "date": "2026-03"},
    )
    mock_candidate_1 = types.Candidate(
        content=types.Content(role="model", parts=[types.Part(function_call=mock_call)])
    )
    mock_resp_1 = MagicMock()
    mock_resp_1.function_calls = [mock_call]
    mock_resp_1.candidates = [mock_candidate_1]
    mock_resp_1.text = None

    # Mock final synthesis response from Gemini
    mock_candidate_2 = types.Candidate(
        content=types.Content(
            role="model",
            parts=[types.Part.from_text(text="SWOT KaRIn altimetry reveals Sea Surface Height Anomaly of +0.35 m in the Gulf Stream.")],
        )
    )
    mock_resp_2 = MagicMock()
    mock_resp_2.function_calls = []
    mock_resp_2.candidates = [mock_candidate_2]
    mock_resp_2.text = "SWOT KaRIn altimetry reveals Sea Surface Height Anomaly of +0.35 m in the Gulf Stream."

    mock_client = MagicMock()
    mock_client.models.generate_content.side_effect = [mock_resp_1, mock_resp_2]

    with patch("google.genai.Client", return_value=mock_client), \
         patch("app.core.config.settings.GEMINI_API_KEY", "test_gemini_api_key_valid_long_secret"):

        req = AssistantQueryRequest(
            prompt="Tell me about the ocean eddies in the Gulf Stream.",
            context=AssistantContext(active_module="ocean", latitude=36.0, longitude=-68.0),
        )
        res = await AssistantService.process_query(req)

        assert "get_ocean_observations" in res.tool_calls_executed
        assert "SWOT KaRIn altimetry reveals" in res.response
        assert any(b["type"] == "metric_card" for b in res.visual_blocks)
        assert len(res.scientific_grounding) > 0


# --- 8. FastAPI Assistant Endpoint Test ---

def test_api_assistant_query_endpoint():
    """Tests POST /api/v1/assistant/query endpoint."""
    with patch("app.core.config.settings.GEMINI_API_KEY", ""):
        payload = {
            "prompt": "Show historical trends of vegetation in the Congo basin",
            "context": {
                "active_module": "land",
                "latitude": 0.5,
                "longitude": 23.5,
                "selected_date": "2026-03",
            },
            "history": [
                {"role": "user", "content": "Hello TerraLens"},
                {"role": "assistant", "content": "Welcome to TerraLens!"},
            ],
        }
        response = client.post("/api/v1/assistant/query", json=payload)
        assert response.status_code == 200
        data = response.json()
        assert "response" in data
        assert "scientific_grounding" in data
        assert "suggested_followups" in data
        assert "visual_blocks" in data
        assert "tool_calls_executed" in data
        assert data["data_status"] in ["observation", "simulated", "unavailable", "demonstration_model"]


# --- 9. Intent Routing, Safeguards & Error Masking Tests ---

def test_intent_router_ocean_overrides_land_module():
    """Verifies that an Ocean question (chlorophyll, SST) overrides an active Land viewport module."""
    prompt = "What is the chlorophyll-a concentration and sea surface temperature in the Arabian Sea?"
    intent = AssistantService._detect_domain_intent(prompt, active_module="land")
    assert intent == "ocean"

    # Verify atmosphere keywords override active land module
    prompt_rain = "How much rain fell during the monsoon?"
    intent_rain = AssistantService._detect_domain_intent(prompt_rain, active_module="land")
    assert intent_rain == "atmosphere"

    # Verify land prompt returns land
    prompt_land = "Analyze crop canopy greenness and drought in Punjab"
    intent_land = AssistantService._detect_domain_intent(prompt_land, active_module="ocean")
    assert intent_land == "land"


@pytest.mark.asyncio
async def test_ocean_question_on_land_viewport_offline():
    """
    Critical regression test:
    When user asks about Arabian Sea chlorophyll/SST while viewport is on Land (Punjab),
    the assistant MUST call get_ocean_observations, NOT get_vegetation_indices.
    """
    with patch("app.core.config.settings.GEMINI_API_KEY", ""):
        req = AssistantQueryRequest(
            prompt="What is the chlorophyll-a concentration and sea surface temperature in the Arabian Sea?",
            context=AssistantContext(active_module="land", selected_region="Punjab", latitude=30.9, longitude=75.8),
        )
        res = await AssistantService.process_query(req)

        assert "get_ocean_observations" in res.tool_calls_executed
        assert "get_vegetation_indices" not in res.tool_calls_executed
        assert "Chlorophyll-a" in res.response
        assert "NDVI" not in res.response
        assert "GEMINI_API_KEY" not in res.response
        assert "> [!NOTE]" in res.response


def test_tool_argument_type_coercion():
    """Verifies that string coordinates and hemisphere signs are safely coerced without TypeErrors."""
    res = get_ocean_observations(latitude="16.0°N", longitude="64.0°E", date="2026-03")
    assert res["status"] == "success"
    assert res["location"]["latitude"] == 16.0
    assert res["location"]["longitude"] == 64.0

    res_veg = get_vegetation_indices(latitude="30.9", longitude="75.8", date="2026-03-15")
    assert res_veg["status"] == "success"
    assert res_veg["location"]["latitude"] == 30.9

