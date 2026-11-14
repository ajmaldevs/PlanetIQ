export type PlaceCategory =
  | 'continent'
  | 'ocean'
  | 'country'
  | 'state'
  | 'city'
  | 'natural_feature';

export interface GISPlace {
  id: string;
  name: string;
  category: PlaceCategory;
  lat: number;
  lon: number;
  level: 1 | 2 | 3 | 4; // 1: Continents/Oceans, 2: Countries, 3: States/Provinces, 4: Cities/Locals
  priority: number; // Higher number = higher rendering priority
  parentContinent?: string;
  parentCountry?: string;
  parentState?: string;
  detail?: string;
  population?: number;
}

export const GIS_PLACES: GISPlace[] = [
  // ================= 1. CONTINENTS & MAJOR OCEANS (Level 1) =================
  { id: 'cont-asia', name: 'ASIA', category: 'continent', lat: 46.0, lon: 95.0, level: 1, priority: 100 },
  { id: 'cont-africa', name: 'AFRICA', category: 'continent', lat: 4.0, lon: 20.0, level: 1, priority: 100 },
  { id: 'cont-na', name: 'NORTH AMERICA', category: 'continent', lat: 46.0, lon: -100.0, level: 1, priority: 100 },
  { id: 'cont-sa', name: 'SOUTH AMERICA', category: 'continent', lat: -16.0, lon: -60.0, level: 1, priority: 100 },
  { id: 'cont-eu', name: 'EUROPE', category: 'continent', lat: 52.0, lon: 16.0, level: 1, priority: 100 },
  { id: 'cont-oc', name: 'AUSTRALIA & OCEANIA', category: 'continent', lat: -25.0, lon: 135.0, level: 1, priority: 100 },
  { id: 'cont-ant', name: 'ANTARCTICA', category: 'continent', lat: -82.0, lon: 0.0, level: 1, priority: 95 },

  { id: 'oc-pacific', name: 'PACIFIC OCEAN', category: 'ocean', lat: 0.0, lon: -160.0, level: 1, priority: 95 },
  { id: 'oc-atlantic', name: 'ATLANTIC OCEAN', category: 'ocean', lat: 18.0, lon: -38.0, level: 1, priority: 95 },
  { id: 'oc-indian', name: 'INDIAN OCEAN', category: 'ocean', lat: -16.0, lon: 78.0, level: 1, priority: 95 },
  { id: 'oc-southern', name: 'SOUTHERN OCEAN', category: 'ocean', lat: -60.0, lon: 0.0, level: 1, priority: 90 },
  { id: 'oc-arctic', name: 'ARCTIC OCEAN', category: 'ocean', lat: 82.0, lon: 0.0, level: 1, priority: 90 },

  // ================= 2. SOVEREIGN COUNTRIES & MAJOR SEAS (Level 2) =================
  { id: 'cntry-in', name: 'India', category: 'country', lat: 20.5937, lon: 78.9629, level: 2, priority: 85, parentContinent: 'Asia' },
  { id: 'cntry-us', name: 'United States', category: 'country', lat: 37.0902, lon: -95.7129, level: 2, priority: 85, parentContinent: 'North America' },
  { id: 'cntry-cn', name: 'China', category: 'country', lat: 35.8617, lon: 104.1954, level: 2, priority: 85, parentContinent: 'Asia' },
  { id: 'cntry-br', name: 'Brazil', category: 'country', lat: -14.2350, lon: -51.9253, level: 2, priority: 85, parentContinent: 'South America' },
  { id: 'cntry-ru', name: 'Russia', category: 'country', lat: 61.5240, lon: 105.3188, level: 2, priority: 85, parentContinent: 'Europe' },
  { id: 'cntry-ca', name: 'Canada', category: 'country', lat: 56.1304, lon: -106.3468, level: 2, priority: 85, parentContinent: 'North America' },
  { id: 'cntry-au', name: 'Australia', category: 'country', lat: -25.2744, lon: 133.7751, level: 2, priority: 85, parentContinent: 'Australia & Oceania' },
  { id: 'cntry-jp', name: 'Japan', category: 'country', lat: 36.2048, lon: 138.2529, level: 2, priority: 85, parentContinent: 'Asia' },
  { id: 'cntry-de', name: 'Germany', category: 'country', lat: 51.1657, lon: 10.4515, level: 2, priority: 85, parentContinent: 'Europe' },
  { id: 'cntry-uk', name: 'United Kingdom', category: 'country', lat: 55.3781, lon: -3.4360, level: 2, priority: 85, parentContinent: 'Europe' },
  { id: 'cntry-fr', name: 'France', category: 'country', lat: 46.2276, lon: 2.2137, level: 2, priority: 85, parentContinent: 'Europe' },
  { id: 'cntry-id', name: 'Indonesia', category: 'country', lat: -0.7893, lon: 113.9213, level: 2, priority: 85, parentContinent: 'Asia' },
  { id: 'cntry-za', name: 'South Africa', category: 'country', lat: -30.5595, lon: 22.9375, level: 2, priority: 85, parentContinent: 'Africa' },
  { id: 'cntry-eg', name: 'Egypt', category: 'country', lat: 26.8206, lon: 30.8025, level: 2, priority: 85, parentContinent: 'Africa' },
  { id: 'cntry-ng', name: 'Nigeria', category: 'country', lat: 9.0820, lon: 8.6753, level: 2, priority: 85, parentContinent: 'Africa' },
  { id: 'cntry-ke', name: 'Kenya', category: 'country', lat: -0.0236, lon: 37.9062, level: 2, priority: 85, parentContinent: 'Africa' },
  { id: 'cntry-sa', name: 'Saudi Arabia', category: 'country', lat: 23.8859, lon: 45.0792, level: 2, priority: 85, parentContinent: 'Asia' },
  { id: 'cntry-mx', name: 'Mexico', category: 'country', lat: 23.6345, lon: -102.5528, level: 2, priority: 85, parentContinent: 'North America' },
  { id: 'cntry-ar', name: 'Argentina', category: 'country', lat: -38.4161, lon: -63.6167, level: 2, priority: 85, parentContinent: 'South America' },
  { id: 'cntry-it', name: 'Italy', category: 'country', lat: 41.8719, lon: 12.5674, level: 2, priority: 85, parentContinent: 'Europe' },
  { id: 'cntry-es', name: 'Spain', category: 'country', lat: 40.4637, lon: -3.7492, level: 2, priority: 85, parentContinent: 'Europe' },
  { id: 'cntry-no', name: 'Norway', category: 'country', lat: 60.4720, lon: 8.4689, level: 2, priority: 80, parentContinent: 'Europe' },
  { id: 'cntry-kr', name: 'South Korea', category: 'country', lat: 35.9078, lon: 127.7669, level: 2, priority: 80, parentContinent: 'Asia' },
  { id: 'cntry-tr', name: 'Turkey', category: 'country', lat: 38.9637, lon: 35.2433, level: 2, priority: 80, parentContinent: 'Asia' },
  { id: 'cntry-nz', name: 'New Zealand', category: 'country', lat: -40.9006, lon: 174.8860, level: 2, priority: 80, parentContinent: 'Australia & Oceania' },
  { id: 'cntry-cl', name: 'Chile', category: 'country', lat: -35.6751, lon: -71.5430, level: 2, priority: 80, parentContinent: 'South America' },
  { id: 'cntry-ae', name: 'United Arab Emirates', category: 'country', lat: 23.4241, lon: 53.8478, level: 2, priority: 80, parentContinent: 'Asia' },
  { id: 'sea-arabian', name: 'Arabian Sea', category: 'natural_feature', lat: 15.0, lon: 65.0, level: 2, priority: 75, parentContinent: 'Indian Ocean' },
  { id: 'sea-bengal', name: 'Bay of Bengal', category: 'natural_feature', lat: 15.0, lon: 88.0, level: 2, priority: 75, parentContinent: 'Indian Ocean' },
  { id: 'sea-med', name: 'Mediterranean Sea', category: 'natural_feature', lat: 35.0, lon: 18.0, level: 2, priority: 75, parentContinent: 'Atlantic Ocean' },
  { id: 'sea-carib', name: 'Caribbean Sea', category: 'natural_feature', lat: 15.0, lon: -75.0, level: 2, priority: 75, parentContinent: 'Atlantic Ocean' },

  // ================= 3. FIRST-LEVEL ADMINISTRATIVE DIVISIONS / STATES (Level 3) =================
  // India States
  { id: 'state-kerala', name: 'Kerala', category: 'state', lat: 10.8505, lon: 76.2711, level: 3, priority: 70, parentCountry: 'India', parentContinent: 'Asia', detail: 'Coastal State of Southwest India • Malabar & Travancore' },
  { id: 'state-tn', name: 'Tamil Nadu', category: 'state', lat: 11.1271, lon: 78.6569, level: 3, priority: 65, parentCountry: 'India', parentContinent: 'Asia' },
  { id: 'state-karnataka', name: 'Karnataka', category: 'state', lat: 15.3173, lon: 75.7139, level: 3, priority: 65, parentCountry: 'India', parentContinent: 'Asia' },
  { id: 'state-maharashtra', name: 'Maharashtra', category: 'state', lat: 19.7515, lon: 75.7139, level: 3, priority: 65, parentCountry: 'India', parentContinent: 'Asia' },
  { id: 'state-delhi', name: 'Delhi', category: 'state', lat: 28.7041, lon: 77.1025, level: 3, priority: 65, parentCountry: 'India', parentContinent: 'Asia' },
  { id: 'state-wb', name: 'West Bengal', category: 'state', lat: 22.9868, lon: 87.8550, level: 3, priority: 65, parentCountry: 'India', parentContinent: 'Asia' },
  { id: 'state-gujarat', name: 'Gujarat', category: 'state', lat: 22.2587, lon: 71.1924, level: 3, priority: 65, parentCountry: 'India', parentContinent: 'Asia' },
  { id: 'state-up', name: 'Uttar Pradesh', category: 'state', lat: 26.8467, lon: 80.9462, level: 3, priority: 65, parentCountry: 'India', parentContinent: 'Asia' },
  { id: 'state-rajasthan', name: 'Rajasthan', category: 'state', lat: 27.0238, lon: 74.2179, level: 3, priority: 65, parentCountry: 'India', parentContinent: 'Asia' },

  // US States
  { id: 'state-ca', name: 'California', category: 'state', lat: 36.7783, lon: -119.4179, level: 3, priority: 70, parentCountry: 'United States', parentContinent: 'North America' },
  { id: 'state-tx', name: 'Texas', category: 'state', lat: 31.9686, lon: -99.9018, level: 3, priority: 68, parentCountry: 'United States', parentContinent: 'North America' },
  { id: 'state-ny', name: 'New York', category: 'state', lat: 40.7128, lon: -74.0060, level: 3, priority: 68, parentCountry: 'United States', parentContinent: 'North America' },
  { id: 'state-fl', name: 'Florida', category: 'state', lat: 27.6648, lon: -81.5158, level: 3, priority: 68, parentCountry: 'United States', parentContinent: 'North America' },
  { id: 'state-wa', name: 'Washington', category: 'state', lat: 47.7511, lon: -120.7401, level: 3, priority: 65, parentCountry: 'United States', parentContinent: 'North America' },
  { id: 'state-il', name: 'Illinois', category: 'state', lat: 40.6331, lon: -89.3985, level: 3, priority: 65, parentCountry: 'United States', parentContinent: 'North America' },

  // International States & Provinces
  { id: 'state-bavaria', name: 'Bavaria', category: 'state', lat: 48.7904, lon: 11.4979, level: 3, priority: 65, parentCountry: 'Germany', parentContinent: 'Europe' },
  { id: 'state-sp-br', name: 'São Paulo', category: 'state', lat: -23.5505, lon: -46.6333, level: 3, priority: 65, parentCountry: 'Brazil', parentContinent: 'South America' },
  { id: 'state-ontario', name: 'Ontario', category: 'state', lat: 51.2538, lon: -85.3232, level: 3, priority: 65, parentCountry: 'Canada', parentContinent: 'North America' },
  { id: 'state-nsw', name: 'New South Wales', category: 'state', lat: -31.8402, lon: 145.6128, level: 3, priority: 65, parentCountry: 'Australia', parentContinent: 'Australia & Oceania' },
  { id: 'state-england', name: 'England', category: 'state', lat: 52.3555, lon: -1.1743, level: 3, priority: 68, parentCountry: 'United Kingdom', parentContinent: 'Europe' },

  // ================= 4. CITIES & POPULATED PLACES (Level 4) =================
  // Kerala Cities (Required for exact walkthrough test)
  { id: 'city-kozhikode', name: 'Kozhikode', category: 'city', lat: 11.2588, lon: 75.7804, level: 4, priority: 60, parentCountry: 'India', parentState: 'Kerala', parentContinent: 'Asia', detail: 'Historic port city of Calicut on the Malabar Coast of Kerala' },
  { id: 'city-kochi', name: 'Kochi', category: 'city', lat: 9.9312, lon: 76.2673, level: 4, priority: 58, parentCountry: 'India', parentState: 'Kerala', parentContinent: 'Asia', detail: 'Major commercial port city of Kerala on the Arabian Sea' },
  { id: 'city-tvm', name: 'Thiruvananthapuram', category: 'city', lat: 8.5241, lon: 76.9366, level: 4, priority: 58, parentCountry: 'India', parentState: 'Kerala', parentContinent: 'Asia', detail: 'Capital city of Kerala' },
  { id: 'city-kannur', name: 'Kannur', category: 'city', lat: 11.8745, lon: 75.3704, level: 4, priority: 50, parentCountry: 'India', parentState: 'Kerala', parentContinent: 'Asia', detail: 'Coastal city in northern Kerala' },

  // Other Major Indian Cities
  { id: 'city-mumbai', name: 'Mumbai', category: 'city', lat: 19.0760, lon: 72.8777, level: 4, priority: 58, parentCountry: 'India', parentState: 'Maharashtra', parentContinent: 'Asia', detail: 'Financial capital of India on the Arabian Sea' },
  { id: 'city-delhi', name: 'New Delhi', category: 'city', lat: 28.6139, lon: 77.2090, level: 4, priority: 58, parentCountry: 'India', parentState: 'Delhi', parentContinent: 'Asia', detail: 'National capital of India' },
  { id: 'city-bengaluru', name: 'Bengaluru', category: 'city', lat: 12.9716, lon: 77.5946, level: 4, priority: 58, parentCountry: 'India', parentState: 'Karnataka', parentContinent: 'Asia', detail: 'Deccan plateau technology hub' },
  { id: 'city-chennai', name: 'Chennai', category: 'city', lat: 13.0827, lon: 80.2707, level: 4, priority: 55, parentCountry: 'India', parentState: 'Tamil Nadu', parentContinent: 'Asia', detail: 'Metropolitan hub on the Bay of Bengal' },
  { id: 'city-kolkata', name: 'Kolkata', category: 'city', lat: 22.5726, lon: 88.3639, level: 4, priority: 55, parentCountry: 'India', parentState: 'West Bengal', parentContinent: 'Asia', detail: 'Eastern cultural and commercial center' },

  // Global Megacities
  { id: 'city-tokyo', name: 'Tokyo', category: 'city', lat: 35.6762, lon: 139.6503, level: 4, priority: 60, parentCountry: 'Japan', parentContinent: 'Asia' },
  { id: 'city-nyc', name: 'New York City', category: 'city', lat: 40.7128, lon: -74.0060, level: 4, priority: 60, parentCountry: 'United States', parentState: 'New York', parentContinent: 'North America' },
  { id: 'city-la', name: 'Los Angeles', category: 'city', lat: 34.0522, lon: -118.2437, level: 4, priority: 58, parentCountry: 'United States', parentState: 'California', parentContinent: 'North America' },
  { id: 'city-sf', name: 'San Francisco', category: 'city', lat: 37.7749, lon: -122.4194, level: 4, priority: 55, parentCountry: 'United States', parentState: 'California', parentContinent: 'North America' },
  { id: 'city-london', name: 'London', category: 'city', lat: 51.5074, lon: -0.1278, level: 4, priority: 60, parentCountry: 'United Kingdom', parentContinent: 'Europe' },
  { id: 'city-paris', name: 'Paris', category: 'city', lat: 48.8566, lon: 2.3522, level: 4, priority: 60, parentCountry: 'France', parentContinent: 'Europe' },
  { id: 'city-berlin', name: 'Berlin', category: 'city', lat: 52.5200, lon: 13.4050, level: 4, priority: 55, parentCountry: 'Germany', parentContinent: 'Europe' },
  { id: 'city-cairo', name: 'Cairo', category: 'city', lat: 30.0444, lon: 31.2357, level: 4, priority: 58, parentCountry: 'Egypt', parentContinent: 'Africa' },
  { id: 'city-nairobi', name: 'Nairobi', category: 'city', lat: -1.2921, lon: 36.8219, level: 4, priority: 55, parentCountry: 'Kenya', parentContinent: 'Africa' },
  { id: 'city-sydney', name: 'Sydney', category: 'city', lat: -33.8688, lon: 151.2093, level: 4, priority: 58, parentCountry: 'Australia', parentContinent: 'Australia & Oceania' },
  { id: 'city-beijing', name: 'Beijing', category: 'city', lat: 39.9042, lon: 116.4074, level: 4, priority: 58, parentCountry: 'China', parentContinent: 'Asia' },
  { id: 'city-shanghai', name: 'Shanghai', category: 'city', lat: 31.2304, lon: 121.4737, level: 4, priority: 58, parentCountry: 'China', parentContinent: 'Asia' },
  { id: 'city-singapore', name: 'Singapore', category: 'city', lat: 1.3521, lon: 103.8198, level: 4, priority: 58, parentCountry: 'Singapore', parentContinent: 'Asia' },
  { id: 'city-dubai', name: 'Dubai', category: 'city', lat: 25.2048, lon: 55.2708, level: 4, priority: 58, parentCountry: 'United Arab Emirates', parentContinent: 'Asia' },
  { id: 'city-saopaulo', name: 'São Paulo', category: 'city', lat: -23.5505, lon: -46.6333, level: 4, priority: 58, parentCountry: 'Brazil', parentContinent: 'South America' },

  // Scientific Natural Features & Currents
  { id: 'feat-gulfstream', name: 'Gulf Stream Boundary Current', category: 'natural_feature', lat: 36.0, lon: -68.0, level: 3, priority: 70, detail: 'North Atlantic warm current & intense eddy field' },
  { id: 'feat-kuroshio', name: 'Kuroshio Extension Meander', category: 'natural_feature', lat: 35.0, lon: 143.0, level: 3, priority: 70, detail: 'Western Pacific boundary current & mesoscale vortices' },
  { id: 'feat-nino34', name: 'Equatorial Pacific (Niño 3.4)', category: 'natural_feature', lat: 0.0, lon: -140.0, level: 2, priority: 75, detail: 'ENSO thermal & sea surface height anomaly center' },
  { id: 'feat-itcz', name: 'Intertropical Convergence Zone', category: 'natural_feature', lat: 6.5, lon: -150.0, level: 2, priority: 75, detail: 'Global thermal equator & deep convective rain belt' },
  { id: 'feat-amazon', name: 'Amazon Evergreen Rainforest', category: 'natural_feature', lat: -3.5, lon: -62.0, level: 3, priority: 70, detail: 'Dense tropical canopy & terrestrial carbon sink' },
  { id: 'feat-cornbelt', name: 'US Corn Belt Croplands', category: 'natural_feature', lat: 41.5, lon: -93.5, level: 3, priority: 70, detail: 'Intensive midwestern agriculture & vegetation phenology' },
  { id: 'feat-sahara', name: 'Sahara Hyper-Arid Basin', category: 'natural_feature', lat: 23.0, lon: 12.0, level: 2, priority: 70, detail: 'Vast low-NDVI desert landscape' },
  { id: 'feat-himalayas', name: 'Himalayan Mountain Range', category: 'natural_feature', lat: 28.0, lon: 86.0, level: 2, priority: 70, detail: 'Third Pole glacier water tower' },
];

/**
 * Filter GIS places based on current camera zoom distance and screen-space collision detection
 */
export function getVisibleGISPlaces(
  cameraDistance: number,
  centerLat: number,
  centerLon: number
): GISPlace[] {
  // Level thresholding:
  // cameraDistance >= 4.8: Level 1 only
  // 3.7 <= cameraDistance < 4.8: Level 1 & 2
  // 2.9 <= cameraDistance < 3.7: Level 1, 2, & 3
  // cameraDistance < 2.9: Level 1, 2, 3, & 4
  const maxLevel = cameraDistance >= 4.8 ? 1 : cameraDistance >= 3.7 ? 2 : cameraDistance >= 2.9 ? 3 : 4;

  const candidates = GIS_PLACES.filter((p) => p.level <= maxLevel);

  // If zoomed in close (Level 3-4), prioritize places closer to the camera facing center
  if (maxLevel >= 3) {
    return candidates.sort((a, b) => {
      const distA = Math.hypot(a.lat - centerLat, a.lon - centerLon);
      const distB = Math.hypot(b.lat - centerLat, b.lon - centerLon);
      if (Math.abs(distA - distB) > 15) {
        return distA - distB;
      }
      return b.priority - a.priority;
    });
  }

  return candidates.sort((a, b) => b.priority - a.priority);
}
