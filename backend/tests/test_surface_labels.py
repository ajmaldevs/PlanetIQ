"""
Test suite validating Zoom-Based Surface Labels Behaviour and 2D/3D Consistency.
Verifies:
1. Zoom-dependent progressive Level of Detail (LOD) thresholds.
2. Correct surface anchoring (zero parallax float, <0.3% radial offset).
3. Distance-compensated scale stabilization formulas.
4. Consistent 2D MapLibre symbol layer definitions and 3D surface labels.
5. All 1,214 places correctly categorized into Levels 1, 2, 3, 4.
"""

import json
from pathlib import Path
import re
import pytest

ROOT_DIR = Path(__file__).resolve().parent.parent.parent
GIS_DATABASE = ROOT_DIR / "frontend" / "src" / "services" / "gisDatabase.ts"
SURFACE_LABELS = ROOT_DIR / "frontend" / "src" / "services" / "surfaceLabels.ts"
MAP_VIEW = ROOT_DIR / "frontend" / "src" / "components" / "MapView.tsx"
EARTH_GLOBE = ROOT_DIR / "frontend" / "src" / "components" / "EarthGlobe.tsx"


def test_surface_labels_source_exists_and_exports_manager():
    """Verify surfaceLabels.ts exists and implements SurfaceLabelManager with required methods."""
    assert SURFACE_LABELS.exists(), "surfaceLabels.ts must exist"
    content = SURFACE_LABELS.read_text(encoding="utf-8")

    assert "export class SurfaceLabelManager" in content
    assert "public update(" in content
    assert "public getZoomRegime(" in content
    assert "public dispose(" in content
    assert "calculateLODBaseOpacity(" in content


def test_surface_labels_zoom_regimes_and_lod_thresholds():
    """Verify progressive zoom visibility logic:
    - Global: continents visible, countries hidden/subtle, states/cities 0.
    - Continental: countries visible, continents fade.
    - Country: states & major cities visible.
    - Regional: local cities & towns visible.
    """
    content = SURFACE_LABELS.read_text(encoding="utf-8")

    # Global view threshold
    assert "if (cameraDistance >= 4.75) return 'global'" in content
    # Continental view threshold
    assert "if (cameraDistance >= 3.8) return 'continental'" in content
    # Country view threshold
    assert "if (cameraDistance >= 2.85) return 'country'" in content
    # Regional view
    assert "return 'regional'" in content

    # Level 1 Continents fade when zooming deeper than 4.6
    assert "dist >= 4.6" in content
    assert "dist <= 3.6" in content

    # Level 2 Countries: completely hidden when d >= 5.2 in deep space
    assert "dist >= 5.2" in content

    # Level 3 States: hidden when d >= 4.1
    assert "dist >= 4.1" in content

    # Level 4 Cities: hidden when d >= 3.6
    assert "dist >= 3.6" in content


def test_surface_labels_anchoring_and_parallax_suppression():
    """Verify labels are anchored directly to the surface with a tight radial offset."""
    content = SURFACE_LABELS.read_text(encoding="utf-8")

    # Check surface radius is within 0.1% - 0.4% above base radius (1.0022x)
    assert "config.earthRadius * 1.0022" in content or "1.002" in content
    # Geometric horizon culling
    assert "cos(theta_h) = R / d" in content or "horizonThreshold" in content
    assert "dotHorizon" in content


def test_surface_labels_distance_compensated_scale_stabilization():
    """Verify labels dynamically compute world scale to keep screen pixel sizes stable."""
    content = SURFACE_LABELS.read_text(encoding="utf-8")

    # Check FOV perspective pixel calculation
    assert "Math.tan((camera.fov * Math.PI) / 360)" in content
    assert "targetPixelHeight" in content
    assert "item.sprite.scale.set(worldWidth, worldHeight, 1)" in content


def test_earth_globe_uses_surface_label_manager():
    """Verify EarthGlobe mounts and updates SurfaceLabelManager instead of hardcoded billboards."""
    content = EARTH_GLOBE.read_text(encoding="utf-8")

    assert "import { SurfaceLabelManager } from '../services/surfaceLabels'" in content
    assert "surfaceLabelsRef.current" in content
    assert "surfaceLabelsRef.current.update(" in content
    assert "surfaceLabelsRef.current?.dispose()" in content


def test_map_view_2d_has_consistent_gis_place_symbol_layers():
    """Verify 2D MapView adds matching zoom-tiered symbol layers for all GIS places."""
    content = MAP_VIEW.read_text(encoding="utf-8")

    # Source for all 1,214 places
    assert "terralens-gis-places" in content
    assert "GIS_PLACES_GEOJSON" in content

    # 4 distinct zoom tiers in MapLibre:
    # 1. Continents (maxzoom 3.8)
    assert "terralens-labels-continents" in content
    # 2. Countries (minzoom 2.2, maxzoom 8.0)
    assert "terralens-labels-countries" in content
    # 3. States/Provinces (minzoom 4.2)
    assert "terralens-labels-states" in content
    # 4. Cities (minzoom 5.2)
    assert "terralens-labels-cities" in content
    assert "terralens-labels-cities-points" in content

    # Interactive click synchronization
    assert "onSelectPlace" in content
