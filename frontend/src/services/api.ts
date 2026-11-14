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

export interface SystemInfo {
  project_name: string;
  version: string;
  environment: string;
  docs_url: string;
  api_prefix: string;
  nasa_cmr_endpoint: string;
  gemini_model: string;
}

export const fetchSystemHealth = async (): Promise<SystemHealth> => {
  const response = await fetch(`${API_BASE_URL}/health`);
  if (!response.ok) {
    throw new Error(`Health check failed: ${response.statusText}`);
  }
  return response.json();
};

export const fetchSystemInfo = async (): Promise<SystemInfo> => {
  const response = await fetch(`${API_BASE_URL}/system-info`);
  if (!response.ok) {
    throw new Error(`System info request failed: ${response.statusText}`);
  }
  return response.json();
};
