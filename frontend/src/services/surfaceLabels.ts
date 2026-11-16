import * as THREE from 'three';
import { GIS_PLACES, GISPlace } from './gisDatabase';

export type ZoomRegime = 'global' | 'continental' | 'country' | 'regional';

const PLACE_NAME_ACRONYMS: Record<string, string> = {
  EU: 'EU',
  UK: 'UK',
  UAE: 'UAE',
  UN: 'UN',
  US: 'US',
  USA: 'USA',
};

/** Convert source-style uppercase GIS names into readable map labels. */
export function formatSurfacePlaceName(name: string): string {
  const trimmed = name.trim();
  if (!trimmed || trimmed !== trimmed.toLocaleUpperCase()) return trimmed;
  if (PLACE_NAME_ACRONYMS[trimmed]) return PLACE_NAME_ACRONYMS[trimmed];

  const smallWords = new Set(['and', 'of', 'the', '&']);
  let isFirstWord = true;
  return trimmed.toLocaleLowerCase().replace(/[^\s-]+/g, (word) => {
    const formatted = isFirstWord || !smallWords.has(word)
      ? word.charAt(0).toLocaleUpperCase() + word.slice(1)
      : word;
    isFirstWord = false;
    return formatted;
  });
}

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
  baseWidth: number;
  baseHeight: number;
  targetPixelHeight: number;
}

interface DynamicPlaceCandidate {
  place: GISPlace;
  angularDist: number;
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
  private readonly permanentPlaceIds = new Set(GIS_PLACES.filter((place) => place.level <= 2).map((place) => place.id));
  private readonly protectedTextureIds = new Set<string>();
  private readonly maxCachedTextures = 400;

  // Permanent sprites for Level 1 (continents/oceans) and Level 2 (countries)
  private readonly permanentItems: ActiveLabelItem[] = [];

  // Dynamic reusable sprite pool for Level 3 (states) and Level 4 (cities)
  private readonly poolSize: number;
  private readonly poolSprites: THREE.Sprite[] = [];
  private readonly poolItems: ActiveLabelItem[] = [];
  private readonly poolSlots: ActiveLabelItem[] = [];
  private readonly dynamicCandidates: DynamicPlaceCandidate[] = GIS_PLACES
    .filter((place) => place.level >= 3)
    .map((place) => ({ place, angularDist: 0 }));
  private readonly facingCandidates: DynamicPlaceCandidate[] = [];

  // Reusable vectors to eliminate GC in render loop
  private readonly tempWorldPos = new THREE.Vector3();
  private readonly tempViewDir = new THREE.Vector3();
  private readonly earthWorldPos = new THREE.Vector3();
  private readonly tempScreenPos = new THREE.Vector3();
  private readonly tempNormal = new THREE.Vector3();

  // Throttling state
  private lastUpdateDist = 0;
  private lastUpdateRot = { x: 0, y: 0 };
  private lastUpdateTime = 0;

  constructor(config: SurfaceLabelConfig) {
    this.earthRadius = config.earthRadius;
    // Tightly hug surface (+0.22% above 1.900 radius, 1.0022x) with zero visible parallax float
    this.surfaceRadius = config.earthRadius * 1.0022;
    this.maxVisibleLabels = config.maxVisibleLabels || 64;
    this.poolSize = config.maxActivePoolSize || 100;

    this.group = new THREE.Group();
    this.group.name = 'surface-labels-group';
    this.group.renderOrder = 10;

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

      // Calibrated target pixel height of sprite to achieve crisp 14-17px on-screen typography
      const desiredOnScreenFontSize =
        place.level === 1 ? (place.category === 'ocean' ? 15 : 17) : 13.8;
      const canvasFontSize =
        place.level === 1 ? (place.category === 'ocean' ? 32 : 36) : 34;
      const targetPixelHeight = desiredOnScreenFontSize * (80 / canvasFontSize);

      this.permanentItems.push({
        place,
        sprite,
        targetOpacity: 0.0,
        currentOpacity: 0.0,
        worldPos: pos,
        baseWidth: 512,
        baseHeight: 80,
        targetPixelHeight,
      });
    }
  }

  /**
   * Initialize dynamic sprite pool for Level 3 (States/Provinces) and Level 4 (Cities).
   */
  private initializeDynamicPool(): void {
    const placeholderPlace = this.dynamicCandidates[0]?.place || GIS_PLACES[0];
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
      this.poolSlots.push({
        place: placeholderPlace,
        sprite,
        targetOpacity: 0,
        currentOpacity: 0,
        worldPos: new THREE.Vector3(),
        baseWidth: 512,
        baseHeight: 80,
        targetPixelHeight: 33.5,
      });
    }
  }

  /**
   * Convert lat/lon to 3D Cartesian coordinates on sphere.
   */
  private latLonToSphere(lat: number, lon: number, radius: number, target = new THREE.Vector3()): THREE.Vector3 {
    const phi = (90 - lat) * (Math.PI / 180);
    const theta = (lon + 180) * (Math.PI / 180);
    return target.set(
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
    if (cached) {
      this.textureCache.delete(place.id);
      this.textureCache.set(place.id, cached);
      return cached;
    }

    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d')!;
    canvas.width = 512;
    canvas.height = 80;

    let fontSize = 34;
    let textColor = '#ffffff';
    let letterSpacing = '0.5px';
    let fontWeight = '600';

    if (place.level === 1) {
      fontSize = place.category === 'ocean' ? 32 : 36;
      textColor = place.category === 'ocean' ? '#7dd3fc' : '#cbd5e1';
      fontWeight = '700';
      letterSpacing = '1.8px';
    } else if (place.level === 2) {
      fontSize = place.category === 'natural_feature' ? 32 : 34;
      textColor = place.category === 'natural_feature' ? '#38bdf8' : '#ffffff';
      fontWeight = '600';
      letterSpacing = '0.5px';
    } else if (place.level === 3) {
      fontSize = 30;
      textColor = '#fbbf24'; // Warm amber for administrative states/provinces
      fontWeight = '600';
      letterSpacing = '0.3px';
    } else if (place.level === 4) {
      fontSize = 28;
      textColor = '#f8fafc';
      fontWeight = '500';
      letterSpacing = '0px';
    }

    const displayName = formatSurfacePlaceName(place.name);

    ctx.font = `${fontWeight} ${fontSize}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", sans-serif`;
    if ('letterSpacing' in ctx) {
      (ctx as any).letterSpacing = letterSpacing;
    }
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    const centerX = 256;
    const centerY = 40;

    // Heavy dark outline for universal contrast over deserts, clouds, polar ice, and deep water
    ctx.strokeStyle = 'rgba(5, 8, 16, 0.95)';
    ctx.lineWidth = 6;
    ctx.lineJoin = 'round';
    ctx.miterLimit = 2;
    ctx.strokeText(displayName, centerX, centerY);

    // Primary crisp text fill
    ctx.fillStyle = textColor;
    ctx.fillText(displayName, centerX, centerY);

    const texture = new THREE.CanvasTexture(canvas);
    texture.minFilter = THREE.LinearFilter;
    this.textureCache.set(place.id, texture);
    this.evictOldTextures();
    return texture;
  }

  private evictOldTextures(): void {
    while (this.textureCache.size > this.maxCachedTextures) {
      let evicted = false;
      for (const [id, texture] of this.textureCache) {
        if (this.permanentPlaceIds.has(id) || this.protectedTextureIds.has(id)) continue;
        this.textureCache.delete(id);
        texture.dispose();
        evicted = true;
        break;
      }
      if (!evicted) break;
    }
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

    // Level 2: Sovereign Countries & Major Natural Features
    if (place.level === 2) {
      // In deep space overview (dist >= 5.2):
      // Display prominent sovereign nations (priority >= 80) across the globe
      if (dist >= 5.2) {
        const priority = place.priority || 50;
        return priority >= 80 ? 0.90 : 0.0;
      }

      // Continental view (3.8 <= dist < 5.2)
      if (dist >= 3.8) {
        const priority = place.priority || 50;
        if (priority >= 70) return 0.95;
        if (priority >= 55) {
          return Math.min(0.95, Math.max(0.0, (4.8 - dist) / 0.8));
        }
        return Math.min(0.9, Math.max(0.0, (4.4 - dist) / 0.6));
      }

      // Country view (2.85 <= dist < 3.8): Full clarity
      if (dist >= 2.85) return 0.95;

      // Regional view (dist < 2.85): Soften slightly to let regional cities take focus
      return Math.max(0.45, (dist - 2.15) / 0.7);
    }

    // Level 3: First-Level Administrative States & Provinces (e.g. Kerala, California, Bavaria)
    if (place.level === 3) {
      if (dist >= 4.1) return 0.0;
      if (dist >= 3.2) {
        // Fades in as camera approaches country zoom
        return Math.min(0.95, (4.1 - dist) / 0.9);
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
        return Math.min(0.95, Math.max(0.0, (3.5 - dist) / 0.65));
      }

      // Below 2.85 (Regional / Town view): Smaller cities, towns, and local features emerge
      if (isMajorCity) return 0.95;

      let alpha = Math.min(0.95, Math.max(0.0, (2.85 - dist) / 0.7));

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
    const activeItemCount = this.permanentItems.length + this.poolItems.length;
    for (let index = 0; index < activeItemCount; index++) {
      const item = index < this.permanentItems.length
        ? this.permanentItems[index]
        : this.poolItems[index - this.permanentItems.length];
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
      const dotHorizon = this.tempNormal.copy(this.tempWorldPos).normalize().dot(this.tempViewDir);

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

      // Accurate collision bounding box based on actual on-screen rendered text
      const displayName = formatSurfacePlaceName(place.name);
      const charWidth = place.level === 1 ? 9.5 : place.level === 2 ? 8.2 : 7.5;
      const boxWidth = Math.min(180, Math.max(46, displayName.length * charWidth));
      const boxHeight = place.level === 1 ? 24 : 20;

      // Priority boost for screen space sorting
      let effectivePriority = place.priority || 50;
      if (place.level === 1) {
        effectivePriority += 200;
      } else if (place.level === 2) {
        effectivePriority += cameraDistance >= 3.8 ? 100 : 50;
      } else if (place.level === 3) {
        effectivePriority += 40;
      } else if (place.level === 4) {
        // Boost cities close to the camera center
        if (angularDist < 25) effectivePriority += 25;
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
      this.protectedTextureIds.clear();
      for (const sprite of this.poolSprites) {
        sprite.visible = false;
        sprite.material.map = null;
      }
      return;
    }

    // Reuse prebuilt candidate records and one scratch list while filtering to the facing hemisphere.
    const facingCandidates = this.facingCandidates;
    facingCandidates.length = 0;
    for (const candidate of this.dynamicCandidates) {
      const dLat = candidate.place.lat - centerLat;
      let dLon = Math.abs(candidate.place.lon - centerLon);
      if (dLon > 180) dLon = 360 - dLon;
      candidate.angularDist = Math.hypot(dLat, dLon);
      if (candidate.angularDist < 82) facingCandidates.push(candidate);
    }

    // Sort by proximity to center and priority
    facingCandidates.sort((a, b) => {
      if (cameraDistance < 3.2 && Math.abs(a.angularDist - b.angularDist) > 18) {
        return a.angularDist - b.angularDist;
      }
      return b.place.priority - a.place.priority;
    });

    this.poolItems.length = 0;
    const selectedCount = Math.min(facingCandidates.length, this.poolSize);
    this.protectedTextureIds.clear();
    for (let i = 0; i < selectedCount; i++) this.protectedTextureIds.add(facingCandidates[i].place.id);

    for (let i = 0; i < this.poolSize; i++) {
      const sprite = this.poolSprites[i];
      const item = this.poolSlots[i];
      if (i < selectedCount) {
        const place = facingCandidates[i].place;
        const texture = this.getOrCreateTexture(place);
        const pos = this.latLonToSphere(place.lat, place.lon, this.surfaceRadius, item.worldPos);

        if (sprite.material.map !== texture) {
          sprite.material.map = texture;
          sprite.material.needsUpdate = true;
        }
        sprite.position.copy(pos);
        sprite.userData.place = place;
        sprite.userData.id = place.id;

        const targetPixelHeight = place.level === 3 ? 34.1 : 34.3;
        item.place = place;
        item.targetOpacity = 0;
        item.currentOpacity = sprite.material.opacity;
        item.targetPixelHeight = targetPixelHeight;
        this.poolItems.push(item);
      } else {
        sprite.visible = false;
        sprite.material.opacity = 0.0;
        sprite.material.map = null;
        item.targetOpacity = 0;
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
    const activeItemCount = this.permanentItems.length + this.poolItems.length;
    for (let index = 0; index < activeItemCount; index++) {
      const item = index < this.permanentItems.length
        ? this.permanentItems[index]
        : this.poolItems[index - this.permanentItems.length];
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
