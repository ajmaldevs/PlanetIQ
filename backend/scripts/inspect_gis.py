import re

content = open('frontend/src/services/gisDatabase.ts', 'r', encoding='utf-8').read()
cats = re.findall(r'"category":\s*"([^"]+)"', content)
print("Categories in GIS_PLACES:", {c: cats.count(c) for c in set(cats)})

# Check natural features, mountains, rivers, lakes
features = re.findall(r'"name":\s*"([^"]+)",\s*"category":\s*"([^"]+)"', content)
print(f"Total places: {len(features)}")
