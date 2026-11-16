import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { GeoJSONFeatureCollection, GeoJSONFeature } from '../services/api';
import { GISPlace } from '../services/gisDatabase';
import { ImageryLODManager } from '../services/imageryLOD';
import { createCinematicSpaceEnvironment, SpaceEnvironment } from '../services/spaceEnvironment';
import { createEarthDayNightShader, EarthDayNightShaderBundle } from '../services/earthShader';
import { loadVectorBoundaries, VectorBoundariesMeshGroup } from '../services/vectorBoundaries';
import { adaptiveQuality, QualityTier, QualityMode, QualityProfile } from '../services/adaptiveQuality';
import { SurfaceLabelManager } from '../services/surfaceLabels';
import { latLonToVector3, getScientificObservationHexColor } from '../services/geography';
import {
  ZoomIn,
  ZoomOut,
  Navigation,
  Compass,
  Layers,
  Globe as GlobeIcon,
  Cpu,
} from 'lucide-react';

export type EarthModule = 'ocean' | 'atmosphere' | 'land' | null;
export type ZoomLevel = 'global' | 'continental' | 'country' | 'regional';

interface EarthGlobeProps {
  activeModule: EarthModule;
  activeModules?: ('ocean' | 'atmosphere' | 'land')[];
  data: GeoJSONFeatureCollection | null;
  multiData?: {
    ocean?: GeoJSONFeatureCollection | null;
    atmosphere?: GeoJSONFeatureCollection | null;
    land?: GeoJSONFeatureCollection | null;
  };
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
  center?: { lat: number; lon: number };
  cameraDistance?: number;
  sidePanelOpen?: boolean;
  trendsOpen?: boolean;
  trendsExpanded?: boolean;
  introMode?: boolean;
}

// Smooth cubic ease-in-out easing function for time-based camera animations
function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

// Calculate shortest angular difference on circle [-PI, PI] to avoid spinning the wrong way
function getShortestAngleDelta(current: number, target: number): number {
  let diff = (target - current) % (Math.PI * 2);
  if (diff > Math.PI) diff -= Math.PI * 2;
  if (diff < -Math.PI) diff += Math.PI * 2;
  return diff;
}

interface CameraTransition {
  startTime: number;
  duration: number;
  startX: number;
  startY: number;
  startDist: number;
  targetX: number;
  targetY: number;
  targetDist: number;
}

// Derive scientific marker color for 3D observation overlay points using unified colormap
function getObservationColor(feature: GeoJSONFeature, activeModule: EarthModule, metricType: string): THREE.Color {
  return new THREE.Color(getScientificObservationHexColor(feature.properties, activeModule, metricType));
}

export const EarthGlobe: React.FC<EarthGlobeProps> = ({
  activeModule,
  activeModules = [],
  data,
  multiData,
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
  center,
  cameraDistance,
  sidePanelOpen = false,
  trendsOpen = false,
  trendsExpanded = false,
  introMode = false,
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
  const trendsOpenRef = useRef(trendsOpen);
  trendsOpenRef.current = trendsOpen;
  const trendsExpandedRef = useRef(trendsExpanded);
  trendsExpandedRef.current = trendsExpanded;
  const visibleRef = useRef(visible);
  visibleRef.current = visible;
  const prevVisibleRef = useRef(visible);

  const currentZoomRef = useRef<ZoomLevel>('global');
  const [currentZoomLevel, setCurrentZoomLevel] = useState<ZoomLevel>('global');
  const [imageryResolution, setImageryResolution] = useState<string>('TerraLens base imagery');
  const currentResolutionBadgeRef = useRef<string>('TerraLens base imagery');
  const lastCenterCalcRef = useRef(Date.now());
  const lastReportedDistRef = useRef(5.35);

  // Device-adaptive quality state & profile refs
  const [qualityTier, setQualityTier] = useState<QualityTier>(adaptiveQuality.getProfile().tier);
  const [qualityMode, setQualityMode] = useState<QualityMode>(adaptiveQuality.getMode());
  const qualityProfileRef = useRef<QualityProfile>(adaptiveQuality.getProfile());


  // Shared geometry instances for markers to eliminate memory fragmentation
  const sharedSphereGeomRef = useRef<THREE.SphereGeometry | null>(null);
  const sharedHaloGeomRef = useRef<THREE.RingGeometry | null>(null);

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
  const surfaceLabelsRef = useRef<SurfaceLabelManager | null>(null);
  const imageryLODRef = useRef<ImageryLODManager | null>(null);
  const vectorBoundariesRef = useRef<VectorBoundariesMeshGroup | null>(null);
  const spaceEnvRef = useRef<SpaceEnvironment | null>(null);
  const earthShadersRef = useRef<EarthDayNightShaderBundle | null>(null);
  const animFrameIdRef = useRef<number | null>(null);
  const animateRef = useRef<((ts: number) => void) | null>(null);
  const lastTimestampRef = useRef<number>(performance.now());

  // Interaction state machine ('idle' | 'dragging' | 'transitioning' | 'pinching')
  type InteractionState = 'idle' | 'dragging' | 'transitioning' | 'pinching';
  const interactionStateRef = useRef<InteractionState>('idle');
  const activeTransitionRef = useRef<CameraTransition | null>(null);

  // Multi-touch & pointer tracking
  const activePointersRef = useRef<Map<number, { x: number; y: number }>>(new Map());
  const pinchStartDistanceRef = useRef<number | null>(null);
  const pinchStartCameraDistRef = useRef<number>(4.6);
  const dragDistanceRef = useRef<number>(0);

  const isDraggingRef = useRef(false);
  const prevMousePos = useRef({ x: 0, y: 0 });
  const targetRotation = useRef({ x: 0.12, y: -0.6 });
  const currentRotation = useRef({ x: 0.12, y: -0.6 });
  const targetCameraDistance = useRef(5.35);
  const currentCameraDistance = useRef(5.35);
  const lastInteractionTime = useRef(Date.now());
  const minDistance = 2.15; // Camera can zoom in deep to close orbit (~250km) for high-res tile inspection
  const maxDistance = 6.8;  // Wide space perspective

  const [isReady, setIsReady] = useState(false);

  // Time-based camera fly-to with cubic easing, shortest angular arc, and reduced-motion support
  const flyToCoordinates = (lat: number, lon: number, targetDist?: number, duration: number = 1100) => {
    const targetY = -((lon + 90) * (Math.PI / 180));
    const targetX = Math.max(-1.15, Math.min(1.15, lat * (Math.PI / 180)));
    const diffY = getShortestAngleDelta(currentRotation.current.y, targetY);
    const resolvedDist = targetDist !== undefined ? Math.max(minDistance, Math.min(maxDistance, targetDist)) : currentCameraDistance.current;

    // Respect WCAG 2.3.3 / OS prefers-reduced-motion preference: jump immediately without spinning
    const isReducedMotion = typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (isReducedMotion) {
      currentRotation.current.x = targetX;
      currentRotation.current.y = targetY;
      currentCameraDistance.current = resolvedDist;
      activeTransitionRef.current = null;
      interactionStateRef.current = 'idle';
      lastInteractionTime.current = Date.now();
      return;
    }

    activeTransitionRef.current = {
      startTime: performance.now(),
      duration,
      startX: currentRotation.current.x,
      startY: currentRotation.current.y,
      startDist: currentCameraDistance.current,
      targetX,
      targetY: currentRotation.current.y + diffY,
      targetDist: resolvedDist,
    };
    interactionStateRef.current = 'transitioning';
    lastInteractionTime.current = Date.now();
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

  // Subscribe to device-adaptive quality profile
  useEffect(() => {
    return adaptiveQuality.subscribe((profile, mode) => {
      qualityProfileRef.current = profile;
      setQualityTier(profile.tier);
      setQualityMode(mode);

      // Dynamically adapt renderer pixel ratio without recreating WebGL context
      if (rendererRef.current) {
        rendererRef.current.setPixelRatio(
          Math.min(window.devicePixelRatio || 1, profile.maxPixelRatio)
        );
      }
    });
  }, []);

  // Initialize Three.js Realistic Cinematic Earth Scene
  useEffect(() => {
    const mount = canvasMountRef.current;
    if (!mount) return;
    let disposed = false;

    const width = window.innerWidth;
    const height = window.innerHeight;

    // 1. Scene
    const scene = new THREE.Scene();
    sceneRef.current = scene;

    // 2. Camera with true full-viewport aspect ratio
    const camera = new THREE.PerspectiveCamera(42, width / height, 0.1, 1200);
    camera.position.set(0, 0, currentCameraDistance.current);
    cameraRef.current = camera;

    // 3. WebGL Renderer sized to entire viewport with device-adaptive settings
    const profile = qualityProfileRef.current;
    const renderer = new THREE.WebGLRenderer({
      antialias: profile.antialias,
      alpha: true,
      powerPreference: 'high-performance',
    });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, profile.maxPixelRatio));
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
      if (disposed) {
        vb.dispose();
        return;
      }
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

    // 14. Surface-Anchored Progressive GIS Labels (Google Earth-style progressive LOD)
    const surfaceLabels = new SurfaceLabelManager({
      earthRadius,
      maxVisibleLabels: 64,
      maxActivePoolSize: 100,
    });
    surfaceLabels.group.renderOrder = 10;
    earthGroup.add(surfaceLabels.group);
    surfaceLabelsRef.current = surfaceLabels;

    setIsReady(true);

    // 15. Render Animation Loop with Serene Rotation & Multi-Resolution Tile Streamer
    lastTimestampRef.current = performance.now();

    const animate = (timestamp: number) => {
      const delta = Math.min((timestamp - lastTimestampRef.current) / 1000, 0.1);
      lastTimestampRef.current = timestamp;

      if (!visibleRef.current) {
        animFrameIdRef.current = null;
        return;
      }

      // Update cinematic celestial background & subtle dust drift
      if (spaceEnvRef.current) {
        spaceEnvRef.current.update(delta, timestamp);
      }

      // Slower, serene rotation: 1 revolution every 9 minutes (~0.0116 rad/sec)
      const now = Date.now();
      const timeSinceInteraction = now - lastInteractionTime.current;
      if (interactionStateRef.current === 'idle' && timeSinceInteraction > 2500) {
        targetRotation.current.y += 0.0116 * delta;
      }

      // Time-based camera transitions vs frame-rate independent exponential smoothing
      if (interactionStateRef.current === 'transitioning' && activeTransitionRef.current) {
        const trans = activeTransitionRef.current;
        const elapsed = (timestamp - trans.startTime) / trans.duration;
        const progress = Math.min(1.0, Math.max(0.0, elapsed));
        const ease = easeInOutCubic(progress);

        currentRotation.current.x = trans.startX + (trans.targetX - trans.startX) * ease;
        currentRotation.current.y = trans.startY + (trans.targetY - trans.startY) * ease;
        currentCameraDistance.current = trans.startDist + (trans.targetDist - trans.startDist) * ease;

        targetRotation.current.x = currentRotation.current.x;
        targetRotation.current.y = currentRotation.current.y;
        targetCameraDistance.current = currentCameraDistance.current;

        if (progress >= 1.0) {
          activeTransitionRef.current = null;
          interactionStateRef.current = 'idle';
        }
      } else {
        // Frame-rate independent exponential smoothing for dragging, wheel zoom, and idle rotation
        const smoothFactor = 1.0 - Math.exp(-12.0 * delta);
        currentRotation.current.x += (targetRotation.current.x - currentRotation.current.x) * smoothFactor;
        currentRotation.current.y += (targetRotation.current.y - currentRotation.current.y) * smoothFactor;
        currentCameraDistance.current += (targetCameraDistance.current - currentCameraDistance.current) * smoothFactor;
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
      const shouldShift =
        sidePanelOpenRef.current && window.innerWidth >= 1024 && window.innerWidth < 1536;
      targetCameraX.current = shouldShift ? -0.42 : 0;
      const xSmoothFactor = 1.0 - Math.exp(-8.0 * delta);
      currentCameraX.current += (targetCameraX.current - currentCameraX.current) * xSmoothFactor;

      if (cameraRef.current) {
        cameraRef.current.position.z = currentCameraDistance.current;
        cameraRef.current.position.x = currentCameraX.current;
      }

      // Report frame delta to Adaptive Quality manager for dynamic tiering
      adaptiveQuality.reportFrameDelta(delta);

      // Adaptive Zoom Level & Resolution Scale Calculation
      const distNow = currentCameraDistance.current;
      let newLevel: ZoomLevel = 'global';
      let resBadge = 'TerraLens base imagery';

      if (distNow < 2.65) {
        newLevel = 'regional';
        resBadge = 'ArcGIS World Imagery · z8';
      } else if (distNow < 3.2) {
        newLevel = 'regional';
        resBadge = 'ArcGIS World Imagery · z7';
      } else if (distNow < 3.8) {
        newLevel = 'country';
        resBadge = 'ArcGIS World Imagery · z5';
      } else if (distNow < 4.7) {
        newLevel = 'continental';
        resBadge = 'ArcGIS World Imagery · z3';
      } else {
        newLevel = 'global';
        resBadge = 'TerraLens base imagery';
      }

      if (newLevel !== currentZoomRef.current || Math.abs(distNow - lastReportedDistRef.current) > 0.08) {
        currentZoomRef.current = newLevel;
        lastReportedDistRef.current = distNow;
        setCurrentZoomLevel(newLevel);
        if (onZoomChangeRef.current) {
          onZoomChangeRef.current(newLevel, distNow);
        }
      }

      // Eliminate per-frame React rerenders: update state only when resolution text changes
      if (resBadge !== currentResolutionBadgeRef.current) {
        currentResolutionBadgeRef.current = resBadge;
        setImageryResolution(resBadge);
      }

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

      // 17. Stream Spherical Satellite Imagery LOD Tiles (Centralized delta-time stepping)
      if (imageryLODRef.current) {
        imageryLODRef.current.update(delta, distNow, centerLat, centerLon);
      }

      // 18. Surface-Anchored Geographic Labels (Progressive LOD, Scale-Stabilization, Silky Fade)
      if (surfaceLabelsRef.current && cameraRef.current) {
        surfaceLabelsRef.current.update(
          delta,
          cameraRef.current,
          distNow,
          currentRotation.current,
          window.innerWidth,
          window.innerHeight
        );
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

    animateRef.current = animate;
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
      if (!visibleRef.current) return;

      // Allow native scrolling when pointer is over any interactive UI container (aside, nav, drawer, dialog, etc.)
      const target = e.target as HTMLElement | null;
      if (
        target &&
        target.closest(
          'aside, header, nav, button, input, select, textarea, [role="dialog"], [role="region"], .overflow-y-auto, .overflow-x-auto, .overflow-auto'
        )
      ) {
        return;
      }

      // Explicit screen-coordinate guards for open panels to ensure 100% independent scrolling
      if (sidePanelOpenRef.current && e.clientX > window.innerWidth - 390) {
        return;
      }
      const trendDrawerHeight = trendsExpandedRef.current ? 580 : (typeof window !== 'undefined' && window.innerWidth >= 640 ? 390 : 330);
      if (trendsOpenRef.current && e.clientY > window.innerHeight - trendDrawerHeight) {
        return;
      }

      // Zoom ONLY when pointer is hovering over Earth sphere!
      if (isPointerOverEarth(e.clientX, e.clientY)) {
        e.preventDefault();
        // Immediately cancel active transition if user initiates wheel zoom
        if (interactionStateRef.current === 'transitioning') {
          activeTransitionRef.current = null;
          targetRotation.current.x = currentRotation.current.x;
          targetRotation.current.y = currentRotation.current.y;
          targetCameraDistance.current = currentCameraDistance.current;
          interactionStateRef.current = 'idle';
        }
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

    // WebGL Context Loss & Restoration Handling
    const canvasElem = renderer.domElement;
    const onContextLost = (e: Event) => {
      e.preventDefault();
      console.warn('[EarthGlobe] WebGL context lost. Suspending Three.js render loop.');
      if (animFrameIdRef.current) {
        cancelAnimationFrame(animFrameIdRef.current);
        animFrameIdRef.current = null;
      }
    };
    const onContextRestored = () => {
      console.info('[EarthGlobe] WebGL context restored. Rebuilding rendering state.');
      if (rendererRef.current && cameraRef.current) {
        rendererRef.current.setSize(window.innerWidth, window.innerHeight);
      }
      lastTimestampRef.current = performance.now();
      animFrameIdRef.current = requestAnimationFrame(animate);
    };
    canvasElem.addEventListener('webglcontextlost', onContextLost, false);
    canvasElem.addEventListener('webglcontextrestored', onContextRestored, false);

    // Page Visibility State Management (reduce GPU battery consumption when tab is hidden)
    const onVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        if (animFrameIdRef.current) {
          cancelAnimationFrame(animFrameIdRef.current);
          animFrameIdRef.current = null;
        }
      } else {
        if (!animFrameIdRef.current && visibleRef.current) {
          lastTimestampRef.current = performance.now();
          animFrameIdRef.current = requestAnimationFrame(animate);
        }
      }
    };
    document.addEventListener('visibilitychange', onVisibilityChange);

    // Cleanup resources on unmount
    return () => {
      disposed = true;
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('wheel', onWindowWheel);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      canvasElem.removeEventListener('webglcontextlost', onContextLost);
      canvasElem.removeEventListener('webglcontextrestored', onContextRestored);
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
      surfaceLabelsRef.current?.dispose();
      earthShadersRef.current?.dispose();
      earthGeometry.dispose();
      cloudsGeometry.dispose();
      cloudsMaterial.dispose();
      atmosphereGeometry.dispose();
      if (sharedSphereGeomRef.current) sharedSphereGeomRef.current.dispose();
      if (sharedHaloGeomRef.current) sharedHaloGeomRef.current.dispose();
    };
  }, []);

  // Pause render loop when 3D globe is hidden (e.g. 2D Map view active)
  useEffect(() => {
    if (!visible) {
      if (animFrameIdRef.current) {
        cancelAnimationFrame(animFrameIdRef.current);
        animFrameIdRef.current = null;
      }
    } else {
      if (!animFrameIdRef.current && isReady && animateRef.current && document.visibilityState !== 'hidden') {
        lastReportedDistRef.current = currentCameraDistance.current;
        lastTimestampRef.current = performance.now();
        animFrameIdRef.current = requestAnimationFrame(animateRef.current);
      }
    }
  }, [visible, isReady]);

  // Update Observation Markers when data or module changes (Geometry reuse across all features)
  useEffect(() => {
    if (!isReady || !markersGroupRef.current) return;
    const markersGroup = markersGroupRef.current;
    selectedHaloRef.current = null;
    layerOpacityRef.current = 0.0;

    while (markersGroup.children.length > 0) {
      const child = markersGroup.children[0] as THREE.Mesh;
      markersGroup.remove(child);
      if (child.material) {
        if (Array.isArray(child.material)) child.material.forEach((m) => m.dispose());
        else child.material.dispose();
      }
    }

    const collectionsToRender: Array<{ mod: 'ocean' | 'atmosphere' | 'land'; collection: GeoJSONFeatureCollection }> = [];
    if (multiData && activeModules.length > 0) {
      activeModules.forEach((m) => {
        const col = multiData[m];
        if (col && col.features && col.features.length > 0) {
          collectionsToRender.push({ mod: m, collection: col });
        }
      });
    } else if (data && activeModule && data.features && data.features.length > 0) {
      collectionsToRender.push({ mod: activeModule as any, collection: data });
    }

    if (collectionsToRender.length === 0) return;

    const earthRadius = 1.9;
    const markerRadius = earthRadius * 1.008;

    // Reuse single geometry instances to eliminate hundreds of allocations/garbage collections
    if (!sharedSphereGeomRef.current) {
      sharedSphereGeomRef.current = new THREE.SphereGeometry(0.024, 12, 12);
    }
    if (!sharedHaloGeomRef.current) {
      sharedHaloGeomRef.current = new THREE.RingGeometry(0.028, 0.048, 16);
    }
    const sphereGeom = sharedSphereGeomRef.current;
    const haloGeom = sharedHaloGeomRef.current;

    collectionsToRender.forEach(({ mod, collection }) => {
      collection.features.forEach((feature) => {
        const coords = feature.geometry.coordinates;
        const lon = coords[0];
        const lat = coords[1];

        const pos = latLonToVector3(lat, lon, markerRadius);
        const color = getObservationColor(feature, mod, metricType);

        const markerMat = new THREE.MeshBasicMaterial({
          color,
          transparent: true,
          opacity: 0.0,
        });

        const marker = new THREE.Mesh(sphereGeom, markerMat);
        marker.position.copy(pos);
        marker.userData = { feature, module: mod, baseOpacity: 0.95 };
        markersGroup.add(marker);

        const haloMat = new THREE.MeshBasicMaterial({
          color,
          transparent: true,
          opacity: 0.0,
          side: THREE.DoubleSide,
        });
        const halo = new THREE.Mesh(haloGeom, haloMat);
        halo.position.copy(pos);
        halo.lookAt(0, 0, 0);
        halo.userData = { feature, module: mod, baseOpacity: 0.45 };
        markersGroup.add(halo);
      });
    });
  }, [data, multiData, activeModule, activeModules, metricType, isReady]);

  // Lightweight synchronization of selected observation halo without scene reconstruction
  useEffect(() => {
    if (!markersGroupRef.current) return;
    const group = markersGroupRef.current;

    if (!selectedFeature) {
      selectedHaloRef.current = null;
      return;
    }

    const [selLon, selLat] = selectedFeature.geometry.coordinates;
    let foundHalo: THREE.Mesh | null = null;

    group.children.forEach((child) => {
      const mesh = child as THREE.Mesh;
      const feat = mesh.userData?.feature as GeoJSONFeature | undefined;
      if (!feat) return;

      const isThisPoint =
        feat.geometry.coordinates[0] === selLon && feat.geometry.coordinates[1] === selLat;

      if (mesh.geometry instanceof THREE.RingGeometry) {
        if (isThisPoint) {
          foundHalo = mesh;
          mesh.userData.baseOpacity = 0.85;
          (mesh.material as THREE.MeshBasicMaterial).color.setHex(0x38bdf8);
        } else {
          mesh.userData.baseOpacity = 0.45;
          const origColor = getObservationColor(feat, activeModule, metricType);
          (mesh.material as THREE.MeshBasicMaterial).color.copy(origColor);
        }
      }
    });

    selectedHaloRef.current = foundHalo;
  }, [selectedFeature, activeModule, metricType]);

  // Handle fly-to when selectedFeature changes
  useEffect(() => {
    if (!selectedFeature) return;
    const [lon, lat] = selectedFeature.geometry.coordinates;
    const targetDist = targetCameraDistance.current > 3.8 ? 3.2 : targetCameraDistance.current;
    flyToCoordinates(lat, lon, targetDist);
  }, [selectedFeature]);

  // Handle fly-to when selectedPlace changes with Google Earth-style dynamic altitude framing
  useEffect(() => {
    if (!selectedPlace || !visible || !isReady) return;
    let targetDist: number;

    if (selectedPlace.bbox && selectedPlace.bbox.length === 4) {
      const [minLon, minLat, maxLon, maxLat] = selectedPlace.bbox;
      const spanLat = Math.abs(maxLat - minLat);
      const spanLon = Math.abs(maxLon - minLon);
      const maxSpan = Math.max(spanLat, spanLon);

      if (maxSpan > 55) {
        // Massive country / continent (e.g. Russia, Canada, Brazil, China, USA)
        targetDist = 4.45;
      } else if (maxSpan > 20) {
        // Medium country / large basin (e.g. France, Germany, India, Egypt)
        targetDist = 3.80;
      } else if (maxSpan > 6) {
        // Smaller country / state (e.g. UK, Japan, California, Madagascar)
        targetDist = 3.30;
      } else if (maxSpan > 2) {
        // Small state / metro region (e.g. Switzerland, Lebanon, Kerala)
        targetDist = 2.85;
      } else {
        // City / mountain / localized feature
        targetDist = 2.50;
      }
    } else {
      targetDist =
        selectedPlace.level === 4
          ? 2.55
          : selectedPlace.level === 3
          ? 3.10
          : selectedPlace.level === 2
          ? 3.80
          : 4.60;
    }

    flyToCoordinates(selectedPlace.lat, selectedPlace.lon, targetDist, 1100);
  }, [selectedPlace, visible, isReady]);

  // Synchronize 3D camera orientation with geographic center and distance when restoring from 2D mode
  useEffect(() => {
    if (!prevVisibleRef.current && visible && center && isReady && !selectedPlace && !selectedFeature) {
      const targetDist = cameraDistance
        ? Math.max(minDistance, Math.min(maxDistance, cameraDistance))
        : currentCameraDistance.current;
      flyToCoordinates(center.lat, center.lon, targetDist, 750);
    }
    prevVisibleRef.current = visible;
  }, [visible, center, isReady, cameraDistance, selectedPlace, selectedFeature]);

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

  // Clear any active drag/pinch/pointer state on view or module transition
  useEffect(() => {
    activePointersRef.current.clear();
    isDraggingRef.current = false;
    pinchStartDistanceRef.current = null;
    interactionStateRef.current = 'idle';
  }, [visible, activeModule]);

  // Mouse / Pointer Drag & Multi-Touch Pinch Handlers with Altitude-Scaled Sensitivity
  const handlePointerDown = (e: React.PointerEvent) => {
    // Avoid capturing pointers if clicking on interactive child elements
    const target = e.target as HTMLElement | null;
    if (
      target &&
      target.closest(
        'aside, header, nav, button, input, select, textarea, [role="dialog"], [role="region"], .overflow-y-auto, .overflow-x-auto, .overflow-auto'
      )
    ) {
      return;
    }

    // Do not initiate globe gestures if pointer down occurs over docked panels
    if (sidePanelOpenRef.current && e.clientX > window.innerWidth - 390) {
      return;
    }
    const trendDrawerHeight = trendsExpandedRef.current ? 580 : (typeof window !== 'undefined' && window.innerWidth >= 640 ? 390 : 330);
    if (trendsOpenRef.current && e.clientY > window.innerHeight - trendDrawerHeight) {
      return;
    }

    // Seamless interruption: cancel any active camera transition without snapping
    if (interactionStateRef.current === 'transitioning') {
      activeTransitionRef.current = null;
      targetRotation.current.x = currentRotation.current.x;
      targetRotation.current.y = currentRotation.current.y;
      targetCameraDistance.current = currentCameraDistance.current;
    }

    activePointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (activePointersRef.current.size === 1) {
      interactionStateRef.current = 'dragging';
      isDraggingRef.current = true;
      dragDistanceRef.current = 0;
      prevMousePos.current = { x: e.clientX, y: e.clientY };
      pinchStartDistanceRef.current = null;
    } else if (activePointersRef.current.size >= 2) {
      // Initiate two-finger pinch gesture
      const pts = Array.from(activePointersRef.current.values());
      const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      pinchStartDistanceRef.current = Math.max(10, dist);
      pinchStartCameraDistRef.current = currentCameraDistance.current;
      interactionStateRef.current = 'pinching';
      isDraggingRef.current = false;
    }

    lastInteractionTime.current = Date.now();
    try {
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
    } catch {}
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!activePointersRef.current.has(e.pointerId)) return;
    activePointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

    // Multi-touch pinch-to-zoom handling
    if (activePointersRef.current.size >= 2) {
      const pts = Array.from(activePointersRef.current.values());
      const currentPinchDist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      if (pinchStartDistanceRef.current && pinchStartDistanceRef.current > 10) {
        const pinchDelta = currentPinchDist - pinchStartDistanceRef.current;
        // Scale pinch zoom by current altitude
        const altitude = Math.max(0.18, currentCameraDistance.current - 1.9);
        const altitudeRatio = Math.min(1.0, altitude / 4.5);
        const zoomStep = 0.0055 * Math.pow(altitudeRatio, 0.7);
        const targetDist = pinchStartCameraDistRef.current - pinchDelta * zoomStep;

        targetCameraDistance.current = Math.max(
          minDistance,
          Math.min(maxDistance, targetDist)
        );
        lastInteractionTime.current = Date.now();
      }
      return;
    }

    // Single-pointer drag rotation
    if (!isDraggingRef.current) return;
    const deltaX = e.clientX - prevMousePos.current.x;
    const deltaY = e.clientY - prevMousePos.current.y;
    dragDistanceRef.current += Math.hypot(deltaX, deltaY);
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
    activePointersRef.current.delete(e.pointerId);
    try {
      (e.target as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {}

    if (activePointersRef.current.size === 0) {
      isDraggingRef.current = false;
      pinchStartDistanceRef.current = null;
      interactionStateRef.current = 'idle';
      lastInteractionTime.current = Date.now();
    } else if (activePointersRef.current.size === 1) {
      // Revert to single finger drag if one finger is lifted
      const remaining = Array.from(activePointersRef.current.values())[0];
      prevMousePos.current = { x: remaining.x, y: remaining.y };
      pinchStartDistanceRef.current = null;
      interactionStateRef.current = 'dragging';
      isDraggingRef.current = true;
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

      const newDist = Math.max(minDistance, currentCameraDistance.current - 1.25);
      flyToCoordinates(lat, lon, newDist, 950);
    }
  };

  // Click Raycasting: Select observation point or GIS place label
  const handleClick = (e: React.MouseEvent) => {
    // Prevent accidental click activation after dragging (> 7px drag threshold)
    if (dragDistanceRef.current > 7) {
      return;
    }
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

    // 2. Raycast against visible surface-anchored GIS place labels
    if (surfaceLabelsRef.current) {
      const visibleSprites = surfaceLabelsRef.current.group.children.filter((c) => c.visible);
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
          flyToCoordinates(place.lat, place.lon, targetDist, 1100);
          return;
        }
      }
    }
  };

  // Dedicated Precision Navigation Controls
  const zoomIn = () => {
    const altitude = Math.max(0.18, currentCameraDistance.current - 1.9);
    const altitudeRatio = Math.min(1.0, altitude / 4.5);
    const step = Math.max(0.4, 0.85 * altitudeRatio);
    const targetDist = Math.max(minDistance, currentCameraDistance.current - step);

    activeTransitionRef.current = {
      startTime: performance.now(),
      duration: 500,
      startX: currentRotation.current.x,
      startY: currentRotation.current.y,
      startDist: currentCameraDistance.current,
      targetX: currentRotation.current.x,
      targetY: currentRotation.current.y,
      targetDist,
    };
    interactionStateRef.current = 'transitioning';
    lastInteractionTime.current = Date.now();
  };

  const zoomOut = () => {
    const altitude = Math.max(0.18, currentCameraDistance.current - 1.9);
    const altitudeRatio = Math.min(1.0, altitude / 4.5);
    const step = Math.max(0.4, 0.85 * altitudeRatio);
    const targetDist = Math.min(maxDistance, currentCameraDistance.current + step);

    activeTransitionRef.current = {
      startTime: performance.now(),
      duration: 500,
      startX: currentRotation.current.x,
      startY: currentRotation.current.y,
      startDist: currentCameraDistance.current,
      targetX: currentRotation.current.x,
      targetY: currentRotation.current.y,
      targetDist,
    };
    interactionStateRef.current = 'transitioning';
    lastInteractionTime.current = Date.now();
  };

  const resetOrientation = () => {
    const targetX = 0.12;
    const targetY = -0.6;
    const diffY = getShortestAngleDelta(currentRotation.current.y, targetY);

    activeTransitionRef.current = {
      startTime: performance.now(),
      duration: 1000,
      startX: currentRotation.current.x,
      startY: currentRotation.current.y,
      startDist: currentCameraDistance.current,
      targetX,
      targetY: currentRotation.current.y + diffY,
      targetDist: 5.35,
    };
    interactionStateRef.current = 'transitioning';
    lastInteractionTime.current = Date.now();
  };

  const orientNorthUp = () => {
    activeTransitionRef.current = {
      startTime: performance.now(),
      duration: 700,
      startX: currentRotation.current.x,
      startY: currentRotation.current.y,
      startDist: currentCameraDistance.current,
      targetX: 0,
      targetY: currentRotation.current.y,
      targetDist: currentCameraDistance.current,
    };
    interactionStateRef.current = 'transitioning';
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
      data-globe-target={selectedPlace?.name || selectedFeature?.properties.location_name || ''}
    >
      {/* Full-Viewport Unrestricted 3D Earth Canvas Mount */}
      <div
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onClick={handleClick}
        onDoubleClick={handleDoubleClick}
        className={`fixed inset-0 w-full h-dvh z-0 overflow-hidden select-none cursor-grab active:cursor-grabbing touch-none ${className}`}
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

      {/* Keep navigation clear of the home cards while the globe is an overview backdrop. */}
      <div
        className={`fixed left-4 sm:left-6 z-30 ${introMode ? 'top-[4.5rem] right-3 left-auto hidden sm:flex justify-end' : 'flex'} items-center space-x-2.5 pointer-events-auto transition-all duration-300 ease-out ${
          trendsOpen
            ? trendsExpanded
              ? 'bottom-[min(596px,calc(100dvh-120px))]'
              : 'bottom-[350px] sm:bottom-[410px]'
            : introMode
            ? 'bottom-4 sm:bottom-6'
            : 'bottom-36 sm:bottom-36 md:bottom-40'
        }`}
        style={introMode ? { bottom: 'auto' } : undefined}
      >
        <div className={`flex ${introMode ? 'flex-row space-x-1' : 'flex-col space-y-1'} bg-[#090d16]/90 p-1.5 rounded-xl border border-slate-800/80 backdrop-blur-md shadow-2xl`}>
          <button
            onClick={(e) => {
              e.stopPropagation();
              zoomIn();
            }}
            title="Zoom In (or double-click surface)"
            aria-label="Zoom in on 3D globe"
            className="min-h-[36px] min-w-[36px] flex items-center justify-center p-2 rounded-lg hover:bg-slate-800 text-slate-300 hover:text-white transition-colors focus-visible:ring-2 focus-visible:ring-cyan-400 focus-visible:outline-none"
          >
            <ZoomIn className="h-4 w-4" />
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              zoomOut();
            }}
            title="Zoom Out"
            aria-label="Zoom out of 3D globe"
            className="min-h-[36px] min-w-[36px] flex items-center justify-center p-2 rounded-lg hover:bg-slate-800 text-slate-300 hover:text-white transition-colors focus-visible:ring-2 focus-visible:ring-cyan-400 focus-visible:outline-none"
          >
            <ZoomOut className="h-4 w-4" />
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              recenterOnSelected();
            }}
            title="Re-center on Selected Place"
            aria-label="Re-center camera on selected location"
            className="min-h-[36px] min-w-[36px] flex items-center justify-center p-2 rounded-lg hover:bg-slate-800 text-slate-300 hover:text-cyan-400 transition-colors focus-visible:ring-2 focus-visible:ring-cyan-400 focus-visible:outline-none"
          >
            <Navigation className="h-4 w-4" />
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              orientNorthUp();
            }}
            title="Reset Orientation (North Up)"
            aria-label="Reset orientation to north-up"
            className="min-h-[36px] min-w-[36px] flex items-center justify-center p-2 rounded-lg hover:bg-slate-800 text-slate-300 hover:text-cyan-400 transition-colors focus-visible:ring-2 focus-visible:ring-cyan-400 focus-visible:outline-none"
          >
            <Compass className="h-4 w-4" />
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              resetOrientation();
            }}
            title="Reset Global View"
            aria-label="Reset camera to global overview"
            className="min-h-[36px] min-w-[36px] flex items-center justify-center p-2 rounded-lg hover:bg-slate-800 text-slate-300 hover:text-cyan-400 transition-colors focus-visible:ring-2 focus-visible:ring-cyan-400 focus-visible:outline-none"
          >
            <GlobeIcon className="h-4 w-4" />
          </button>
        </div>

        {/* Imagery & Science Resolution Information Pill with Adaptive Quality Indicator */}
        {!introMode && <div className="hidden sm:flex min-w-[235px] flex-col justify-center px-3.5 py-2.5 rounded-xl bg-[#090d16]/95 border border-slate-800/80 text-[11px] font-mono backdrop-blur-md shadow-2xl text-slate-300 space-y-2">
          <div className="flex items-center space-x-1.5 text-slate-400">
            <Layers className="h-3 w-3 text-cyan-400" />
            <span className="text-slate-500 uppercase tracking-wider text-[8px]">Imagery LOD:</span>
            <span className="text-cyan-300 font-medium">{imageryResolution}</span>
          </div>
          <div className="flex items-center justify-between gap-3 text-[10px] text-slate-400">
            <div className="flex items-center space-x-1">
              <span>Scale: <strong className="text-white capitalize">{currentZoomLevel}</strong></span>
              {activeModule && (
                <span className="text-slate-500 hidden md:inline">
                  • {activeModule === 'ocean' ? 'SWOT: ±2.4cm' : activeModule === 'atmosphere' ? 'GPM: 0.1°' : 'MODIS: 0.05°'}
                </span>
              )}
            </div>

            {/* Advanced quality controls are available in the Tools menu. */}
            <div className="flex items-center space-x-1 px-1.5 py-0.5 rounded bg-slate-900/90 border border-slate-800" title={`Rendering quality: ${qualityMode}; active tier: ${qualityTier}`}>
              <Cpu className="h-2.5 w-2.5 text-cyan-400" />
              <span className="uppercase tracking-wider text-[8px] font-semibold">
                {qualityMode === 'auto' ? `Auto (${qualityTier[0].toUpperCase()})` : qualityMode}
              </span>
            </div>
          </div>
        </div>}
      </div>
    </div>
  );
};

export default EarthGlobe;
