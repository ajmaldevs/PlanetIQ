/**
 * Resolves the active backend API base URL.
 * Automatically adapts across:
 * 1. Explicit Vite environment variable (VITE_API_BASE_URL)
 * 2. Mobile/Tablet devices on LAN IP (e.g. http://192.168.1.5:8000/api/v1)
 * 3. Production same-origin reverse-proxy (/api/v1)
 * 4. Local desktop development fallback (http://localhost:8000/api/v1)
 */
export function getApiBaseUrl(): string {
  const envUrl = import.meta.env.VITE_API_BASE_URL;
  if (envUrl && typeof envUrl === 'string' && envUrl.trim() !== '') {
    return envUrl.trim().replace(/\/+$/, '');
  }

  if (typeof window !== 'undefined' && window.location) {
    const { hostname, protocol, port, origin } = window.location;

    // Production reverse-proxy deployment on standard web ports
    if (!port || port === '80' || port === '443') {
      return `${origin}/api/v1`;
    }

    // Accessing Vite dev server over local network IP (e.g. phone or secondary laptop)
    if (hostname && hostname !== 'localhost' && hostname !== '127.0.0.1') {
      return `${protocol}//${hostname}:8000/api/v1`;
    }
  }

  return 'http://localhost:8000/api/v1';
}

export const API_BASE_URL = getApiBaseUrl();

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

// In-memory cache with TTL and in-flight request deduplication for high-performance responsive browsing
interface CacheEntry<T> {
  data: T;
  timestamp: number;
}
const apiCache = new Map<string, CacheEntry<any>>();
const inFlightRequests = new Map<string, Promise<any>>();
const DEFAULT_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

export function clearApiCache(): void {
  apiCache.clear();
  inFlightRequests.clear();
}

/**
 * Wraps a promise with an AbortSignal so the caller rejects with AbortError
 * immediately upon abort without terminating shared underlying network requests.
 */
function wrapWithSignal<T>(promise: Promise<T>, signal?: AbortSignal | null): Promise<T> {
  if (!signal) return promise;
  if (signal.aborted) {
    return Promise.reject(new DOMException('The operation was aborted.', 'AbortError'));
  }
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => {
      reject(new DOMException('The operation was aborted.', 'AbortError'));
    };
    signal.addEventListener('abort', onAbort, { once: true });
    promise.then(
      val => {
        signal.removeEventListener('abort', onAbort);
        resolve(val);
      },
      err => {
        signal.removeEventListener('abort', onAbort);
        reject(err);
      }
    );
  });
}

async function cachedFetchJson<T>(
  url: string,
  options?: RequestInit,
  ttlMs = DEFAULT_CACHE_TTL_MS
): Promise<T> {
  const isGet = !options || !options.method || options.method.toUpperCase() === 'GET';
  const cacheKey = url;
  const consumerSignal = options?.signal;

  if (isGet) {
    const cached = apiCache.get(cacheKey);
    if (cached && performance.now() - cached.timestamp < ttlMs) {
      if (consumerSignal?.aborted) {
        throw new DOMException('The operation was aborted.', 'AbortError');
      }
      return cached.data as T;
    }

    if (inFlightRequests.has(cacheKey)) {
      const inFlightPromise = inFlightRequests.get(cacheKey) as Promise<T>;
      return wrapWithSignal(inFlightPromise, consumerSignal);
    }
  }

  // Strip consumer-specific signal from network options for shared GET requests so one consumer aborting
  // does not cancel the shared fetch for other callers or future cache hits.
  const fetchOptions = isGet && options ? { ...options, signal: undefined } : options;

  const promise = (async () => {
    try {
      const res = await fetch(url, fetchOptions);
      if (!res.ok) throw new Error(`HTTP error ${res.status}: ${res.statusText}`);
      const data = await res.json();
      if (isGet) {
        apiCache.set(cacheKey, { data, timestamp: performance.now() });
      }
      return data as T;
    } finally {
      if (isGet) {
        inFlightRequests.delete(cacheKey);
      }
    }
  })();

  if (isGet) {
    inFlightRequests.set(cacheKey, promise);
  }

  return wrapWithSignal(promise, consumerSignal);
}

// API methods with AbortSignal cancellation support for responsive race-free data updates
export const fetchSystemHealth = async (signal?: AbortSignal): Promise<SystemHealth> => {
  const res = await fetch(`${API_BASE_URL}/health`, { signal });
  if (!res.ok) throw new Error(`Health check failed: ${res.statusText}`);
  return res.json();
};

export const fetchAtmosphereGrid = async (
  date: string = '2026-03',
  signal?: AbortSignal
): Promise<GeoJSONFeatureCollection> => {
  return cachedFetchJson<GeoJSONFeatureCollection>(
    `${API_BASE_URL}/atmosphere/grid?date=${date}`,
    { signal }
  );
};

export const fetchAtmosphereTimeseries = async (
  lat: number,
  lon: number,
  signal?: AbortSignal
): Promise<AtmosphereTimeSeriesResponse> => {
  const rLat = Number(lat.toFixed(4));
  const rLon = Number(lon.toFixed(4));
  return cachedFetchJson<AtmosphereTimeSeriesResponse>(
    `${API_BASE_URL}/atmosphere/timeseries?latitude=${rLat}&longitude=${rLon}`,
    { signal }
  );
};

export const fetchOceanObservations = async (
  date: string = '2026-03',
  signal?: AbortSignal
): Promise<GeoJSONFeatureCollection> => {
  return cachedFetchJson<GeoJSONFeatureCollection>(
    `${API_BASE_URL}/ocean/observations?date=${date}`,
    { signal }
  );
};

export const fetchOceanTimeseries = async (
  lat: number,
  lon: number,
  signal?: AbortSignal
): Promise<OceanTimeSeriesResponse> => {
  const rLat = Number(lat.toFixed(4));
  const rLon = Number(lon.toFixed(4));
  return cachedFetchJson<OceanTimeSeriesResponse>(
    `${API_BASE_URL}/ocean/timeseries?latitude=${rLat}&longitude=${rLon}`,
    { signal }
  );
};

export const fetchLandGrid = async (
  date: string = '2026-03',
  signal?: AbortSignal
): Promise<GeoJSONFeatureCollection> => {
  return cachedFetchJson<GeoJSONFeatureCollection>(
    `${API_BASE_URL}/land/grid?date=${date}`,
    { signal }
  );
};

export const fetchLandTimeseries = async (
  lat: number,
  lon: number,
  signal?: AbortSignal
): Promise<LandTimeSeriesResponse> => {
  const rLat = Number(lat.toFixed(4));
  const rLon = Number(lon.toFixed(4));
  return cachedFetchJson<LandTimeSeriesResponse>(
    `${API_BASE_URL}/land/timeseries?latitude=${rLat}&longitude=${rLon}`,
    { signal }
  );
};

export const fetchCrossSystemAnalysis = async (
  phenomenonId: string = 'enso_walker',
  signal?: AbortSignal
): Promise<CrossSystemResponse> => {
  return cachedFetchJson<CrossSystemResponse>(
    `${API_BASE_URL}/cross-system/analysis?phenomenon_id=${phenomenonId}`,
    { signal }
  );
};

export const queryAssistant = async (
  prompt: string,
  context?: { active_module?: string; latitude?: number; longitude?: number; selected_date?: string; selected_region?: string },
  signal?: AbortSignal
): Promise<AssistantQueryResponse> => {
  const res = await fetch(`${API_BASE_URL}/assistant/query`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt, context }),
    signal,
  });
  if (!res.ok) throw new Error(`Assistant query failed: ${res.statusText}`);
  return res.json();
};

export const fetchDatasetCatalog = async (signal?: AbortSignal): Promise<DatasetCatalogItem[]> => {
  return cachedFetchJson<DatasetCatalogItem[]>(
    `${API_BASE_URL}/datasets/`,
    { signal },
    15 * 60 * 1000 // 15 mins TTL for static catalog
  );
};

export interface ConnectionCheckResult {
  connected: boolean;
  endpoint: string;
  error?: string;
  latencyMs?: number;
}

export const checkBackendConnection = async (): Promise<ConnectionCheckResult> => {
  const start = performance.now();
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 4000);
    const res = await fetch(`${API_BASE_URL}/health`, { signal: controller.signal });
    clearTimeout(timeoutId);
    if (res.ok) {
      return {
        connected: true,
        endpoint: API_BASE_URL,
        latencyMs: Math.round(performance.now() - start),
      };
    }
    return {
      connected: false,
      endpoint: API_BASE_URL,
      error: `Server responded with ${res.status}: ${res.statusText}`,
    };
  } catch (err: any) {
    return {
      connected: false,
      endpoint: API_BASE_URL,
      error: err.name === 'AbortError' ? 'Connection timed out (4s)' : err.message || 'Network unreachable',
    };
  }
};
