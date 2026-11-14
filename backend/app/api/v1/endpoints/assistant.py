from fastapi import APIRouter
from app.schemas.scientific import AssistantQueryRequest, AssistantQueryResponse
from app.services.assistant_service import AssistantService

router = APIRouter()


@router.post(
    "/query",
    response_model=AssistantQueryResponse,
    summary="Query AI Scientific Assistant (Gemini Grounded)"
)
async def query_assistant(request: AssistantQueryRequest):
    """
    Submits a natural language scientific question to the TerraLens AI Assistant.
    Provides context-grounded analysis of SWOT, GPM IMERG, MODIS NDVI,
    and cross-system Earth dynamics with scientific accuracy safeguards.
    """
    return await AssistantService.process_query(request)
