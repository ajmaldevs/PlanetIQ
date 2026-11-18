"""
NASA Earthdata & Common Metadata Repository (CMR) Client.
Re-exported from app.integrations.nasa.earthdata_client for backward compatibility.
"""

from app.integrations.nasa.earthdata_client import (
    NasaEarthdataClient,
    COLLECTION_CONCEPT_IDS,
    COLLECTION_SHORT_NAMES,
)

__all__ = ["NasaEarthdataClient", "COLLECTION_CONCEPT_IDS", "COLLECTION_SHORT_NAMES"]
