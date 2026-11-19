import * as THREE from 'three';

export type ZoomLevel = 'global' | 'continental' | 'country' | 'regional';

export interface GeographicContext {
  level: ZoomLevel;
  title: string;
  subtitle: string;
  continent: string;
  country?: string;
  region?: string;
  lat: number;
  lon: number;
  spatialResolution: string;
  coverageNote: string;
}

interface PlaceNode {
  name: string;
  lat: number;
  lon: number;
  type: 'continent' | 'basin' | 'country' | 'sea' | 'region' | 'city';
  parentContinent: string;
  parentCountry?: string;
}

const PLACES_DB: PlaceNode[] = [
  // Continents & Ocean Basins (Level 1-2)
  { name: 'North America', lat: 46.0, lon: -100.0, type: 'continent', parentContinent: 'North America' },
  { name: 'South America', lat: -16.0, lon: -60.0, type: 'continent', parentContinent: 'South America' },
  { name: 'Europe', lat: 52.0, lon: 16.0, type: 'continent', parentContinent: 'Europe' },
  { name: 'Africa', lat: 4.0, lon: 20.0, type: 'continent', parentContinent: 'Africa' },
  { name: 'Asia', lat: 46.0, lon: 95.0, type: 'continent', parentContinent: 'Asia' },
  { name: 'Australia & Oceania', lat: -25.0, lon: 135.0, type: 'continent', parentContinent: 'Australia & Oceania' },
  { name: 'Pacific Ocean Basin', lat: 0.0, lon: -160.0, type: 'basin', parentContinent: 'Pacific Ocean' },
  { name: 'Atlantic Ocean Basin', lat: 18.0, lon: -38.0, type: 'basin', parentContinent: 'Atlantic Ocean' },
  { name: 'Indian Ocean Basin', lat: -16.0, lon: 78.0, type: 'basin', parentContinent: 'Indian Ocean' },
  { name: 'Southern Ocean', lat: -60.0, lon: 0.0, type: 'basin', parentContinent: 'Southern Ocean' },

  // Countries & Major Seas (Level 3)
  { name: 'United States', lat: 39.0, lon: -98.0, type: 'country', parentContinent: 'North America' },
  { name: 'Canada', lat: 56.0, lon: -106.0, type: 'country', parentContinent: 'North America' },
  { name: 'Mexico', lat: 23.0, lon: -102.0, type: 'country', parentContinent: 'North America' },
  { name: 'Brazil', lat: -10.0, lon: -53.0, type: 'country', parentContinent: 'South America' },
  { name: 'Argentina', lat: -34.0, lon: -64.0, type: 'country', parentContinent: 'South America' },
  { name: 'Colombia', lat: 4.5, lon: -73.0, type: 'country', parentContinent: 'South America' },
  { name: 'United Kingdom', lat: 54.5, lon: -2.5, type: 'country', parentContinent: 'Europe' },
  { name: 'France', lat: 46.5, lon: 2.5, type: 'country', parentContinent: 'Europe' },
  { name: 'Germany', lat: 51.0, lon: 10.0, type: 'country', parentContinent: 'Europe' },
  { name: 'Spain', lat: 40.0, lon: -3.7, type: 'country', parentContinent: 'Europe' },
  { name: 'Italy', lat: 42.5, lon: 12.5, type: 'country', parentContinent: 'Europe' },
  { name: 'Norway', lat: 62.0, lon: 10.0, type: 'country', parentContinent: 'Europe' },
  { name: 'Egypt', lat: 26.5, lon: 30.0, type: 'country', parentContinent: 'Africa' },
  { name: 'Nigeria', lat: 9.0, lon: 7.5, type: 'country', parentContinent: 'Africa' },
  { name: 'Kenya', lat: 0.5, lon: 37.5, type: 'country', parentContinent: 'Africa' },
  { name: 'South Africa', lat: -29.0, lon: 24.0, type: 'country', parentContinent: 'Africa' },
  { name: 'China', lat: 35.0, lon: 104.0, type: 'country', parentContinent: 'Asia' },
  { name: 'India', lat: 21.0, lon: 78.0, type: 'country', parentContinent: 'Asia' },
  { name: 'Japan', lat: 36.5, lon: 138.0, type: 'country', parentContinent: 'Asia' },
  { name: 'Indonesia', lat: -1.0, lon: 118.0, type: 'country', parentContinent: 'Asia' },
  { name: 'Saudi Arabia', lat: 24.0, lon: 45.0, type: 'country', parentContinent: 'Asia' },
  { name: 'Australia', lat: -25.0, lon: 135.0, type: 'country', parentContinent: 'Australia & Oceania' },
  { name: 'New Zealand', lat: -41.0, lon: 174.0, type: 'country', parentContinent: 'Australia & Oceania' },
  { name: 'Mediterranean Sea', lat: 35.0, lon: 18.0, type: 'sea', parentContinent: 'Europe' },
  { name: 'Caribbean Sea', lat: 15.0, lon: -75.0, type: 'sea', parentContinent: 'North America' },
  { name: 'Arabian Sea', lat: 15.0, lon: 65.0, type: 'sea', parentContinent: 'Asia' },
  { name: 'Bay of Bengal', lat: 14.0, lon: 87.0, type: 'sea', parentContinent: 'Asia' },

  // Regions, Ocean Features, Cities (Level 4)
  { name: 'Gulf Stream Boundary Current', lat: 36.0, lon: -68.0, type: 'region', parentContinent: 'Atlantic Ocean', parentCountry: 'United States Offshore' },
  { name: 'Kuroshio Extension Meander', lat: 35.0, lon: 143.0, type: 'region', parentContinent: 'Pacific Ocean', parentCountry: 'Japan Offshore' },
  { name: 'Equatorial Pacific (Niño 3.4)', lat: 0.0, lon: -140.0, type: 'region', parentContinent: 'Pacific Ocean' },
  { name: 'Agulhas Retroflection Rings', lat: -38.0, lon: 20.0, type: 'region', parentContinent: 'Indian Ocean', parentCountry: 'South Africa Offshore' },
  { name: 'Drake Passage ACC Jet', lat: -58.0, lon: -65.0, type: 'region', parentContinent: 'Southern Ocean' },
  { name: 'Intertropical Convergence Zone', lat: 6.5, lon: -150.0, type: 'region', parentContinent: 'Pacific Ocean' },
  { name: 'South Asian Monsoon (Bay of Bengal)', lat: 21.0, lon: 88.5, type: 'region', parentContinent: 'Asia', parentCountry: 'India / Bangladesh' },
  { name: 'Amazon Evergreen Rainforest', lat: -3.5, lon: -62.0, type: 'region', parentContinent: 'South America', parentCountry: 'Brazil' },
  { name: 'US Corn Belt Croplands', lat: 41.5, lon: -93.5, type: 'region', parentContinent: 'North America', parentCountry: 'United States' },
  { name: 'Sahelian Acacia Savanna', lat: 14.0, lon: 5.0, type: 'region', parentContinent: 'Africa', parentCountry: 'Niger / Nigeria' },
  { name: 'Siberian Boreal Taiga', lat: 62.0, lon: 129.0, type: 'region', parentContinent: 'Asia', parentCountry: 'Russia' },
  { name: 'Sahara Hyper-Arid Basin', lat: 23.0, lon: 12.0, type: 'region', parentContinent: 'Africa', parentCountry: 'Libya / Chad' },
  { name: 'Tokyo Metropolis', lat: 35.68, lon: 139.76, type: 'city', parentContinent: 'Asia', parentCountry: 'Japan' },
  { name: 'New York Urban Corridor', lat: 40.71, lon: -74.00, type: 'city', parentContinent: 'North America', parentCountry: 'United States' },
  { name: 'London Metropolitan Area', lat: 51.51, lon: -0.12, type: 'city', parentContinent: 'Europe', parentCountry: 'United Kingdom' },
  { name: 'Cairo Nile Delta Basin', lat: 30.04, lon: 31.23, type: 'city', parentContinent: 'Africa', parentCountry: 'Egypt' },
  { name: 'Mumbai Arabian Coastal Zone', lat: 19.07, lon: 72.87, type: 'city', parentContinent: 'Asia', parentCountry: 'India' },
  { name: 'São Paulo Highland Plateau', lat: -23.55, lon: -46.63, type: 'city', parentContinent: 'South America', parentCountry: 'Brazil' },
  { name: 'Sydney Pacific Coastal Hub', lat: -33.86, lon: 151.20, type: 'city', parentContinent: 'Australia & Oceania', parentCountry: 'Australia' },
  { name: 'Nairobi Rift Valley Highland', lat: -1.29, lon: 36.82, type: 'city', parentContinent: 'Africa', parentCountry: 'Kenya' },
];

function calcDistSq(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const dLat = lat1 - lat2;
  let dLon = lon1 - lon2;
  if (dLon > 180) dLon -= 360;
  if (dLon < -180) dLon += 360;
  return dLat * dLat + dLon * dLon;
}

export function resolveGeographicContext(
  lat: number,
  lon: number,
  zoomLevel: ZoomLevel,
  moduleType: 'ocean' | 'atmosphere' | 'land' | null,
  explicitLocationName?: string
): GeographicContext {
  // 1. Level 1: Global View
  if (zoomLevel === 'global') {
    return {
      level: 'global',
      title: 'Global Earth System',
      subtitle: 'Synoptic Planetary View',
      continent: 'Global',
      lat,
      lon,
      spatialResolution: 'Global Planetary Grid',
      coverageNote: 'Global planetary geographic framework. Scientific layers display authentic verified NASA Earth observations or explicit unavailable status.',
    };
  }

  // Find nearest continent or ocean basin
  const continentsAndBasins = PLACES_DB.filter((p) => p.type === 'continent' || p.type === 'basin');
  let nearestContinent = continentsAndBasins[0];
  let minContDist = Infinity;
  for (const c of continentsAndBasins) {
    const dist = calcDistSq(lat, lon, c.lat, c.lon);
    if (dist < minContDist) {
      minContDist = dist;
      nearestContinent = c;
    }
  }

  // 2. Level 2: Continental View
  if (zoomLevel === 'continental') {
    return {
      level: 'continental',
      title: nearestContinent.name,
      subtitle: nearestContinent.type === 'basin' ? 'Ocean Basin Synoptic Scale' : 'Continental Scale Overview',
      continent: nearestContinent.name,
      lat,
      lon,
      spatialResolution: 'Basin / Continental Multi-Sensor Synthesis',
      coverageNote:
        'Continental-scale geographic footprint. Teleconnections and anomalies represent verified multi-sensor satellite indices.',
    };
  }

  // Find nearest country / sea
  const countriesAndSeas = PLACES_DB.filter((p) => p.type === 'country' || p.type === 'sea');
  let nearestCountry = countriesAndSeas[0];
  let minCountryDist = Infinity;
  for (const c of countriesAndSeas) {
    const dist = calcDistSq(lat, lon, c.lat, c.lon);
    if (dist < minCountryDist) {
      minCountryDist = dist;
      nearestCountry = c;
    }
  }

  // 3. Level 3: Country View
  if (zoomLevel === 'country') {
    const title = explicitLocationName || nearestCountry.name;
    return {
      level: 'country',
      title,
      subtitle: `${nearestCountry.parentContinent} • Country Scale`,
      continent: nearestCountry.parentContinent,
      country: nearestCountry.name,
      lat,
      lon,
      spatialResolution: 'National / Regional Footprint (~50–100 km)',
      coverageNote:
        'National geographic scale. Observations reflect authentic satellite telemetry validated with quality flags and sensor provenance.',
    };
  }

  // 4. Level 4: Regional and City View
  const regionsAndCities = PLACES_DB.filter((p) => p.type === 'region' || p.type === 'city');
  let nearestRegion = regionsAndCities[0];
  let minRegionDist = Infinity;
  for (const r of regionsAndCities) {
    const dist = calcDistSq(lat, lon, r.lat, r.lon);
    if (dist < minRegionDist) {
      minRegionDist = dist;
      nearestRegion = r;
    }
  }

  const regionTitle = explicitLocationName || (minRegionDist < 120 ? nearestRegion.name : `${nearestCountry.name} Region`);
  let resolutionStr = 'Authentic NASA observation grid';
  let limitationStr = 'Observations strictly represent authentic satellite telemetry with verified sensor provenance.';

  if (moduleType === 'ocean') {
    resolutionStr = 'SWOT KaRIn Altimetry (2 km / 120 km swath) & MODIS Ocean Color (9 km)';
    limitationStr = 'Altimetric sea surface height and chlorophyll concentrations with quality flag filtering.';
  } else if (moduleType === 'atmosphere') {
    resolutionStr = 'GPM IMERG Final Grid: 0.1° × 0.1° (~10 km)';
    limitationStr = 'Gauge-calibrated multi-satellite microwave and infrared precipitation estimates.';
  } else if (moduleType === 'land') {
    resolutionStr = 'MODIS Terra 0.05° (~5.5 km) Climate Modeling Grid';
    limitationStr = 'Atmospherically corrected surface reflectance with pixel reliability and snow/cloud masking.';
  }

  return {
    level: 'regional',
    title: regionTitle,
    subtitle: `${nearestCountry.name} • ${nearestCountry.parentContinent}`,
    continent: nearestCountry.parentContinent,
    country: nearestCountry.name,
    region: regionTitle,
    lat,
    lon,
    spatialResolution: resolutionStr,
    coverageNote: limitationStr,
  };
}

/**
 * Converts geographic (lat, lon) in degrees to a 3D Cartesian Vector3 on a sphere of radius R.
 * Standard spherical-to-Cartesian convention matching PlanetIQ Three.js world coordinates.
 */
export function latLonToVector3(lat: number, lon: number, radius: number): THREE.Vector3 {
  const phi = (90 - lat) * (Math.PI / 180);
  const theta = (lon + 180) * (Math.PI / 180);
  return new THREE.Vector3(
    -radius * Math.sin(phi) * Math.cos(theta),
    radius * Math.cos(phi),
    radius * Math.sin(phi) * Math.sin(theta)
  );
}

/**
 * Standard scientific colormap thresholds across 2D (MapLibre) and 3D (Three.js) visualizations:
 * - Ocean: Chlorophyll-a (mg/m³), SST (°C), SSHA (meters)
 * - Atmosphere: Precipitation Rate (mm/hr), Accumulation (mm), AOD 550nm (turbidity), Cloud Fraction (%)
 * - Land: MODIS NDVI / EVI (-0.2 to 1.0)
 * Unobserved or missing measurements return neutral no-data gray (#64748b).
 */
export function getScientificObservationHexColor(
  properties: Record<string, any>,
  moduleName: string | null,
  metricType: string = 'rate'
): string {
  const NO_DATA_COLOR = '#64748b';

  if (!properties) return NO_DATA_COLOR;

  if (moduleName === 'ocean') {
    if (metricType === 'chlor_a') {
      const chl = properties.chlor_a_mg_m3 ?? properties.chlor_a;
      if (chl === undefined || chl === null) return NO_DATA_COLOR;
      if (chl < 0.1) return '#1e40af';      // Oligotrophic blue
      if (chl < 0.5) return '#06b6d4';      // Moderate turquoise
      if (chl < 1.5) return '#10b981';      // Productive shelf green
      return '#84cc16';                     // High phytoplankton bloom
    }

    if (metricType === 'sst') {
      const sst = properties.sst_celsius ?? properties.sst;
      if (sst === undefined || sst === null) return NO_DATA_COLOR;
      if (sst < 8.0) return '#1d4ed8';      // Subpolar cold
      if (sst < 18.0) return '#06b6d4';     // Temperate cool
      if (sst < 26.0) return '#f59e0b';     // Warm subtropical
      return '#ef4444';                     // Tropical warm pool
    }

    // Default: SSHA or SSH
    const ssha = properties.ssha_karin_m ?? properties.ssha;
    if (ssha === undefined || ssha === null) return NO_DATA_COLOR;
    if (ssha <= -0.15) return '#2563eb';
    if (ssha < 0) return '#38bdf8';
    if (ssha <= 0.15) return '#f59e0b';
    return '#ef4444';
  }

  if (moduleName === 'atmosphere') {
    if (metricType === 'aod') {
      const aod = properties.aod_550;
      if (aod === undefined || aod === null) return NO_DATA_COLOR;
      if (aod < 0.10) return '#38bdf8';     // Pristine maritime
      if (aod < 0.30) return '#eab308';     // Light aerosol background
      if (aod < 0.60) return '#f97316';     // Regional industrial haze
      return '#b91c1c';                     // Dense smog / wildfire smoke
    }

    if (metricType === 'cloud') {
      const cld = properties.cloud_fraction ?? (properties.cloud_fraction_percent ? properties.cloud_fraction_percent / 100 : null);
      if (cld === undefined || cld === null) return NO_DATA_COLOR;
      if (cld < 0.25) return '#0284c7';     // Clear skies
      if (cld < 0.55) return '#7dd3fc';     // Scattered clouds
      if (cld < 0.80) return '#cbd5e1';     // Broken cloud cover
      return '#f8fafc';                     // Overcast deep convective
    }

    if (metricType === 'rate') {
      const rate = properties.precipitation_rate_mm_hr;
      if (rate === undefined || rate === null) return NO_DATA_COLOR;
      if (rate < 0.1) return '#38bdf8';
      if (rate < 0.3) return '#0284c7';
      if (rate < 0.5) return '#6366f1';
      return '#ec4899';
    } else {
      const acc = properties.precipitation_accumulated_mm;
      if (acc === undefined || acc === null) return NO_DATA_COLOR;
      if (acc < 80) return '#38bdf8';
      if (acc < 200) return '#0284c7';
      if (acc < 350) return '#6366f1';
      return '#ec4899';
    }
  }

  if (moduleName === 'land') {
    const ndvi = properties.ndvi;
    if (ndvi === undefined || ndvi === null) return NO_DATA_COLOR;
    if (ndvi < 0.2) return '#d97706';
    if (ndvi < 0.45) return '#ca8a04';
    if (ndvi < 0.7) return '#84cc16';
    return '#10b981';
  }

  return NO_DATA_COLOR;
}
