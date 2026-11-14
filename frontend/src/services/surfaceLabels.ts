import * as THREE from 'three';
import { GIS_PLACES, GISPlace } from './gisDatabase';

export type ZoomRegime = 'global' | 'continental' | 'country' | 'regional';

export interface SurfaceLabelConfig {
  earthRadius: number;
  maxActivePoolSize?: number;
  maxVisibleLabels?: number;
}

/**
 * Monotonic bidirectional mapping between 3D camera distance (2.15 - 5.5)
 * and 2D MapLibre planar zoom level (1.6 - 10.4).
 */
export function distanceToMapZoom(distance: number): number {
  const d = Math.max(2.15, Math.min(5.5, distance));
  const t = (5.5 - d) / (5.5 - 2.15); // 0 at d=5.5 (global), 1 at d=2.15 (city/town)
  return Number((1.6 + 8.8 * Math.pow(t, 0.95)).toFixed(2));
}

export function mapZoomToDistance(zoom: number): number {
  const z = Math.max(1.6, Math.min(10.4, zoom));
  const t = Math.pow((z - 1.6) / 8.8, 1 / 0.95);
  return Number((5.5 - t * (5.5 - 2.15)).toFixed(3));
}

interface ActiveLabelItem {
  place: GISPlace;
  sprite: THREE.Sprite;
  targetOpacity: number;
  currentOpacity: number;
  worldPos: THREE.Vector3;
  normal: THREE.Vector3;
  baseWidth: number;
  baseHeight: number;
  targetPixelHeight: number;
}

/**
 * High-performance, surface-anchored geographic label system for 3D Earth.
 * Features:
 * 1. Google Earth-style zoom-dependent progressive Level of Detail (Global -> Continental -> Country -> Regional).
 * 2. Surface-anchored positioning with zero parallax float (radius offset +0.22%).
 * 3. Dynamic distance-compensated scale stabilization to prevent ballooning billboards.
 * 4. Silky smooth delta-time opacity cross-fading without sudden popping.
 * 5. Screen-space 2D collision detection and density gating.
 * 6. Dynamic sprite pooling for Level 3/4 places with on-demand canvas texture caching.
 */
export class SurfaceLabelManager {
  public readonly group: THREE.Group;
  private readonly earthRadius: number;
  private readonly surfaceRadius: number;
  private readonly maxVisibleLabels: number;

  // Texture cache keyed by place id
  private readonly textureCache = new Map<string, THREE.CanvasTexture>();

  // Permanent sprites for Level 1 (continents/oceans) and Level 2 (countries)
  private readonly permanentItems: ActiveLabelItem[] = [];

  // Dynamic reusable sprite pool for Level 3 (states) and Level 4 (cities)
  private readonly poolSize: number;
  private readonly poolSprites: THREE.Sprite[] = [];
  private readonly poolItems: ActiveLabelItem[] = [];

  // Reusable vectors to eliminate GC in render loop
  private readonly tempWorldPos = new THREE.Vector3();
  private readonly tempViewDir = new THREE.Vector3();
  private readonly earthWorldPos = new THREE.Vector3();
  private readonly tempScreenPos = new THREE.Vector3();

  // Throttling state
  private lastUpdateDist = 0;
  private lastUpdateRot = { x: 0, y: 0 };
  private lastUpdateTime = 0;

  constructor(config: SurfaceLabelConfig) {
    this.earthRadius = config.earthRadius;
    // Tightly hug surface (+0.22% above 1.900 radius) to completely eliminate parallax floating
    this.surfaceRadius = config.earthRadius * 1.0022;
    this.maxVisibleLabels = config.maxVisibleLabels || 48;
    this.poolSize = config.maxActivePoolSize || 90;

    this.group = new THREE.Group();
    this.group.name = 'surface-labels-group';

    this.initializePermanentLabels();
    this.initializeDynamicPool();
  }

  /**
   * Initialize permanent sprites for Level 1 (12 places) and Level 2 (251 countries).
   * These entities have dedicated sprites because countries & continents are foundational.
   */
  private initializePermanentLabels(): void {
    const permPlaces = GIS_PLACES.filter((p) => p.level <= 2);

    for (const place of permPlaces) {
      const pos = this.latLonToSphere(place.lat, place.lon, this.surfaceRadius);
      const normal = pos.clone().normalize();
      const texture = this.getOrCreateTexture(place);

      const material = new THREE.SpriteMaterial({
        map: texture,
        transparent: true,
        opacity: 0.0,
        depthTest: false,
        depthWrite: false,
      });

      const sprite = new THREE.Sprite(material);
      sprite.position.copy(pos);
      sprite.visible = false;
      sprite.userData = { place, id: place.id };

      this.group.add(sprite);

      const targetPixelHeight = place.level === 1 ? 21 : 15.5;

      this.permanentItems.push({
        place,
        sprite,
        targetOpacity: 0.0,
        currentOpacity: 0.0,
        worldPos: pos,
        normal,
        baseWidth: 440,
        baseHeight: 76,
        targetPixelHeight,
      });
    }
  }

  /**
   * Initialize dynamic sprite pool for Level 3 (States/Provinces) and Level 4 (Cities).
   */
  private initializeDynamicPool(): void {
    for (let i = 0; i < this.poolSize; i++) {
      const material = new THREE.SpriteMaterial({
        transparent: true,
        opacity: 0.0,
        depthTest: false,
        depthWrite: false,
      });
      const sprite = new THREE.Sprite(material);
      sprite.visible = false;
      this.group.add(sprite);
      this.poolSprites.push(sprite);
    }
  }

  /**
   * Convert lat/lon to 3D Cartesian coordinates on sphere.
   */
  private latLonToSphere(lat: number, lon: number, radius: number): THREE.Vector3 {
    const phi = (90 - lat) * (Math.PI / 180);
    const theta = (lon + 180) * (Math.PI / 180);
    return new THREE.Vector3(
      -radius * Math.sin(phi) * Math.cos(theta),
      radius * Math.cos(phi),
      radius * Math.sin(phi) * Math.sin(theta)
    );
  }

  /**
   * Create or fetch cached high-DPI canvas texture with crisp typography and contrast outline.
   */
  private getOrCreateTexture(place: GISPlace): THREE.CanvasTexture {
    const cached = this.textureCache.get(place.id);
    if (cached) return cached;

    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d')!;
    canvas.width = 440;
    canvas.height = 76;

    let fontSize = 21;
    let textColor = '#ffffff';
    let isUppercase = false;
    let letterSpacing = '0px';

    if (place.level === 1) {
      fontSize = place.category === 'ocean' ? 22 : 23;
      textColor = place.category === 'ocean' ? '#7dd3fc' : '#94a3b8';
      isUppercase = true;
      letterSpacing = '2px';
    } else if (place.level === 2) {
      fontSize = 20;
      textColor = place.category === 'natural_feature' ? '#38bdf8' : '#ffffff';
    } else if (place.level === 3) {
      fontSize = 18;
      textColor = '#fbbf24'; // Warm amber for administrative states/provinces
    } else if (place.level === 4) {
      fontSize = 17;
      textColor = '#f1f5f9';
    }

    const displayName = isUppercase ? place.name.toUpperCase() : place.name;

    ctx.font = `600 ${fontSize}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;
    if ('letterSpacing' in ctx) {
      (ctx as any).letterSpacing = letterSpacing;
    }
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    const centerX = 220;
    const centerY = 38;

    // Anchor pin dot for cities
    if (place.level === 4) {
      const textWidth = ctx.measureText(displayName).width;
      const dotX = centerX - textWidth / 2 - 12;
      ctx.beginPath();
      ctx.arc(dotX, centerY, 3.5, 0, Math.PI * 2);
      ctx.fillStyle = '#38bdf8';
      ctx.fill();
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = '#05070b';
      ctx.stroke();
    }

    // Heavy dark outline for universal contrast over deserts, clouds and deep water
    ctx.strokeStyle = 'rgba(4, 7, 14, 0.95)';
    ctx.lineWidth = 5;
    ctx.lineJoin = 'round';
    ctx.strokeText(displayName, centerX, centerY);

    // Primary crisp text fill
    ctx.fillStyle = textColor;
    ctx.fillText(displayName, centerX, centerY);

    const texture = new THREE.CanvasTexture(canvas);
    texture.minFilter = THREE.LinearFilter;
    this.textureCache.set(place.id, texture);
    return texture;
  }

  /**
   * Determine the current zoom regime from camera distance.
   */
  public getZoomRegime(cameraDistance: number): ZoomRegime {
    if (cameraDistance >= 4.75) return 'global';
    if (cameraDistance >= 3.8) return 'continental';
    if (cameraDistance >= 2.85) return 'country';
    return 'regional';
  }

  /**
   * Calculate progressive LOD base opacity for a given place based on camera distance and position.
   */
  private calculateLODBaseOpacity(
    place: GISPlace,
    cameraDistance: number,
    angularDistFromCenter: number
  ): number {
    const dist = cameraDistance;

    // Level 1: Continents & Major Oceans
    if (place.level === 1) {
      if (dist >= 4.6) return 1.0;
      if (dist <= 3.6) return 0.0;
      // Fades out between 4.6 and 3.6 so continents yield focus to countries
      return (dist - 3.6) / 1.0;
    }

    // Level 2: Sovereign Countries & Major Seas
    if (place.level === 2) {
      // Global view: completely hidden when d >= 5.2
      if (dist >= 5.2) return 0.0;

      // Prominent global entities (top 15) fade in early between 5.2 and 4.75
      const isGlobalProminent = (place.priority || 50) >= 88;
      if (dist >= 4.75) {
        if (!isGlobalProminent) return 0.0;
        return ((5.2 - dist) / 0.45) * 0.55;
      }

      // Continental view (3.8 <= d < 4.75)
      if (dist >= 3.8) {
        const priority = place.priority || 50;
        if (priority >= 75) return 1.0;
        if (priority >= 55) {
          return Math.min(1.0, Math.max(0.0, (4.6 - dist) / 0.7));
        }
        // Small countries and island states fade in as d approaches 3.8
        return Math.min(1.0, Math.max(0.0, (4.25 - dist) / 0.45));
      }

      // Country view (2.85 <= d < 3.8): Full clarity
      if (dist >= 2.85) return 0.95;

      // Regional view (d < 2.85): Soften slightly to let regional cities take focus
      return Math.max(0.35, (dist - 2.15) / 0.7);
    }

    // Level 3: First-Level Administrative States & Provinces (e.g. Kerala, California, Bavaria)
    if (place.level === 3) {
      if (dist >= 4.1) return 0.0;
      if (dist >= 3.2) {
        // Fades in as camera approaches country zoom
        return Math.min(1.0, (4.1 - dist) / 0.85);
      }
      return 0.95;
    }

    // Level 4: Cities, Towns & Populated Places (e.g. Kozhikode, Mumbai, New York, Tokyo)
    if (place.level === 4) {
      if (dist >= 3.5) return 0.0;

      const priority = place.priority || 50;
      const isMajorCity = priority >= 70;

      // Major metropolises and national capitals fade in between 3.5 and 2.85
      if (dist >= 2.85) {
        if (!isMajorCity) return 0.0;
        return Math.min(0.95, Math.max(0.0, (3.5 - dist) / 0.6));
      }

      // Below 2.85 (Regional / Town view): Smaller cities, towns, and local features emerge
      if (isMajorCity) return 0.95;

      let alpha = Math.min(1.0, Math.max(0.0, (2.85 - dist) / 0.55));

      // Proximity boost to facing center: towns right under the camera are extra prominent
      if (angularDistFromCenter < 25) {
        alpha = Math.min(1.0, alpha + 0.15);
      }

      return alpha;
    }

    return 0.0;
  }

  /**
   * Main per-frame update loop called from EarthGlobe's animate().
   * Performs:
   * 1. Throttled LOD candidate selection and screen collision detection.
   * 2. Smooth delta-time opacity interpolation for every active sprite.
   * 3. Distance-compensated scale stabilization to keep labels at readable pixel sizes.
   */
  public update(
    delta: number,
    camera: THREE.PerspectiveCamera,
    cameraDistance: number,
    earthRotation: { x: number; y: number },
    screenWidth: number,
    screenHeight: number,
    forceRecalculate = false
  ): void {
    const now = performance.now();
    const distDelta = Math.abs(cameraDistance - this.lastUpdateDist);
    const rotDelta = Math.hypot(
      earthRotation.x - this.lastUpdateRot.x,
      earthRotation.y - this.lastUpdateRot.y
    );

    // Throttle heavy candidate culling and screen collisions to 100ms when moving
    const shouldRecalculate =
      forceRecalculate ||
      now - this.lastUpdateTime > 100 && (distDelta > 0.015 || rotDelta > 0.01) ||
      this.lastUpdateTime === 0;

    const centerLat = earthRotation.x * (180 / Math.PI);
    let centerLon = -earthRotation.y * (180 / Math.PI) - 90;
    centerLon = ((((centerLon + 180) % 360) + 360) % 360) - 180;

    if (shouldRecalculate) {
      this.lastUpdateTime = now;
      this.lastUpdateDist = cameraDistance;
      this.lastUpdateRot = { x: earthRotation.x, y: earthRotation.y };

      this.recalculateLabelVisibility(
        camera,
        cameraDistance,
        centerLat,
        centerLon,
        screenWidth,
        screenHeight
      );
    }

    // Every frame: smooth exponential interpolation of opacity and dynamic scale stabilization
    this.stepAnimationsAndScale(delta, camera, screenHeight);
  }

  /**
   * Recalculates candidate visibility, horizon culling, and screen-space collision.
   */
  private recalculateLabelVisibility(
    camera: THREE.PerspectiveCamera,
    cameraDistance: number,
    centerLat: number,
    centerLon: number,
    screenWidth: number,
    screenHeight: number
  ): void {
    const earthPos = this.earthWorldPos.set(0, 0, 0);
    const camPos = camera.position;
    const camDistToCenter = camPos.distanceTo(earthPos);

    // Exact geometric horizon threshold: cos(theta_h) = R / d
    const horizonThreshold = this.earthRadius / camDistToCenter;
    this.tempViewDir.copy(camPos).sub(earthPos).normalize();

    // 1. Refresh Dynamic Pool with closest Level 3 & Level 4 places in facing hemisphere
    this.refreshDynamicPool(cameraDistance, centerLat, centerLon);

    // 2. Gather candidates from permanent items + dynamic pool
    interface ScreenCandidate {
      item: ActiveLabelItem;
      screenX: number;
      screenY: number;
      boxWidth: number;
      boxHeight: number;
      effectivePriority: number;
      targetAlpha: number;
    }

    const candidates: ScreenCandidate[] = [];
    const allActiveItems = [...this.permanentItems, ...this.poolItems];

    for (const item of allActiveItems) {
      const place = item.place;

      // Angular distance from camera facing center
      const dLat = place.lat - centerLat;
      let dLon = Math.abs(place.lon - centerLon);
      if (dLon > 180) dLon = 360 - dLon;
      const angularDist = Math.hypot(dLat, dLon);

      // Base LOD opacity curve
      const baseLod = this.calculateLODBaseOpacity(place, cameraDistance, angularDist);
      if (baseLod <= 0.02) {
        item.targetOpacity = 0.0;
        continue;
      }

      // Geometric Horizon Culling on Rotating Earth
      item.sprite.getWorldPosition(this.tempWorldPos);
      const normal = this.tempWorldPos.clone().normalize();
      const dotHorizon = normal.dot(this.tempViewDir);

      const horizonCutoff = horizonThreshold + 0.018;
      if (dotHorizon <= horizonCutoff) {
        item.targetOpacity = 0.0;
        continue;
      }

      // Soft limb fade near planetary edge to eliminate hard popping
      const limbFade = Math.min(1.0, Math.max(0.0, (dotHorizon - horizonCutoff) / 0.14));

      // Project to 2D screen coordinates
      this.tempScreenPos.copy(this.tempWorldPos).project(camera);
      const screenX = (this.tempScreenPos.x * 0.5 + 0.5) * screenWidth;
      const screenY = (-(this.tempScreenPos.y * 0.5) + 0.5) * screenHeight;

      // Discard offscreen labels with generous margin
      if (screenX < -30 || screenX > screenWidth + 30 || screenY < -30 || screenY > screenHeight + 30) {
        item.targetOpacity = 0.0;
        continue;
      }

      const finalAlpha = limbFade * baseLod;

      // Bounding box approximation on screen
      const boxWidth =
        place.level === 1 ? 130 : place.level === 2 ? 105 : place.level === 3 ? 92 : 82;
      const boxHeight = 22;

      // Priority boost for screen space sorting
      let effectivePriority = place.priority || 50;
      if (place.level === 1) effectivePriority += 180;
      else if (place.level === 2) {
        effectivePriority += cameraDistance >= 3.8 ? 100 : 40;
        // Small island developing states prioritized in continental view
        if (cameraDistance < 4.8 && (place.population || 0) < 15000000) {
          effectivePriority += 15;
        }
      } else if (place.level === 3) {
        effectivePriority += 50;
      } else if (place.level === 4) {
        // Boost cities close to the camera center
        if (angularDist < 25) effectivePriority += 35;
      }

      candidates.push({
        item,
        screenX,
        screenY,
        boxWidth,
        boxHeight,
        effectivePriority,
        targetAlpha: finalAlpha,
      });
    }

    // Sort descending by effective priority
    candidates.sort((a, b) => b.effectivePriority - a.effectivePriority);

    // 2D Screen-space collision avoidance (greedy bounding box allocation)
    const occupiedBoxes: { left: number; right: number; top: number; bottom: number }[] = [];
    const padding = 6;
    let placedCount = 0;

    for (const cand of candidates) {
      if (placedCount >= this.maxVisibleLabels) {
        cand.item.targetOpacity = 0.0;
        continue;
      }

      const left = cand.screenX - cand.boxWidth / 2 - padding;
      const right = cand.screenX + cand.boxWidth / 2 + padding;
      const top = cand.screenY - cand.boxHeight / 2 - padding;
      const bottom = cand.screenY + cand.boxHeight / 2 + padding;

      let collides = false;
      for (const box of occupiedBoxes) {
        if (left < box.right && right > box.left && top < box.bottom && bottom > box.top) {
          collides = true;
          break;
        }
      }

      if (!collides) {
        occupiedBoxes.push({ left, right, top, bottom });
        cand.item.targetOpacity = cand.targetAlpha;
        placedCount++;
      } else {
        cand.item.targetOpacity = 0.0;
      }
    }
  }

  /**
   * Refreshes dynamic pool for Level 3 & Level 4 places.
   * Selects regional places in facing hemisphere when zoom is deep enough.
   */
  private refreshDynamicPool(
    cameraDistance: number,
    centerLat: number,
    centerLon: number
  ): void {
    // Only activate dynamic pool when zoom is country or regional (d < 4.1)
    if (cameraDistance >= 4.1) {
      for (const item of this.poolItems) {
        item.targetOpacity = 0.0;
      }
      this.poolItems.length = 0;
      for (const sprite of this.poolSprites) {
        sprite.visible = false;
      }
      return;
    }

    // Query Level 3 and Level 4 places within facing hemisphere
    const candidates = GIS_PLACES.filter((p) => p.level >= 3).map((place) => {
      const dLat = place.lat - centerLat;
      let dLon = Math.abs(place.lon - centerLon);
      if (dLon > 180) dLon = 360 - dLon;
      const angularDist = Math.hypot(dLat, dLon);
      return { place, angularDist };
    });

    // Filter to facing hemisphere (< 82 deg angular distance from center)
    const facingCandidates = candidates.filter((c) => c.angularDist < 82);

    // Sort by proximity to center and priority
    facingCandidates.sort((a, b) => {
      if (cameraDistance < 3.2 && Math.abs(a.angularDist - b.angularDist) > 18) {
        return a.angularDist - b.angularDist;
      }
      return b.place.priority - a.place.priority;
    });

    const selected = facingCandidates.slice(0, this.poolSize);

    this.poolItems.length = 0;

    for (let i = 0; i < this.poolSize; i++) {
      const sprite = this.poolSprites[i];
      if (i < selected.length) {
        const place = selected[i].place;
        const texture = this.getOrCreateTexture(place);
        const pos = this.latLonToSphere(place.lat, place.lon, this.surfaceRadius);
        const normal = pos.clone().normalize();

        sprite.material.map = texture;
        sprite.position.copy(pos);
        sprite.userData = { place, id: place.id };

        const targetPixelHeight = place.level === 3 ? 14 : 13;

        this.poolItems.push({
          place,
          sprite,
          targetOpacity: 0.0,
          currentOpacity: sprite.material.opacity,
          worldPos: pos,
          normal,
          baseWidth: 440,
          baseHeight: 76,
          targetPixelHeight,
        });
      } else {
        sprite.visible = false;
        sprite.material.opacity = 0.0;
      }
    }
  }

  /**
   * Smoothly interpolates opacity and recalculates distance-compensated scale.
   */
  private stepAnimationsAndScale(
    delta: number,
    camera: THREE.PerspectiveCamera,
    screenHeight: number
  ): void {
    const fovFactor = (2 * Math.tan((camera.fov * Math.PI) / 360)) / Math.max(screenHeight, 1);
    const alphaRate = 1.0 - Math.exp(-10.0 * delta);
    const allItems = [...this.permanentItems, ...this.poolItems];

    for (const item of allItems) {
      // Exponential smoothing of opacity
      item.currentOpacity += (item.targetOpacity - item.currentOpacity) * alphaRate;

      if (item.currentOpacity <= 0.01) {
        item.sprite.visible = false;
        item.sprite.material.opacity = 0;
      } else {
        item.sprite.visible = true;
        item.sprite.material.opacity = item.currentOpacity;

        // Scale stabilization: compute world scale to keep on-screen pixel size constant
        item.sprite.getWorldPosition(this.tempWorldPos);
        const dCam = camera.position.distanceTo(this.tempWorldPos);

        const worldHeight = dCam * fovFactor * item.targetPixelHeight;
        const worldWidth = worldHeight * (item.baseWidth / item.baseHeight);
        item.sprite.scale.set(worldWidth, worldHeight, 1);
      }
    }
  }

  /**
   * Clean up textures and sprites when component unmounts.
   */
  public dispose(): void {
    for (const texture of this.textureCache.values()) {
      texture.dispose();
    }
    this.textureCache.clear();
    this.permanentItems.length = 0;
    this.poolItems.length = 0;
    this.poolSprites.length = 0;
    while (this.group.children.length > 0) {
      const child = this.group.children[0];
      this.group.remove(child);
    }
  }
}
