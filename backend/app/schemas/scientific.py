from typing import List, Optional, Dict, Any
from pydantic import BaseModel, Field


# --- Shared Geospatial Schemas ---

class GeoPoint(BaseModel):
    latitude: float = Field(..., ge=-90.0, le=90.0)
    longitude: float = Field(..., ge=-180.0, le=180.0)


class GeoBoundingBox(BaseModel):
    min_latitude: float = Field(..., ge=-90.0, le=90.0)
    max_latitude: float = Field(..., ge=-90.0, le=90.0)
    min_longitude: float = Field(..., ge=-180.0, le=180.0)
    max_longitude: float = Field(..., ge=-180.0, le=180.0)


class GeoJSONGeometry(BaseModel):
    type: str = "Point"
    coordinates: Any


class GeoJSONFeature(BaseModel):
    type: str = "Feature"
    geometry: GeoJSONGeometry
    properties: Dict[str, Any]


class GeoJSONFeatureCollection(BaseModel):
    type: str = "FeatureCollection"
    features: List[GeoJSONFeature]
    metadata: Dict[str, Any] = Field(default_factory=dict)


# --- Atmosphere (GPM IMERG) Schemas ---

class PrecipitationGridPoint(BaseModel):
    latitude: float
    longitude: float
    precipitation_rate_mm_hr: float = Field(
        ...,
        description="Instantaneous precipitation rate averaged across the month (mm/hr)"
    )
    precipitation_accumulated_mm: float = Field(
        ...,
        description="Total accumulated precipitation for the month (mm). Calculated as rate * 24h * days"
    )
    climatological_normal_mm: float = Field(
        ...,
        description="Historical 1998-2020 climatological mean for this calendar month (mm)"
    )
    anomaly_mm: float = Field(
        ...,
        description="Departure from climatological normal (mm)"
    )
    quality_index: float = Field(
        ..., ge=0.0, le=1.0,
        description="IMERG gauge weighting / sensor quality index (0.0 to 1.0)"
    )


class AtmosphereTimeSeriesPoint(BaseModel):
    date: str = Field(..., description="YYYY-MM")
    precipitation_rate_mm_hr: float
    precipitation_accumulated_mm: float
    climatological_normal_mm: float
    anomaly_mm: float


class AtmosphereTimeSeriesResponse(BaseModel):
    data_status: str = "demonstration_model"
    is_observation: bool = False
    dataset_id: str = "GPM_3IMERGM"
    dataset_name: str = "GPM IMERG Final Monthly Precipitation"
    location_name: Optional[str] = None
    latitude: float
    longitude: float
    unit_rate: str = "mm/hr"
    unit_accumulation: str = "mm"
    summary_statistics: Dict[str, Any]
    timeseries: List[AtmosphereTimeSeriesPoint]


# --- Ocean (SWOT KaRIn SSH) Schemas ---

class OceanObservationPoint(BaseModel):
    latitude: float
    longitude: float
    ssh_karin_m: float = Field(..., description="Sea Surface Height relative to WGS84 ellipsoid (meters)")
    ssha_karin_m: float = Field(..., description="Sea Surface Height Anomaly relative to Mean Sea Surface (meters)")
    dynamic_topography_m: float = Field(..., description="Absolute Dynamic Topography (meters)")
    eddy_type: Optional[str] = Field(None, description="Meso-scale eddy classification: 'cyclonic', 'anticyclonic', or 'neutral'")
    measurement_uncertainty_m: float = Field(..., description="Estimated instrument error margin in meters")
    track_pass_id: str = Field(..., description="SWOT orbit revolution / track pass ID")


class OceanTimeSeriesPoint(BaseModel):
    date: str = Field(..., description="YYYY-MM")
    ssha_mean_m: float
    ssha_min_m: float
    ssha_max_m: float
    eddy_kinetic_energy_cm2_s2: float


class OceanTimeSeriesResponse(BaseModel):
    data_status: str = "demonstration_model"
    is_observation: bool = False
    dataset_id: str = "SWOT_L2_LR_SSH"
    dataset_name: str = "SWOT KaRIn Ocean Sea Surface Height (Option A)"
    region_name: str
    latitude: float
    longitude: float
    unit_height: str = "meters (m)"
    summary_statistics: Dict[str, Any]
    timeseries: List[OceanTimeSeriesPoint]


# --- Land (MODIS MOD13C2 NDVI) Schemas ---

class LandObservationPoint(BaseModel):
    latitude: float
    longitude: float
    ndvi: float = Field(..., ge=-0.2, le=1.0, description="Normalized Difference Vegetation Index (-0.2 to 1.0)")
    evi: float = Field(..., ge=-0.2, le=1.0, description="Enhanced Vegetation Index (-0.2 to 1.0)")
    vci_percent: float = Field(..., ge=0.0, le=100.0, description="Vegetation Condition Index (%)")
    drought_category: str = Field(..., description="Classification: Extreme Stress, Moderate Stress, Normal, Lush")
    land_cover_type: str = Field(..., description="IGBP Land Cover classification")


class LandTimeSeriesPoint(BaseModel):
    date: str = Field(..., description="YYYY-MM")
    ndvi: float
    evi: float
    historical_ndvi_median: float
    ndvi_anomaly: float


class LandTimeSeriesResponse(BaseModel):
    data_status: str = "demonstration_model"
    is_observation: bool = False
    dataset_id: str = "MOD13C2"
    dataset_name: str = "MODIS Monthly Global Vegetation Indices"
    region_name: str
    latitude: float
    longitude: float
    unit: str = "dimensionless index (-0.2 to 1.0)"
    summary_statistics: Dict[str, Any]
    timeseries: List[LandTimeSeriesPoint]


# --- Cross-System Teleconnection Schemas ---

class CrossSystemCorrelationPoint(BaseModel):
    date: str
    ocean_ssha_m: float
    atmosphere_precipitation_anomaly_mm: float
    land_ndvi_anomaly: float
    teleconnection_phase: str


class CrossSystemResponse(BaseModel):
    data_status: str = "demonstration_model"
    is_observation: bool = False
    phenomenon_name: str
    description: str
    primary_ocean_metric: str
    primary_atmosphere_metric: str
    primary_land_metric: str
    scientific_coupling_mechanism: str
    causation_vs_correlation_note: str
    timeseries: List[CrossSystemCorrelationPoint]
    key_insights: List[str]


# --- AI Assistant Schemas ---

class AssistantMessage(BaseModel):
    role: str = Field(..., description="'user' or 'assistant' or 'system'")
    content: str


class AssistantContext(BaseModel):
    active_module: Optional[str] = "overview"  # ocean | atmosphere | land | cross-system
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    selected_date: Optional[str] = None
    selected_region: Optional[str] = None


class AssistantQueryRequest(BaseModel):
    prompt: str = Field(..., min_length=2, max_length=1500)
    context: Optional[AssistantContext] = Field(default_factory=AssistantContext)
    history: Optional[List[AssistantMessage]] = Field(default_factory=list)


class ScientificCitation(BaseModel):
    dataset_id: str
    mission: str
    variable: str
    units: str
    doi_or_url: str


class AssistantQueryResponse(BaseModel):
    response: str
    scientific_grounding: List[ScientificCitation]
    suggested_followups: List[str]
    confidence_level: str = "High (NASA Earth Science Grounded)"


# --- Dataset Documentation Schemas ---

class DatasetCatalogItem(BaseModel):
    id: str
    module: str
    name: str
    agency: str
    sensor: str
    spatial_resolution: str
    temporal_resolution: str
    variables: List[Dict[str, str]]
    units: List[str]
    scientific_purpose: str
    scientific_limitations: List[str]
    cmr_concept_id: str
    documentation_url: str


# --- Historical Period Comparison Schemas ---

class PeriodObservation(BaseModel):
    date: str
    value: float
    unit: str
    normal_or_baseline: Optional[float] = None
    anomaly: Optional[float] = None
    metadata: Dict[str, Any] = Field(default_factory=dict)


class RegionalDiffPoint(BaseModel):
    name: str
    latitude: float
    longitude: float
    value_a: float
    value_b: float
    delta: float
    unit: str
    interpretation: Optional[str] = None


class PeriodComparisonResponse(BaseModel):
    data_status: str = "demonstration_model"
    is_observation: bool = False
    module: str
    period_a: str
    period_b: str
    location_name: str
    latitude: float
    longitude: float
    unit: str
    metric_label: str
    observation_a: PeriodObservation
    observation_b: PeriodObservation
    absolute_difference: float
    percentage_difference: Optional[float] = None
    percentage_meaningful: bool = True
    percentage_note: Optional[str] = None
    interpretation: str
    regional_differences: List[RegionalDiffPoint] = Field(default_factory=list)

