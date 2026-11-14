import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { GeoJSONFeatureCollection, GeoJSONFeature } from '../services/api';
import { GIS_PLACES, GISPlace } from '../services/gisDatabase';
import { ImageryLODManager } from '../services/imageryLOD';
import { createCinematicSpaceEnvironment, SpaceEnvironment } from '../services/spaceEnvironment';
import { createEarthDayNightShader, EarthDayNightShaderBundle } from '../services/earthShader';
import { loadVectorBoundaries, VectorBoundariesMeshGroup } from '../services/vectorBoundaries';
import {
  ZoomIn,
  ZoomOut,
  Navigation,
  Compass,
  Layers,
  Globe as GlobeIcon,
} from 'lucide-react';

export type EarthModule = 'ocean' | 'atmosphere' | 'land' | null;
export type ZoomLevel = 'global' | 'continental' | 'country' | 'regional';

interface EarthGlobeProps {
  activeModule: EarthModule;
  data: GeoJSONFeatureCollection | null;
  loading?: boolean;
  onSelectFeature?: (feature: GeoJSONFeature) => void;
  selectedFeature?: GeoJSONFeature | null;
  onSelectPlace?: (place: GISPlace) => void;
  selectedPlace?: GISPlace | null;
  metricType?: string;
  className?: string;
  visible?: boolean;
  onZoomChange?: (zoom: ZoomLevel, distance: number) => void;
  onCenterCoordinatesChange?: (lat: number, lon: number) => void;
  sidePanelOpen?: boolean;
}

// Convert (Lat, Lon) in degrees to 3D Cartesian coordinates on sphere
function latLonToVector3(lat: number, lon: number, radius: number): THREE.Vector3 {
  const phi = (90 - lat) * (Math.PI / 180);
  const theta = (lon + 180) * (Math.PI / 180);
  return new THREE.Vector3(
    -radius * Math.sin(phi) * Math.cos(theta),
    radius * Math.cos(phi),
    radius * Math.sin(phi) * Math.sin(theta)
  );
}

// Generate high-resolution 2D canvas text sprites with dark contrast halos and category styling
function createGISLabelSprite(place: GISPlace): THREE.Sprite {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d')!;
  canvas.width = 440;
  canvas.height = 76;

  let fontSize = 21;
  let textColor = '#f8fafc';
  let isUppercase = false;

  if (place.level === 1) {
    // Continents & Major Oceans: wide tracked out
    fontSize = place.category === 'ocean' ? 22 : 23;
    textColor = place.category === 'ocean' ? '#7dd3fc' : '#94a3b8';
    isUppercase = true;
  } else if (place.level === 2) {
    // Sovereign Countries & Seas
    fontSize = 20;
    textColor = place.category === 'natural_feature' ? '#38bdf8' : '#ffffff';
  } else if (place.level === 3) {
    // States & Provinces (e.g., Kerala, California, Bavaria)
    fontSize = 18;
    textColor = '#fde047'; // warm amber tint for administrative divisions
  } else if (place.level === 4) {
    // Cities / Ports / Populated Places (e.g., Kozhikode, Mumbai, New York)
    fontSize = 17;
    textColor = '#e2e8f0';
  }

  const displayName = isUppercase ? place.name.toUpperCase() : place.name;

  ctx.font = `600 ${fontSize}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  const centerX = 220;
  const centerY = 38;

  // For cities, draw a small distinctive location dot
  if (place.level === 4) {
    ctx.beginPath();
    ctx.arc(centerX - ctx.measureText(displayName).width / 2 - 12, centerY, 3.5, 0, Math.PI * 2);
    ctx.fillStyle = '#38bdf8';
    ctx.fill();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = '#05070b';
    ctx.stroke();
  }

  // Crisp dark outline for universal contrast over deep oceans and bright sands
  ctx.strokeStyle = 'rgba(5, 7, 11, 0.92)';
  ctx.lineWidth = 5;
  ctx.lineJoin = 'round';
  ctx.strokeText(displayName, centerX, centerY);

  // Core clean typography fill
  ctx.fillStyle = textColor;
  ctx.fillText(displayName, centerX, centerY);

  const texture = new THREE.CanvasTexture(canvas);
  texture.minFilter = THREE.LinearFilter;

  const material = new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    depthTest: false,
    depthWrite: false,
  });

  const sprite = new THREE.Sprite(material);
  // Sprite sizing in 3D world coordinates
  const scaleX = place.level === 1 ? 0.48 : place.level === 2 ? 0.40 : place.level === 3 ? 0.35 : 0.32;
  const scaleY = scaleX * (76 / 440);
  sprite.scale.set(scaleX, scaleY, 1);
  return sprite;
}

// Derive scientific marker color for 3D observation overlay points
function getObservationColor(feature: GeoJSONFeature, activeModule: EarthModule, metricType: string): THREE.Color {
  if (activeModule === 'ocean') {
    const ssha = feature.properties.ssha_karin_m ?? 0;
    if (ssha <= -0.15) return new THREE.Color(0x2563eb); // cold cyclonic upwelling
    if (ssha < 0) return new THREE.Color(0x38bdf8);
    if (ssha <= 0.15) return new THREE.Color(0xf59e0b);
    return new THREE.Color(0xef4444); // warm anticyclonic eddy
  }

  if (activeModule === 'atmosphere') {
    if (metricType === 'rate') {
      const rate = feature.properties.precipitation_rate_mm_hr ?? 0;
      if (rate < 0.1) return new THREE.Color(0x38bdf8);
      if (rate < 0.3) return new THREE.Color(0x0284c7);
      if (rate < 0.5) return new THREE.Color(0x6366f1);
      return new THREE.Color(0xec4899);
    } else {
      const acc = feature.properties.precipitation_accumulated_mm ?? 0;
      if (acc < 80) return new THREE.Color(0x38bdf8);
      if (acc < 200) return new THREE.Color(0x0284c7);
      if (acc < 350) return new THREE.Color(0x6366f1);
      return new THREE.Color(0xec4899);
    }
  }

  if (activeModule === 'land') {
    const ndvi = feature.properties.ndvi ?? 0.5;
    if (ndvi < 0.2) return new THREE.Color(0xd97706); // arid/barren
    if (ndvi < 0.45) return new THREE.Color(0xca8a04); // savanna
    if (ndvi < 0.7) return new THREE.Color(0x84cc16); // temperate
    return new THREE.Color(0x10b981); // dense lush canopy
  }

  return new THREE.Color(0x38bdf8);
}

export const EarthGlobe: React.FC<EarthGlobeProps> = ({
  activeModule,
  data,
  loading = false,
  onSelectFeature,
  selectedFeature,
  onSelectPlace,
  selectedPlace,
  metricType = 'default',
  className = '',
  visible = true,
  onZoomChange,
  onCenterCoordinatesChange,
  sidePanelOpen = false,
}) => {
  // Leaf container specifically for Three.js canvas (isolated from React children)
  const canvasMountRef = useRef<HTMLDivElement>(null);

  // Zoom, center, and sidePanel refs to avoid stale animation closures
  const onZoomChangeRef = useRef(onZoomChange);
  onZoomChangeRef.current = onZoomChange;
  const onCenterCoordsRef = useRef(onCenterCoordinatesChange);
  onCenterCoordsRef.current = onCenterCoordinatesChange;
  const onSelectPlaceRef = useRef(onSelectPlace);
  onSelectPlaceRef.current = onSelectPlace;
  const sidePanelOpenRef = useRef(sidePanelOpen);
  sidePanelOpenRef.current = sidePanelOpen;
  const visibleRef = useRef(visible);
  visibleRef.current = visible;

  const currentZoomRef = useRef<ZoomLevel>('continental');
  const [currentZoomLevel, setCurrentZoomLevel] = useState<ZoomLevel>('continental');
  const [imageryResolution, setImageryResolution] = useState<string>('NASA Blue Marble (1km Base)');
  const lastCenterCalcRef = useRef(Date.now());

  // Camera horizontal glide & layer cross-fade refs
  const targetCameraX = useRef(0);
  const currentCameraX = useRef(0);
  const layerOpacityRef = useRef(1.0);
  const selectedHaloRef = useRef<THREE.Mesh | null>(null);

  // Three.js internal references
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const earthMeshRef = useRef<THREE.Mesh | null>(null);
  const cloudsMeshRef = useRef<THREE.Mesh | null>(null);
  const earthGroupRef = useRef<THREE.Group | null>(null);
  const lodTilesGroupRef = useRef<THREE.Group | null>(null);
  const markersGroupRef = useRef<THREE.Group | null>(null);
  const labelsGroupRef = useRef<THREE.Group | null>(null);
  const imageryLODRef = useRef<ImageryLODManager | null>(null);
  const vectorBoundariesRef = useRef<VectorBoundariesMeshGroup | null>(null);
  const spaceEnvRef = useRef<SpaceEnvironment | null>(null);
  const earthShadersRef = useRef<EarthDayNightShaderBundle | null>(null);
  const animFrameIdRef = useRef<number | null>(null);

  // Interaction & camera animation state
  const isDraggingRef = useRef(false);
  const prevMousePos = useRef({ x: 0, y: 0 });
  const targetRotation = useRef({ x: 0.12, y: -0.6 });
  const currentRotation = useRef({ x: 0.12, y: -0.6 });
  const targetCameraDistance = useRef(4.6);
  const currentCameraDistance = useRef(4.6);
  const lastInteractionTime = useRef(Date.now());
  const minDistance = 2.15; // Camera can zoom in deep to close orbit (~250km) for high-res tile inspection
  const maxDistance = 6.8;  // Wide space perspective

  // Fly-to camera animation
  const isFlyingToRef = useRef(false);
  const flyToTarget = useRef<{ x: number; y: number } | null>(null);

  const [isReady, setIsReady] = useState(false);

  // Smoothly glide camera and rotate to center specific lat/lon
  const flyToCoordinates = (lat: number, lon: number, targetDist?: number) => {
    const targetY = -((lon + 90) * (Math.PI / 180));
    const targetX = lat * (Math.PI / 180);

    flyToTarget.current = {
      x: Math.max(-1.15, Math.min(1.15, targetX)),
      y: targetY,
    };
    isFlyingToRef.current = true;
    lastInteractionTime.current = Date.now();

    if (targetDist !== undefined) {
      targetCameraDistance.current = targetDist;
    }
  };

  // Check if cursor coordinates intersect the Earth sphere
  const isPointerOverEarth = (clientX: number, clientY: number): boolean => {
    if (!cameraRef.current || !earthMeshRef.current) return false;
    const x = (clientX / window.innerWidth) * 2 - 1;
    const y = -(clientY / window.innerHeight) * 2 + 1;
    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(new THREE.Vector2(x, y), cameraRef.current);
    const hits = raycaster.intersectObject(earthMeshRef.current);
    return hits.length > 0;
  };

  // Initialize Three.js Realistic Cinematic Earth Scene
  useEffect(() => {
    const mount = canvasMountRef.current;
    if (!mount) return;

    const width = window.innerWidth;
    const height = window.innerHeight;

    // 1. Scene
    const scene = new THREE.Scene();
    sceneRef.current = scene;

    // 2. Camera with true full-viewport aspect ratio
    const camera = new THREE.PerspectiveCamera(42, width / height, 0.1, 1200);
    camera.position.set(0, 0, currentCameraDistance.current);
    cameraRef.current = camera;

    // 3. WebGL Renderer sized to entire viewport
    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      powerPreference: 'high-performance',
    });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;

    // Append canvas safely to leaf mount node
    mount.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // 4. Directional Sunlight matching NASA Deep Space Photography
    const sunlight = new THREE.DirectionalLight(0xfffaf0, 2.2);
    const sunPos = new THREE.Vector3(6.5, 2.8, 5.0);
    sunlight.position.copy(sunPos);
    scene.add(sunlight);

    // Deep space ambient fill (preserves soft visibility of dark hemisphere)
    const spaceAmbient = new THREE.AmbientLight(0x080f1d, 0.24);
    scene.add(spaceAmbient);

    // 5. Cinematic Space Environment (Sky Dome with Faint Cosmic Dust & Stellar Classes)
    const spaceEnv = createCinematicSpaceEnvironment();
    scene.add(spaceEnv.group);
    spaceEnvRef.current = spaceEnv;

    // 6. Earth Group Container
    const earthGroup = new THREE.Group();
    earthGroup.rotation.x = currentRotation.current.x;
    earthGroup.rotation.y = currentRotation.current.y;
    scene.add(earthGroup);
    earthGroupRef.current = earthGroup;

    // 7. Textures Setup (NASA Blue Marble Day + Black Marble Night Lights + Relief)
    const textureLoader = new THREE.TextureLoader();
    const earthRadius = 1.9;

    const dayTexture = textureLoader.load('/textures/earth/earth_day.jpg');
    const nightTexture = textureLoader.load('/textures/earth/earth_night.png');
    const normalTexture = textureLoader.load('/textures/earth/earth_normal.jpg');
    const specularTexture = textureLoader.load('/textures/earth/earth_specular.jpg');
    const cloudsTexture = textureLoader.load('/textures/earth/earth_clouds.png');

    // 8. Custom Earth Day/Night Shader & Rayleigh Atmospheric Scattering Limb
    const earthShaders = createEarthDayNightShader(
      dayTexture,
      nightTexture,
      normalTexture,
      specularTexture
    );
    earthShadersRef.current = earthShaders;
    earthShaders.updateSun(sunPos);

    // Earth Main Mesh with Day/Night Shader
    const earthGeometry = new THREE.SphereGeometry(earthRadius, 64, 64);
    const earthMesh = new THREE.Mesh(earthGeometry, earthShaders.earthMaterial);
    earthGroup.add(earthMesh);
    earthMeshRef.current = earthMesh;

    // 9. Authentic 3D Vector Geographic Boundaries (Countries, Coastlines, States)
    loadVectorBoundaries(earthRadius).then((vb) => {
      earthGroup.add(vb.group);
      vectorBoundariesRef.current = vb;
    });

    // 10. Multi-Resolution Imagery LOD Tiles Group (Spherical quadtree patches conforming to curvature)
    const lodTilesGroup = new THREE.Group();
    earthGroup.add(lodTilesGroup);
    lodTilesGroupRef.current = lodTilesGroup;
    imageryLODRef.current = new ImageryLODManager(earthRadius, lodTilesGroup);

    // 11. Independent Cloud Layer (Natural, Delicate 40% Opacity hugging Surface)
    const cloudsGeometry = new THREE.SphereGeometry(earthRadius * 1.004, 64, 64);
    const cloudsMaterial = new THREE.MeshStandardMaterial({
      map: cloudsTexture,
      transparent: true,
      opacity: 0.42,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const cloudsMesh = new THREE.Mesh(cloudsGeometry, cloudsMaterial);
    earthGroup.add(cloudsMesh);
    cloudsMeshRef.current = cloudsMesh;

    // 12. Razor-Thin Natural Atmospheric Limb (Twilight sunset glow on terminator, dark on shadow side)
    const atmosphereGeometry = new THREE.SphereGeometry(earthRadius * 1.008, 64, 64);
    const atmosphereMesh = new THREE.Mesh(atmosphereGeometry, earthShaders.atmosphereMaterial);
    earthGroup.add(atmosphereMesh);

    // 13. Scientific Observation Markers Group
    const markersGroup = new THREE.Group();
    earthGroup.add(markersGroup);
    markersGroupRef.current = markersGroup;

    // 14. Scalable GIS Place Names & Labels Group
    const labelsGroup = new THREE.Group();
    earthGroup.add(labelsGroup);
    labelsGroupRef.current = labelsGroup;

    // Populate Comprehensive GIS Labels onto the Globe
    GIS_PLACES.forEach((place) => {
      const pos = latLonToVector3(place.lat, place.lon, earthRadius * 1.011);
      const sprite = createGISLabelSprite(place);
      sprite.position.copy(pos);
      sprite.userData = {
        place,
      };
      labelsGroup.add(sprite);
    });

    setIsReady(true);

    // 15. Render Animation Loop with Serene Rotation & Multi-Resolution Tile Streamer
    let lastTimestamp = performance.now();
    const tempWorldPos = new THREE.Vector3();
    const tempNormal = new THREE.Vector3();
    const tempViewDir = new THREE.Vector3();
    const earthWorldPos = new THREE.Vector3();

    const animate = (timestamp: number) => {
      const delta = Math.min((timestamp - lastTimestamp) / 1000, 0.1);
      lastTimestamp = timestamp;

      if (!visibleRef.current) {
        animFrameIdRef.current = requestAnimationFrame(animate);
        return;
      }

      // Update cinematic celestial background & subtle dust drift
      if (spaceEnvRef.current) {
        spaceEnvRef.current.update(delta, timestamp);
      }

      // Slower, serene rotation: 1 revolution every 9 minutes (~0.0116 rad/sec)
      const now = Date.now();
      const timeSinceInteraction = now - lastInteractionTime.current;
      if (!isDraggingRef.current && !isFlyingToRef.current && timeSinceInteraction > 2500) {
        targetRotation.current.y += 0.0116 * delta;
      }

      // Smooth orientation interpolation using shortest spherical angular arc
      if (isFlyingToRef.current && flyToTarget.current) {
        currentRotation.current.x += (flyToTarget.current.x - currentRotation.current.x) * 0.08;

        let diffY = (flyToTarget.current.y - currentRotation.current.y) % (Math.PI * 2);
        if (diffY > Math.PI) diffY -= Math.PI * 2;
        if (diffY < -Math.PI) diffY += Math.PI * 2;
        currentRotation.current.y += diffY * 0.08;

        targetRotation.current.x = currentRotation.current.x;
        targetRotation.current.y = currentRotation.current.y;
        if (
          Math.abs(flyToTarget.current.x - currentRotation.current.x) < 0.002 &&
          Math.abs(diffY) < 0.002
        ) {
          targetRotation.current.x = flyToTarget.current.x;
          targetRotation.current.y = flyToTarget.current.y;
          isFlyingToRef.current = false;
        }
      } else {
        currentRotation.current.x += (targetRotation.current.x - currentRotation.current.x) * 0.12;
        currentRotation.current.y += (targetRotation.current.y - currentRotation.current.y) * 0.12;
      }

      if (earthGroupRef.current) {
        earthGroupRef.current.rotation.x = currentRotation.current.x;
        earthGroupRef.current.rotation.y = currentRotation.current.y;
      }

      // Independent dynamic cloud movement (drifts slightly faster than solid Earth)
      if (cloudsMeshRef.current) {
        cloudsMeshRef.current.rotation.y += 0.002 * delta;
      }

      // Smooth camera position and zoom interpolation with desktop panel glide
      currentCameraDistance.current +=
        (targetCameraDistance.current - currentCameraDistance.current) * 0.12;

      const shouldShift =
        sidePanelOpenRef.current && window.innerWidth >= 1024 && window.innerWidth < 1536;
      targetCameraX.current = shouldShift ? -0.42 : 0;
      currentCameraX.current += (targetCameraX.current - currentCameraX.current) * 0.08;

      if (cameraRef.current) {
        cameraRef.current.position.z = currentCameraDistance.current;
        cameraRef.current.position.x = currentCameraX.current;
      }

      // Adaptive Zoom Level & Resolution Scale Calculation
      const distNow = currentCameraDistance.current;
      let newLevel: ZoomLevel = 'global';
      let resBadge = 'NASA Blue Marble (1km Base)';

      if (distNow < 2.65) {
        newLevel = 'regional';
        resBadge = 'High-Res Satellite (15m LOD)';
      } else if (distNow < 3.2) {
        newLevel = 'regional';
        resBadge = 'Regional Satellite (30m LOD)';
      } else if (distNow < 3.8) {
        newLevel = 'country';
        resBadge = 'Country Satellite (60m LOD)';
      } else if (distNow < 4.7) {
        newLevel = 'continental';
        resBadge = 'Continental Satellite (250m LOD)';
      } else {
        newLevel = 'global';
        resBadge = 'NASA Blue Marble (1km Base)';
      }

      if (newLevel !== currentZoomRef.current) {
        currentZoomRef.current = newLevel;
        setCurrentZoomLevel(newLevel);
        if (onZoomChangeRef.current) {
          onZoomChangeRef.current(newLevel, distNow);
        }
      }
      setImageryResolution(resBadge);

      // Facing Center Coordinates Calculation (throttled every 250ms)
      const centerLat = currentRotation.current.x * (180 / Math.PI);
      let centerLon = -currentRotation.current.y * (180 / Math.PI) - 90;
      centerLon = ((((centerLon + 180) % 360) + 360) % 360) - 180;

      if (now - lastCenterCalcRef.current > 250) {
        lastCenterCalcRef.current = now;
        if (onCenterCoordsRef.current) {
          onCenterCoordsRef.current(centerLat, centerLon);
        }
      }

      // 16. Update Vector Boundaries LOD (States fade in at close orbit, Country borders adapt)
      if (vectorBoundariesRef.current) {
        vectorBoundariesRef.current.updateLOD(distNow);
      }

      // 17. Stream Spherical Satellite Imagery LOD Tiles Based on Viewpoint
      if (imageryLODRef.current) {
        imageryLODRef.current.update(distNow, centerLat, centerLon);
      }

      // 18. Scalable GIS Labels: Backface Culling, LOD Cross-Fade & 2D Screen-Space Collision Detection
      if (labelsGroupRef.current && cameraRef.current && earthMeshRef.current) {
        const camera = cameraRef.current;
        const cameraPos = camera.position;
        earthMeshRef.current.getWorldPosition(earthWorldPos);
        const dist = currentCameraDistance.current;
        const screenWidth = window.innerWidth;
        const screenHeight = window.innerHeight;

        interface LabelCandidate {
          sprite: THREE.Sprite;
          screenX: number;
          screenY: number;
          width: number;
          height: number;
          priority: number;
          alpha: number;
        }

        const candidates: LabelCandidate[] = [];

        labelsGroupRef.current.children.forEach((child) => {
          const sprite = child as THREE.Sprite;
          const place = sprite.userData?.place as GISPlace | undefined;
          if (!place) {
            sprite.visible = false;
            return;
          }

          // Continuous Level of Detail (LOD) opacity curves
          let lodAlpha = 0.0;
          if (place.level === 1) {
            // Continents & Oceans: visible from deep space, gracefully softened up close
            lodAlpha = dist < 3.2 ? Math.max(0.12, (dist - 2.5) / 0.7) : 1.0;
          } else if (place.level === 2) {
            // Sovereign Countries & Major Seas: visible when dist < 5.6
            lodAlpha = Math.min(1.0, Math.max(0.0, (5.6 - dist) / 0.8));
          } else if (place.level === 3) {
            // First-Level Admin Divisions / States (e.g., Kerala, California, Bavaria): visible when dist < 4.2
            lodAlpha = Math.min(1.0, Math.max(0.0, (4.2 - dist) / 0.7));
          } else if (place.level === 4) {
            // Cities / Ports / Populated Places (e.g., Kozhikode, Mumbai, NYC): visible when dist < 3.4
            lodAlpha = Math.min(1.0, Math.max(0.0, (3.4 - dist) / 0.6));
          }

          if (lodAlpha <= 0.02) {
            sprite.visible = false;
            return;
          }

          // Backface Culling: check angle between surface normal and view direction
          sprite.getWorldPosition(tempWorldPos);
          tempNormal.copy(tempWorldPos).sub(earthWorldPos).normalize();
          tempViewDir.copy(cameraPos).sub(tempWorldPos).normalize();
          const dot = tempNormal.dot(tempViewDir);

          if (dot <= 0.20) {
            sprite.visible = false;
            return;
          }

          // Project 3D position to 2D screen coordinates
          tempWorldPos.project(camera);
          const screenX = (tempWorldPos.x * 0.5 + 0.5) * screenWidth;
          const screenY = (-(tempWorldPos.y * 0.5) + 0.5) * screenHeight;

          // Discard offscreen points
          if (screenX < -40 || screenX > screenWidth + 40 || screenY < -40 || screenY > screenHeight + 40) {
            sprite.visible = false;
            return;
          }

          // Soften opacity near the planetary limb/horizon
          const limbFade = Math.min(1.0, Math.max(0.0, (dot - 0.20) * 3.5));
          const finalAlpha = limbFade * 0.94 * lodAlpha;

          // Bounding box approximation for 2D screen-space collision checks
          const boxWidth = place.level === 1 ? 140 : place.level === 2 ? 110 : place.level === 3 ? 95 : 85;
          const boxHeight = 24;

          candidates.push({
            sprite,
            screenX,
            screenY,
            width: boxWidth,
            height: boxHeight,
            priority: place.priority || 50,
            alpha: finalAlpha,
          });
        });

        // Sort candidates by priority descending (higher-tier labels take precedence)
        candidates.sort((a, b) => b.priority - a.priority);

        // 2D Screen-space collision detection (prevents overlapping text)
        const occupiedBoxes: { left: number; right: number; top: number; bottom: number }[] = [];
        const padding = 6;

        for (const item of candidates) {
          const left = item.screenX - item.width / 2 - padding;
          const right = item.screenX + item.width / 2 + padding;
          const top = item.screenY - item.height / 2 - padding;
          const bottom = item.screenY + item.height / 2 + padding;

          let collides = false;
          for (const box of occupiedBoxes) {
            if (left < box.right && right > box.left && top < box.bottom && bottom > box.top) {
              collides = true;
              break;
            }
          }

          if (!collides) {
            occupiedBoxes.push({ left, right, top, bottom });
            item.sprite.visible = true;
            item.sprite.material.opacity = item.alpha;
          } else {
            item.sprite.visible = false;
          }
        }
      }

      // 19. Scientific Observation Layer Smooth Cross-Fade Animation
      if (layerOpacityRef.current < 1.0 && markersGroupRef.current) {
        layerOpacityRef.current = Math.min(1.0, layerOpacityRef.current + delta * 3.8);
        markersGroupRef.current.children.forEach((child) => {
          const m = child as THREE.Mesh;
          if (m.material && 'opacity' in m.material) {
            const baseOp = (m.userData.baseOpacity as number) || 0.95;
            (m.material as THREE.Material & { opacity: number }).opacity =
              baseOp * layerOpacityRef.current;
          }
        });
      }

      // 20. Selected Location Marker Subtle Organic Breathing Pulse
      if (selectedHaloRef.current) {
        const pulse = (Math.sin(timestamp * 0.004) + 1) * 0.5;
        selectedHaloRef.current.scale.setScalar(1.0 + pulse * 0.45);
        if (selectedHaloRef.current.material && 'opacity' in selectedHaloRef.current.material) {
          (selectedHaloRef.current.material as THREE.Material & { opacity: number }).opacity =
            0.35 + pulse * 0.55;
        }
      }

      if (rendererRef.current && sceneRef.current && cameraRef.current) {
        rendererRef.current.render(sceneRef.current, cameraRef.current);
      }

      animFrameIdRef.current = requestAnimationFrame(animate);
    };

    animFrameIdRef.current = requestAnimationFrame(animate);

    // Full Viewport Window Resize Handler
    const handleResize = () => {
      if (!rendererRef.current || !cameraRef.current) return;
      const w = window.innerWidth;
      const h = window.innerHeight;
      cameraRef.current.aspect = w / h;
      cameraRef.current.updateProjectionMatrix();
      rendererRef.current.setSize(w, h);
    };

    window.addEventListener('resize', handleResize);

    // Non-passive Native Wheel Handler (Altitude-Scaled Zoom Sensitivity)
    const onWindowWheel = (e: WheelEvent) => {
      // Zoom ONLY when pointer is hovering over Earth sphere!
      if (isPointerOverEarth(e.clientX, e.clientY)) {
        e.preventDefault();
        // Scale zoom increment by camera altitude above Earth surface
        const altitude = Math.max(0.18, currentCameraDistance.current - 1.9);
        const altitudeRatio = Math.min(1.0, altitude / 4.5);
        const zoomStep = 0.0018 * Math.pow(altitudeRatio, 0.65);
        const zoomFactor = e.deltaY * zoomStep;

        targetCameraDistance.current = Math.max(
          minDistance,
          Math.min(maxDistance, targetCameraDistance.current + zoomFactor)
        );
        lastInteractionTime.current = Date.now();
      }
    };

    window.addEventListener('wheel', onWindowWheel, { passive: false });

    // Cleanup resources on unmount
    return () => {
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('wheel', onWindowWheel);
      if (animFrameIdRef.current) cancelAnimationFrame(animFrameIdRef.current);
      if (rendererRef.current) {
        if (rendererRef.current.domElement.parentNode === mount) {
          mount.removeChild(rendererRef.current.domElement);
        }
        rendererRef.current.dispose();
      }
      spaceEnvRef.current?.dispose();
      vectorBoundariesRef.current?.dispose();
      imageryLODRef.current?.dispose();
      earthShadersRef.current?.dispose();
      earthGeometry.dispose();
      cloudsGeometry.dispose();
      cloudsMaterial.dispose();
      atmosphereGeometry.dispose();
    };
  }, []);

  // Update Observation Markers when data or module changes
  useEffect(() => {
    if (!isReady || !markersGroupRef.current) return;
    const markersGroup = markersGroupRef.current;
    selectedHaloRef.current = null;
    layerOpacityRef.current = 0.0;

    while (markersGroup.children.length > 0) {
      const child = markersGroup.children[0] as THREE.Mesh;
      markersGroup.remove(child);
      if (child.geometry) child.geometry.dispose();
      if (Array.isArray(child.material)) child.material.forEach((m) => m.dispose());
      else if (child.material) child.material.dispose();
    }

    if (!data || !activeModule || !data.features || data.features.length === 0) return;

    const earthRadius = 1.9;
    const markerRadius = earthRadius * 1.008;
    const sphereGeom = new THREE.SphereGeometry(0.024, 12, 12);

    data.features.forEach((feature) => {
      const coords = feature.geometry.coordinates;
      const lon = coords[0];
      const lat = coords[1];

      const pos = latLonToVector3(lat, lon, markerRadius);
      const color = getObservationColor(feature, activeModule, metricType);

      const isSelected =
        selectedFeature &&
        selectedFeature.geometry.coordinates[0] === lon &&
        selectedFeature.geometry.coordinates[1] === lat;

      const markerMat = new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: 0.0,
      });

      const marker = new THREE.Mesh(sphereGeom, markerMat);
      marker.position.copy(pos);
      marker.userData = { feature, baseOpacity: 0.95 };
      markersGroup.add(marker);

      const haloGeom = new THREE.RingGeometry(0.028, 0.048, 16);
      const haloMat = new THREE.MeshBasicMaterial({
        color: isSelected ? new THREE.Color(0x38bdf8) : color,
        transparent: true,
        opacity: 0.0,
        side: THREE.DoubleSide,
      });
      const halo = new THREE.Mesh(haloGeom, haloMat);
      halo.position.copy(pos);
      halo.lookAt(0, 0, 0);
      halo.userData = { feature, baseOpacity: isSelected ? 0.75 : 0.45 };
      markersGroup.add(halo);

      if (isSelected) {
        selectedHaloRef.current = halo;
      }
    });
  }, [data, activeModule, metricType, isReady]);

  // Handle fly-to when selectedFeature changes
  useEffect(() => {
    if (!selectedFeature) return;
    const [lon, lat] = selectedFeature.geometry.coordinates;
    const targetDist = targetCameraDistance.current > 3.8 ? 3.2 : targetCameraDistance.current;
    flyToCoordinates(lat, lon, targetDist);
  }, [selectedFeature]);

  // Handle fly-to when selectedPlace changes
  useEffect(() => {
    if (!selectedPlace) return;
    const targetDist =
      selectedPlace.level === 4
        ? 2.5
        : selectedPlace.level === 3
        ? 3.1
        : selectedPlace.level === 2
        ? 3.8
        : 4.6;
    flyToCoordinates(selectedPlace.lat, selectedPlace.lon, targetDist);
  }, [selectedPlace]);

  // Synchronize selected observation marker halo for breathing pulse
  useEffect(() => {
    if (!selectedFeature || !markersGroupRef.current) {
      selectedHaloRef.current = null;
      return;
    }
    const [lon, lat] = selectedFeature.geometry.coordinates;
    const hitHalo = markersGroupRef.current.children.find((child) => {
      const feat = child.userData?.feature as GeoJSONFeature | undefined;
      const mesh = child as THREE.Mesh;
      return (
        feat &&
        feat.geometry.coordinates[0] === lon &&
        feat.geometry.coordinates[1] === lat &&
        mesh.geometry instanceof THREE.RingGeometry
      );
    }) as THREE.Mesh | undefined;

    selectedHaloRef.current = hitHalo || null;
  }, [selectedFeature]);

  // Mouse / Pointer Drag Handlers with Altitude-Scaled Pan Sensitivity
  const handlePointerDown = (e: React.PointerEvent) => {
    if (!isPointerOverEarth(e.clientX, e.clientY)) return;
    isDraggingRef.current = true;
    isFlyingToRef.current = false;
    prevMousePos.current = { x: e.clientX, y: e.clientY };
    lastInteractionTime.current = Date.now();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isDraggingRef.current) return;
    const deltaX = e.clientX - prevMousePos.current.x;
    const deltaY = e.clientY - prevMousePos.current.y;
    prevMousePos.current = { x: e.clientX, y: e.clientY };

    // Scale pan sensitivity with altitude above Earth surface
    const altitude = Math.max(0.18, currentCameraDistance.current - 1.9);
    const altitudeRatio = Math.min(1.0, altitude / 4.5);
    const sensitivity = 0.0055 * Math.pow(altitudeRatio, 0.85);

    targetRotation.current.y += deltaX * sensitivity;
    targetRotation.current.x += deltaY * sensitivity;

    targetRotation.current.x = Math.max(-1.25, Math.min(1.25, targetRotation.current.x));
    lastInteractionTime.current = Date.now();
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    if (isDraggingRef.current) {
      isDraggingRef.current = false;
      lastInteractionTime.current = Date.now();
      try {
        (e.target as HTMLElement).releasePointerCapture(e.pointerId);
      } catch {}
    }
  };

  // Double-Click Raycasting: Smoothly zoom in towards the exact clicked coordinates
  const handleDoubleClick = (e: React.MouseEvent) => {
    if (!cameraRef.current || !earthMeshRef.current) return;
    const x = (e.clientX / window.innerWidth) * 2 - 1;
    const y = -(e.clientY / window.innerHeight) * 2 + 1;
    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(new THREE.Vector2(x, y), cameraRef.current);
    const hits = raycaster.intersectObject(earthMeshRef.current);
    if (hits.length > 0) {
      const localHit = hits[0].point.clone();
      if (earthGroupRef.current) {
        earthGroupRef.current.worldToLocal(localHit);
      }
      const radius = localHit.length();
      const phi = Math.acos(Math.max(-1, Math.min(1, localHit.y / radius)));
      const lat = 90 - phi * (180 / Math.PI);
      const theta = Math.atan2(localHit.z, -localHit.x);
      let lon = theta * (180 / Math.PI) - 180;
      lon = ((((lon + 180) % 360) + 360) % 360) - 180;

      const newDist = Math.max(minDistance, targetCameraDistance.current - 1.25);
      flyToCoordinates(lat, lon, newDist);
    }
  };

  // Click Raycasting: Select observation point or GIS place label
  const handleClick = (e: React.MouseEvent) => {
    if (!cameraRef.current) return;

    const x = (e.clientX / window.innerWidth) * 2 - 1;
    const y = -(e.clientY / window.innerHeight) * 2 + 1;

    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(new THREE.Vector2(x, y), cameraRef.current);

    // 1. Raycast against scientific observation markers first
    if (markersGroupRef.current) {
      const intersects = raycaster.intersectObjects(markersGroupRef.current.children);
      if (intersects.length > 0 && onSelectFeature) {
        const hit = intersects.find((i) => i.object.userData?.feature);
        if (hit && hit.object.userData.feature) {
          onSelectFeature(hit.object.userData.feature);
          return;
        }
      }
    }

    // 2. Raycast against visible GIS place labels
    if (labelsGroupRef.current) {
      const visibleSprites = labelsGroupRef.current.children.filter((c) => c.visible);
      const labelHits = raycaster.intersectObjects(visibleSprites);
      if (labelHits.length > 0) {
        const hitSprite = labelHits[0].object as THREE.Sprite;
        const place = hitSprite.userData?.place as GISPlace | undefined;
        if (place) {
          if (onSelectPlaceRef.current) {
            onSelectPlaceRef.current(place);
          }
          const targetDist =
            place.level === 4
              ? 2.5
              : place.level === 3
              ? 3.1
              : place.level === 2
              ? 3.8
              : 4.6;
          flyToCoordinates(place.lat, place.lon, targetDist);
          return;
        }
      }
    }
  };

  // Dedicated Precision Navigation Controls
  const zoomIn = () => {
    const altitude = Math.max(0.18, currentCameraDistance.current - 1.9);
    const altitudeRatio = Math.min(1.0, altitude / 4.5);
    const step = Math.max(0.35, 0.85 * altitudeRatio);
    targetCameraDistance.current = Math.max(minDistance, targetCameraDistance.current - step);
    lastInteractionTime.current = Date.now();
  };

  const zoomOut = () => {
    const altitude = Math.max(0.18, currentCameraDistance.current - 1.9);
    const altitudeRatio = Math.min(1.0, altitude / 4.5);
    const step = Math.max(0.35, 0.85 * altitudeRatio);
    targetCameraDistance.current = Math.min(maxDistance, targetCameraDistance.current + step);
    lastInteractionTime.current = Date.now();
  };

  const resetOrientation = () => {
    targetRotation.current = { x: 0.12, y: -0.6 };
    targetCameraDistance.current = 4.6;
    isFlyingToRef.current = false;
    lastInteractionTime.current = Date.now();
  };

  const orientNorthUp = () => {
    targetRotation.current.x = 0; // Align equator directly with horizontal axis
    lastInteractionTime.current = Date.now();
  };

  const recenterOnSelected = () => {
    if (selectedFeature) {
      const [lon, lat] = selectedFeature.geometry.coordinates;
      flyToCoordinates(lat, lon, Math.max(2.6, targetCameraDistance.current));
    } else if (selectedPlace) {
      flyToCoordinates(selectedPlace.lat, selectedPlace.lon, Math.max(2.5, targetCameraDistance.current));
    } else {
      resetOrientation();
    }
  };

  return (
    <div
      className={`transition-opacity duration-300 ${
        visible ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
      }`}
    >
      {/* Full-Viewport Unrestricted 3D Earth Canvas Mount */}
      <div
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onClick={handleClick}
        onDoubleClick={handleDoubleClick}
        className={`fixed inset-0 w-screen h-screen z-0 overflow-hidden select-none cursor-grab active:cursor-grabbing touch-none ${className}`}
        style={{ touchAction: 'none' }}
      >
        <div ref={canvasMountRef} className="absolute inset-0 w-full h-full pointer-events-none" />
      </div>

      {/* Observation Layer Updating Toast */}
      {loading && (
        <div className="fixed top-20 left-1/2 -translate-x-1/2 z-30 flex items-center space-x-2 px-3.5 py-1.5 rounded-full bg-slate-900/90 border border-slate-800 text-[11px] font-mono text-cyan-300 shadow-2xl backdrop-blur-md pointer-events-none">
          <div className="h-3 w-3 rounded-full border-2 border-cyan-400 border-t-transparent animate-spin" />
          <span>Updating Observations...</span>
        </div>
      )}

      {/* Precision Navigation Controls & Resolution Scale Bar (Bottom-Left) */}
      <div className="fixed bottom-5 left-5 sm:bottom-6 sm:left-6 z-30 flex items-center space-x-2.5 pointer-events-auto">
        <div className="flex flex-col space-y-1 bg-[#090d16]/90 p-1.5 rounded-xl border border-slate-800/80 backdrop-blur-md shadow-2xl">
          <button
            onClick={(e) => {
              e.stopPropagation();
              zoomIn();
            }}
            title="Zoom In (or double-click surface)"
            className="p-2 rounded-lg hover:bg-slate-800 text-slate-300 hover:text-white transition-colors"
          >
            <ZoomIn className="h-4 w-4" />
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              zoomOut();
            }}
            title="Zoom Out"
            className="p-2 rounded-lg hover:bg-slate-800 text-slate-300 hover:text-white transition-colors"
          >
            <ZoomOut className="h-4 w-4" />
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              recenterOnSelected();
            }}
            title="Re-center on Selected Place"
            className="p-2 rounded-lg hover:bg-slate-800 text-slate-300 hover:text-cyan-400 transition-colors"
          >
            <Navigation className="h-4 w-4" />
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              orientNorthUp();
            }}
            title="Reset Orientation (North Up)"
            className="p-2 rounded-lg hover:bg-slate-800 text-slate-300 hover:text-cyan-400 transition-colors"
          >
            <Compass className="h-4 w-4" />
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              resetOrientation();
            }}
            title="Reset Global View"
            className="p-2 rounded-lg hover:bg-slate-800 text-slate-300 hover:text-cyan-400 transition-colors"
          >
            <GlobeIcon className="h-4 w-4" />
          </button>
        </div>

        {/* Imagery & Science Resolution Information Pill */}
        <div className="hidden sm:flex flex-col justify-center px-3 py-2 rounded-xl bg-[#090d16]/90 border border-slate-800/80 text-[10px] font-mono backdrop-blur-md shadow-2xl text-slate-300 space-y-0.5">
          <div className="flex items-center space-x-1.5 text-slate-400">
            <Layers className="h-3 w-3 text-cyan-400" />
            <span className="text-slate-500 uppercase tracking-wider text-[8px]">Imagery LOD:</span>
            <span className="text-cyan-300 font-medium">{imageryResolution}</span>
          </div>
          <div className="flex items-center space-x-2 text-[9px] text-slate-400">
            <span>Scale: <strong className="text-white capitalize">{currentZoomLevel}</strong></span>
            {activeModule && (
              <span className="text-slate-500">
                • {activeModule === 'ocean' ? 'SWOT: ±2.4cm' : activeModule === 'atmosphere' ? 'GPM: 0.1°' : 'MODIS: 0.05°'}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default EarthGlobe;
