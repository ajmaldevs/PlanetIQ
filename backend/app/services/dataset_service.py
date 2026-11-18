"""
Authoritative catalog service maintaining exact scientific provenance,
resolution, measurement units, and known limitations for all PlanetIQ modules.
Re-exports and leverages DatasetRepository.
"""

from typing import List, Optional
from app.schemas.scientific import DatasetCatalogItem
from app.repositories.dataset_repository import DatasetRepository


class DatasetService:
    """Service wrapper for dataset catalog operations."""

    CATALOG: List[DatasetCatalogItem] = DatasetRepository.CATALOG

    @classmethod
    def get_all_datasets(cls) -> List[DatasetCatalogItem]:
        return DatasetRepository.get_all()

    @classmethod
    def get_dataset_by_id(cls, dataset_id: str) -> Optional[DatasetCatalogItem]:
        return DatasetRepository.get_by_id(dataset_id)
