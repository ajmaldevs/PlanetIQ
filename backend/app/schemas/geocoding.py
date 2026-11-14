from typing import List, Optional
from pydantic import BaseModel, Field


class GeocodingResult(BaseModel):
    id: str = Field(..., description="Unique geographic place identifier")
    name: str = Field(..., description="Common display name")
    formal_name: Optional[str] = Field(None, description="Official or administrative formal name")
    category: str = Field(..., description="Geographic category (Country, City, State, Ocean, Natural Feature)")
    level: int = Field(..., description="LOD hierarchy level (1: Global/Continent/Ocean, 2: Country, 3: State, 4: City/Town)")
    priority: int = Field(..., description="Rendering and search priority rank")
    latitude: float = Field(..., description="Representative latitude coordinate")
    longitude: float = Field(..., description="Representative longitude coordinate")
    bbox: Optional[List[float]] = Field(None, description="Bounding box [minLon, minLat, maxLon, maxLat]")
    iso_a2: Optional[str] = Field(None, description="ISO 3166-1 alpha-2 country code")
    iso_a3: Optional[str] = Field(None, description="ISO 3166-1 alpha-3 country code")
    parent_country: Optional[str] = Field(None, description="Parent country name")
    parent_state: Optional[str] = Field(None, description="Parent administrative division or state")
    parent_continent: Optional[str] = Field(None, description="Parent continent or ocean basin")
    population: Optional[int] = Field(None, description="Estimated population")
    detail: Optional[str] = Field(None, description="Administrative or scientific context")


class GeocodingSearchResponse(BaseModel):
    query: str
    total_results: int
    results: List[GeocodingResult]
