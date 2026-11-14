import * as THREE from 'three';
import { QualityProfile, adaptiveQuality } from './adaptiveQuality';

// Convert (lat, lon) in degrees to 3D Cartesian coordinates on sphere of given radius
function latLonToVector3(lat: number, lon: number, radius: number): THREE.Vector3 {
  const phi = (90 - lat) * (Math.PI / 180);
  const theta = (lon + 180) * (Math.PI / 180);
  return new THREE.Vector3(
    -radius * Math.sin(phi) * Math.cos(theta),
    radius * Math.cos(phi),
    radius * Math.sin(phi) * Math.sin(theta)
  );
}

// Convert (lat, lon, zoom) to Web Mercator tile (x, y)
function latLonToTileXY(lat: number, lon: number, zoom: number): { x: number; y: number } {
  const n = Math.pow(2, zoom);
  const x = Math.floor(((lon + 180) / 360) * n);
  const latRad = (lat * Math.PI) / 180;
  const y = Math.floor(
    ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n
  );
  return {
    x: Math.max(0, Math.min(n - 1, x)),
    y: Math.max(0, Math.min(n - 1, y)),
  };
}

// Convert tile (x, y, zoom) to bounding box in lat/lon degrees
function tileXYToBounds(
  x: number,
  y: number,
  zoom: number
): { minLat: number; maxLat: number; minLon: number; maxLon: number } {
  const n = Math.pow(2, zoom);
  const minLon = (x / n) * 360 - 180;
  const maxLon = ((x + 1) / n) * 360 - 180;

  const n1 = Math.PI - (2 * Math.PI * y) / n;
  const maxLat = (180 / Math.PI) * Math.atan(0.5 * (Math.exp(n1) - Math.exp(-n1)));

  const n2 = Math.PI - (2 * Math.PI * (y + 1)) / n;
  const minLat = (180 / Math.PI) * Math.atan(0.5 * (Math.exp(n2) - Math.exp(-n2)));

  return { minLat, maxLat, minLon, maxLon };
}

// Create a curved spherical patch geometry for a tile conforming to the Earth sphere
function createSphericalTileGeometry(
  minLat: number,
  maxLat: number,
  minLon: number,
  maxLon: number,
  radius: number,
  subdivisions = 8
): THREE.BufferGeometry {
  const geom = new THREE.BufferGeometry();
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  for (let j = 0; j <= subdivisions; j++) {
    const v = j / subdivisions;
    const lat = maxLat - v * (maxLat - minLat);

    for (let i = 0; i <= subdivisions; i++) {
      const u = i / subdivisions;
      const lon = minLon + u * (maxLon - minLon);

      const pos = latLonToVector3(lat, lon, radius);
      positions.push(pos.x, pos.y, pos.z);
      uvs.push(u, 1 - v);
    }
  }

  const rowStride = subdivisions + 1;
  for (let j = 0; j < subdivisions; j++) {
    for (let i = 0; i < subdivisions; i++) {
      const a = j * rowStride + i;
      const b = (j + 1) * rowStride + i;
      const c = (j + 1) * rowStride + (i + 1);
      const d = j * rowStride + (i + 1);

      // Two triangles per quad: (a, b, d) and (b, c, d)
      indices.push(a, b, d);
      indices.push(b, c, d);
    }
  }

  geom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geom.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geom.setIndex(indices);
  geom.computeVertexNormals();
  return geom;
}

interface TileRecord {
  mesh: THREE.Mesh;
  loaded: boolean;
  fadingIn: boolean;
  fadingOut: boolean;
  opacity: number;
  zoom: number;
  key: string;
  generation: number;
  tileUrl: string;
}

interface QueuedTileRequest {
  z: number;
  x: number;
  y: number;
  key: string;
  generation: number;
  tileUrl: string;
  distToCenter: number;
  abortController: AbortController;
}

export class ImageryLODManager {
  private sphereRadius: number;
  private patchRadius: number;
  private containerGroup: THREE.Group;
  private activeTiles: Map<string, TileRecord> = new Map();
  private textureCache: Map<string, THREE.Texture> = new Map();
  private textureUsageCount: Map<string, number> = new Map();
  private textureLoader: THREE.TextureLoader = new THREE.TextureLoader();
  private lastUpdateCenter = { lat: 999, lon: 999, zoom: -1 };
  private currentGeneration = 0;
  private maxCacheSize = 72;

  // Bounded Concurrency Queue
  private queuedRequests: QueuedTileRequest[] = [];
  private activeRequestCount = 0;
  private qualityProfile: QualityProfile;
  private qualityUnsubscribe: () => void;

  constructor(sphereRadius = 1.9, containerGroup: THREE.Group) {
    this.sphereRadius = sphereRadius;
    // Microscopic offset (0.0006) to sit millimeters above base sphere without z-fighting
    this.patchRadius = sphereRadius * 1.0006;
    this.containerGroup = containerGroup;
    this.qualityProfile = adaptiveQuality.getProfile();
    this.qualityUnsubscribe = adaptiveQuality.subscribe((p) => {
      this.qualityProfile = p;
    });
  }

  public get radius(): number {
    return this.sphereRadius;
  }

  /**
   * Determine target tile zoom level based on camera distance and active quality profile
   */
  public getTargetTileZoom(cameraDistance: number): number {
    const maxZoom = this.qualityProfile.maxLodZoom;
    if (cameraDistance >= 4.6) return 0; // Global scale: base NASA Blue Marble only
    if (cameraDistance >= 3.7) return Math.min(maxZoom, 3); // Continental scale: zoom 3 (~5,000 km)
    if (cameraDistance >= 3.0) return Math.min(maxZoom, 5); // Country scale: zoom 5 (~1,200 km)
    if (cameraDistance >= 2.65) return Math.min(maxZoom, 7); // Regional scale: zoom 7 (~300 km)
    return Math.min(maxZoom, 8); // Local scale: zoom 8 (~150 km)
  }

  /**
   * Get authentic imagery resolution description for currently active tiles
   */
  public getResolutionBadge(cameraDistance: number): string {
    const targetZoom = this.getTargetTileZoom(cameraDistance);
    switch (targetZoom) {
      case 8:
        return 'High-Res Satellite (15m LOD)';
      case 7:
        return 'Regional Satellite (30m LOD)';
      case 5:
        return 'Country Satellite (60m LOD)';
      case 3:
        return 'Continental Satellite (250m LOD)';
      default:
        return 'NASA Blue Marble (1km Base)';
    }
  }

  /**
   * Update LOD tiles based on current camera distance and facing center coordinates.
   * Centralized delta-time stepping handles smooth cross-fades without spawning rAF loops.
   */
  public update(deltaTime: number, cameraDistance: number, centerLat: number, centerLon: number): void {
    // 1. Advance cross-fade animations for all active tiles using delta time
    this.stepTileFadeAnimations(deltaTime);

    const targetZoom = this.getTargetTileZoom(cameraDistance);

    // If global view, smoothly fade out sub-tiles
    if (targetZoom === 0) {
      if (this.activeTiles.size > 0) {
        this.startFadeOutAllTiles();
      }
      return;
    }

    // Throttle checks if coordinates and zoom haven't shifted meaningfully
    const dLat = Math.abs(centerLat - this.lastUpdateCenter.lat);
    const dLon = Math.abs(centerLon - this.lastUpdateCenter.lon);
    if (targetZoom === this.lastUpdateCenter.zoom && dLat < 0.25 && dLon < 0.25) {
      return;
    }

    this.lastUpdateCenter = { lat: centerLat, lon: centerLon, zoom: targetZoom };
    this.currentGeneration++;
    const currentGen = this.currentGeneration;

    // Calculate center tile coordinates
    const centerTile = latLonToTileXY(centerLat, centerLon, targetZoom);
    const maxTiles = Math.pow(2, targetZoom);

    // Span from device quality profile
    const span = targetZoom >= 7 ? this.qualityProfile.lodTileSpan : 1;
    const requiredTileKeys = new Set<string>();

    for (let dy = -span; dy <= span; dy++) {
      const tileY = centerTile.y + dy;
      if (tileY < 0 || tileY >= maxTiles) continue;

      for (let dx = -span; dx <= span; dx++) {
        const tileX = (centerTile.x + dx + maxTiles) % maxTiles;
        const key = `${targetZoom}/${tileX}/${tileY}`;
        requiredTileKeys.add(key);

        const existingTile = this.activeTiles.get(key);
        if (!existingTile) {
          const distToCenter = Math.hypot(dx, dy);
          this.scheduleTileLoad(targetZoom, tileX, tileY, key, currentGen, distToCenter);
        } else {
          existingTile.generation = currentGen;
          // Cancel fade-out if it was marked for removal but is now needed again
          if (existingTile.fadingOut) {
            existingTile.fadingOut = false;
            existingTile.fadingIn = true;
          }
        }
      }
    }

    // Cancel queued requests from older generations that are no longer needed
    this.pruneQueuedRequests(requiredTileKeys);

    // Smoothly fade out older tiles rather than abruptly dropping them
    for (const [key, tile] of this.activeTiles.entries()) {
      if (!requiredTileKeys.has(key)) {
        if (!tile.loaded) {
          this.disposeTile(key, tile);
        } else if (!tile.fadingOut) {
          tile.fadingOut = true;
          tile.fadingIn = false;
        }
      }
    }
  }

  /**
   * Centralized delta-time based cross-fade stepping for all tiles.
   * Completely eliminates scattered requestAnimationFrame loops.
   */
  private stepTileFadeAnimations(delta: number): void {
    const fadeInSpeed = 3.8; // ~260ms full cross-fade
    const fadeOutSpeed = 3.2;

    for (const [key, tile] of Array.from(this.activeTiles.entries())) {
      const mat = tile.mesh.material as THREE.MeshBasicMaterial;

      if (tile.fadingIn) {
        tile.opacity = Math.min(0.98, tile.opacity + delta * fadeInSpeed);
        mat.opacity = tile.opacity;
        if (tile.opacity >= 0.98) {
          tile.fadingIn = false;
        }
      } else if (tile.fadingOut) {
        tile.opacity = Math.max(0.0, tile.opacity - delta * fadeOutSpeed);
        mat.opacity = tile.opacity;
        if (tile.opacity <= 0.0) {
          this.disposeTile(key, tile);
        }
      }
    }
  }

  /**
   * Schedule a tile load within bounded concurrency limits
   */
  private scheduleTileLoad(
    z: number,
    x: number,
    y: number,
    key: string,
    generation: number,
    distToCenter: number
  ): void {
    const tileUrl = `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${z}/${y}/${x}`;

    // If texture is already cached in memory, instantiate mesh instantly with zero latency
    if (this.textureCache.has(tileUrl)) {
      const cachedTexture = this.textureCache.get(tileUrl)!;
      this.createAndMountTileMesh(z, x, y, key, generation, tileUrl, cachedTexture, true);
      return;
    }

    // Check if request is already queued
    if (this.queuedRequests.some((q) => q.key === key)) return;

    const queuedItem: QueuedTileRequest = {
      z,
      x,
      y,
      key,
      generation,
      tileUrl,
      distToCenter,
      abortController: new AbortController(),
    };

    this.queuedRequests.push(queuedItem);
    // Sort queue so tiles closest to center load first
    this.queuedRequests.sort((a, b) => a.distToCenter - b.distToCenter);

    this.processQueue();
  }

  /**
   * Process pending tile requests within bounded concurrency limit
   */
  private processQueue(): void {
    const maxConcurrent = this.qualityProfile.maxConcurrentTileLoads;

    while (this.activeRequestCount < maxConcurrent && this.queuedRequests.length > 0) {
      const nextRequest = this.queuedRequests.shift()!;
      this.activeRequestCount++;
      this.executeTileFetch(nextRequest);
    }
  }

  /**
   * Execute an individual tile download with generation and cancellation guards
   */
  private executeTileFetch(req: QueuedTileRequest): void {
    const { z, x, y, key, generation, tileUrl } = req;

    this.textureLoader.load(
      tileUrl,
      (texture) => {
        this.activeRequestCount--;
        // If newer generation already superseded this request, discard
        if (generation < this.currentGeneration - 1) {
          texture.dispose();
          this.processQueue();
          return;
        }

        texture.wrapS = THREE.ClampToEdgeWrapping;
        texture.wrapT = THREE.ClampToEdgeWrapping;
        texture.minFilter = THREE.LinearMipmapLinearFilter;
        texture.magFilter = THREE.LinearFilter;
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.generateMipmaps = true;

        this.textureCache.set(tileUrl, texture);
        this.createAndMountTileMesh(z, x, y, key, generation, tileUrl, texture, false);
        this.pruneTextureCache();
        this.processQueue();
      },
      undefined,
      () => {
        this.activeRequestCount--;
        // Graceful fallback to base NASA Blue Marble without breaking or popping
        this.processQueue();
      }
    );
  }

  private createAndMountTileMesh(
    z: number,
    x: number,
    y: number,
    key: string,
    generation: number,
    tileUrl: string,
    texture: THREE.Texture,
    instantVisible = false
  ): void {
    // If tile already active, update texture
    if (this.activeTiles.has(key)) {
      const existing = this.activeTiles.get(key)!;
      existing.generation = generation;
      return;
    }

    const bounds = tileXYToBounds(x, y, z);
    const geometry = createSphericalTileGeometry(
      bounds.minLat,
      bounds.maxLat,
      bounds.minLon,
      bounds.maxLon,
      this.patchRadius,
      8
    );

    const initialOpacity = instantVisible ? 0.98 : 0.0;
    const material = new THREE.MeshBasicMaterial({
      map: texture,
      transparent: true,
      opacity: initialOpacity,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
    });

    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = `lod-tile-${key}`;
    this.containerGroup.add(mesh);

    // Track usage count of texture
    const currentUsage = this.textureUsageCount.get(tileUrl) || 0;
    this.textureUsageCount.set(tileUrl, currentUsage + 1);

    const record: TileRecord = {
      mesh,
      loaded: true,
      fadingIn: !instantVisible,
      fadingOut: false,
      opacity: initialOpacity,
      zoom: z,
      key,
      generation,
      tileUrl,
    };

    this.activeTiles.set(key, record);
  }

  private pruneQueuedRequests(validKeys: Set<string>): void {
    for (let i = this.queuedRequests.length - 1; i >= 0; i--) {
      const req = this.queuedRequests[i];
      if (!validKeys.has(req.key)) {
        req.abortController.abort();
        this.queuedRequests.splice(i, 1);
      }
    }
  }

  private startFadeOutAllTiles(): void {
    for (const tile of this.activeTiles.values()) {
      if (!tile.fadingOut) {
        tile.fadingOut = true;
        tile.fadingIn = false;
      }
    }
    this.queuedRequests.forEach((q) => q.abortController.abort());
    this.queuedRequests = [];
    this.lastUpdateCenter = { lat: 999, lon: 999, zoom: -1 };
  }

  private disposeTile(key: string, tile: TileRecord): void {
    this.containerGroup.remove(tile.mesh);
    if (tile.mesh.geometry) tile.mesh.geometry.dispose();
    if (Array.isArray(tile.mesh.material)) {
      tile.mesh.material.forEach((m) => m.dispose());
    } else if (tile.mesh.material) {
      tile.mesh.material.dispose();
    }

    // Decrement texture usage
    const currentUsage = this.textureUsageCount.get(tile.tileUrl) || 1;
    if (currentUsage <= 1) {
      this.textureUsageCount.delete(tile.tileUrl);
    } else {
      this.textureUsageCount.set(tile.tileUrl, currentUsage - 1);
    }

    this.activeTiles.delete(key);
  }

  /**
   * Prune texture cache safely without disposing any texture in active use
   */
  private pruneTextureCache(): void {
    if (this.textureCache.size <= this.maxCacheSize) return;

    for (const [url, texture] of Array.from(this.textureCache.entries())) {
      if (this.textureCache.size <= this.maxCacheSize) break;
      const usage = this.textureUsageCount.get(url) || 0;
      if (usage === 0) {
        texture.dispose();
        this.textureCache.delete(url);
      }
    }
  }

  public clearAllTiles(): void {
    for (const [key, tile] of Array.from(this.activeTiles.entries())) {
      this.disposeTile(key, tile);
    }
    this.activeTiles.clear();
    this.queuedRequests.forEach((q) => q.abortController.abort());
    this.queuedRequests = [];
    this.lastUpdateCenter = { lat: 999, lon: 999, zoom: -1 };
  }

  public dispose(): void {
    this.qualityUnsubscribe();
    this.clearAllTiles();
    for (const texture of this.textureCache.values()) {
      texture.dispose();
    }
    this.textureCache.clear();
    this.textureUsageCount.clear();
  }
}
