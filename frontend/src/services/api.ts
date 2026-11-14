const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000/api/v1';

export interface SystemHealth {
  status: string;
  service: string;
  version: string;
  environment: string;
  database: {
    status: string;
    connected: boolean;
    postgis_available: boolean;
    version?: string;
    message?: string;
  };
  scientific_modules: {
    ocean: string;
    atmosphere: string;
    land: string;
  };
}

export interface GeoJSONFeature {
  type: 'Feature';
  geometry: {
    type: string;
    coordinates: [number, number];
  };
  properties: Record<string, any>;
}

export interface GeoJSONFeatureCollection {
  type: 'FeatureCollection';
  features: GeoJSONFeature[];
  metadata: Record<string, any>;
}

export interface AtmosphereTimeSeriesPoint {
  date: string;
  precipitation_rate_mm_hr: number;
  precipitation_accumulated_mm: number;
  climatological_normal_mm: number;
  anomaly_mm: number;
}

export interface AtmosphereTimeSeriesResponse {
  dataset_id: string;
  dataset_name: string;
  location_name: string;
  latitude: number;
  longitude: number;
  unit_rate: string;
  unit_accumulation: string;
  summary_statistics: Record<string, any>;
  timeseries: AtmosphereTimeSeriesPoint[];
}

export interface OceanTimeSeriesPoint {
  date: string;
  ssha_mean_m: number;
  ssha_min_m: number;
  ssha_max_m: number;
  eddy_kinetic_energy_cm2_s2: number;
}

export interface OceanTimeSeriesResponse {
  dataset_id: string;
  dataset_name: string;
  region_name: string;
  latitude: number;
  longitude: number;
  unit_height: string;
  summary_statistics: Record<string, any>;
  timeseries: OceanTimeSeriesPoint[];
}

export interface LandTimeSeriesPoint {
  date: string;
  ndvi: number;
  evi: number;
  historical_ndvi_median: number;
  ndvi_anomaly: number;
}

export interface LandTimeSeriesResponse {
  dataset_id: string;
  dataset_name: string;
  region_name: string;
  latitude: number;
  longitude: number;
  unit: string;
  summary_statistics: Record<string, any>;
  timeseries: LandTimeSeriesPoint[];
}

export interface CrossSystemCorrelationPoint {
  date: string;
  ocean_ssha_m: number;
  atmosphere_precipitation_anomaly_mm: number;
  land_ndvi_anomaly: number;
  teleconnection_phase: string;
}

export interface CrossSystemResponse {
  phenomenon_name: string;
  description: string;
  primary_ocean_metric: string;
  primary_atmosphere_metric: string;
  primary_land_metric: string;
  scientific_coupling_mechanism: string;
  causation_vs_correlation_note: string;
  timeseries: CrossSystemCorrelationPoint[];
  key_insights: string[];
}

export interface ScientificCitation {
  dataset_id: string;
  mission: string;
  variable: string;
  units: string;
  doi_or_url: string;
}

export interface AssistantQueryResponse {
  response: string;
  scientific_grounding: ScientificCitation[];
  suggested_followups: string[];
  confidence_level: string;
}

export interface DatasetCatalogItem {
  id: string;
  module: string;
  name: string;
  agency: string;
  sensor: string;
  spatial_resolution: string;
  temporal_resolution: string;
  variables: Array<{ name: string; description: string; unit: string }>;
  units: string[];
  scientific_purpose: string;
  scientific_limitations: string[];
  cmr_concept_id: string;
  documentation_url: string;
}

// API methods
export const fetchSystemHealth = async (): Promise<SystemHealth> => {
  const res = await fetch(`${API_BASE_URL}/health`);
  if (!res.ok) throw new Error(`Health check failed: ${res.statusText}`);
  return res.json();
};

export const fetchAtmosphereGrid = async (date: string = '2026-03'): Promise<GeoJSONFeatureCollection> => {
  const res = await fetch(`${API_BASE_URL}/atmosphere/grid?date=${date}`);
  if (!res.ok) throw new Error(`Atmosphere grid failed: ${res.statusText}`);
  return res.json();
};

export const fetchAtmosphereTimeseries = async (
  lat: number,
  lon: number
): Promise<AtmosphereTimeSeriesResponse> => {
  const res = await fetch(`${API_BASE_URL}/atmosphere/timeseries?latitude=${lat}&longitude=${lon}`);
  if (!res.ok) throw new Error(`Atmosphere timeseries failed: ${res.statusText}`);
  return res.json();
};

export const fetchOceanObservations = async (date: string = '2026-03'): Promise<GeoJSONFeatureCollection> => {
  const res = await fetch(`${API_BASE_URL}/ocean/observations?date=${date}`);
  if (!res.ok) throw new Error(`Ocean observations failed: ${res.statusText}`);
  return res.json();
};

export const fetchOceanTimeseries = async (lat: number, lon: number): Promise<OceanTimeSeriesResponse> => {
  const res = await fetch(`${API_BASE_URL}/ocean/timeseries?latitude=${lat}&longitude=${lon}`);
  if (!res.ok) throw new Error(`Ocean timeseries failed: ${res.statusText}`);
  return res.json();
};

export const fetchLandGrid = async (date: string = '2026-03'): Promise<GeoJSONFeatureCollection> => {
  const res = await fetch(`${API_BASE_URL}/land/grid?date=${date}`);
  if (!res.ok) throw new Error(`Land grid failed: ${res.statusText}`);
  return res.json();
};

export const fetchLandTimeseries = async (lat: number, lon: number): Promise<LandTimeSeriesResponse> => {
  const res = await fetch(`${API_BASE_URL}/land/timeseries?latitude=${lat}&longitude=${lon}`);
  if (!res.ok) throw new Error(`Land timeseries failed: ${res.statusText}`);
  return res.json();
};

export const fetchCrossSystemAnalysis = async (phenomenonId: string = 'enso_walker'): Promise<CrossSystemResponse> => {
  const res = await fetch(`${API_BASE_URL}/cross-system/analysis?phenomenon_id=${phenomenonId}`);
  if (!res.ok) throw new Error(`Cross-system analysis failed: ${res.statusText}`);
  return res.json();
};

export const queryAssistant = async (
  prompt: string,
  context?: { active_module?: string; latitude?: number; longitude?: number; selected_date?: string; selected_region?: string }
): Promise<AssistantQueryResponse> => {
  const res = await fetch(`${API_BASE_URL}/assistant/query`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt, context }),
  });
  if (!res.ok) throw new Error(`Assistant query failed: ${res.statusText}`);
  return res.json();
};

export const fetchDatasetCatalog = async (): Promise<DatasetCatalogItem[]> => {
  const res = await fetch(`${API_BASE_URL}/datasets/`);
  if (!res.ok) throw new Error(`Dataset catalog failed: ${res.statusText}`);
  return res.json();
};
