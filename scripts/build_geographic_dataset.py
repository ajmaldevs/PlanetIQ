"""
Script to download, optimize, and generate complete authoritative global geographic datasets
for TerraLens 3D Globe and 2D MapLibre view.
"""
import json
import os
import urllib.request
import math

COUNTRIES_URL = "https://raw.githubusercontent.com/martynafford/natural-earth-geojson/master/50m/cultural/ne_50m_admin_0_countries.json"
PLACES_URL = "https://raw.githubusercontent.com/martynafford/natural-earth-geojson/master/50m/cultural/ne_50m_populated_places.json"

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.dirname(SCRIPT_DIR)
GEO_OUT_DIR = os.path.join(PROJECT_ROOT, "frontend", "public", "data", "geo")
GIS_DB_OUT = os.path.join(PROJECT_ROOT, "frontend", "src", "services", "gisDatabase.ts")

os.makedirs(GEO_OUT_DIR, exist_ok=True)

def download_json(url):
    print(f"Downloading {url} ...")
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 (TerraLens Geo Pipeline)"})
    with urllib.request.urlopen(req, timeout=45) as resp:
        return json.loads(resp.read().decode("utf-8"))

def round_coords(coords, precision=4):
    if isinstance(coords[0], (int, float)):
        return [round(coords[0], precision), round(coords[1], precision)]
    return [round_coords(c, precision) for c in coords]

def compute_centroid(geometry):
    """Compute an approximate bounding box center and area-weighted centroid for polygons."""
    geom_type = geometry.get("type")
    coords = geometry.get("coordinates", [])
    
    all_points = []
    def collect_points(c):
        if isinstance(c[0], (int, float)):
            all_points.append(c)
        else:
            for item in c:
                collect_points(item)
    collect_points(coords)
    
    if not all_points:
        return 0.0, 0.0
    
    min_lon = min(p[0] for p in all_points)
    max_lon = max(p[0] for p in all_points)
    min_lat = min(p[1] for p in all_points)
    max_lat = max(p[1] for p in all_points)
    
    # Simple midpoint
    mid_lon = (min_lon + max_lon) / 2.0
    mid_lat = (min_lat + max_lat) / 2.0
    
    # If spans > 180 deg (e.g. Russia, Fiji across antimeridian), handle longitude wrap
    if max_lon - min_lon > 180:
        positive_lons = [p[0] for p in all_points if p[0] >= 0]
        negative_lons = [p[0] for p in all_points if p[0] < 0]
        if positive_lons and negative_lons:
            avg_pos = sum(positive_lons) / len(positive_lons)
            avg_neg = sum(negative_lons) / len(negative_lons)
            mid_lon = avg_pos if len(positive_lons) > len(negative_lons) else avg_neg
            
    return round(mid_lat, 4), round(mid_lon, 4)

def main():
    countries_data = download_json(COUNTRIES_URL)
    places_data = download_json(PLACES_URL)
    
    print(f"Loaded {len(countries_data['features'])} country features")
    print(f"Loaded {len(places_data['features'])} populated place features")
    
    clean_country_features = []
    clean_boundary_lines = []
    country_db_entries = []
    
    seen_ids = set()
    
    for f in countries_data["features"]:
        props = f.get("properties", {})
        name = props.get("NAME") or props.get("ADMIN") or props.get("SOVEREIGNT") or "Unknown"
        formal_name = props.get("FORMAL_EN") or props.get("NAME_LONG") or name
        iso_a2 = props.get("ISO_A2")
        iso_a3 = props.get("ISO_A3")
        adm0_a3 = props.get("ADM0_A3") or props.get("SOV_A3") or ""
        
        # Normalize -99 invalid ISO codes from Natural Earth
        if iso_a2 == "-99" or not iso_a2:
            iso_a2 = adm0_a3[:2] if len(adm0_a3) >= 2 else "XX"
        if iso_a3 == "-99" or not iso_a3:
            iso_a3 = adm0_a3 if len(adm0_a3) == 3 else "XXX"
            
        code_id = f"cntry-{iso_a3.lower()}"
        if code_id in seen_ids:
            code_id = f"cntry-{iso_a3.lower()}-{len(seen_ids)}"
        seen_ids.add(code_id)
        
        continent = props.get("CONTINENT") or "Unknown"
        subregion = props.get("SUBREGION") or ""
        pop_est = props.get("POP_EST") or 0
        scalerank = props.get("scalerank", 5)
        labelrank = props.get("LABELRANK", 5)
        
        geom = f.get("geometry")
        if not geom:
            continue
            
        c_lat, c_lon = compute_centroid(geom)
        
        # Override specific centroids for countries spanning the antimeridian or overseas enclaves
        special_centroids = {
            "Russia": (61.5240, 105.3188),
            "United States": (37.0902, -95.7129),
            "France": (46.2276, 2.2137),
            "Norway": (60.4720, 8.4689),
            "Fiji": (-17.7134, 178.0650),
            "New Zealand": (-40.9006, 174.8860),
            "Kiribati": (1.4518, 172.9717),
            "Tuvalu": (-7.1095, 177.6493),
            "Maldives": (3.2028, 73.2207),
            "Seychelles": (-4.6796, 55.4920),
            "Mauritius": (-20.3484, 57.5522),
            "Malta": (35.9375, 14.3754),
            "Iceland": (64.9631, -19.0208),
            "Singapore": (1.3521, 103.8198),
            "Bahamas": (25.0343, -77.3963),
        }
        if name in special_centroids:
            c_lat, c_lon = special_centroids[name]
            
        clean_geom = {
            "type": geom["type"],
            "coordinates": round_coords(geom["coordinates"], precision=4)
        }
        
        clean_f = {
            "type": "Feature",
            "id": iso_a3,
            "properties": {
                "id": code_id,
                "name": name,
                "formal_name": formal_name,
                "iso_a2": iso_a2,
                "iso_a3": iso_a3,
                "continent": continent,
                "subregion": subregion,
                "pop_est": pop_est,
                "scalerank": scalerank,
                "labelrank": labelrank,
                "center_lat": c_lat,
                "center_lon": c_lon,
            },
            "geometry": clean_geom
        }
        clean_country_features.append(clean_f)
        
        # Priority: Major countries (low scalerank / high pop) get high priority
        priority = 85 - min(15, scalerank * 2)
        if pop_est > 50000000:
            priority += 5
        elif pop_est < 1000000:
            priority -= 5
            
        country_db_entries.append({
            "id": code_id,
            "name": name,
            "formal_name": formal_name,
            "category": "country",
            "lat": c_lat,
            "lon": c_lon,
            "level": 2,
            "priority": priority,
            "iso_a2": iso_a2,
            "iso_a3": iso_a3,
            "parentContinent": continent,
            "population": pop_est,
        })
        
        # Extract boundary line segments for 3D vector rendering
        if geom["type"] == "Polygon":
            for ring in clean_geom["coordinates"]:
                clean_boundary_lines.append(ring)
        elif geom["type"] == "MultiPolygon":
            for poly in clean_geom["coordinates"]:
                for ring in poly:
                    clean_boundary_lines.append(ring)

    # Ensure Tuvalu and missing island microstates are explicitly present with accurate geometries
    has_tuvalu = any(f["properties"].get("name") == "Tuvalu" or f["properties"].get("iso_a3") == "TUV" for f in clean_country_features)
    if not has_tuvalu:
        tuvalu_ring = [[179.18, -8.51], [179.22, -8.51], [179.24, -8.53], [179.20, -8.54], [179.17, -8.53], [179.18, -8.51]]
        clean_country_features.append({
            "type": "Feature",
            "id": "TUV",
            "properties": {
                "id": "country-tuv",
                "name": "Tuvalu",
                "formal_name": "Tuvalu",
                "iso_a2": "TV",
                "iso_a3": "TUV",
                "continent": "Oceania",
                "subregion": "Polynesia",
                "pop_est": 11204,
                "scalerank": 6,
                "labelrank": 5,
                "center_lat": -8.5211,
                "center_lon": 179.1962,
            },
            "geometry": {
                "type": "Polygon",
                "coordinates": [tuvalu_ring]
            }
        })
        clean_boundary_lines.append(tuvalu_ring)
        country_db_entries.append({
            "id": "country-tuv",
            "name": "Tuvalu",
            "formal_name": "Tuvalu",
            "category": "country",
            "lat": -8.5211,
            "lon": 179.1962,
            "level": 2,
            "priority": 72,
            "iso_a2": "TV",
            "iso_a3": "TUV",
            "parentContinent": "Oceania",
            "population": 11204,
        })

    # Save clean countries GeoJSON
    countries_geojson = {
        "type": "FeatureCollection",
        "features": clean_country_features
    }
    countries_path = os.path.join(GEO_OUT_DIR, "ne_countries.geojson")
    with open(countries_path, "w", encoding="utf-8") as f:
        json.dump(countries_geojson, f, ensure_ascii=False, separators=(",", ":"))
    print(f"Saved {countries_path} ({os.path.getsize(countries_path) / 1024:.1f} KB)")
    
    # Save clean boundary lines GeoJSON
    boundary_features = []
    for line in clean_boundary_lines:
        boundary_features.append({
            "type": "Feature",
            "properties": {"type": "country_boundary"},
            "geometry": {
                "type": "LineString",
                "coordinates": line
            }
        })
    boundary_geojson = {
        "type": "FeatureCollection",
        "features": boundary_features
    }
    boundary_path = os.path.join(GEO_OUT_DIR, "ne_country_boundaries.geojson")
    with open(boundary_path, "w", encoding="utf-8") as f:
        json.dump(boundary_geojson, f, ensure_ascii=False, separators=(",", ":"))
    print(f"Saved {boundary_path} ({os.path.getsize(boundary_path) / 1024:.1f} KB)")
    
    # Process populated places
    # Select capitals and major cities (scalerank <= 4 or pop_max > 800000)
    city_db_entries = []
    seen_city_names = set()
    
    # Include historic/important cities requested in prior requirements
    curated_cities = {
        "Kozhikode", "Kochi", "Thiruvananthapuram", "Kannur", "Thrissur", "Palakkad", "Kollam",
        "Mumbai", "New Delhi", "Bengaluru", "Chennai", "Hyderabad", "Kolkata", "Pune", "Ahmedabad",
        "New York", "Los Angeles", "San Francisco", "Chicago", "London", "Paris", "Berlin", "Munich",
        "Tokyo", "Beijing", "Shanghai", "Cairo", "Nairobi", "São Paulo", "Sydney", "Dubai", "Singapore"
    }
    
    for f in places_data.get("features", []):
        props = f.get("properties", {})
        c_name = props.get("NAME") or props.get("NAMEASCII") or ""
        country_name = props.get("ADM0NAME") or props.get("SOV0NAME") or ""
        pop = props.get("POP_MAX") or props.get("POP_OTHER") or 0
        scalerank = props.get("SCALERANK") if props.get("SCALERANK") is not None else 10
        is_capital = props.get("FEATURECLA") in ("Admin-0 capital", "Admin-0 capital alt", "Admin-1 capital")
        
        geom = f.get("geometry", {})
        coords = geom.get("coordinates", [0, 0])
        
        if not c_name or coords == [0, 0]:
            continue
            
        # Filter for capitals, major metropolises (pop > 750,000), or curated cities
        if not (is_capital or pop > 750000 or scalerank <= 3 or c_name in curated_cities):
            continue
            
        city_key = f"{c_name}-{country_name}".lower()
        if city_key in seen_city_names:
            continue
        seen_city_names.add(city_key)
        
        slug = c_name.lower().replace(" ", "-").replace("'", "")[:24]
        city_id = f"city-{slug}-{len(seen_city_names)}"
        
        prio = 65
        if is_capital:
            prio = 68
        if pop > 5000000:
            prio += 2
            
        city_db_entries.append({
            "id": city_id,
            "name": c_name,
            "category": "city",
            "lat": round(coords[1], 4),
            "lon": round(coords[0], 4),
            "level": 4,
            "priority": prio,
            "parentCountry": country_name,
            "population": pop,
        })
        
    print(f"Extracted {len(city_db_entries)} major populated places and capitals")
    
    # Administrative divisions (States & Provinces)
    state_entries = [
        # India States
        {"id": "state-kerala", "name": "Kerala", "category": "state", "lat": 10.8505, "lon": 76.2711, "level": 3, "priority": 75, "parentCountry": "India", "parentContinent": "Asia", "detail": "Coastal State of Southwest India • Malabar & Travancore"},
        {"id": "state-tn", "name": "Tamil Nadu", "category": "state", "lat": 11.1271, "lon": 78.6569, "level": 3, "priority": 72, "parentCountry": "India", "parentContinent": "Asia", "detail": "Southern coastal state on Bay of Bengal"},
        {"id": "state-karnataka", "name": "Karnataka", "category": "state", "lat": 15.3173, "lon": 75.7139, "level": 3, "priority": 72, "parentCountry": "India", "parentContinent": "Asia", "detail": "Southwestern state • Deccan Plateau"},
        {"id": "state-maharashtra", "name": "Maharashtra", "category": "state", "lat": 19.7515, "lon": 75.7139, "level": 3, "priority": 74, "parentCountry": "India", "parentContinent": "Asia", "detail": "Western state • Financial hub"},
        {"id": "state-delhi", "name": "Delhi NCR", "category": "state", "lat": 28.7041, "lon": 77.1025, "level": 3, "priority": 74, "parentCountry": "India", "parentContinent": "Asia", "detail": "National Capital Region of India"},
        {"id": "state-gujarat", "name": "Gujarat", "category": "state", "lat": 22.2587, "lon": 71.1924, "level": 3, "priority": 70, "parentCountry": "India", "parentContinent": "Asia"},
        {"id": "state-wb", "name": "West Bengal", "category": "state", "lat": 22.9868, "lon": 87.8550, "level": 3, "priority": 70, "parentCountry": "India", "parentContinent": "Asia"},
        {"id": "state-up", "name": "Uttar Pradesh", "category": "state", "lat": 26.8467, "lon": 80.9462, "level": 3, "priority": 70, "parentCountry": "India", "parentContinent": "Asia"},
        {"id": "state-rajasthan", "name": "Rajasthan", "category": "state", "lat": 27.0238, "lon": 74.2179, "level": 3, "priority": 70, "parentCountry": "India", "parentContinent": "Asia"},
        {"id": "state-punjab", "name": "Punjab", "category": "state", "lat": 31.1471, "lon": 75.3412, "level": 3, "priority": 68, "parentCountry": "India", "parentContinent": "Asia"},
        {"id": "state-ap", "name": "Andhra Pradesh", "category": "state", "lat": 15.9129, "lon": 79.7400, "level": 3, "priority": 68, "parentCountry": "India", "parentContinent": "Asia"},
        {"id": "state-telangana", "name": "Telangana", "category": "state", "lat": 18.1124, "lon": 79.0193, "level": 3, "priority": 68, "parentCountry": "India", "parentContinent": "Asia"},
        # US States
        {"id": "state-ca", "name": "California", "category": "state", "lat": 36.7783, "lon": -119.4179, "level": 3, "priority": 75, "parentCountry": "United States", "parentContinent": "North America", "detail": "Pacific Coast State"},
        {"id": "state-tx", "name": "Texas", "category": "state", "lat": 31.9686, "lon": -99.9018, "level": 3, "priority": 72, "parentCountry": "United States", "parentContinent": "North America"},
        {"id": "state-ny", "name": "New York", "category": "state", "lat": 40.7128, "lon": -74.0060, "level": 3, "priority": 72, "parentCountry": "United States", "parentContinent": "North America"},
        {"id": "state-fl", "name": "Florida", "category": "state", "lat": 27.6648, "lon": -81.5158, "level": 3, "priority": 72, "parentCountry": "United States", "parentContinent": "North America"},
        {"id": "state-wa", "name": "Washington", "category": "state", "lat": 47.7511, "lon": -120.7401, "level": 3, "priority": 68, "parentCountry": "United States", "parentContinent": "North America"},
        {"id": "state-il", "name": "Illinois", "category": "state", "lat": 40.6331, "lon": -89.3985, "level": 3, "priority": 68, "parentCountry": "United States", "parentContinent": "North America"},
        {"id": "state-co", "name": "Colorado", "category": "state", "lat": 39.5501, "lon": -105.7821, "level": 3, "priority": 68, "parentCountry": "United States", "parentContinent": "North America"},
        # International States & Provinces
        {"id": "state-bavaria", "name": "Bavaria", "category": "state", "lat": 48.7904, "lon": 11.4979, "level": 3, "priority": 70, "parentCountry": "Germany", "parentContinent": "Europe"},
        {"id": "state-sp-br", "name": "São Paulo", "category": "state", "lat": -23.5505, "lon": -46.6333, "level": 3, "priority": 70, "parentCountry": "Brazil", "parentContinent": "South America"},
        {"id": "state-ontario", "name": "Ontario", "category": "state", "lat": 51.2538, "lon": -85.3232, "level": 3, "priority": 70, "parentCountry": "Canada", "parentContinent": "North America"},
        {"id": "state-nsw", "name": "New South Wales", "category": "state", "lat": -31.8402, "lon": 145.6128, "level": 3, "priority": 70, "parentCountry": "Australia", "parentContinent": "Australia & Oceania"},
        {"id": "state-england", "name": "England", "category": "state", "lat": 52.3555, "lon": -1.1743, "level": 3, "priority": 72, "parentCountry": "United Kingdom", "parentContinent": "Europe"},
        {"id": "state-scotland", "name": "Scotland", "category": "state", "lat": 56.4907, "lon": -4.2026, "level": 3, "priority": 68, "parentCountry": "United Kingdom", "parentContinent": "Europe"},
        {"id": "state-idf", "name": "Île-de-France", "category": "state", "lat": 48.8499, "lon": 2.6370, "level": 3, "priority": 70, "parentCountry": "France", "parentContinent": "Europe"},
        {"id": "state-catalonia", "name": "Catalonia", "category": "state", "lat": 41.5912, "lon": 1.5209, "level": 3, "priority": 68, "parentCountry": "Spain", "parentContinent": "Europe"},
    ]
    
    # Continents & Oceans (Level 1)
    continent_entries = [
        {"id": "cont-asia", "name": "ASIA", "category": "continent", "lat": 46.0, "lon": 95.0, "level": 1, "priority": 100},
        {"id": "cont-africa", "name": "AFRICA", "category": "continent", "lat": 4.0, "lon": 20.0, "level": 1, "priority": 100},
        {"id": "cont-na", "name": "NORTH AMERICA", "category": "continent", "lat": 46.0, "lon": -100.0, "level": 1, "priority": 100},
        {"id": "cont-sa", "name": "SOUTH AMERICA", "category": "continent", "lat": -16.0, "lon": -60.0, "level": 1, "priority": 100},
        {"id": "cont-eu", "name": "EUROPE", "category": "continent", "lat": 52.0, "lon": 16.0, "level": 1, "priority": 100},
        {"id": "cont-oc", "name": "AUSTRALIA & OCEANIA", "category": "continent", "lat": -25.0, "lon": 135.0, "level": 1, "priority": 100},
        {"id": "cont-ant", "name": "ANTARCTICA", "category": "continent", "lat": -82.0, "lon": 0.0, "level": 1, "priority": 95},
        {"id": "oc-pacific", "name": "PACIFIC OCEAN", "category": "ocean", "lat": 0.0, "lon": -160.0, "level": 1, "priority": 95},
        {"id": "oc-atlantic", "name": "ATLANTIC OCEAN", "category": "ocean", "lat": 18.0, "lon": -38.0, "level": 1, "priority": 95},
        {"id": "oc-indian", "name": "INDIAN OCEAN", "category": "ocean", "lat": -16.0, "lon": 78.0, "level": 1, "priority": 95},
        {"id": "oc-southern", "name": "SOUTHERN OCEAN", "category": "ocean", "lat": -60.0, "lon": 0.0, "level": 1, "priority": 90},
        {"id": "oc-arctic", "name": "ARCTIC OCEAN", "category": "ocean", "lat": 82.0, "lon": 0.0, "level": 1, "priority": 90},
    ]
    
    # Natural Features & Planetary Teleconnection Regions
    feature_entries = [
        {"id": "sea-arabian", "name": "Arabian Sea", "category": "natural_feature", "lat": 15.0, "lon": 65.0, "level": 2, "priority": 75, "parentContinent": "Indian Ocean"},
        {"id": "sea-bengal", "name": "Bay of Bengal", "category": "natural_feature", "lat": 15.0, "lon": 88.0, "level": 2, "priority": 75, "parentContinent": "Indian Ocean"},
        {"id": "sea-med", "name": "Mediterranean Sea", "category": "natural_feature", "lat": 35.0, "lon": 18.0, "level": 2, "priority": 75, "parentContinent": "Atlantic Ocean"},
        {"id": "sea-carib", "name": "Caribbean Sea", "category": "natural_feature", "lat": 15.0, "lon": -75.0, "level": 2, "priority": 75, "parentContinent": "Atlantic Ocean"},
        {"id": "feat-gulfstream", "name": "Gulf Stream Boundary Current", "category": "natural_feature", "lat": 36.0, "lon": -68.0, "level": 2, "priority": 75, "detail": "North Atlantic warm current & intense eddy field"},
        {"id": "feat-kuroshio", "name": "Kuroshio Extension Meander", "category": "natural_feature", "lat": 35.0, "lon": 143.0, "level": 2, "priority": 75, "detail": "Western Pacific boundary current"},
        {"id": "feat-itcz", "name": "Intertropical Convergence Zone", "category": "natural_feature", "lat": 6.5, "lon": -150.0, "level": 2, "priority": 75, "detail": "Global thermal equator & deep convective rain belt"},
        {"id": "feat-amazon", "name": "Amazon Evergreen Rainforest", "category": "natural_feature", "lat": -3.5, "lon": -62.0, "level": 3, "priority": 70, "detail": "Dense tropical canopy & terrestrial carbon sink"},
        {"id": "feat-cornbelt", "name": "US Corn Belt Croplands", "category": "natural_feature", "lat": 41.5, "lon": -93.5, "level": 3, "priority": 70, "detail": "Intensive midwestern agriculture & vegetation phenology"},
        {"id": "feat-sahara", "name": "Sahara Hyper-Arid Basin", "category": "natural_feature", "lat": 23.0, "lon": 12.0, "level": 2, "priority": 70, "detail": "Vast low-NDVI desert landscape"},
        {"id": "feat-himalayas", "name": "Himalayan Mountain Range", "category": "natural_feature", "lat": 28.0, "lon": 86.0, "level": 2, "priority": 70, "detail": "Third Pole glacier water tower"},
    ]
    
    all_places = continent_entries + country_db_entries + feature_entries + state_entries + city_db_entries
    print(f"Total GIS database places compiled: {len(all_places)} places (Countries: {len(country_db_entries)}, Cities: {len(city_db_entries)})")
    
    # Generate TypeScript gisDatabase.ts
    ts_code = f"""export type PlaceCategory =
  | 'continent'
  | 'ocean'
  | 'country'
  | 'state'
  | 'city'
  | 'natural_feature';

export interface GISPlace {{
  id: string;
  name: string;
  formal_name?: string;
  category: PlaceCategory;
  lat: number;
  lon: number;
  level: 1 | 2 | 3 | 4; // 1: Continents/Oceans, 2: Countries, 3: States/Provinces, 4: Cities/Locals
  priority: number; // Higher number = higher rendering priority
  iso_a2?: string;
  iso_a3?: string;
  parentContinent?: string;
  parentCountry?: string;
  parentState?: string;
  detail?: string;
  population?: number;
}}

/**
 * Authoritative global GIS places database derived from Natural Earth cultural dataset.
 * Covers all {len(country_db_entries)} sovereign countries & territories, continents, oceans,
 * administrative divisions, and major populated places.
 */
export const GIS_PLACES: GISPlace[] = {json.dumps(all_places, indent=2, ensure_ascii=False)};

/**
 * Lookup a GIS place by its unique ID or ISO code
 */
export function findPlaceById(id: string): GISPlace | undefined {{
  const lower = id.toLowerCase();
  return GIS_PLACES.find(
    (p) =>
      p.id.toLowerCase() === lower ||
      (p.iso_a3 && p.iso_a3.toLowerCase() === lower) ||
      (p.iso_a2 && p.iso_a2.toLowerCase() === lower)
  );
}}

/**
 * Fast prefix & fuzzy search for countries, places, and geographical features
 */
export function searchGISPlaces(query: string, limit = 15): GISPlace[] {{
  if (!query || !query.trim()) return [];
  const q = query.trim().toLowerCase();

  const exactMatches: GISPlace[] = [];
  const startsWithMatches: GISPlace[] = [];
  const containsMatches: GISPlace[] = [];

  for (const place of GIS_PLACES) {{
    const nameLower = place.name.toLowerCase();
    const formalLower = place.formal_name?.toLowerCase() || '';
    const iso2Lower = place.iso_a2?.toLowerCase() || '';
    const iso3Lower = place.iso_a3?.toLowerCase() || '';

    if (nameLower === q || iso2Lower === q || iso3Lower === q) {{
      exactMatches.push(place);
    }} else if (nameLower.startsWith(q) || iso2Lower.startsWith(q) || iso3Lower.startsWith(q)) {{
      startsWithMatches.push(place);
    }} else if (nameLower.includes(q) || formalLower.includes(q)) {{
      containsMatches.push(place);
    }}
  }}

  const results = [...exactMatches, ...startsWithMatches, ...containsMatches];
  return results.slice(0, limit);
}}

/**
 * Filter GIS places based on current camera zoom distance and viewpoint
 */
export function getVisibleGISPlaces(
  cameraDistance: number,
  centerLat: number,
  centerLon: number,
  maxDisplayCount = 60
): GISPlace[] {{
  const maxLevel = cameraDistance >= 5.2 ? 1 : cameraDistance >= 3.8 ? 2 : cameraDistance >= 2.8 ? 3 : 4;
  const candidates = GIS_PLACES.filter((p) => p.level <= maxLevel);

  if (maxLevel >= 2) {{
    // Prioritize places near center viewpoint, then by priority
    return candidates
      .map((place) => {{
        const dLat = place.lat - centerLat;
        let dLon = Math.abs(place.lon - centerLon);
        if (dLon > 180) dLon = 360 - dLon;
        const angularDist = Math.hypot(dLat, dLon);
        return {{ place, angularDist }};
      }})
      .sort((a, b) => {{
        // At close zooms, proximity to facing center is vital
        if (cameraDistance < 3.8 && Math.abs(a.angularDist - b.angularDist) > 35) {{
          return a.angularDist - b.angularDist;
        }}
        return b.place.priority - a.place.priority;
      }})
      .slice(0, maxDisplayCount)
      .map((item) => item.place);
  }}

  return candidates.sort((a, b) => b.priority - a.priority).slice(0, maxDisplayCount);
}}
"""
    with open(GIS_DB_OUT, "w", encoding="utf-8") as f:
        f.write(ts_code)
    print(f"Generated {GIS_DB_OUT} ({os.path.getsize(GIS_DB_OUT) / 1024:.1f} KB)")
    print("Geographic dataset build complete!")

if __name__ == "__main__":
    main()
