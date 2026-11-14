import * as THREE from 'three';

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
  opacity: number;
  zoom: number;
  key: string;
  generation: number;
}

export class ImageryLODManager {
  private sphereRadius: number;
  private patchRadius: number;
  private containerGroup: THREE.Group;
  private activeTiles: Map<string, TileRecord> = new Map();
  private textureCache: Map<string, THREE.Texture> = new Map();
  private textureLoader: THREE.TextureLoader = new THREE.TextureLoader();
  private lastUpdateCenter = { lat: 999, lon: 999, zoom: -1 };
  private currentGeneration = 0;
  private maxCacheSize = 72;

  constructor(sphereRadius = 1.9, containerGroup: THREE.Group) {
    this.sphereRadius = sphereRadius;
    // Microscopic offset (0.0006) to sit millimeters above base sphere without z-fighting
    this.patchRadius = sphereRadius * 1.0006;
    this.containerGroup = containerGroup;
  }

  public get radius(): number {
    return this.sphereRadius;
  }

  /**
   * Determine target tile zoom level based on camera distance
   */
  public getTargetTileZoom(cameraDistance: number): number {
    if (cameraDistance >= 4.6) return 0; // Global scale: base NASA Blue Marble only
    if (cameraDistance >= 3.7) return 3; // Continental scale: zoom 3 (~5,000 km across)
    if (cameraDistance >= 3.0) return 5; // Country scale: zoom 5 (~1,200 km across)
    if (cameraDistance >= 2.65) return 7; // Regional / State scale: zoom 7 (~300 km across)
    return 8; // Local / City scale: zoom 8 (~150 km across)
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
   * Update LOD tiles based on current camera distance and facing center coordinates
   */
  public update(cameraDistance: number, centerLat: number, centerLon: number): void {
    const targetZoom = this.getTargetTileZoom(cameraDistance);

    // If global view, smoothly clear sub-tiles
    if (targetZoom === 0) {
      if (this.activeTiles.size > 0) {
        this.clearAllTiles();
      }
      return;
    }

    // Throttle updates if coordinates and zoom haven't shifted meaningfully
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

    // Grid radius around center (e.g., 3x3 tiles at regional/country scale)
    const span = targetZoom >= 7 ? 2 : 1;
    const requiredTileKeys = new Set<string>();

    for (let dy = -span; dy <= span; dy++) {
      const tileY = centerTile.y + dy;
      if (tileY < 0 || tileY >= maxTiles) continue;

      for (let dx = -span; dx <= span; dx++) {
        const tileX = (centerTile.x + dx + maxTiles) % maxTiles;
        const key = `${targetZoom}/${tileX}/${tileY}`;
        requiredTileKeys.add(key);

        if (!this.activeTiles.has(key)) {
          this.loadTileMesh(targetZoom, tileX, tileY, key, currentGen);
        } else {
          // Touch active tile to update its generation
          const tile = this.activeTiles.get(key)!;
          tile.generation = currentGen;
        }
      }
    }

    // Clean up older tiles smoothly:
    // Only remove tiles that are from completely obsolete viewports/generations
    // and only if the newer tiles have begun loading/displaying
    for (const [key, tile] of Array.from(this.activeTiles.entries())) {
      if (!requiredTileKeys.has(key)) {
        // If tile was never loaded or is from a much older generation, dispose it
        if (!tile.loaded || currentGen - tile.generation > 1) {
          this.removeTile(key, tile);
        }
      }
    }
  }

  /**
   * Load and mount an individual spherical tile patch
   */
  private loadTileMesh(z: number, x: number, y: number, key: string, generation: number): void {
    const bounds = tileXYToBounds(x, y, z);
    const geometry = createSphericalTileGeometry(
      bounds.minLat,
      bounds.maxLat,
      bounds.minLon,
      bounds.maxLon,
      this.patchRadius,
      8
    );

    // Initial placeholder material that smoothly cross-fades without z-fighting
    const material = new THREE.MeshBasicMaterial({
      transparent: true,
      opacity: 0.0,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
    });

    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = `lod-tile-${key}`;
    this.containerGroup.add(mesh);

    const record: TileRecord = {
      mesh,
      loaded: false,
      opacity: 0.0,
      zoom: z,
      key,
      generation,
    };
    this.activeTiles.set(key, record);

    const tileUrl = `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${z}/${y}/${x}`;

    // Check LRU cache first
    if (this.textureCache.has(tileUrl)) {
      const cachedTexture = this.textureCache.get(tileUrl)!;
      material.map = cachedTexture;
      material.needsUpdate = true;
      record.loaded = true;
      record.opacity = 0.98;
      material.opacity = 0.98;
      return;
    }

    // Fetch high-resolution imagery tile via CORS
    this.textureLoader.load(
      tileUrl,
      (texture) => {
        // Discard if tile was removed while fetching
        if (!this.activeTiles.has(key)) {
          texture.dispose();
          return;
        }

        texture.wrapS = THREE.ClampToEdgeWrapping;
        texture.wrapT = THREE.ClampToEdgeWrapping;
        texture.minFilter = THREE.LinearMipmapLinearFilter;
        texture.magFilter = THREE.LinearFilter;
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.generateMipmaps = true;

        this.textureCache.set(tileUrl, texture);
        this.pruneTextureCache();

        material.map = texture;
        material.needsUpdate = true;
        record.loaded = true;

        // Smooth fluid cross-fade in over 200ms
        let currentOpacity = 0.0;
        const fadeInStep = () => {
          if (!this.activeTiles.has(key)) return;
          currentOpacity = Math.min(0.98, currentOpacity + 0.14);
          material.opacity = currentOpacity;
          record.opacity = currentOpacity;
          if (currentOpacity < 0.98) {
            requestAnimationFrame(fadeInStep);
          }
        };
        requestAnimationFrame(fadeInStep);
      },
      undefined,
      () => {
        // Graceful fallback to base NASA Blue Marble without breaking or popping
        if (this.activeTiles.has(key)) {
          this.removeTile(key, record);
        }
      }
    );
  }

  private removeTile(key: string, tile: TileRecord): void {
    this.containerGroup.remove(tile.mesh);
    if (tile.mesh.geometry) tile.mesh.geometry.dispose();
    if (Array.isArray(tile.mesh.material)) {
      tile.mesh.material.forEach((m) => m.dispose());
    } else if (tile.mesh.material) {
      tile.mesh.material.dispose();
    }
    this.activeTiles.delete(key);
  }

  /**
   * Prune texture cache to prevent GPU memory saturation
   */
  private pruneTextureCache(): void {
    if (this.textureCache.size <= this.maxCacheSize) return;
    const entries = Array.from(this.textureCache.entries());
    const toRemoveCount = entries.length - this.maxCacheSize;
    for (let i = 0; i < toRemoveCount; i++) {
      const [url, texture] = entries[i];
      let isInUse = false;
      for (const tile of this.activeTiles.values()) {
        if ((tile.mesh.material as THREE.MeshBasicMaterial).map === texture) {
          isInUse = true;
          break;
        }
      }
      if (!isInUse) {
        texture.dispose();
        this.textureCache.delete(url);
      }
    }
  }

  /**
   * Clear all active tile meshes from scene cleanly
   */
  public clearAllTiles(): void {
    for (const [key, tile] of Array.from(this.activeTiles.entries())) {
      this.removeTile(key, tile);
    }
    this.activeTiles.clear();
    this.lastUpdateCenter = { lat: 999, lon: 999, zoom: -1 };
  }

  /**
   * Dispose all resources on unmount
   */
  public dispose(): void {
    this.clearAllTiles();
    for (const texture of this.textureCache.values()) {
      texture.dispose();
    }
    this.textureCache.clear();
  }
}
