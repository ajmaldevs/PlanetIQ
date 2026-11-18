import json

data = json.load(open('frontend/public/data/geo/ne_countries.geojson', encoding='utf-8'))
country_bboxes = {}

for f in data['features']:
    props = f['properties']
    name = props['name']
    geom = f['geometry']
    coords = geom['coordinates']

    # Flatten coordinates to find min/max lon and lat
    lons, lats = [], []
    def extract_pts(c):
        if isinstance(c[0], (int, float)):
            lons.append(c[0])
            lats.append(c[1])
        else:
            for sub in c:
                extract_pts(sub)
    extract_pts(coords)

    if lons and lats:
        min_lon = round(min(lons), 4)
        min_lat = round(min(lats), 4)
        max_lon = round(max(lons), 4)
        max_lat = round(max(lats), 4)
        bbox = [min_lon, min_lat, max_lon, max_lat]
        country_bboxes[name.lower()] = bbox
        if props.get('iso_a3'):
            country_bboxes[props['iso_a3'].lower()] = bbox
        if props.get('iso_a2'):
            country_bboxes[props['iso_a2'].lower()] = bbox
        if props.get('formal_name'):
            country_bboxes[props['formal_name'].lower()] = bbox

print(f"Generated bounding boxes for {len(country_bboxes)} country identifiers.")
with open('backend/scripts/country_bboxes.json', 'w', encoding='utf-8') as out:
    json.dump(country_bboxes, out, indent=2)
