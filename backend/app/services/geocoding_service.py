import json
import os
import re
from typing import List, Dict, Any
from app.schemas.geocoding import GeocodingResult, GeocodingSearchResponse

# Major Natural Features Database (Rivers, Lakes, Mountain Ranges, Seas)
NATURAL_FEATURES: List[Dict[str, Any]] = [
    # Rivers
    {"id": "feat-river-nile", "name": "Nile River", "category": "Natural Feature", "level": 2, "priority": 90, "lat": 18.0, "lon": 31.0, "parent_continent": "Africa", "detail": "Longest global river system • East & Northeast Africa basin", "bbox": [29.0, -3.0, 34.0, 31.5]},
    {"id": "feat-river-amazon", "name": "Amazon River", "category": "Natural Feature", "level": 2, "priority": 90, "lat": -3.4, "lon": -60.0, "parent_continent": "South America", "detail": "Largest global river discharge • Equatorial rainforest basin", "bbox": [-78.0, -18.0, -50.0, 5.0]},
    {"id": "feat-river-yangtze", "name": "Yangtze River", "category": "Natural Feature", "level": 2, "priority": 88, "lat": 31.2, "lon": 112.0, "parent_continent": "Asia", "parent_country": "China", "detail": "Major East Asian water artery & hydroelectric corridor", "bbox": [90.0, 24.5, 122.0, 35.5]},
    {"id": "feat-river-mississippi", "name": "Mississippi River", "category": "Natural Feature", "level": 2, "priority": 88, "lat": 38.0, "lon": -90.0, "parent_continent": "North America", "parent_country": "United States", "detail": "Primary North American drainage basin & agricultural conduit", "bbox": [-95.0, 29.0, -88.0, 47.5]},
    {"id": "feat-river-danube", "name": "Danube River", "category": "Natural Feature", "level": 2, "priority": 85, "lat": 45.2, "lon": 20.0, "parent_continent": "Europe", "detail": "Central & Southeastern European river crossing 10 nations", "bbox": [8.0, 43.5, 30.0, 49.5]},
    {"id": "feat-river-ganges", "name": "Ganges River", "category": "Natural Feature", "level": 2, "priority": 88, "lat": 25.5, "lon": 85.0, "parent_continent": "Asia", "parent_country": "India", "detail": "Sacred Indo-Gangetic river plain • High seasonal monsoon runoff", "bbox": [78.0, 22.0, 90.0, 31.0]},
    {"id": "feat-river-congo", "name": "Congo River", "category": "Natural Feature", "level": 2, "priority": 86, "lat": 0.0, "lon": 20.0, "parent_continent": "Africa", "detail": "Deepest global river & Central African tropical rainforest basin", "bbox": [12.0, -12.0, 32.0, 5.0]},
    {"id": "feat-river-volga", "name": "Volga River", "category": "Natural Feature", "level": 2, "priority": 85, "lat": 53.0, "lon": 48.0, "parent_continent": "Europe", "parent_country": "Russia", "detail": "Longest river in Europe discharging into the Caspian Sea", "bbox": [32.0, 45.0, 50.0, 58.0]},
    {"id": "feat-river-mekong", "name": "Mekong River", "category": "Natural Feature", "level": 2, "priority": 86, "lat": 15.0, "lon": 105.0, "parent_continent": "Asia", "detail": "Trans-boundary Southeast Asian river supporting massive delta rice bowl", "bbox": [94.0, 9.5, 107.0, 33.5]},
    {"id": "feat-river-rhine", "name": "Rhine River", "category": "Natural Feature", "level": 2, "priority": 84, "lat": 50.0, "lon": 8.0, "parent_continent": "Europe", "detail": "Primary Western European commercial navigation waterway", "bbox": [6.0, 46.5, 9.5, 52.0]},

    # Lakes & Inland Seas
    {"id": "feat-lake-caspian", "name": "Caspian Sea", "category": "Natural Feature", "level": 1, "priority": 92, "lat": 41.5, "lon": 51.0, "parent_continent": "Asia / Europe", "detail": "Largest enclosed inland body of water on Earth", "bbox": [46.5, 36.5, 54.5, 47.0]},
    {"id": "feat-lake-superior", "name": "Lake Superior", "category": "Natural Feature", "level": 2, "priority": 88, "lat": 47.7, "lon": -87.5, "parent_continent": "North America", "detail": "Largest freshwater lake by surface area • US / Canada border", "bbox": [-92.2, 46.4, -84.3, 49.0]},
    {"id": "feat-lake-victoria", "name": "Lake Victoria", "category": "Natural Feature", "level": 2, "priority": 88, "lat": -1.0, "lon": 33.0, "parent_continent": "Africa", "detail": "Largest African tropical lake • Source of White Nile", "bbox": [31.5, -3.0, 34.9, 0.5]},
    {"id": "feat-lake-baikal", "name": "Lake Baikal", "category": "Natural Feature", "level": 2, "priority": 88, "lat": 53.5, "lon": 108.0, "parent_continent": "Asia", "parent_country": "Russia", "detail": "Deepest and oldest global freshwater rift lake (20% unfrozen surface water)", "bbox": [103.5, 51.4, 109.9, 55.8]},
    {"id": "feat-lake-tanganyika", "name": "Lake Tanganyika", "category": "Natural Feature", "level": 2, "priority": 84, "lat": -6.0, "lon": 29.5, "parent_continent": "Africa", "detail": "Second-deepest global lake in the East African Rift Valley", "bbox": [29.0, -8.8, 31.2, -3.3]},
    {"id": "feat-lake-michigan", "name": "Lake Michigan", "category": "Natural Feature", "level": 2, "priority": 86, "lat": 44.0, "lon": -87.0, "parent_continent": "North America", "parent_country": "United States", "detail": "Great Lakes basin • Entirely within United States", "bbox": [-88.0, 41.6, -84.7, 46.1]},
    {"id": "feat-lake-huron", "name": "Lake Huron", "category": "Natural Feature", "level": 2, "priority": 85, "lat": 44.8, "lon": -82.4, "parent_continent": "North America", "detail": "Great Lakes freshwater system • US / Canada border", "bbox": [-84.8, 43.0, -79.7, 46.3]},

    # Mountains & Mountain Ranges
    {"id": "feat-mt-everest", "name": "Mount Everest", "formal_name": "Sagarmatha / Chomolungma", "category": "Natural Feature", "level": 3, "priority": 95, "lat": 27.9881, "lon": 86.9250, "parent_continent": "Asia", "parent_country": "Nepal / China", "detail": "Highest mountain peak above sea level on Earth (8,848.86 m)", "bbox": [86.7, 27.8, 87.1, 28.1]},
    {"id": "feat-mt-k2", "name": "K2 (Mount Godwin-Austen)", "category": "Natural Feature", "level": 3, "priority": 92, "lat": 35.8825, "lon": 76.5133, "parent_continent": "Asia", "parent_country": "Pakistan / China", "detail": "Second-highest peak on Earth (8,611 m) • Karakoram range", "bbox": [76.3, 35.7, 76.7, 36.0]},
    {"id": "feat-mt-kilimanjaro", "name": "Mount Kilimanjaro", "category": "Natural Feature", "level": 3, "priority": 92, "lat": -3.0674, "lon": 37.3556, "parent_continent": "Africa", "parent_country": "Tanzania", "detail": "Highest peak in Africa (5,895 m) • Free-standing volcanic massif", "bbox": [37.2, -3.2, 37.5, -2.9]},
    {"id": "feat-mt-blanc", "name": "Mont Blanc", "category": "Natural Feature", "level": 3, "priority": 90, "lat": 45.8326, "lon": 6.8652, "parent_continent": "Europe", "parent_country": "France / Italy", "detail": "Highest summit in the Alps and Western Europe (4,808 m)", "bbox": [6.7, 45.7, 7.0, 46.0]},
    {"id": "feat-mt-fuji", "name": "Mount Fuji", "category": "Natural Feature", "level": 3, "priority": 90, "lat": 35.3606, "lon": 138.7274, "parent_continent": "Asia", "parent_country": "Japan", "detail": "Iconic stratovolcano and highest peak in Japan (3,776 m)", "bbox": [138.6, 35.2, 138.9, 35.5]},
    {"id": "feat-range-himalayas", "name": "Himalayas", "category": "Natural Feature", "level": 2, "priority": 94, "lat": 28.0, "lon": 84.0, "parent_continent": "Asia", "detail": "Highest mountain range on Earth • Asian continent collision zone", "bbox": [73.0, 26.0, 95.0, 36.0]},
    {"id": "feat-range-andes", "name": "Andes Mountains", "category": "Natural Feature", "level": 2, "priority": 93, "lat": -22.0, "lon": -68.0, "parent_continent": "South America", "detail": "Longest continental mountain range in the world (7,000 km)", "bbox": [-78.0, -55.0, -64.0, 11.0]},
    {"id": "feat-range-rockies", "name": "Rocky Mountains", "category": "Natural Feature", "level": 2, "priority": 92, "lat": 44.0, "lon": -110.0, "parent_continent": "North America", "detail": "Major North American mountain cordillera (4,800 km)", "bbox": [-125.0, 35.0, -105.0, 60.0]},
    {"id": "feat-range-alps", "name": "Alps", "category": "Natural Feature", "level": 2, "priority": 92, "lat": 46.5, "lon": 10.0, "parent_continent": "Europe", "detail": "Highest and most extensive mountain range system entirely in Europe", "bbox": [5.0, 44.0, 16.0, 48.0]},
    {"id": "feat-range-urall", "name": "Ural Mountains", "category": "Natural Feature", "level": 2, "priority": 88, "lat": 60.0, "lon": 60.0, "parent_continent": "Europe / Asia", "parent_country": "Russia", "detail": "Traditional geographic boundary dividing Europe and Asia", "bbox": [57.0, 50.0, 62.0, 69.0]},

    # Major Seas & Ocean Basins
    {"id": "sea-mediterranean", "name": "Mediterranean Sea", "category": "Ocean", "level": 1, "priority": 95, "lat": 35.0, "lon": 18.0, "parent_continent": "Atlantic Ocean", "detail": "Intercontinental sea connected to the Atlantic Ocean via Strait of Gibraltar", "bbox": [-5.5, 30.0, 36.0, 46.0]},
    {"id": "sea-caribbean", "name": "Caribbean Sea", "category": "Ocean", "level": 1, "priority": 94, "lat": 15.0, "lon": -75.0, "parent_continent": "Atlantic Ocean", "detail": "Tropical sea of the Western Hemisphere in the Atlantic subduction basin", "bbox": [-88.0, 9.0, -60.0, 22.0]},
    {"id": "sea-south-china", "name": "South China Sea", "category": "Ocean", "level": 1, "priority": 94, "lat": 12.0, "lon": 113.0, "parent_continent": "Pacific Ocean", "detail": "Major marginal sea of the Western Pacific Ocean", "bbox": [102.0, 3.0, 121.0, 23.0]},
    {"id": "sea-arabian", "name": "Arabian Sea", "category": "Ocean", "level": 1, "priority": 93, "lat": 16.0, "lon": 64.0, "parent_continent": "Indian Ocean", "detail": "Northwestern Indian Ocean basin bordered by India, Pakistan, and Arabia", "bbox": [50.0, 9.0, 75.0, 25.0]},
    {"id": "sea-red", "name": "Red Sea", "category": "Ocean", "level": 1, "priority": 91, "lat": 20.0, "lon": 38.0, "parent_continent": "Indian Ocean", "detail": "Seawater inlet of the Indian Ocean lying between Africa and Asia", "bbox": [32.0, 12.5, 43.5, 30.0]},
    {"id": "sea-baltic", "name": "Baltic Sea", "category": "Ocean", "level": 1, "priority": 90, "lat": 58.0, "lon": 20.0, "parent_continent": "Atlantic Ocean", "detail": "Arm of the Atlantic Ocean enclosed by Scandinavia, Finland, and Baltic states", "bbox": [9.5, 53.5, 30.0, 66.0]},
    {"id": "sea-north", "name": "North Sea", "category": "Ocean", "level": 1, "priority": 91, "lat": 56.0, "lon": 3.0, "parent_continent": "Atlantic Ocean", "detail": "Marginal sea of the Atlantic Ocean between Great Britain and northwestern Europe", "bbox": [-4.0, 51.0, 9.0, 61.5]},
    {"id": "sea-black", "name": "Black Sea", "category": "Ocean", "level": 1, "priority": 92, "lat": 43.5, "lon": 34.0, "parent_continent": "Atlantic Ocean", "detail": "Marginal mediterranean sea between Southeastern Europe and Western Asia", "bbox": [27.5, 40.8, 41.8, 46.6]},
    {"id": "sea-bering", "name": "Bering Sea", "category": "Ocean", "level": 1, "priority": 90, "lat": 58.0, "lon": -175.0, "parent_continent": "Pacific Ocean", "detail": "Marginal sea of northern Pacific Ocean bounded by Alaska and Kamchatka", "bbox": [-180.0, 52.0, 180.0, 66.0]},
    {"id": "sea-coral", "name": "Coral Sea", "category": "Ocean", "level": 1, "priority": 91, "lat": -18.0, "lon": 152.0, "parent_continent": "Pacific Ocean", "detail": "Marginal sea off the northeast coast of Australia containing the Great Barrier Reef", "bbox": [142.0, -26.0, 160.0, -10.0]},
]

# Disambiguation definitions for cities with duplicate names
DISAMBIGUATED_PLACES: List[Dict[str, Any]] = [
    {
        "id": "city-paris-fr",
        "name": "Paris",
        "category": "City",
        "level": 4,
        "priority": 95,
        "lat": 48.8566,
        "lon": 2.3522,
        "parent_country": "France",
        "parent_state": "Île-de-France",
        "parent_continent": "Europe",
        "iso_a2": "FR",
        "iso_a3": "FRA",
        "detail": "Capital of France • Global cultural & economic metropolis",
        "population": 2161000,
    },
    {
        "id": "city-paris-us-tx",
        "name": "Paris (Texas)",
        "category": "City",
        "level": 4,
        "priority": 60,
        "lat": 33.6609,
        "lon": -95.5555,
        "parent_country": "United States",
        "parent_state": "Texas",
        "parent_continent": "North America",
        "iso_a2": "US",
        "iso_a3": "USA",
        "detail": "City in Lamar County, Texas, United States",
        "population": 24476,
    },
    {
        "id": "city-london-uk",
        "name": "London",
        "category": "City",
        "level": 4,
        "priority": 95,
        "lat": 51.5074,
        "lon": -0.1278,
        "parent_country": "United Kingdom",
        "parent_state": "England",
        "parent_continent": "Europe",
        "iso_a2": "GB",
        "iso_a3": "GBR",
        "detail": "Capital of the United Kingdom • Synoptic atmospheric corridor",
        "population": 8982000,
    },
    {
        "id": "city-london-ca-on",
        "name": "London (Ontario)",
        "category": "City",
        "level": 4,
        "priority": 65,
        "lat": 42.9849,
        "lon": -81.2453,
        "parent_country": "Canada",
        "parent_state": "Ontario",
        "parent_continent": "North America",
        "iso_a2": "CA",
        "iso_a3": "CAN",
        "detail": "City in Southwestern Ontario, Canada • Great Lakes basin",
        "population": 422324,
    },
    {
        "id": "city-santiago-cl",
        "name": "Santiago",
        "category": "City",
        "level": 4,
        "priority": 90,
        "lat": -33.4489,
        "lon": -70.6693,
        "parent_country": "Chile",
        "parent_state": "Santiago Metropolitan",
        "parent_continent": "South America",
        "iso_a2": "CL",
        "iso_a3": "CHL",
        "detail": "Capital of Chile • Central Andean valley & Pacific Humboldt influence",
        "population": 6257000,
    },
    {
        "id": "city-santiago-es",
        "name": "Santiago de Compostela",
        "category": "City",
        "level": 4,
        "priority": 70,
        "lat": 42.8782,
        "lon": -8.5448,
        "parent_country": "Spain",
        "parent_state": "Galicia",
        "parent_continent": "Europe",
        "iso_a2": "ES",
        "iso_a3": "ESP",
        "detail": "Historic capital of Galicia, Spain",
        "population": 97848,
    },
    {
        "id": "city-san-jose-cr",
        "name": "San José (Costa Rica)",
        "category": "City",
        "level": 4,
        "priority": 85,
        "lat": 9.9281,
        "lon": -84.0907,
        "parent_country": "Costa Rica",
        "parent_continent": "North America",
        "iso_a2": "CR",
        "iso_a3": "CRI",
        "detail": "Capital of Costa Rica • Central American cordillera",
        "population": 342188,
    },
    {
        "id": "city-san-jose-us-ca",
        "name": "San Jose (California)",
        "category": "City",
        "level": 4,
        "priority": 85,
        "lat": 37.3382,
        "lon": -121.8863,
        "parent_country": "United States",
        "parent_state": "California",
        "parent_continent": "North America",
        "iso_a2": "US",
        "iso_a3": "USA",
        "detail": "Silicon Valley metropolis, California, United States",
        "population": 1013240,
    },
    {
        "id": "city-kozhikode-in",
        "name": "Kozhikode (Calicut)",
        "formal_name": "Calicut",
        "category": "City",
        "level": 4,
        "priority": 85,
        "lat": 11.2588,
        "lon": 75.7804,
        "parent_country": "India",
        "parent_state": "Kerala",
        "parent_continent": "Asia",
        "iso_a2": "IN",
        "iso_a3": "IND",
        "detail": "Coastal port city in Kerala, India • Malabar Coast & Arabian Sea",
        "population": 609224,
    },
]


class GeocodingService:
    _index_initialized = False
    _places: List[Dict[str, Any]] = []
    _country_bboxes: Dict[str, List[float]] = {}
    _cache: Dict[str, List[GeocodingResult]] = {}

    @classmethod
    def _initialize_index(cls) -> None:
        if cls._index_initialized:
            return

        # 1. Load country bounding boxes
        base_dir = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
        bbox_path = os.path.join(base_dir, "scripts", "country_bboxes.json")
        if os.path.exists(bbox_path):
            with open(bbox_path, "r", encoding="utf-8") as f:
                cls._country_bboxes = json.load(f)

        # 2. Load authoritative Natural Earth countries
        geo_path = os.path.join(os.path.dirname(base_dir), "frontend", "public", "data", "geo", "ne_countries.geojson")
        if os.path.exists(geo_path):
            try:
                with open(geo_path, "r", encoding="utf-8") as f:
                    geo_data = json.load(f)
                    for feat in geo_data.get("features", []):
                        props = feat.get("properties", {})
                        name = props.get("name", "")
                        if not name:
                            continue
                        iso_a2 = props.get("iso_a2")
                        iso_a3 = props.get("iso_a3")
                        center_lat = props.get("center_lat", 0.0)
                        center_lon = props.get("center_lon", 0.0)
                        bbox = cls._country_bboxes.get(name.lower())

                        cls._places.append({
                            "id": f"cntry-{iso_a3.lower() if iso_a3 else name.lower()}",
                            "name": name,
                            "formal_name": props.get("formal_name"),
                            "category": "Country",
                            "level": 2,
                            "priority": 100,
                            "lat": center_lat,
                            "lon": center_lon,
                            "bbox": bbox,
                            "iso_a2": iso_a2,
                            "iso_a3": iso_a3,
                            "parent_continent": props.get("continent"),
                            "population": props.get("pop_est"),
                            "detail": f"{props.get('continent', '')} • Sovereign Nation [{iso_a3 or ''}]",
                        })
            except Exception as e:
                print(f"Warning: Failed loading ne_countries.geojson in GeocodingService: {e}")

        # 3. Add Natural Features
        cls._places.extend(NATURAL_FEATURES)

        # 4. Add Disambiguated Cities
        cls._places.extend(DISAMBIGUATED_PLACES)

        # 5. Load GIS Places from TypeScript file if available
        gis_ts_path = os.path.join(os.path.dirname(base_dir), "frontend", "src", "services", "gisDatabase.ts")
        if os.path.exists(gis_ts_path):
            try:
                with open(gis_ts_path, "r", encoding="utf-8") as f:
                    content = f.read()
                    # Extract GIS_PLACES JSON array
                    match = re.search(r"export const GIS_PLACES:\s*GISPlace\[\]\s*=\s*(\[.*?\]);", content, re.DOTALL)
                    if match:
                        raw_places = json.loads(match.group(1))
                        existing_ids = {p["id"] for p in cls._places}
                        for p in raw_places:
                            if p["id"] in existing_ids:
                                continue
                            cat = "City"
                            if p.get("category") == "country":
                                cat = "Country"
                            elif p.get("category") == "state":
                                cat = "State / Province"
                            elif p.get("category") == "continent":
                                cat = "Continent"
                            elif p.get("category") == "ocean":
                                cat = "Ocean"
                            elif p.get("category") == "natural_feature":
                                cat = "Natural Feature"

                            bbox = cls._country_bboxes.get(p["name"].lower()) if cat == "Country" else None
                            cls._places.append({
                                "id": p["id"],
                                "name": p["name"],
                                "formal_name": p.get("formal_name"),
                                "category": cat,
                                "level": p.get("level", 4),
                                "priority": p.get("priority", 50),
                                "lat": p["lat"],
                                "lon": p["lon"],
                                "bbox": bbox,
                                "iso_a2": p.get("iso_a2"),
                                "iso_a3": p.get("iso_a3"),
                                "parent_country": p.get("parentCountry"),
                                "parent_state": p.get("parentState"),
                                "parent_continent": p.get("parentContinent"),
                                "population": p.get("population"),
                                "detail": p.get("detail"),
                            })
            except Exception as e:
                print(f"Warning: Failed parsing GIS places in GeocodingService: {e}")

        cls._index_initialized = True

    @classmethod
    def search(cls, query: str, limit: int = 10) -> GeocodingSearchResponse:
        cls._initialize_index()
        q = query.strip().lower()
        if not q:
            return GeocodingSearchResponse(query=query, total_results=0, results=[])

        cache_key = f"{q}_{limit}"
        if cache_key in cls._cache:
            return GeocodingSearchResponse(
                query=query,
                total_results=len(cls._cache[cache_key]),
                results=cls._cache[cache_key],
            )

        scored_results = []
        for p in cls._places:
            score = 0
            name_lower = p["name"].lower()
            formal_lower = (p.get("formal_name") or "").lower()
            iso_a2 = (p.get("iso_a2") or "").lower()
            iso_a3 = (p.get("iso_a3") or "").lower()
            detail = (p.get("detail") or "").lower()
            cat = p.get("category", "").lower()
            state = (p.get("parent_state") or "").lower()
            country = (p.get("parent_country") or "").lower()

            # Exact match bonus
            if name_lower == q or iso_a2 == q or iso_a3 == q or formal_lower == q:
                score += 1500
            elif name_lower.startswith(q) or iso_a3.startswith(q):
                score += 800
            elif q in name_lower or q in formal_lower:
                score += 400
            elif q in detail or q in state or q in country:
                score += 150
            elif q in cat:
                score += 50
            else:
                # Check token containment
                tokens = q.split()
                if all(tok in name_lower or tok in detail or tok in country for tok in tokens):
                    score += 250
                else:
                    continue

            # Prioritize higher LOD / population
            score += p.get("priority", 0) * 2
            if p.get("population"):
                score += min(50, int(p["population"] / 100000))

            scored_results.append((score, p))

        scored_results.sort(key=lambda x: x[0], reverse=True)
        top = scored_results[:limit]

        final_results = [
            GeocodingResult(
                id=item["id"],
                name=item["name"],
                formal_name=item.get("formal_name"),
                category=item["category"],
                level=item["level"],
                priority=item["priority"],
                latitude=item["lat"],
                longitude=item["lon"],
                bbox=item.get("bbox"),
                iso_a2=item.get("iso_a2"),
                iso_a3=item.get("iso_a3"),
                parent_country=item.get("parent_country"),
                parent_state=item.get("parent_state"),
                parent_continent=item.get("parent_continent"),
                population=item.get("population"),
                detail=item.get("detail"),
            )
            for _, item in top
        ]

        cls._cache[cache_key] = final_results
        return GeocodingSearchResponse(
            query=query,
            total_results=len(final_results),
            results=final_results,
        )
