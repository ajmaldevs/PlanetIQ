from typing import List, Optional
from fastapi import APIRouter, HTTPException, Query
from app.schemas.scientific import DatasetCatalogItem
from app.services.dataset_service import DatasetService

router = APIRouter()


@router.get(
    "/",
    response_model=List[DatasetCatalogItem],
    summary="List All Approved Scientific Datasets"
)
def get_all_datasets():
    """
    Returns complete scientific catalog metadata, sensors, resolutions,
    units, processing methods, and known limitations for all TerraLens modules.
    """
    return DatasetService.get_all_datasets()


@router.get(
    "/{dataset_id}",
    response_model=DatasetCatalogItem,
    summary="Get Specific Dataset Metadata"
)
def get_dataset_by_id(dataset_id: str):
    """
    Retrieves full provenance, scientific variables, units, and documentation
    for a specific NASA dataset identifier (e.g. SWOT_L2_LR_SSH, GPM_3IMERGM, MOD13C2).
    """
    item = DatasetService.get_dataset_by_id(dataset_id)
    if not item:
        raise HTTPException(status_code=404, detail=f"Dataset with ID '{dataset_id}' not found in catalog.")
    return item
