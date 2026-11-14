/**
 * Device-Adaptive Performance Engineering & Rendering Quality Service
 * 
 * Automatically measures hardware capability, GPU performance, memory constraints,
 * and frame rendering latency to dynamically adjust 3D rendering workload.
 * 
 * Provides hysteresis safeguards to prevent setting oscillation and supports
 * manual user override.
 */

export type QualityTier = 'high' | 'standard' | 'low';
export type QualityMode = 'auto' | QualityTier;

export interface QualityProfile {
  tier: QualityTier;
  maxPixelRatio: number;
  sphereSegments: number;
  antialias: boolean;
  starsCount: number;
  maxLodZoom: number;
  lodTileSpan: number;
  labelUpdateIntervalMs: number;
  maxConcurrentTileLoads: number;
  enableAtmosphericGlow: boolean;
  enableSpecularHighlights: boolean;
}

const QUALITY_PROFILES: Record<QualityTier, QualityProfile> = {
  high: {
    tier: 'high',
    maxPixelRatio: 2.0,
    sphereSegments: 64,
    antialias: true,
    starsCount: 800,
    maxLodZoom: 8,
    lodTileSpan: 2,
    labelUpdateIntervalMs: 80,
    maxConcurrentTileLoads: 4,
    enableAtmosphericGlow: true,
    enableSpecularHighlights: true,
  },
  standard: {
    tier: 'standard',
    maxPixelRatio: 1.5,
    sphereSegments: 48,
    antialias: true,
    starsCount: 450,
    maxLodZoom: 7,
    lodTileSpan: 1,
    labelUpdateIntervalMs: 140,
    maxConcurrentTileLoads: 3,
    enableAtmosphericGlow: true,
    enableSpecularHighlights: true,
  },
  low: {
    tier: 'low',
    maxPixelRatio: 1.0,
    sphereSegments: 32,
    antialias: false,
    starsCount: 200,
    maxLodZoom: 5,
    lodTileSpan: 1,
    labelUpdateIntervalMs: 220,
    maxConcurrentTileLoads: 2,
    enableAtmosphericGlow: false,
    enableSpecularHighlights: false,
  },
};

export interface DeviceCapabilities {
  cores: number;
  memoryGb?: number;
  devicePixelRatio: number;
  unmaskedRenderer: string;
  isMobileOrTablet: boolean;
  isConstrainedGpu: boolean;
  initialRecommendedTier: QualityTier;
}

class AdaptiveQualityManager {
  private mode: QualityMode = 'auto';
  private currentTier: QualityTier = 'standard';
  private capabilities: DeviceCapabilities;
  private listeners: Set<(profile: QualityProfile, mode: QualityMode) => void> = new Set();

  // Dynamic frame-time monitoring with hysteresis
  private frameTimes: number[] = [];
  private readonly maxSampleCount = 90;
  private lastEvaluationTime = performance.now();
  private stableGoodPerformanceStart = performance.now();
  private stableDegradedPerformanceStart = 0;

  constructor() {
    this.capabilities = this.detectDeviceCapabilities();
    const savedMode = this.loadSavedMode();
    this.mode = savedMode;
    this.currentTier = savedMode === 'auto' ? this.capabilities.initialRecommendedTier : savedMode;
  }

  private detectDeviceCapabilities(): DeviceCapabilities {
    const cores = typeof navigator !== 'undefined' ? navigator.hardwareConcurrency || 4 : 4;
    const memoryGb = typeof navigator !== 'undefined' && 'deviceMemory' in navigator
      ? (navigator as any).deviceMemory
      : undefined;
    const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;

    let unmaskedRenderer = 'unknown';
    let isConstrainedGpu = false;

    if (typeof document !== 'undefined') {
      try {
        const canvas = document.createElement('canvas');
        const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
        if (gl && 'getExtension' in gl) {
          const debugInfo = (gl as WebGLRenderingContext).getExtension('WEBGL_debug_renderer_info');
          if (debugInfo) {
            unmaskedRenderer = (gl as WebGLRenderingContext).getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) || '';
          }
        }
      } catch {
        // Ignored in test / headless environments
      }
    }

    const rendererLower = unmaskedRenderer.toLowerCase();
    // Detect software or severely constrained mobile/integrated GPUs
    if (
      rendererLower.includes('swiftshader') ||
      rendererLower.includes('llvmpipe') ||
      rendererLower.includes('mali-400') ||
      rendererLower.includes('mali-t') ||
      rendererLower.includes('adreno (tm) 3') ||
      rendererLower.includes('adreno (tm) 4') ||
      rendererLower.includes('intel hd graphics 3000') ||
      rendererLower.includes('intel hd graphics 4000') ||
      rendererLower.includes('powervr')
    ) {
      isConstrainedGpu = true;
    }

    const isMobileOrTablet =
      typeof window !== 'undefined' &&
      (window.innerWidth <= 840 || /Android|iPhone|iPad|iPod/i.test(navigator.userAgent));

    // Determine initial recommended tier
    let initialRecommendedTier: QualityTier = 'standard';

    if (isConstrainedGpu || (memoryGb && memoryGb <= 2) || cores <= 2) {
      initialRecommendedTier = 'low';
    } else if (
      !isMobileOrTablet &&
      cores >= 6 &&
      (memoryGb === undefined || memoryGb >= 6) &&
      (rendererLower.includes('nvidia') ||
        rendererLower.includes('amd') ||
        rendererLower.includes('radeon') ||
        rendererLower.includes('apple') ||
        rendererLower.includes('direct3d11') ||
        rendererLower.includes('iris') ||
        rendererLower.includes('geforce'))
    ) {
      initialRecommendedTier = 'high';
    } else if (isMobileOrTablet) {
      initialRecommendedTier = dpr > 2 ? 'standard' : 'standard';
    }

    return {
      cores,
      memoryGb,
      devicePixelRatio: dpr,
      unmaskedRenderer,
      isMobileOrTablet,
      isConstrainedGpu,
      initialRecommendedTier,
    };
  }

  private loadSavedMode(): QualityMode {
    if (typeof localStorage === 'undefined') return 'auto';
    try {
      const saved = localStorage.getItem('terralens_render_quality');
      if (saved === 'high' || saved === 'standard' || saved === 'low' || saved === 'auto') {
        return saved as QualityMode;
      }
    } catch {}
    return 'auto';
  }

  public getCapabilities(): DeviceCapabilities {
    return this.capabilities;
  }

  public getMode(): QualityMode {
    return this.mode;
  }

  public getProfile(): QualityProfile {
    return QUALITY_PROFILES[this.currentTier];
  }

  public setMode(mode: QualityMode): void {
    this.mode = mode;
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem('terralens_render_quality', mode);
      }
    } catch {}

    if (mode === 'auto') {
      this.currentTier = this.capabilities.initialRecommendedTier;
    } else {
      this.currentTier = mode;
    }
    this.notifyListeners();
  }

  public subscribe(callback: (profile: QualityProfile, mode: QualityMode) => void): () => void {
    this.listeners.add(callback);
    callback(this.getProfile(), this.mode);
    return () => this.listeners.delete(callback);
  }

  private notifyListeners(): void {
    const profile = this.getProfile();
    this.listeners.forEach((cb) => cb(profile, this.mode));
  }

  /**
   * Called by the main Three.js animation loop to feed frame delta times.
   * Evaluates rolling average and adapts quality with conservative hysteresis.
   */
  public reportFrameDelta(deltaSec: number): void {
    if (this.mode !== 'auto') return;

    const deltaMs = deltaSec * 1000;
    this.frameTimes.push(deltaMs);
    if (this.frameTimes.length > this.maxSampleCount) {
      this.frameTimes.shift();
    }

    const now = performance.now();
    // Evaluate only every 3 seconds
    if (now - this.lastEvaluationTime < 3000) return;
    this.lastEvaluationTime = now;

    if (this.frameTimes.length < 30) return;

    const avgMs = this.frameTimes.reduce((a, b) => a + b, 0) / this.frameTimes.length;
    const severeSpikes = this.frameTimes.filter((t) => t > 55).length;

    // Sustained frame time > 32ms (~30 FPS) or frequent severe spikes indicates GPU/CPU saturation
    if (avgMs > 32 || severeSpikes >= 5) {
      this.stableGoodPerformanceStart = now;
      if (this.stableDegradedPerformanceStart === 0) {
        this.stableDegradedPerformanceStart = now;
      } else if (now - this.stableDegradedPerformanceStart > 3000) {
        // Demote quality tier
        if (this.currentTier === 'high') {
          console.warn('[AdaptiveQuality] Sustained frame latency detected. Demoting high -> standard');
          this.currentTier = 'standard';
          this.notifyListeners();
        } else if (this.currentTier === 'standard') {
          console.warn('[AdaptiveQuality] Sustained frame latency detected. Demoting standard -> low');
          this.currentTier = 'low';
          this.notifyListeners();
        }
        this.stableDegradedPerformanceStart = 0;
        this.frameTimes = [];
      }
    } else if (avgMs < 15.0 && severeSpikes === 0) {
      // Extremely smooth (< 15ms per frame)
      this.stableDegradedPerformanceStart = 0;
      // Require 12 full seconds of unbroken smooth performance before promoting up
      if (now - this.stableGoodPerformanceStart > 12000) {
        if (this.currentTier === 'low' && this.capabilities.initialRecommendedTier !== 'low') {
          console.info('[AdaptiveQuality] Sustained smooth 60fps detected. Promoting low -> standard');
          this.currentTier = 'standard';
          this.notifyListeners();
          this.stableGoodPerformanceStart = now;
          this.frameTimes = [];
        } else if (this.currentTier === 'standard' && this.capabilities.initialRecommendedTier === 'high') {
          console.info('[AdaptiveQuality] Sustained smooth 60fps detected. Promoting standard -> high');
          this.currentTier = 'high';
          this.notifyListeners();
          this.stableGoodPerformanceStart = now;
          this.frameTimes = [];
        }
      }
    } else {
      // Balanced zone
      this.stableDegradedPerformanceStart = 0;
      this.stableGoodPerformanceStart = now;
    }
  }
}

export const adaptiveQuality = new AdaptiveQualityManager();
