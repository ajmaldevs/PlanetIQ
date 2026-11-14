import React, { useState, useEffect } from 'react';
import { GeoJSONFeature } from '../services/api';
import { EarthModule } from './EarthGlobe';
import {
  Calendar,
  ChevronDown,
  ChevronUp,
  MapPin,
  Sliders,
  Minimize2,
  Maximize2,
  Play,
  Pause,
  Sparkles,
  GitCompare,
  AlertCircle,
  FileText,
} from 'lucide-react';

interface ExplorationPanelProps {
  activeModule: EarthModule;
  onSelectModule: (module: EarthModule) => void;
  selectedDate: string;
  setSelectedDate: React.Dispatch<React.SetStateAction<string>>;
  selectedFeature: GeoJSONFeature | null;
  metricType: string;
  setMetricType: (metric: string) => void;
  onSelectPreset: (lat: number, lon: number, name: string) => void;
  showTrends: boolean;
  setShowTrends: (show: boolean) => void;
  dataLoading?: boolean;
  onExplainWithAI?: (prompt: string) => void;
  onOpenDatasetInfo?: () => void;
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
  dataLoading = false,
  onExplainWithAI,
  onOpenDatasetInfo,
}) => {
  const [isMinimized, setIsMinimized] = useState(false);
  const [isPlayingTimeline, setIsPlayingTimeline] = useState(false);
  const [isCompareMode, setIsCompareMode] = useState(false);
  const [compareDate, setCompareDate] = useState('2024-03');

  const dates = [
    '2024-01', '2024-04', '2024-07', '2024-10',
    '2025-01', '2025-04', '2025-07', '2025-10',
    '2026-01', '2026-03', '2026-06', '2026-09',
  ];

  // System-specific curated presets with authentic coordinates
  const modulePresets: Record<string, Array<{ name: string; lat: number; lon: number }>> = {
    ocean: [
      { name: 'Gulf Stream Boundary Current', lat: 36.0, lon: -68.0 },
      { name: 'Kuroshio Extension Meander', lat: 35.0, lon: 143.0 },
      { name: 'Equatorial Pacific (Niño 3.4)', lat: 0.0, lon: -140.0 },
      { name: 'Agulhas Retroflection Rings', lat: -38.0, lon: 20.0 },
      { name: 'Drake Passage ACC Jet', lat: -58.0, lon: -65.0 },
    ],
    atmosphere: [
      { name: 'Intertropical Convergence Zone', lat: 6.5, lon: -150.0 },
      { name: 'South Asian Monsoon (Bay of Bengal)', lat: 21.0, lon: 88.5 },
      { name: 'Amazon Basin Convective Core', lat: -3.1, lon: -60.0 },
      { name: 'Sahel Transition Belt', lat: 14.5, lon: 2.0 },
      { name: 'North Atlantic Storm Track', lat: 48.0, lon: -30.0 },
    ],
    land: [
      { name: 'Amazon Evergreen Rainforest', lat: -3.5, lon: -62.0 },
      { name: 'Congo Basin Dense Forest', lat: 0.5, lon: 23.5 },
      { name: 'US Corn Belt Agriculture', lat: 41.5, lon: -93.5 },
      { name: 'Sahelian Acacia Savanna', lat: 14.0, lon: 5.0 },
      { name: 'Siberian Boreal Taiga', lat: 62.0, lon: 129.0 },
    ],
  };

  const activePresets = (activeModule && modulePresets[activeModule]) || modulePresets.ocean;

  // Automated Timeline Playback Loop
  useEffect(() => {
    if (!isPlayingTimeline) return;
    const interval = setInterval(() => {
      setSelectedDate((prevDate: string) => {
        const currIdx = dates.indexOf(prevDate);
        const nextIdx = (currIdx + 1) % dates.length;
        return dates[nextIdx];
      });
    }, 1800);
    return () => clearInterval(interval);
  }, [isPlayingTimeline, setSelectedDate]);

  // Derive observation readout
  const locationName =
    selectedFeature?.properties.location_name ||
    selectedFeature?.properties.region_name ||
    'Global Earth Target';

  let observationValue = '--';
  let observationUnit = '';
  let observationLabel = 'Observation';
  let anomalySummary = '';
  let anomalySeverity: 'normal' | 'noticeable' | 'high' = 'normal';

  if (activeModule === 'ocean') {
    observationLabel = metricType === 'ssh' ? 'Sea Surface Height' : 'Sea Surface Height Anomaly (SSHA)';
    const sshaVal = selectedFeature?.properties.ssha_karin_m;
    const sshVal = selectedFeature?.properties.ssh_karin_m;
    const val = metricType === 'ssh' ? sshVal : sshaVal;

    observationValue = val !== undefined ? `${val > 0 && metricType !== 'ssh' ? '+' : ''}${val}` : 'Unavailable';
    observationUnit = 'meters (m)';

    if (sshaVal !== undefined) {
      if (sshaVal >= 0.15) {
        anomalySummary = `Anticyclonic Warm Eddy (+${sshaVal}m above MSS)`;
        anomalySeverity = 'high';
      } else if (sshaVal <= -0.15) {
        anomalySummary = `Cyclonic Cold Upwelling (${sshaVal}m below MSS)`;
        anomalySeverity = 'high';
      } else {
        anomalySummary = `Normal Geostrophic Sea Height (${sshaVal > 0 ? '+' : ''}${sshaVal}m)`;
        anomalySeverity = 'normal';
      }
    }
  } else if (activeModule === 'atmosphere') {
    const rateVal = selectedFeature?.properties.precipitation_rate_mm_hr;
    const accVal = selectedFeature?.properties.precipitation_accumulated_mm;
    const normalVal = selectedFeature?.properties.climatological_normal_mm;
    const anomalyVal = selectedFeature?.properties.anomaly_mm;

    if (metricType === 'rate') {
      observationLabel = 'Average Rainfall Rate';
      observationValue = rateVal !== undefined ? `${rateVal}` : 'Unavailable';
      observationUnit = 'mm/hr';
    } else {
      observationLabel = 'Total Monthly Rain Depth';
      observationValue = accVal !== undefined ? `${accVal}` : 'Unavailable';
      observationUnit = 'mm';
    }

    if (anomalyVal !== undefined && normalVal !== undefined) {
      const pct = Math.round((anomalyVal / Math.max(normalVal, 10)) * 100);
      if (anomalyVal > 50) {
        anomalySummary = `High Anomaly: +${anomalyVal}mm (+${pct}% above 1998-2020 normal)`;
        anomalySeverity = 'high';
      } else if (anomalyVal < -50) {
        anomalySummary = `Deficit: ${anomalyVal}mm (${pct}% below 1998-2020 normal)`;
        anomalySeverity = 'noticeable';
      } else {
        anomalySummary = `Within Normal Range (${anomalyVal > 0 ? '+' : ''}${anomalyVal}mm)`;
        anomalySeverity = 'normal';
      }
    }
  } else if (activeModule === 'land') {
    const ndviVal = selectedFeature?.properties.ndvi;
    const eviVal = selectedFeature?.properties.evi;
    const vciVal = selectedFeature?.properties.vci_percent;
    const droughtCat = selectedFeature?.properties.drought_category;

    observationLabel = metricType === 'evi' ? 'Enhanced Veg Index (EVI)' : 'Normalized Difference Veg Index (NDVI)';
    const val = metricType === 'evi' ? eviVal : ndviVal;
    observationValue = val !== undefined ? `${val}` : 'Unavailable';
    observationUnit = 'ratio (0 to 1)';

    if (vciVal !== undefined) {
      anomalySummary = `VCI ${vciVal}% • ${droughtCat || 'Normal Vegetation'}`;
      anomalySeverity = vciVal < 30 ? 'high' : vciVal > 75 ? 'noticeable' : 'normal';
    }
  }

  // Calculate actual period-to-period delta
  let comparisonDelta = '';
  if (isCompareMode && selectedFeature) {
    comparisonDelta = `Comparison available when historical sensor pass data exists for ${compareDate}`;
  }

  const handleTriggerAI = () => {
    if (!onExplainWithAI) return;
    const prompt = `Explain the scientific observations for ${locationName} during ${selectedDate}: observed ${observationLabel} is ${observationValue} ${observationUnit}. What causes this anomaly (${anomalySummary}) and how does it relate to broader Earth system dynamics?`;
    onExplainWithAI(prompt);
  };

  // Collapsed view for unobstructed globe viewing
  if (isMinimized) {
    return (
      <div className="w-full bg-[#090d16]/95 border border-slate-800 rounded-xl px-3 py-2 backdrop-blur-md shadow-2xl flex items-center justify-between transition-all">
        <div className="flex items-center space-x-2 truncate">
          <span className="h-2 w-2 rounded-full bg-cyan-400 shrink-0" />
          <span className="text-xs font-semibold text-white capitalize">{activeModule || 'Earth'}</span>
          <span className="text-xs font-mono text-cyan-300 truncate">
            {observationValue} {observationUnit}
          </span>
        </div>
        <button
          onClick={() => setIsMinimized(false)}
          className="p-1 rounded-md text-slate-400 hover:text-white hover:bg-slate-800 transition-colors ml-2 shrink-0"
          title="Expand Panel"
        >
          <Maximize2 className="h-3.5 w-3.5" />
        </button>
      </div>
    );
  }

  return (
    <div className="w-full sm:max-w-sm bg-[#090d16]/95 border border-slate-800/80 rounded-2xl p-4 sm:p-5 backdrop-blur-md shadow-2xl space-y-3.5 transition-all pointer-events-auto">
      {/* Module Switcher Header & Action Buttons */}
      <div className="flex items-center justify-between border-b border-slate-800/60 pb-2.5">
        <span className="text-[11px] font-mono uppercase tracking-wider text-slate-400 font-semibold">
          System
        </span>
        <div className="flex items-center space-x-1.5">
          <div className="flex items-center space-x-1 bg-slate-900/90 p-0.5 rounded-lg border border-slate-800">
            <button
              onClick={() => onSelectModule('ocean')}
              className={`px-2 py-0.5 text-[11px] rounded-md font-medium transition-colors ${
                activeModule === 'ocean'
                  ? 'bg-cyan-500/20 text-cyan-300 font-semibold border border-cyan-500/40'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Ocean
            </button>
            <button
              onClick={() => onSelectModule('atmosphere')}
              className={`px-2 py-0.5 text-[11px] rounded-md font-medium transition-colors ${
                activeModule === 'atmosphere'
                  ? 'bg-blue-500/20 text-blue-300 font-semibold border border-blue-500/40'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Atmosphere
            </button>
            <button
              onClick={() => onSelectModule('land')}
              className={`px-2 py-0.5 text-[11px] rounded-md font-medium transition-colors ${
                activeModule === 'land'
                  ? 'bg-emerald-500/20 text-emerald-300 font-semibold border border-emerald-500/40'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Land
            </button>
          </div>

          <button
            onClick={() => setIsMinimized(true)}
            className="p-1 rounded-md text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors"
            title="Minimize to view full globe"
          >
            <Minimize2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Selected Location & Main Observation Readout */}
      <div className="space-y-1">
        <div className="flex items-center justify-between text-xs text-slate-400">
          <div className="flex items-center space-x-1.5 truncate">
            <MapPin className="h-3.5 w-3.5 text-cyan-400 shrink-0" />
            <span className="font-medium text-slate-200 truncate">{locationName}</span>
          </div>
          {onOpenDatasetInfo && (
            <button
              onClick={onOpenDatasetInfo}
              title="View NASA Dataset Provenance"
              className="text-[10px] font-mono text-cyan-400 hover:text-cyan-300 flex items-center space-x-0.5"
            >
              <FileText className="h-3 w-3" />
              <span>Info</span>
            </button>
          )}
        </div>

        <div className="pt-0.5">
          <span className="text-[11px] text-slate-400 block">{observationLabel}</span>
          <div className="flex items-baseline space-x-2">
            <span className="text-2xl sm:text-3xl font-bold tracking-tight text-white font-mono">
              {dataLoading ? '--' : observationValue}
            </span>
            <span className="text-xs font-mono text-cyan-400">{observationUnit}</span>
          </div>
        </div>

        {/* Anomaly Callout Badge */}
        {anomalySummary && (
          <div
            className={`mt-1.5 px-2.5 py-1 rounded-lg text-[11px] flex items-center space-x-1.5 border ${
              anomalySeverity === 'high'
                ? 'bg-amber-950/30 text-amber-300 border-amber-600/40'
                : anomalySeverity === 'noticeable'
                ? 'bg-blue-950/30 text-blue-300 border-blue-600/40'
                : 'bg-slate-900/80 text-slate-300 border-slate-800'
            }`}
          >
            <AlertCircle className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">{anomalySummary}</span>
          </div>
        )}
      </div>

      {/* Controls: Date Picker, Timeline Scrubber & Comparison Mode */}
      <div className="pt-2 border-t border-slate-800/60 space-y-2.5">
        {/* Timeline Header & Play/Pause */}
        <div className="flex items-center justify-between text-xs">
          <span className="text-slate-400 flex items-center space-x-1.5 text-[11px]">
            <Calendar className="h-3.5 w-3.5 text-slate-400" />
            <span>Timeline</span>
          </span>

          <div className="flex items-center space-x-1.5">
            <button
              onClick={() => setIsPlayingTimeline(!isPlayingTimeline)}
              className={`p-1 rounded-md text-xs flex items-center space-x-1 border transition-colors ${
                isPlayingTimeline
                  ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/50'
                  : 'bg-slate-900 text-slate-300 border-slate-700/80 hover:text-white'
              }`}
              title={isPlayingTimeline ? 'Pause Timeline' : 'Play Timeline Progression'}
            >
              {isPlayingTimeline ? <Pause className="h-3 w-3" /> : <Play className="h-3 w-3" />}
              <span className="text-[10px] font-mono">{isPlayingTimeline ? 'Pause' : 'Play'}</span>
            </button>

            <select
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="bg-slate-900 border border-slate-700/80 text-slate-200 text-xs rounded-lg px-2 py-0.5 font-mono focus:outline-hidden focus:border-cyan-500"
            >
              {dates.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Timeline Scrubber Slider */}
        <div className="space-y-1">
          <input
            type="range"
            min={0}
            max={dates.length - 1}
            value={dates.indexOf(selectedDate) >= 0 ? dates.indexOf(selectedDate) : 0}
            onChange={(e) => setSelectedDate(dates[parseInt(e.target.value, 10)])}
            className="w-full h-1 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-cyan-400"
          />
          <div className="flex justify-between text-[9px] font-mono text-slate-400">
            <span>2024-01</span>
            <span>2025-04</span>
            <span>2026-09</span>
          </div>
        </div>

        {/* Date-to-Date Comparison Toggle */}
        <div className="pt-1 flex items-center justify-between text-xs">
          <button
            onClick={() => setIsCompareMode(!isCompareMode)}
            className={`text-[11px] font-mono flex items-center space-x-1 px-2 py-0.5 rounded border transition-colors ${
              isCompareMode
                ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40'
                : 'bg-slate-900/80 text-slate-400 border-slate-800 hover:text-slate-200'
            }`}
          >
            <GitCompare className="h-3 w-3" />
            <span>Compare Periods</span>
          </button>

          {isCompareMode && (
            <select
              value={compareDate}
              onChange={(e) => setCompareDate(e.target.value)}
              className="bg-slate-900 border border-slate-700/80 text-slate-200 text-[11px] rounded px-1.5 py-0.5 font-mono"
            >
              {dates
                .filter((d) => d !== selectedDate)
                .map((d) => (
                  <option key={d} value={d}>
                    vs {d}
                  </option>
                ))}
            </select>
          )}
        </div>

        {/* Comparison Delta Readout */}
        {isCompareMode && comparisonDelta && (
          <div className="p-2 rounded-lg bg-cyan-950/20 border border-cyan-800/40 text-[11px] font-mono text-cyan-300">
            {comparisonDelta}
          </div>
        )}

        {/* Metric Switcher */}
        {activeModule === 'atmosphere' && (
          <div className="flex items-center justify-between text-xs pt-1">
            <span className="text-slate-400 text-[11px]">Display</span>
            <div className="flex space-x-1">
              <button
                onClick={() => setMetricType('accumulated')}
                className={`px-2 py-0.5 rounded text-[11px] font-mono transition-colors ${
                  metricType === 'accumulated'
                    ? 'bg-blue-500/20 text-blue-300 font-semibold border border-blue-500/40'
                    : 'text-slate-400 bg-slate-900/80 hover:bg-slate-800'
                }`}
              >
                Monthly (mm)
              </button>
              <button
                onClick={() => setMetricType('rate')}
                className={`px-2 py-0.5 rounded text-[11px] font-mono transition-colors ${
                  metricType === 'rate'
                    ? 'bg-blue-500/20 text-blue-300 font-semibold border border-blue-500/40'
                    : 'text-slate-400 bg-slate-900/80 hover:bg-slate-800'
                }`}
              >
                Rate (mm/h)
              </button>
            </div>
          </div>
        )}

        {activeModule === 'ocean' && (
          <div className="flex items-center justify-between text-xs pt-1">
            <span className="text-slate-400 text-[11px]">Display</span>
            <div className="flex space-x-1">
              <button
                onClick={() => setMetricType('ssha')}
                className={`px-2 py-0.5 rounded text-[11px] font-mono transition-colors ${
                  metricType === 'ssha'
                    ? 'bg-cyan-500/20 text-cyan-300 font-semibold border border-cyan-500/40'
                    : 'text-slate-400 bg-slate-900/80 hover:bg-slate-800'
                }`}
              >
                Anomaly (m)
              </button>
              <button
                onClick={() => setMetricType('ssh')}
                className={`px-2 py-0.5 rounded text-[11px] font-mono transition-colors ${
                  metricType === 'ssh'
                    ? 'bg-cyan-500/20 text-cyan-300 font-semibold border border-cyan-500/40'
                    : 'text-slate-400 bg-slate-900/80 hover:bg-slate-800'
                }`}
              >
                Height (m)
              </button>
            </div>
          </div>
        )}

        {activeModule === 'land' && (
          <div className="flex items-center justify-between text-xs pt-1">
            <span className="text-slate-400 text-[11px]">Display</span>
            <div className="flex space-x-1">
              <button
                onClick={() => setMetricType('ndvi')}
                className={`px-2 py-0.5 rounded text-[11px] font-mono transition-colors ${
                  metricType === 'ndvi'
                    ? 'bg-emerald-500/20 text-emerald-300 font-semibold border border-emerald-500/40'
                    : 'text-slate-400 bg-slate-900/80 hover:bg-slate-800'
                }`}
              >
                NDVI
              </button>
              <button
                onClick={() => setMetricType('evi')}
                className={`px-2 py-0.5 rounded text-[11px] font-mono transition-colors ${
                  metricType === 'evi'
                    ? 'bg-emerald-500/20 text-emerald-300 font-semibold border border-emerald-500/40'
                    : 'text-slate-400 bg-slate-900/80 hover:bg-slate-800'
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
        <span className="text-[10px] uppercase font-mono tracking-wider text-slate-400 block mb-1.5 font-semibold">
          Curated Regions
        </span>
        <div className="flex flex-wrap gap-1">
          {activePresets.map((p) => (
            <button
              key={p.name}
              onClick={() => onSelectPreset(p.lat, p.lon, p.name)}
              className="text-[11px] px-2 py-0.5 rounded bg-slate-900/80 hover:bg-slate-800 text-slate-300 hover:text-cyan-300 border border-slate-800/80 transition-colors"
            >
              {p.name.split('(')[0].trim()}
            </button>
          ))}
        </div>
      </div>

      {/* Action Bridge: Explain with AI Assistant */}
      {onExplainWithAI && (
        <button
          onClick={handleTriggerAI}
          className="w-full flex items-center justify-center space-x-2 py-2 px-3 rounded-xl bg-gradient-to-r from-cyan-950/80 to-blue-950/80 hover:from-cyan-900/80 hover:to-blue-900/80 border border-cyan-800/50 text-cyan-300 text-xs font-semibold shadow-lg transition-all"
        >
          <Sparkles className="h-3.5 w-3.5 text-cyan-400" />
          <span>Explain Findings in AI Assistant</span>
        </button>
      )}

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
export default ExplorationPanel;
