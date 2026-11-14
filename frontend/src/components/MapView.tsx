import React, { useEffect, useRef, useState } from 'react';
import maplibregl from 'maplibre-gl';
import { GeoJSONFeatureCollection, GeoJSONFeature } from '../services/api';
import { Layers, Calendar, Navigation } from 'lucide-react';

interface MapViewProps {
  module: 'ocean' | 'atmosphere' | 'land' | 'overview';
  data: GeoJSONFeatureCollection | null;
  loading: boolean;
  selectedDate: string;
  setSelectedDate: (date: string) => void;
  onSelectFeature?: (feature: GeoJSONFeature) => void;
  selectedFeature?: GeoJSONFeature | null;
  activeMetric: string;
  setActiveMetric: (metric: string) => void;
}

export const MapView: React.FC<MapViewProps> = ({
  module,
  data,
  loading,
  selectedDate,
  setSelectedDate,
  onSelectFeature,
  selectedFeature,
  activeMetric,
  setActiveMetric,
}) => {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<maplibregl.Map | null>(null);
  const [mapLoaded, setMapLoaded] = useState(false);

  // Available dates for historical exploration
  const dateOptions = [
    '2024-01', '2024-04', '2024-07', '2024-10',
    '2025-01', '2025-04', '2025-07', '2025-10',
    '2026-01', '2026-03', '2026-06', '2026-09'
  ];

  // Presets
  const presets = [
    { name: 'Amazon Basin', lat: -3.5, lon: -62.0, zoom: 4 },
    { name: 'Gulf Stream', lat: 36.0, lon: -68.0, zoom: 4 },
    { name: 'South Asia (Bay of Bengal)', lat: 21.0, lon: 88.5, zoom: 4 },
    { name: 'Equatorial Pacific (Niño 3.4)', lat: 0.0, lon: -140.0, zoom: 3 },
    { name: 'Sahel Belt', lat: 14.5, lon: 2.0, zoom: 4 },
    { name: 'Western Europe', lat: 50.0, lon: 7.5, zoom: 4 },
  ];

  // Initialize Map
  useEffect(() => {
    if (!mapContainer.current || map.current) return;

    try {
      map.current = new maplibregl.Map({
        container: mapContainer.current,
        style: 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json',
        center: [0, 20],
        zoom: 1.8,
        minZoom: 1,
        maxZoom: 12,
        attributionControl: false,
      });

      map.current.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');

      map.current.on('load', () => {
        setMapLoaded(true);
      });
    } catch (e) {
      console.warn('MapLibre GL initialization fallback: ', e);
      setMapLoaded(true);
    }

    return () => {
      if (map.current) {
        map.current.remove();
        map.current = null;
      }
    };
  }, []);

  // Update Data Layers
  useEffect(() => {
    if (!map.current || !mapLoaded || !data) return;

    const sourceId = 'terralens-observations';
    const layerId = 'observation-points';
    const labelLayerId = 'observation-labels';

    // Remove existing layers if present
    if (map.current.getLayer(labelLayerId)) map.current.removeLayer(labelLayerId);
    if (map.current.getLayer(layerId)) map.current.removeLayer(layerId);
    if (map.current.getSource(sourceId)) map.current.removeSource(sourceId);

    // Add GeoJSON Source
    map.current.addSource(sourceId, {
      type: 'geojson',
      data: data as any,
    });

    // Dynamic color expression based on active module & metric
    let circleColor: any = '#38bdf8';
    let circleRadius: any = 6;

    if (module === 'atmosphere') {
      if (activeMetric === 'rate') {
        circleColor = [
          'interpolate', ['linear'], ['get', 'precipitation_rate_mm_hr'],
          0.02, '#38bdf8',
          0.10, '#0284c7',
          0.25, '#2563eb',
          0.45, '#7c3aed',
          0.70, '#db2777'
        ];
      } else {
        circleColor = [
          'interpolate', ['linear'], ['get', 'precipitation_accumulated_mm'],
          20, '#38bdf8',
          80, '#0284c7',
          180, '#2563eb',
          300, '#7c3aed',
          500, '#db2777'
        ];
      }
      circleRadius = 7;
    } else if (module === 'ocean') {
      circleColor = [
        'interpolate', ['linear'], ['get', 'ssha_karin_m'],
        -0.40, '#1d4ed8', // deep cyclonic cold
        -0.10, '#38bdf8',
        0.00, '#e2e8f0',  // neutral
        0.15, '#f59e0b',
        0.35, '#ef4444'   // anticyclonic warm
      ];
      circleRadius = 8;
    } else if (module === 'land') {
      circleColor = [
        'interpolate', ['linear'], ['get', 'ndvi'],
        0.05, '#d97706', // barren
        0.20, '#eab308', // sparse
        0.45, '#84cc16', // moderate
        0.70, '#10b981', // dense
        0.88, '#065f46'  // lush canopy
      ];
      circleRadius = 8;
    }

    map.current.addLayer({
      id: layerId,
      type: 'circle',
      source: sourceId,
      paint: {
        'circle-radius': circleRadius,
        'circle-color': circleColor,
        'circle-stroke-width': 1.5,
        'circle-stroke-color': '#0f172a',
        'circle-opacity': 0.85,
      },
    });

    // Click handler
    const handleClick = (e: maplibregl.MapMouseEvent) => {
      if (!map.current) return;
      const bbox: [maplibregl.PointLike, maplibregl.PointLike] = [
        [e.point.x - 5, e.point.y - 5],
        [e.point.x + 5, e.point.y + 5]
      ];
      const features = map.current.queryRenderedFeatures(bbox, { layers: [layerId] });
      if (features.length > 0 && onSelectFeature) {
        onSelectFeature(features[0] as unknown as GeoJSONFeature);
      }
    };

    map.current.on('click', layerId, handleClick);

    // Hover cursor
    map.current.on('mouseenter', layerId, () => {
      if (map.current) map.current.getCanvas().style.cursor = 'pointer';
    });
    map.current.on('mouseleave', layerId, () => {
      if (map.current) map.current.getCanvas().style.cursor = '';
    });

    return () => {
      if (map.current) {
        map.current.off('click', layerId, handleClick);
      }
    };
  }, [mapLoaded, data, module, activeMetric]);

  const flyToPreset = (lat: number, lon: number, zoom: number) => {
    if (!map.current) return;
    map.current.flyTo({ center: [lon, lat], zoom, essential: true });
  };

  return (
    <div className="relative w-full h-[520px] rounded-xl overflow-hidden border border-slate-800 bg-[#07090e] shadow-2xl">
      {/* Map Element */}
      <div ref={mapContainer} className="w-full h-full" />

      {/* Loading Overlay */}
      {loading && (
        <div className="absolute inset-0 bg-[#07090e]/60 backdrop-blur-xs flex items-center justify-center z-20">
          <div className="flex items-center space-x-3 px-4 py-2 bg-slate-900 border border-slate-700 rounded-lg shadow-xl">
            <div className="h-4 w-4 rounded-full border-2 border-cyan-400 border-t-transparent animate-spin" />
            <span className="text-xs text-slate-200 font-mono">Streaming Satellite Granules...</span>
          </div>
        </div>
      )}

      {/* Top Left: Controls & Metric Switcher */}
      <div className="absolute top-4 left-4 z-10 flex flex-col space-y-2 max-w-xs">
        <div className="bg-[#0f141f]/95 border border-slate-800/80 p-2.5 rounded-lg backdrop-blur-md shadow-lg space-y-2">
          <div className="flex items-center justify-between text-xs text-slate-300 font-medium">
            <span className="flex items-center space-x-1.5">
              <Layers className="h-3.5 w-3.5 text-cyan-400" />
              <span className="uppercase tracking-wider text-[11px] font-semibold">Active Layer</span>
            </span>
            <span className="text-[10px] text-cyan-400 font-mono uppercase bg-cyan-950/80 px-1.5 py-0.5 rounded border border-cyan-800/40">
              {module}
            </span>
          </div>

          {/* Metric Selector depending on module */}
          {module === 'atmosphere' && (
            <div className="grid grid-cols-2 gap-1 pt-1">
              <button
                onClick={() => setActiveMetric('accumulated')}
                className={`px-2 py-1 text-[11px] font-mono rounded transition-colors ${
                  activeMetric === 'accumulated'
                    ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 font-semibold'
                    : 'bg-slate-900 text-slate-400 hover:text-slate-200'
                }`}
              >
                Accumulated (mm)
              </button>
              <button
                onClick={() => setActiveMetric('rate')}
                className={`px-2 py-1 text-[11px] font-mono rounded transition-colors ${
                  activeMetric === 'rate'
                    ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 font-semibold'
                    : 'bg-slate-900 text-slate-400 hover:text-slate-200'
                }`}
              >
                Rate (mm/hr)
              </button>
            </div>
          )}

          {module === 'ocean' && (
            <div className="grid grid-cols-2 gap-1 pt-1">
              <button
                onClick={() => setActiveMetric('ssha')}
                className={`px-2 py-1 text-[11px] font-mono rounded transition-colors ${
                  activeMetric === 'ssha'
                    ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 font-semibold'
                    : 'bg-slate-900 text-slate-400 hover:text-slate-200'
                }`}
              >
                SSHA Anomaly (m)
              </button>
              <button
                onClick={() => setActiveMetric('ssh')}
                className={`px-2 py-1 text-[11px] font-mono rounded transition-colors ${
                  activeMetric === 'ssh'
                    ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 font-semibold'
                    : 'bg-slate-900 text-slate-400 hover:text-slate-200'
                }`}
              >
                Sea Height (m)
              </button>
            </div>
          )}

          {module === 'land' && (
            <div className="grid grid-cols-2 gap-1 pt-1">
              <button
                onClick={() => setActiveMetric('ndvi')}
                className={`px-2 py-1 text-[11px] font-mono rounded transition-colors ${
                  activeMetric === 'ndvi'
                    ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 font-semibold'
                    : 'bg-slate-900 text-slate-400 hover:text-slate-200'
                }`}
              >
                NDVI Index
              </button>
              <button
                onClick={() => setActiveMetric('evi')}
                className={`px-2 py-1 text-[11px] font-mono rounded transition-colors ${
                  activeMetric === 'evi'
                    ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 font-semibold'
                    : 'bg-slate-900 text-slate-400 hover:text-slate-200'
                }`}
              >
                EVI Canopy
              </button>
            </div>
          )}
        </div>

        {/* Quick Location Presets */}
        <div className="bg-[#0f141f]/90 border border-slate-800 p-2 rounded-lg backdrop-blur-md hidden sm:block">
          <p className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold mb-1 flex items-center space-x-1">
            <Navigation className="h-3 w-3 text-cyan-400" />
            <span>Region Viewports</span>
          </p>
          <div className="flex flex-wrap gap-1">
            {presets.map((p) => (
              <button
                key={p.name}
                onClick={() => flyToPreset(p.lat, p.lon, p.zoom)}
                className="text-[10px] px-2 py-0.5 bg-slate-900/80 hover:bg-slate-800 text-slate-300 hover:text-cyan-300 rounded border border-slate-800 transition-colors"
              >
                {p.name}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Bottom Bar: Timeline Slider & Legend */}
      <div className="absolute bottom-4 left-4 right-4 z-10 flex flex-col sm:flex-row items-center justify-between gap-3 bg-[#0f141f]/95 border border-slate-800 p-3 rounded-lg backdrop-blur-md shadow-2xl">
        {/* Date Timeline Picker */}
        <div className="flex items-center space-x-3 w-full sm:w-auto">
          <Calendar className="h-4 w-4 text-cyan-400 shrink-0" />
          <div className="flex items-center space-x-2 w-full">
            <span className="text-xs font-mono text-cyan-400 font-semibold">{selectedDate}</span>
            <select
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="bg-slate-900 border border-slate-700 text-slate-200 text-xs rounded px-2 py-1 font-mono focus:outline-hidden focus:border-cyan-500"
            >
              {dateOptions.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Dynamic Legend */}
        <div className="flex items-center space-x-2 text-[11px] text-slate-300 font-mono">
          <span className="text-[10px] uppercase text-slate-400 font-semibold">Scale:</span>
          {module === 'atmosphere' && (
            <div className="flex items-center space-x-1.5">
              <span>Dry (0)</span>
              <div className="h-2 w-28 rounded-full bg-gradient-to-r from-sky-400 via-blue-600 via-purple-600 to-pink-500" />
              <span>Heavy ({activeMetric === 'rate' ? '>0.7 mm/h' : '>400 mm'})</span>
            </div>
          )}
          {module === 'ocean' && (
            <div className="flex items-center space-x-1.5">
              <span>Cold (-0.4m)</span>
              <div className="h-2 w-28 rounded-full bg-gradient-to-r from-blue-700 via-slate-200 to-red-600" />
              <span>Warm (+0.35m)</span>
            </div>
          )}
          {module === 'land' && (
            <div className="flex items-center space-x-1.5">
              <span>Barren (0.05)</span>
              <div className="h-2 w-28 rounded-full bg-gradient-to-r from-amber-600 via-lime-500 to-emerald-800" />
              <span>Lush Canopy (0.85)</span>
            </div>
          )}
          {module === 'overview' && (
            <div className="flex items-center space-x-1.5">
              <span>Low</span>
              <div className="h-2 w-24 rounded-full bg-gradient-to-r from-cyan-400 to-blue-600" />
              <span>High</span>
            </div>
          )}
        </div>
      </div>

      {/* Selected Feature Floating Inspector Card */}
      {selectedFeature && (
        <div className="absolute top-4 right-4 z-20 w-72 bg-[#0d121d]/95 border border-cyan-500/40 p-3.5 rounded-lg backdrop-blur-md shadow-2xl space-y-2 text-xs">
          <div className="flex items-center justify-between border-b border-slate-800 pb-1.5">
            <span className="font-semibold text-white truncate">
              {selectedFeature.properties.location_name || selectedFeature.properties.region_name || 'Observation Point'}
            </span>
            <span className="text-[10px] font-mono text-cyan-400">
              {selectedFeature.properties.latitude?.toFixed(1)}°, {selectedFeature.properties.longitude?.toFixed(1)}°
            </span>
          </div>

          {/* Module-specific properties */}
          {selectedFeature.properties.dataset_id === 'GPM_3IMERGM' && (
            <div className="space-y-1 text-slate-300 font-mono text-[11px]">
              <div className="flex justify-between">
                <span className="text-slate-400">Monthly Accumulation:</span>
                <span className="font-bold text-cyan-300">{selectedFeature.properties.precipitation_accumulated_mm} mm</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Average Rate:</span>
                <span>{selectedFeature.properties.precipitation_rate_mm_hr} mm/hr</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Climatological Normal:</span>
                <span>{selectedFeature.properties.climatological_normal_mm} mm</span>
              </div>
              <div className="flex justify-between border-t border-slate-800/80 pt-1">
                <span className="text-slate-400">Monthly Anomaly:</span>
                <span className={selectedFeature.properties.anomaly_mm >= 0 ? 'text-emerald-400 font-semibold' : 'text-rose-400 font-semibold'}>
                  {selectedFeature.properties.anomaly_mm > 0 ? '+' : ''}{selectedFeature.properties.anomaly_mm} mm
                </span>
              </div>
            </div>
          )}

          {selectedFeature.properties.dataset_id === 'SWOT_L2_LR_SSH' && (
            <div className="space-y-1 text-slate-300 font-mono text-[11px]">
              <div className="flex justify-between">
                <span className="text-slate-400">SSHA Anomaly:</span>
                <span className="font-bold text-cyan-300">
                  {selectedFeature.properties.ssha_karin_m > 0 ? '+' : ''}{selectedFeature.properties.ssha_karin_m} m
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Dynamic Topography:</span>
                <span>{selectedFeature.properties.dynamic_topography_m} m</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Meso-scale Vortex:</span>
                <span className="capitalize text-slate-200">{selectedFeature.properties.eddy_type?.replace(/_/g, ' ')}</span>
              </div>
              <div className="flex justify-between border-t border-slate-800/80 pt-1">
                <span className="text-slate-400">Instrument Error (1σ):</span>
                <span>±{selectedFeature.properties.measurement_uncertainty_m * 100} cm</span>
              </div>
            </div>
          )}

          {selectedFeature.properties.dataset_id === 'MOD13C2' && (
            <div className="space-y-1 text-slate-300 font-mono text-[11px]">
              <div className="flex justify-between">
                <span className="text-slate-400">NDVI Ratio:</span>
                <span className="font-bold text-emerald-400">{selectedFeature.properties.ndvi}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">EVI Canopy:</span>
                <span>{selectedFeature.properties.evi}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Vegetation Condition (VCI):</span>
                <span>{selectedFeature.properties.vci_percent}%</span>
              </div>
              <div className="border-t border-slate-800/80 pt-1 text-[10px] text-slate-400">
                <span>Classification: <strong className="text-slate-200">{selectedFeature.properties.drought_category}</strong></span>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
