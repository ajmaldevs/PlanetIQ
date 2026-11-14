import * as THREE from 'three';

// Convert (Lat, Lon) in degrees to 3D Cartesian coordinates on sphere of given radius
function latLonToVector3(lat: number, lon: number, radius: number): THREE.Vector3 {
  const phi = (90 - lat) * (Math.PI / 180);
  const theta = (lon + 180) * (Math.PI / 180);
  return new THREE.Vector3(
    -radius * Math.sin(phi) * Math.cos(theta),
    radius * Math.cos(phi),
    radius * Math.sin(phi) * Math.sin(theta)
  );
}

export interface VectorBoundariesMeshGroup {
  group: THREE.Group;
  countryLines: THREE.LineSegments | null;
  coastlineLines: THREE.LineSegments | null;
  stateLines: THREE.LineSegments | null;
  updateLOD: (cameraDistance: number) => void;
  dispose: () => void;
}

/**
 * Parses GeoJSON line or polygon features into a Three.js LineSegments BufferGeometry
 */
function createLineSegmentsFromGeoJSON(geojson: any, radius: number): THREE.BufferGeometry {
  const geometry = new THREE.BufferGeometry();
  const positions: number[] = [];

  const addLine = (coords: number[][]) => {
    for (let i = 0; i < coords.length - 1; i++) {
      const p1 = coords[i];
      const p2 = coords[i + 1];

      // Discard invalid points or antimeridian wraparound discontinuities (>180 deg jump)
      if (Math.abs(p1[0] - p2[0]) > 180) continue;
      // Discard polar cap artifacts
      if (Math.abs(p1[1]) > 89.0 && Math.abs(p2[1]) > 89.0 && Math.abs(p1[0] - p2[0]) > 60) continue;

      const v1 = latLonToVector3(p1[1], p1[0], radius);
      const v2 = latLonToVector3(p2[1], p2[0], radius);

      positions.push(v1.x, v1.y, v1.z);
      positions.push(v2.x, v2.y, v2.z);
    }
  };

  if (geojson && geojson.features) {
    for (const feature of geojson.features) {
      const geom = feature.geometry;
      if (!geom) continue;

      if (geom.type === 'LineString') {
        addLine(geom.coordinates);
      } else if (geom.type === 'MultiLineString') {
        for (const line of geom.coordinates) {
          addLine(line);
        }
      } else if (geom.type === 'Polygon') {
        for (const ring of geom.coordinates) {
          addLine(ring);
        }
      } else if (geom.type === 'MultiPolygon') {
        for (const poly of geom.coordinates) {
          for (const ring of poly) {
            addLine(ring);
          }
        }
      }
    }
  }

  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  return geometry;
}

/**
 * Asynchronously loads authentic Natural Earth vector boundaries and attaches them as 3D vector lines
 */
export async function loadVectorBoundaries(earthRadius = 1.9): Promise<VectorBoundariesMeshGroup> {
  const group = new THREE.Group();
  group.name = 'vector-boundaries-group';
  const vectorRadius = earthRadius * 1.0012; // Hovers cleanly millimeters above surface

  let countryLines: THREE.LineSegments | null = null;
  let coastlineLines: THREE.LineSegments | null = null;
  let stateLines: THREE.LineSegments | null = null;

  try {
    // 1. Fetch Authoritative Country Boundaries (all sovereign countries and island territories)
    let countryRes = await fetch('/data/geo/ne_country_boundaries.geojson');
    if (!countryRes.ok) {
      // Fallback to 110m land lines
      countryRes = await fetch('/data/geo/ne_110m_admin_0_boundary_lines_land.geojson');
    }
    if (countryRes.ok) {
      const countryData = await countryRes.json();
      const countryGeom = createLineSegmentsFromGeoJSON(countryData, vectorRadius);
      const countryMat = new THREE.LineBasicMaterial({
        color: 0xe2e8f0, // Crisp silver-white for sovereign borders
        transparent: true,
        opacity: 0.55,
        depthTest: true,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: -1,
        polygonOffsetUnits: -1,
      });
      countryLines = new THREE.LineSegments(countryGeom, countryMat);
      countryLines.name = 'vector-country-boundaries';
      group.add(countryLines);
    }

    // 2. Fetch Coastlines (ne_110m_coastline.geojson)
    const coastRes = await fetch('/data/geo/ne_110m_coastline.geojson');
    if (coastRes.ok) {
      const coastData = await coastRes.json();
      const coastGeom = createLineSegmentsFromGeoJSON(coastData, vectorRadius);
      const coastMat = new THREE.LineBasicMaterial({
        color: 0x38bdf8, // Subtle ocean-cyan for coastlines
        transparent: true,
        opacity: 0.40,
        depthTest: true,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: -1,
        polygonOffsetUnits: -1,
      });
      coastlineLines = new THREE.LineSegments(coastGeom, coastMat);
      coastlineLines.name = 'vector-coastlines';
      group.add(coastlineLines);
    }

    // 3. Fetch States / Provinces (ne_50m_admin_1_states_provinces_lines.geojson)
    const stateRes = await fetch('/data/geo/ne_50m_admin_1_states_provinces_lines.geojson');
    if (stateRes.ok) {
      const stateData = await stateRes.json();
      const stateGeom = createLineSegmentsFromGeoJSON(stateData, vectorRadius);
      const stateMat = new THREE.LineBasicMaterial({
        color: 0xf59e0b, // Warm amber for first-level administrative divisions
        transparent: true,
        opacity: 0.0, // Fades in when camera zooms closer than 4.5
        depthTest: true,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: -1,
        polygonOffsetUnits: -1,
      });
      stateLines = new THREE.LineSegments(stateGeom, stateMat);
      stateLines.name = 'vector-state-boundaries';
      group.add(stateLines);
    }
  } catch (err) {
    console.warn('Vector boundaries could not be fully loaded, falling back gracefully:', err);
  }

  const updateLOD = (cameraDistance: number) => {
    // Country boundaries: softly visible at global distance, crisp up close
    if (countryLines && countryLines.material instanceof THREE.LineBasicMaterial) {
      const alpha = Math.min(0.65, Math.max(0.20, (5.8 - cameraDistance) / 2.0));
      countryLines.material.opacity = alpha;
    }

    // Coastlines: subtle atmospheric contrast
    if (coastlineLines && coastlineLines.material instanceof THREE.LineBasicMaterial) {
      const alpha = Math.min(0.45, Math.max(0.15, (6.0 - cameraDistance) / 2.5));
      coastlineLines.material.opacity = alpha;
    }

    // States & Provinces (e.g. Kerala, Tamil Nadu, California, Bavaria): fade in when dist < 4.2
    if (stateLines && stateLines.material instanceof THREE.LineBasicMaterial) {
      const alpha = Math.min(0.40, Math.max(0.0, (4.2 - cameraDistance) / 0.8));
      stateLines.visible = alpha > 0.01;
      stateLines.material.opacity = alpha;
    }
  };

  const dispose = () => {
    if (countryLines) {
      countryLines.geometry.dispose();
      (countryLines.material as THREE.Material).dispose();
    }
    if (coastlineLines) {
      coastlineLines.geometry.dispose();
      (coastlineLines.material as THREE.Material).dispose();
    }
    if (stateLines) {
      stateLines.geometry.dispose();
      (stateLines.material as THREE.Material).dispose();
    }
    group.clear();
  };

  return {
    group,
    countryLines,
    coastlineLines,
    stateLines,
    updateLOD,
    dispose,
  };
}
