import React, { useEffect, useRef, useState } from 'react';
import maplibregl from 'maplibre-gl';
import { GeoJSONFeatureCollection, GeoJSONFeature } from '../services/api';
import { RotateCcw, ZoomIn, ZoomOut } from 'lucide-react';

export type EarthModule = 'ocean' | 'atmosphere' | 'land' | null;

interface EarthGlobeProps {
  activeModule: EarthModule;
  data: GeoJSONFeatureCollection | null;
  loading?: boolean;
  onSelectFeature?: (feature: GeoJSONFeature) => void;
  selectedFeature?: GeoJSONFeature | null;
  metricType?: string;
  className?: string;
}

export const EarthGlobe: React.FC<EarthGlobeProps> = ({
  activeModule,
  data,
  loading = false,
  onSelectFeature,
  selectedFeature,
  metricType = 'default',
  className = '',
}) => {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<maplibregl.Map | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);

  // Initialize MapLibre in 3D Globe Projection
  useEffect(() => {
    if (!mapContainer.current || map.current) return;

    try {
      const instance = new maplibregl.Map({
        container: mapContainer.current,
        style: 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json',
        center: [0, 15],
        zoom: 1.25,
        minZoom: 0.8,
        maxZoom: 9,
        attributionControl: false,
      });

      instance.on('load', () => {
        try {
          if (typeof (instance as any).setProjection === 'function') {
            (instance as any).setProjection({ type: 'globe' });
          }
        } catch (err) {
          console.warn('Globe projection fallback:', err);
        }
        setIsLoaded(true);
      });

      map.current = instance;
    } catch (e) {
      console.error('Error creating 3D Globe:', e);
    }

    return () => {
      if (map.current) {
        map.current.remove();
        map.current = null;
      }
    };
  }, []);

  // Update Data Layers when Module or Data changes
  useEffect(() => {
    if (!map.current || !isLoaded) return;

    const sourceId = 'terralens-globe-data';
    const layerId = 'terralens-points';
    const haloLayerId = 'terralens-points-halo';

    // Remove existing layers safely
    if (map.current.getLayer(haloLayerId)) map.current.removeLayer(haloLayerId);
    if (map.current.getLayer(layerId)) map.current.removeLayer(layerId);
    if (map.current.getSource(sourceId)) map.current.removeSource(sourceId);

    if (!data || !activeModule) return;

    // Add GeoJSON data
    map.current.addSource(sourceId, {
      type: 'geojson',
      data: data as any,
    });

    // Determine color ramp based on active Earth module
    let circleColor: any = '#38bdf8';
    let haloColor: any = '#38bdf8';
    let radius = 6;

    if (activeModule === 'ocean') {
      circleColor = [
        'interpolate', ['linear'], ['get', 'ssha_karin_m'],
        -0.35, '#2563eb', // cyclonic cold upwelling
        -0.08, '#38bdf8',
        0.00, '#cbd5e1',
        0.12, '#f59e0b',
        0.35, '#ef4444'  // anticyclonic warm core
      ];
      haloColor = 'rgba(56, 189, 248, 0.3)';
      radius = 7;
    } else if (activeModule === 'atmosphere') {
      if (metricType === 'rate') {
        circleColor = [
          'interpolate', ['linear'], ['get', 'precipitation_rate_mm_hr'],
          0.02, '#38bdf8',
          0.15, '#0284c7',
          0.35, '#6366f1',
          0.60, '#ec4899'
        ];
      } else {
        circleColor = [
          'interpolate', ['linear'], ['get', 'precipitation_accumulated_mm'],
          30, '#38bdf8',
          120, '#0284c7',
          250, '#6366f1',
          450, '#ec4899'
        ];
      }
      haloColor = 'rgba(99, 102, 241, 0.25)';
      radius = 6.5;
    } else if (activeModule === 'land') {
      circleColor = [
        'interpolate', ['linear'], ['get', 'ndvi'],
        0.08, '#d97706', // barren
        0.25, '#ca8a04',
        0.50, '#84cc16',
        0.75, '#10b981',
        0.88, '#047857'  // lush canopy
      ];
      haloColor = 'rgba(16, 185, 129, 0.3)';
      radius = 7;
    }

    // Outer soft halo
    map.current.addLayer({
      id: haloLayerId,
      type: 'circle',
      source: sourceId,
      paint: {
        'circle-radius': radius + 4,
        'circle-color': haloColor,
        'circle-opacity': 0.4,
      },
    });

    // Core observation dot
    map.current.addLayer({
      id: layerId,
      type: 'circle',
      source: sourceId,
      paint: {
        'circle-radius': radius,
        'circle-color': circleColor,
        'circle-stroke-width': 1.5,
        'circle-stroke-color': '#090d16',
        'circle-opacity': 0.95,
      },
    });

    // Interactive point selection
    const onPointClick = (e: maplibregl.MapMouseEvent) => {
      if (!map.current) return;
      const bbox: [maplibregl.PointLike, maplibregl.PointLike] = [
        [e.point.x - 6, e.point.y - 6],
        [e.point.x + 6, e.point.y + 6],
      ];
      const features = map.current.queryRenderedFeatures(bbox, { layers: [layerId] });
      if (features.length > 0 && onSelectFeature) {
        onSelectFeature(features[0] as unknown as GeoJSONFeature);
      }
    };

    map.current.on('click', layerId, onPointClick);
    map.current.on('mouseenter', layerId, () => {
      if (map.current) map.current.getCanvas().style.cursor = 'pointer';
    });
    map.current.on('mouseleave', layerId, () => {
      if (map.current) map.current.getCanvas().style.cursor = '';
    });

    return () => {
      if (map.current) {
        map.current.off('click', layerId, onPointClick);
      }
    };
  }, [isLoaded, data, activeModule, metricType]);

  // Handle selectedFeature fly-to
  useEffect(() => {
    if (!map.current || !selectedFeature) return;
    const [lon, lat] = selectedFeature.geometry.coordinates;
    map.current.flyTo({
      center: [lon, lat],
      essential: true,
      duration: 1200,
    });
  }, [selectedFeature]);

  // Camera Controls
  const zoomIn = () => map.current?.zoomIn();
  const zoomOut = () => map.current?.zoomOut();
  const resetOrientation = () => {
    map.current?.flyTo({ center: [0, 15], zoom: 1.25, pitch: 0, bearing: 0, duration: 1000 });
  };

  return (
    <div className={`relative w-full overflow-hidden select-none ${className}`}>
      {/* 3D Atmospheric Glow Backdrop */}
      <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
        <div className="w-[520px] h-[520px] sm:w-[680px] sm:h-[680px] rounded-full bg-radial from-cyan-500/8 via-blue-600/4 to-transparent blur-2xl" />
      </div>

      {/* MapLibre WebGL Canvas Container */}
      <div ref={mapContainer} className="w-full h-full cursor-grab active:cursor-grabbing" />

      {/* Subtle Loading Spinner */}
      {loading && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-30 flex items-center space-x-2 px-3 py-1.5 rounded-full bg-slate-900/90 border border-slate-800 text-[11px] font-mono text-cyan-300 shadow-xl backdrop-blur-md">
          <div className="h-3 w-3 rounded-full border-2 border-cyan-400 border-t-transparent animate-spin" />
          <span>Updating Observations...</span>
        </div>
      )}

      {/* Minimal Floating Globe Navigation Controls */}
      <div className="absolute bottom-6 right-6 z-20 flex flex-col space-y-1.5 bg-[#090d16]/80 p-1.5 rounded-lg border border-slate-800/80 backdrop-blur-md shadow-xl">
        <button
          onClick={zoomIn}
          title="Zoom In"
          className="p-1.5 rounded hover:bg-slate-800/80 text-slate-400 hover:text-white transition-colors"
        >
          <ZoomIn className="h-4 w-4" />
        </button>
        <button
          onClick={zoomOut}
          title="Zoom Out"
          className="p-1.5 rounded hover:bg-slate-800/80 text-slate-400 hover:text-white transition-colors"
        >
          <ZoomOut className="h-4 w-4" />
        </button>
        <button
          onClick={resetOrientation}
          title="Reset Globe View"
          className="p-1.5 rounded hover:bg-slate-800/80 text-slate-400 hover:text-cyan-400 transition-colors"
        >
          <RotateCcw className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
};
