import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { GeoJSONFeatureCollection, GeoJSONFeature } from '../services/api';
import { RotateCcw, ZoomIn, ZoomOut } from 'lucide-react';

export type EarthModule = 'ocean' | 'atmosphere' | 'land' | null;
export type ZoomLevel = 'global' | 'continental' | 'country' | 'regional';

interface EarthGlobeProps {
  activeModule: EarthModule;
  data: GeoJSONFeatureCollection | null;
  loading?: boolean;
  onSelectFeature?: (feature: GeoJSONFeature) => void;
  selectedFeature?: GeoJSONFeature | null;
  metricType?: string;
  className?: string;
  visible?: boolean;
  onZoomChange?: (zoom: ZoomLevel, distance: number) => void;
  onCenterCoordinatesChange?: (lat: number, lon: number) => void;
  sidePanelOpen?: boolean;
}

// Geographic Places Database for authentic global orientation & education
interface GeographicPlace {
  name: string;
  lat: number;
  lon: number;
  level: 1 | 2 | 3; // 1: Continents/Major Oceans, 2: Countries/Major Seas, 3: Cities/Landmarks
  color?: string;
  fontSize?: number;
}

const GEOGRAPHIC_PLACES: GeographicPlace[] = [
  // Level 1: Continents & Major Oceans (Wide Space View)
  { name: 'PACIFIC OCEAN', lat: 0.0, lon: -160.0, level: 1, color: '#60a5fa', fontSize: 22 },
  { name: 'ATLANTIC OCEAN', lat: 18.0, lon: -38.0, level: 1, color: '#60a5fa', fontSize: 22 },
  { name: 'INDIAN OCEAN', lat: -16.0, lon: 78.0, level: 1, color: '#60a5fa', fontSize: 22 },
  { name: 'NORTH AMERICA', lat: 46.0, lon: -100.0, level: 1, color: '#94a3b8', fontSize: 24 },
  { name: 'SOUTH AMERICA', lat: -16.0, lon: -60.0, level: 1, color: '#94a3b8', fontSize: 24 },
  { name: 'EUROPE', lat: 52.0, lon: 16.0, level: 1, color: '#94a3b8', fontSize: 24 },
  { name: 'AFRICA', lat: 4.0, lon: 20.0, level: 1, color: '#94a3b8', fontSize: 24 },
  { name: 'ASIA', lat: 46.0, lon: 95.0, level: 1, color: '#94a3b8', fontSize: 24 },
  { name: 'AUSTRALIA', lat: -25.0, lon: 135.0, level: 1, color: '#94a3b8', fontSize: 24 },

  // Level 2: Sovereign Countries & Major Seas (Medium Orbit View: distance < 5.3)
  { name: 'United States', lat: 39.0, lon: -98.0, level: 2, color: '#f8fafc' },
  { name: 'Canada', lat: 56.0, lon: -106.0, level: 2, color: '#f8fafc' },
  { name: 'Brazil', lat: -10.0, lon: -53.0, level: 2, color: '#f8fafc' },
  { name: 'Mexico', lat: 23.0, lon: -102.0, level: 2, color: '#f8fafc' },
  { name: 'Argentina', lat: -34.0, lon: -64.0, level: 2, color: '#f8fafc' },
  { name: 'Colombia', lat: 4.5, lon: -73.0, level: 2, color: '#f8fafc' },
  { name: 'United Kingdom', lat: 54.5, lon: -2.5, level: 2, color: '#f8fafc' },
  { name: 'France', lat: 46.5, lon: 2.5, level: 2, color: '#f8fafc' },
  { name: 'Germany', lat: 51.0, lon: 10.0, level: 2, color: '#f8fafc' },
  { name: 'Spain', lat: 40.0, lon: -3.7, level: 2, color: '#f8fafc' },
  { name: 'Italy', lat: 42.5, lon: 12.5, level: 2, color: '#f8fafc' },
  { name: 'Norway', lat: 62.0, lon: 10.0, level: 2, color: '#f8fafc' },
  { name: 'Egypt', lat: 26.5, lon: 30.0, level: 2, color: '#f8fafc' },
  { name: 'Nigeria', lat: 9.0, lon: 7.5, level: 2, color: '#f8fafc' },
  { name: 'Kenya', lat: 0.5, lon: 37.5, level: 2, color: '#f8fafc' },
  { name: 'South Africa', lat: -29.0, lon: 24.0, level: 2, color: '#f8fafc' },
  { name: 'Morocco', lat: 32.0, lon: -6.0, level: 2, color: '#f8fafc' },
  { name: 'DR Congo', lat: -2.5, lon: 23.5, level: 2, color: '#f8fafc' },
  { name: 'China', lat: 35.0, lon: 104.0, level: 2, color: '#f8fafc' },
  { name: 'India', lat: 21.0, lon: 78.0, level: 2, color: '#f8fafc' },
  { name: 'Japan', lat: 36.5, lon: 138.0, level: 2, color: '#f8fafc' },
  { name: 'Indonesia', lat: -1.0, lon: 118.0, level: 2, color: '#f8fafc' },
  { name: 'Saudi Arabia', lat: 24.0, lon: 45.0, level: 2, color: '#f8fafc' },
  { name: 'Kazakhstan', lat: 48.0, lon: 67.0, level: 2, color: '#f8fafc' },
  { name: 'New Zealand', lat: -41.0, lon: 174.0, level: 2, color: '#f8fafc' },
  { name: 'Mediterranean Sea', lat: 35.0, lon: 18.0, level: 2, color: '#38bdf8' },
  { name: 'Caribbean Sea', lat: 15.0, lon: -75.0, level: 2, color: '#38bdf8' },
  { name: 'Arabian Sea', lat: 15.0, lon: 65.0, level: 2, color: '#38bdf8' },
  { name: 'Bay of Bengal', lat: 14.0, lon: 87.0, level: 2, color: '#38bdf8' },

  // Level 3: Major World Cities & Earth Geographic Systems (Close Orbit: distance < 3.9)
  { name: 'Tokyo', lat: 35.68, lon: 139.76, level: 3, color: '#e2e8f0', fontSize: 20 },
  { name: 'New York', lat: 40.71, lon: -74.00, level: 3, color: '#e2e8f0', fontSize: 20 },
  { name: 'London', lat: 51.51, lon: -0.12, level: 3, color: '#e2e8f0', fontSize: 20 },
  { name: 'Paris', lat: 48.85, lon: 2.35, level: 3, color: '#e2e8f0', fontSize: 20 },
  { name: 'Cairo', lat: 30.04, lon: 31.23, level: 3, color: '#e2e8f0', fontSize: 20 },
  { name: 'Mumbai', lat: 19.07, lon: 72.87, level: 3, color: '#e2e8f0', fontSize: 20 },
  { name: 'São Paulo', lat: -23.55, lon: -46.63, level: 3, color: '#e2e8f0', fontSize: 20 },
  { name: 'Sydney', lat: -33.86, lon: 151.20, level: 3, color: '#e2e8f0', fontSize: 20 },
  { name: 'Singapore', lat: 1.35, lon: 103.82, level: 3, color: '#e2e8f0', fontSize: 20 },
  { name: 'Nairobi', lat: -1.29, lon: 36.82, level: 3, color: '#e2e8f0', fontSize: 20 },
  { name: 'Beijing', lat: 39.90, lon: 116.40, level: 3, color: '#e2e8f0', fontSize: 20 },
  { name: 'Los Angeles', lat: 34.05, lon: -118.24, level: 3, color: '#e2e8f0', fontSize: 20 },
  { name: 'Gulf Stream', lat: 36.0, lon: -68.0, level: 3, color: '#38bdf8', fontSize: 20 },
  { name: 'Amazon Basin', lat: -3.5, lon: -62.0, level: 3, color: '#34d399', fontSize: 20 },
  { name: 'Sahara', lat: 23.0, lon: 12.0, level: 3, color: '#fbbf24', fontSize: 20 },
  { name: 'Himalayas', lat: 28.0, lon: 86.0, level: 3, color: '#cbd5e1', fontSize: 20 },
];

// Helper: Convert (Lat, Lon) to 3D Cartesian coordinates on sphere
function latLonToVector3(lat: number, lon: number, radius: number): THREE.Vector3 {
  const phi = (90 - lat) * (Math.PI / 180);
  const theta = (lon + 180) * (Math.PI / 180);
  return new THREE.Vector3(
    -radius * Math.sin(phi) * Math.cos(theta),
    radius * Math.cos(phi),
    radius * Math.sin(phi) * Math.sin(theta)
  );
}

// Generate high-resolution 2D canvas text sprites with dark contrast halos
function createTextSprite(text: string, fontSize = 24, color = '#f8fafc'): THREE.Sprite {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d')!;
  canvas.width = 384;
  canvas.height = 72;

  ctx.font = `600 ${fontSize}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  // Crisp dark outline for universal contrast over deep oceans and bright sands
  ctx.strokeStyle = 'rgba(5, 7, 11, 0.88)';
  ctx.lineWidth = 5;
  ctx.lineJoin = 'round';
  ctx.strokeText(text, 192, 36);

  // Core clean typography fill
  ctx.fillStyle = color;
  ctx.fillText(text, 192, 36);

  const texture = new THREE.CanvasTexture(canvas);
  texture.minFilter = THREE.LinearFilter;

  const material = new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    depthTest: false,
    depthWrite: false,
  });

  const sprite = new THREE.Sprite(material);
  sprite.scale.set(0.42, 0.08, 1);
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
  const sidePanelOpenRef = useRef(sidePanelOpen);
  sidePanelOpenRef.current = sidePanelOpen;

  const currentZoomRef = useRef<ZoomLevel>('continental');
  const [currentZoomLevel, setCurrentZoomLevel] = useState<ZoomLevel>('continental');
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
  const markersGroupRef = useRef<THREE.Group | null>(null);
  const labelsGroupRef = useRef<THREE.Group | null>(null);
  const animFrameIdRef = useRef<number | null>(null);

  // Interaction & camera animation state
  const isDraggingRef = useRef(false);
  const prevMousePos = useRef({ x: 0, y: 0 });
  const targetRotation = useRef({ x: 0.12, y: -0.6 });
  const currentRotation = useRef({ x: 0.12, y: -0.6 });
  const targetCameraDistance = useRef(4.6);
  const currentCameraDistance = useRef(4.6);
  const lastInteractionTime = useRef(Date.now());
  const minDistance = 2.45; // Camera can zoom in deep to orbit view without clipping
  const maxDistance = 6.8;  // Wide space perspective

  // Selected feature animation
  const isFlyingToRef = useRef(false);
  const flyToTarget = useRef<{ x: number; y: number } | null>(null);

  const [isReady, setIsReady] = useState(false);

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

  // Initialize Three.js Full-Viewport Realistic Earth Scene
  useEffect(() => {
    const mount = canvasMountRef.current;
    if (!mount) return;

    const width = window.innerWidth;
    const height = window.innerHeight;

    // 1. Scene
    const scene = new THREE.Scene();
    sceneRef.current = scene;

    // 2. Camera with true full-viewport aspect ratio
    const camera = new THREE.PerspectiveCamera(42, width / height, 0.1, 1000);
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

    // 4. Lighting: Realistic Sunlight matching NASA Photography
    const sunlight = new THREE.DirectionalLight(0xfffaf0, 2.1);
    sunlight.position.set(6, 2.5, 4.5);
    scene.add(sunlight);

    // Deep space ambient fill (preserves soft visibility of night side)
    const spaceAmbient = new THREE.AmbientLight(0x0a101e, 0.28);
    scene.add(spaceAmbient);

    // 5. Starfield Background (Deep Space Universe)
    const starGeometry = new THREE.BufferGeometry();
    const starCount = 1400;
    const starPositions = new Float32Array(starCount * 3);
    for (let i = 0; i < starCount * 3; i += 3) {
      const radius = 60 + Math.random() * 80;
      const u = Math.random();
      const v = Math.random();
      const theta = u * 2.0 * Math.PI;
      const phi = Math.acos(2.0 * v - 1.0);
      const sinPhi = Math.sin(phi);
      starPositions[i] = radius * sinPhi * Math.cos(theta);
      starPositions[i + 1] = radius * sinPhi * Math.sin(theta);
      starPositions[i + 2] = radius * Math.cos(phi);
    }
    starGeometry.setAttribute('position', new THREE.BufferAttribute(starPositions, 3));
    const starMaterial = new THREE.PointsMaterial({
      size: 1.0,
      color: 0x93c5fd,
      transparent: true,
      opacity: 0.60,
    });
    const stars = new THREE.Points(starGeometry, starMaterial);
    scene.add(stars);

    // 6. Earth Group Container
    const earthGroup = new THREE.Group();
    earthGroup.rotation.x = currentRotation.current.x;
    earthGroup.rotation.y = currentRotation.current.y;
    scene.add(earthGroup);
    earthGroupRef.current = earthGroup;

    // 7. Textures Setup (NASA Blue Marble / Visible Earth Assets)
    const textureLoader = new THREE.TextureLoader();
    const earthRadius = 1.9;

    const dayTexture = textureLoader.load('/textures/earth/earth_day.jpg');
    const normalTexture = textureLoader.load('/textures/earth/earth_normal.jpg');
    const specularTexture = textureLoader.load('/textures/earth/earth_specular.jpg');
    const cloudsTexture = textureLoader.load('/textures/earth/earth_clouds.png');

    // 8. Earth Main Mesh (Natural Deep Blue Oceans, Topographic Relief & Specular Sun Glint)
    const earthGeometry = new THREE.SphereGeometry(earthRadius, 64, 64);
    const earthMaterial = new THREE.MeshPhongMaterial({
      map: dayTexture,
      normalMap: normalTexture,
      normalScale: new THREE.Vector2(0.45, 0.45),
      specularMap: specularTexture,
      specular: new THREE.Color(0x2a3848),
      shininess: 22,
    });
    const earthMesh = new THREE.Mesh(earthGeometry, earthMaterial);
    earthGroup.add(earthMesh);
    earthMeshRef.current = earthMesh;

    // 9. Independent Cloud Layer (Natural, Delicate 40% Opacity hugging Surface)
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

    // 10. Razor-Thin Natural Atmospheric Limb (Replaces thick ring with realistic 0.6% limb fade)
    const atmosphereGeometry = new THREE.SphereGeometry(earthRadius * 1.007, 64, 64);
    const atmosphereMaterial = new THREE.ShaderMaterial({
      vertexShader: `
        varying vec3 vNormal;
        varying vec3 vViewPosition;
        void main() {
          vNormal = normalize(normalMatrix * normal);
          vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
          vViewPosition = -mvPosition.xyz;
          gl_Position = projectionMatrix * mvPosition;
        }
      `,
      fragmentShader: `
        varying vec3 vNormal;
        varying vec3 vViewPosition;
        void main() {
          vec3 viewDir = normalize(vViewPosition);
          // Very sharp grazing angle falloff — visible ONLY as a thin delicate blue edge
          float edge = pow(1.0 - max(0.0, dot(vNormal, viewDir)), 5.5);
          vec3 atmosphereSky = vec3(0.35, 0.65, 0.95);
          gl_FragColor = vec4(atmosphereSky, edge * 0.32);
        }
      `,
      blending: THREE.AdditiveBlending,
      side: THREE.BackSide,
      transparent: true,
      depthWrite: false,
    });
    const atmosphereMesh = new THREE.Mesh(atmosphereGeometry, atmosphereMaterial);
    earthGroup.add(atmosphereMesh);

    // 11. Scientific Observation Markers Group
    const markersGroup = new THREE.Group();
    earthGroup.add(markersGroup);
    markersGroupRef.current = markersGroup;

    // 12. Geographic Place Names & Country Labels Group
    const labelsGroup = new THREE.Group();
    earthGroup.add(labelsGroup);
    labelsGroupRef.current = labelsGroup;

    // Populate Geographic Labels onto the Globe
    GEOGRAPHIC_PLACES.forEach((place) => {
      const pos = latLonToVector3(place.lat, place.lon, earthRadius * 1.011);
      const sprite = createTextSprite(place.name, place.fontSize || 24, place.color || '#f8fafc');
      sprite.position.copy(pos);
      sprite.userData = {
        level: place.level,
        name: place.name,
        lat: place.lat,
        lon: place.lon,
      };
      labelsGroup.add(sprite);
    });

    setIsReady(true);

    // 13. Render Animation Loop with Calm Majestic 9-Minute Revolution
    let lastTimestamp = performance.now();
    const tempWorldPos = new THREE.Vector3();
    const tempNormal = new THREE.Vector3();
    const tempViewDir = new THREE.Vector3();
    const earthWorldPos = new THREE.Vector3();

    const animate = (timestamp: number) => {
      const delta = Math.min((timestamp - lastTimestamp) / 1000, 0.1);
      lastTimestamp = timestamp;

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

      // Adaptive Zoom Level Calculation
      const distNow = currentCameraDistance.current;
      let newLevel: ZoomLevel = 'global';
      if (distNow < 3.1) newLevel = 'regional';
      else if (distNow < 3.9) newLevel = 'country';
      else if (distNow < 5.2) newLevel = 'continental';
      else newLevel = 'global';

      if (newLevel !== currentZoomRef.current) {
        currentZoomRef.current = newLevel;
        setCurrentZoomLevel(newLevel);
        if (onZoomChangeRef.current) {
          onZoomChangeRef.current(newLevel, distNow);
        }
      }

      // Facing Center Coordinates Calculation (throttled every 300ms)
      if (now - lastCenterCalcRef.current > 300) {
        lastCenterCalcRef.current = now;
        const centerLat = currentRotation.current.x * (180 / Math.PI);
        let centerLon = -currentRotation.current.y * (180 / Math.PI) - 90;
        centerLon = ((((centerLon + 180) % 360) + 360) % 360) - 180;
        if (onCenterCoordsRef.current) {
          onCenterCoordsRef.current(centerLat, centerLon);
        }
      }

      // 14. Geographic Labels Backface Culling & Zoom LOD Continuous Cross-Fade
      if (labelsGroupRef.current && cameraRef.current && earthMeshRef.current) {
        const cameraPos = cameraRef.current.position;
        earthMeshRef.current.getWorldPosition(earthWorldPos);
        const dist = currentCameraDistance.current;

        labelsGroupRef.current.children.forEach((child) => {
          const sprite = child as THREE.Sprite;
          const data = sprite.userData as { level: number };

          // Continuous Level of Detail (LOD) opacity cross-fading (no abrupt pop-in)
          let lodAlpha = 1.0;
          if (data.level === 1) {
            lodAlpha = dist < 3.3 ? Math.max(0.15, (dist - 2.6) / 0.7) : 1.0;
          } else if (data.level === 2) {
            lodAlpha = Math.min(1.0, Math.max(0.0, (5.5 - dist) / 0.7));
          } else if (data.level === 3) {
            lodAlpha = Math.min(1.0, Math.max(0.0, (4.1 - dist) / 0.6));
          }

          if (lodAlpha <= 0.01) {
            sprite.visible = false;
            return;
          }

          // Backface Culling: check angle between surface normal and camera vector
          sprite.getWorldPosition(tempWorldPos);
          tempNormal.copy(tempWorldPos).sub(earthWorldPos).normalize();
          tempViewDir.copy(cameraPos).sub(tempWorldPos).normalize();
          const dot = tempNormal.dot(tempViewDir);

          // Visible only on front-facing hemisphere
          if (dot > 0.18) {
            sprite.visible = true;
            // Smoothly soften opacity near the limb/horizon combined with zoom LOD
            const limbFade = Math.min(1.0, Math.max(0.0, (dot - 0.18) * 3.5));
            sprite.material.opacity = limbFade * 0.94 * lodAlpha;
          } else {
            sprite.visible = false;
          }
        });
      }

      // 15. Scientific Observation Layer Smooth Cross-Fade Animation
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

      // 16. Selected Location Marker Subtle Organic Breathing Pulse
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

    // Non-passive Native Wheel Handler (Fixes Zoom vs Scroll Disambiguation)
    const onWindowWheel = (e: WheelEvent) => {
      // Zoom ONLY when pointer is hovering over Earth sphere!
      if (isPointerOverEarth(e.clientX, e.clientY)) {
        e.preventDefault();
        const zoomFactor = e.deltaY * 0.0018;
        targetCameraDistance.current = Math.max(
          minDistance,
          Math.min(maxDistance, targetCameraDistance.current + zoomFactor)
        );
        lastInteractionTime.current = Date.now();
      }
      // If pointer is outside Earth, e.preventDefault() is NOT called, allowing normal page scrolling!
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
      earthGeometry.dispose();
      earthMaterial.dispose();
      cloudsGeometry.dispose();
      cloudsMaterial.dispose();
      atmosphereGeometry.dispose();
      atmosphereMaterial.dispose();
      starGeometry.dispose();
      starMaterial.dispose();
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

    const targetY = -((lon + 90) * (Math.PI / 180));
    const targetX = lat * (Math.PI / 180);

    flyToTarget.current = {
      x: Math.max(-0.9, Math.min(0.9, targetX)),
      y: targetY,
    };
    isFlyingToRef.current = true;
    lastInteractionTime.current = Date.now();

    // Zoom into country/regional view if currently pulled far back
    if (targetCameraDistance.current > 3.8) {
      targetCameraDistance.current = 3.3;
    }
  }, [selectedFeature]);

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

  // Mouse / Pointer Drag Handlers (Only active when starting over Earth or dragging)
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

    const sensitivity = 0.0055;
    targetRotation.current.y += deltaX * sensitivity;
    targetRotation.current.x += deltaY * sensitivity;

    targetRotation.current.x = Math.max(-1.1, Math.min(1.1, targetRotation.current.x));
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

  // Click on Observation Point Raycasting (Full Viewport Coordinates)
  const handleClick = (e: React.MouseEvent) => {
    if (!cameraRef.current || !markersGroupRef.current) return;

    const x = (e.clientX / window.innerWidth) * 2 - 1;
    const y = -(e.clientY / window.innerHeight) * 2 + 1;

    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(new THREE.Vector2(x, y), cameraRef.current);

    const intersects = raycaster.intersectObjects(markersGroupRef.current.children);
    if (intersects.length > 0 && onSelectFeature) {
      const hit = intersects.find((i) => i.object.userData?.feature);
      if (hit && hit.object.userData.feature) {
        onSelectFeature(hit.object.userData.feature);
      }
    }
  };

  // Dedicated Unobtrusive Camera Controls
  const zoomIn = () => {
    targetCameraDistance.current = Math.max(minDistance, targetCameraDistance.current - 0.7);
    lastInteractionTime.current = Date.now();
  };

  const zoomOut = () => {
    targetCameraDistance.current = Math.min(maxDistance, targetCameraDistance.current + 0.7);
    lastInteractionTime.current = Date.now();
  };

  const resetOrientation = () => {
    targetRotation.current = { x: 0.12, y: -0.6 };
    targetCameraDistance.current = 4.6;
    isFlyingToRef.current = false;
    lastInteractionTime.current = Date.now();
  };

  if (!visible) return null;

  return (
    <>
      {/* Full-Viewport Unrestricted 3D Earth Canvas Mount */}
      <div
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onClick={handleClick}
        className={`fixed inset-0 w-screen h-screen z-0 overflow-hidden select-none cursor-grab active:cursor-grabbing touch-none ${className}`}
        style={{ touchAction: 'none' }}
      >
        <div ref={canvasMountRef} className="absolute inset-0 w-full h-full pointer-events-none" />
      </div>

      {/* Subtle Deep Space Vignette (Blends into #05070b) */}
      <div className="fixed inset-0 pointer-events-none z-0 bg-radial from-transparent via-[#05070b]/10 to-[#05070b]/75" />

      {/* Observation Layer Updating Toast */}
      {loading && (
        <div className="fixed top-20 left-1/2 -translate-x-1/2 z-30 flex items-center space-x-2 px-3.5 py-1.5 rounded-full bg-slate-900/90 border border-slate-800 text-[11px] font-mono text-cyan-300 shadow-2xl backdrop-blur-md pointer-events-none">
          <div className="h-3 w-3 rounded-full border-2 border-cyan-400 border-t-transparent animate-spin" />
          <span>Updating Observations...</span>
        </div>
      )}

      {/* Minimal Unobtrusive Camera Navigation Controls (Bottom-Left to avoid side panel collision) */}
      <div className="fixed bottom-5 left-5 sm:bottom-6 sm:left-6 z-30 flex items-center space-x-2 pointer-events-auto">
        <div className="flex flex-col space-y-1 bg-[#090d16]/90 p-1.5 rounded-xl border border-slate-800/80 backdrop-blur-md shadow-2xl">
          <button
            onClick={(e) => {
              e.stopPropagation();
              zoomIn();
            }}
            title="Zoom In"
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
              resetOrientation();
            }}
            title="Reset View"
            className="p-2 rounded-lg hover:bg-slate-800 text-slate-300 hover:text-cyan-400 transition-colors"
          >
            <RotateCcw className="h-4 w-4" />
          </button>
        </div>

        {/* Subtle Scale & Zoom Level Pill */}
        <div className="hidden sm:flex flex-col justify-center px-2.5 py-1.5 rounded-xl bg-[#090d16]/90 border border-slate-800/80 text-[10px] font-mono backdrop-blur-md shadow-2xl text-slate-400">
          <span className="text-slate-500 uppercase tracking-widest text-[8px]">Scale</span>
          <span className="text-cyan-400 font-semibold capitalize">{currentZoomLevel}</span>
        </div>
      </div>
    </>
  );
};
export default EarthGlobe;
