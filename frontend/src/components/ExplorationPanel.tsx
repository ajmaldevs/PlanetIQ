import React from 'react';
import { GeoJSONFeature } from '../services/api';
import { EarthModule } from './EarthGlobe';
import { Calendar, ChevronDown, ChevronUp, MapPin, Sliders } from 'lucide-react';

interface ExplorationPanelProps {
  activeModule: EarthModule;
  onSelectModule: (module: EarthModule) => void;
  selectedDate: string;
  setSelectedDate: (date: string) => void;
  selectedFeature: GeoJSONFeature | null;
  metricType: string;
  setMetricType: (metric: string) => void;
  onSelectPreset: (lat: number, lon: number, name: string) => void;
  showTrends: boolean;
  setShowTrends: (show: boolean) => void;
}

export const ExplorationPanel: React.FC<ExplorationPanelProps> = ({
  activeModule,
  onSelectModule,
  selectedDate,
  setSelectedDate,
  selectedFeature,
  metricType,
  setMetricType,
  onSelectPreset,
  showTrends,
  setShowTrends,
}) => {
  const dates = [
    '2024-01', '2024-04', '2024-07', '2024-10',
    '2025-01', '2025-04', '2025-07', '2025-10',
    '2026-01', '2026-03', '2026-06', '2026-09',
  ];

  const presets = [
    { name: 'Amazon Basin', lat: -3.5, lon: -62.0 },
    { name: 'Gulf Stream', lat: 36.0, lon: -68.0 },
    { name: 'South Asia (Bay of Bengal)', lat: 21.0, lon: 88.5 },
    { name: 'Equatorial Pacific (Niño 3.4)', lat: 0.0, lon: -140.0 },
    { name: 'Sahel Belt', lat: 14.5, lon: 2.0 },
  ];

  // Derive observation readout
  const locationName =
    selectedFeature?.properties.location_name ||
    selectedFeature?.properties.region_name ||
    'Global Ocean / Land Target';

  let observationValue = '--';
  let observationUnit = '';
  let observationLabel = 'Observation';

  if (activeModule === 'ocean') {
    observationLabel = metricType === 'ssh' ? 'Sea Surface Height' : 'Sea Surface Height Anomaly (SSHA)';
    const val = metricType === 'ssh'
      ? selectedFeature?.properties.ssh_karin_m
      : selectedFeature?.properties.ssha_karin_m;
    observationValue = val !== undefined ? `${val > 0 && metricType !== 'ssh' ? '+' : ''}${val}` : '+0.25';
    observationUnit = 'meters (m)';
  } else if (activeModule === 'atmosphere') {
    if (metricType === 'rate') {
      observationLabel = 'Average Rainfall Rate';
      const val = selectedFeature?.properties.precipitation_rate_mm_hr;
      observationValue = val !== undefined ? `${val}` : '0.35';
      observationUnit = 'mm/hr';
    } else {
      observationLabel = 'Total Monthly Rain Depth';
      const val = selectedFeature?.properties.precipitation_accumulated_mm;
      observationValue = val !== undefined ? `${val}` : '245.0';
      observationUnit = 'mm';
    }
  } else if (activeModule === 'land') {
    observationLabel = metricType === 'evi' ? 'Enhanced Veg Index (EVI)' : 'Normalized Difference Veg Index (NDVI)';
    const val = metricType === 'evi'
      ? selectedFeature?.properties.evi
      : selectedFeature?.properties.ndvi;
    observationValue = val !== undefined ? `${val}` : '0.78';
    observationUnit = 'ratio (0 to 1)';
  }

  return (
    <div className="w-full max-w-sm bg-[#090d16]/90 border border-slate-800/80 rounded-2xl p-4 sm:p-5 backdrop-blur-md shadow-2xl space-y-4">
      {/* Module Switcher Header */}
      <div className="flex items-center justify-between border-b border-slate-800/60 pb-3">
        <span className="text-[11px] font-mono uppercase tracking-wider text-slate-400">
          Earth System
        </span>
        <div className="flex items-center space-x-1 bg-slate-900 p-0.5 rounded-lg border border-slate-800">
          <button
            onClick={() => onSelectModule('ocean')}
            className={`px-2.5 py-1 text-[11px] rounded-md font-medium transition-colors ${
              activeModule === 'ocean'
                ? 'bg-cyan-500/20 text-cyan-300 font-semibold'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Ocean
          </button>
          <button
            onClick={() => onSelectModule('atmosphere')}
            className={`px-2.5 py-1 text-[11px] rounded-md font-medium transition-colors ${
              activeModule === 'atmosphere'
                ? 'bg-blue-500/20 text-blue-300 font-semibold'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Atmosphere
          </button>
          <button
            onClick={() => onSelectModule('land')}
            className={`px-2.5 py-1 text-[11px] rounded-md font-medium transition-colors ${
              activeModule === 'land'
                ? 'bg-emerald-500/20 text-emerald-300 font-semibold'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Land
          </button>
        </div>
      </div>

      {/* Selected Location & Main Observation Readout */}
      <div className="space-y-1.5">
        <div className="flex items-center space-x-1.5 text-xs text-slate-400">
          <MapPin className="h-3.5 w-3.5 text-cyan-400 shrink-0" />
          <span className="font-medium text-slate-200 truncate">{locationName}</span>
        </div>

        <div className="pt-1">
          <span className="text-[11px] text-slate-400 block">{observationLabel}</span>
          <div className="flex items-baseline space-x-2">
            <span className="text-2xl sm:text-3xl font-bold tracking-tight text-white font-mono">
              {observationValue}
            </span>
            <span className="text-xs font-mono text-cyan-400">{observationUnit}</span>
          </div>
        </div>
      </div>

      {/* Controls: Date Picker & Metric Toggle */}
      <div className="pt-2 border-t border-slate-800/60 space-y-2.5">
        {/* Date Selector */}
        <div className="flex items-center justify-between text-xs">
          <span className="text-slate-400 flex items-center space-x-1 text-[11px]">
            <Calendar className="h-3.5 w-3.5 text-slate-400" />
            <span>Timeline</span>
          </span>
          <select
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            className="bg-slate-900 border border-slate-700/80 text-slate-200 text-xs rounded-lg px-2.5 py-1 font-mono focus:outline-hidden focus:border-cyan-500"
          >
            {dates.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
        </div>

        {/* Metric Switcher */}
        {activeModule === 'atmosphere' && (
          <div className="flex items-center justify-between text-xs">
            <span className="text-slate-400 text-[11px]">Display</span>
            <div className="flex space-x-1">
              <button
                onClick={() => setMetricType('accumulated')}
                className={`px-2 py-0.5 rounded text-[11px] font-mono transition-colors ${
                  metricType === 'accumulated'
                    ? 'bg-blue-500/20 text-blue-300 font-semibold border border-blue-500/40'
                    : 'text-slate-400 bg-slate-900'
                }`}
              >
                Monthly (mm)
              </button>
              <button
                onClick={() => setMetricType('rate')}
                className={`px-2 py-0.5 rounded text-[11px] font-mono transition-colors ${
                  metricType === 'rate'
                    ? 'bg-blue-500/20 text-blue-300 font-semibold border border-blue-500/40'
                    : 'text-slate-400 bg-slate-900'
                }`}
              >
                Rate (mm/h)
              </button>
            </div>
          </div>
        )}

        {activeModule === 'ocean' && (
          <div className="flex items-center justify-between text-xs">
            <span className="text-slate-400 text-[11px]">Display</span>
            <div className="flex space-x-1">
              <button
                onClick={() => setMetricType('ssha')}
                className={`px-2 py-0.5 rounded text-[11px] font-mono transition-colors ${
                  metricType === 'ssha'
                    ? 'bg-cyan-500/20 text-cyan-300 font-semibold border border-cyan-500/40'
                    : 'text-slate-400 bg-slate-900'
                }`}
              >
                Anomaly (m)
              </button>
              <button
                onClick={() => setMetricType('ssh')}
                className={`px-2 py-0.5 rounded text-[11px] font-mono transition-colors ${
                  metricType === 'ssh'
                    ? 'bg-cyan-500/20 text-cyan-300 font-semibold border border-cyan-500/40'
                    : 'text-slate-400 bg-slate-900'
                }`}
              >
                Height (m)
              </button>
            </div>
          </div>
        )}

        {activeModule === 'land' && (
          <div className="flex items-center justify-between text-xs">
            <span className="text-slate-400 text-[11px]">Display</span>
            <div className="flex space-x-1">
              <button
                onClick={() => setMetricType('ndvi')}
                className={`px-2 py-0.5 rounded text-[11px] font-mono transition-colors ${
                  metricType === 'ndvi'
                    ? 'bg-emerald-500/20 text-emerald-300 font-semibold border border-emerald-500/40'
                    : 'text-slate-400 bg-slate-900'
                }`}
              >
                NDVI
              </button>
              <button
                onClick={() => setMetricType('evi')}
                className={`px-2 py-0.5 rounded text-[11px] font-mono transition-colors ${
                  metricType === 'evi'
                    ? 'bg-emerald-500/20 text-emerald-300 font-semibold border border-emerald-500/40'
                    : 'text-slate-400 bg-slate-900'
                }`}
              >
                EVI
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Quick Region Presets */}
      <div className="pt-2 border-t border-slate-800/60">
        <span className="text-[10px] uppercase font-mono tracking-wider text-slate-500 block mb-1.5">
          Quick Regions
        </span>
        <div className="flex flex-wrap gap-1">
          {presets.map((p) => (
            <button
              key={p.name}
              onClick={() => onSelectPreset(p.lat, p.lon, p.name)}
              className="text-[11px] px-2 py-1 rounded bg-slate-900/80 hover:bg-slate-800 text-slate-300 hover:text-cyan-300 border border-slate-800/80 transition-colors"
            >
              {p.name.split('(')[0].trim()}
            </button>
          ))}
        </div>
      </div>

      {/* Progressive Disclosure Toggle */}
      <button
        onClick={() => setShowTrends(!showTrends)}
        className="w-full flex items-center justify-between text-xs font-medium text-cyan-400 hover:text-cyan-300 pt-2 border-t border-slate-800/60 transition-colors"
      >
        <span className="flex items-center space-x-1.5">
          <Sliders className="h-3.5 w-3.5" />
          <span>{showTrends ? 'Hide Detailed Trends' : 'View Detailed Historical Trends'}</span>
        </span>
        {showTrends ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
      </button>
    </div>
  );
};
