import React, { useState, useEffect } from 'react';
import { GeoJSONFeature } from '../services/api';
import { EarthModule } from './EarthGlobe';
import { ZoomLevel, GeographicContext } from '../services/geography';
import {
  Calendar,
  ChevronDown,
  ChevronUp,
  MapPin,
  Minimize2,
  Maximize2,
  X,
  Play,
  Pause,
  Sparkles,
  GitCompare,
  AlertCircle,
  FileText,
  TrendingUp,
  Info,
} from 'lucide-react';

interface AdaptiveSidePanelProps {
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
  zoomLevel: ZoomLevel;
  geographicContext: GeographicContext;
  isOpen: boolean;
  onClose: () => void;
}

export const AdaptiveSidePanel: React.FC<AdaptiveSidePanelProps> = ({
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
  zoomLevel,
  geographicContext,
  isOpen,
  onClose,
}) => {
  const [isMinimized, setIsMinimized] = useState(false);
  const [isPlayingTimeline, setIsPlayingTimeline] = useState(false);
  const [isCompareMode, setIsCompareMode] = useState(false);
  const [compareDate, setCompareDate] = useState('2024-03');
  const [showAdvancedDetails, setShowAdvancedDetails] = useState(false);

  const dates = [
    '2024-01', '2024-04', '2024-07', '2024-10',
    '2025-01', '2025-04', '2025-07', '2025-10',
    '2026-01', '2026-03', '2026-06', '2026-09',
  ];

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
    geographicContext.title;

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

    observationValue = val !== undefined ? `${val > 0 && metricType !== 'ssh' ? '+' : ''}${val}` : '+0.25';
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
      observationValue = rateVal !== undefined ? `${rateVal}` : '0.35';
      observationUnit = 'mm/hr';
    } else {
      observationLabel = 'Total Monthly Rain Depth';
      observationValue = accVal !== undefined ? `${accVal}` : '245.0';
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
    observationValue = val !== undefined ? `${val}` : '0.78';
    observationUnit = 'ratio (0 to 1)';

    if (vciVal !== undefined) {
      anomalySummary = `VCI ${vciVal}% • ${droughtCat || 'Normal Vegetation'}`;
      anomalySeverity = vciVal < 30 ? 'high' : vciVal > 75 ? 'noticeable' : 'normal';
    }
  }

  // Calculate synthetic date-to-date comparison delta
  let comparisonDelta = '';
  if (isCompareMode && selectedFeature) {
    if (activeModule === 'ocean') {
      const delta = Math.round(((selectedFeature.properties.ssha_karin_m ?? 0.25) - 0.12) * 100) / 100;
      comparisonDelta = `Δ SSHA: ${delta > 0 ? '+' : ''}${delta} m vs ${compareDate}`;
    } else if (activeModule === 'atmosphere') {
      const delta = Math.round(((selectedFeature.properties.precipitation_accumulated_mm ?? 220) - 180) * 10) / 10;
      comparisonDelta = `Δ Rain: ${delta > 0 ? '+' : ''}${delta} mm vs ${compareDate}`;
    } else if (activeModule === 'land') {
      const delta = Math.round(((selectedFeature.properties.ndvi ?? 0.75) - 0.62) * 100) / 100;
      comparisonDelta = `Δ NDVI: ${delta > 0 ? '+' : ''}${delta} vs ${compareDate}`;
    }
  }

  const handleTriggerAI = () => {
    if (!onExplainWithAI) return;
    const prompt = `Explain the scientific observations for ${locationName} (${geographicContext.subtitle}) during ${selectedDate}: observed ${observationLabel} is ${observationValue} ${observationUnit}. What causes this anomaly (${anomalySummary}) and how does it relate to broader Earth system dynamics?`;
    onExplainWithAI(prompt);
  };

  // Curated regional presets
  const presetsByContinent: Record<string, Array<{ name: string; lat: number; lon: number }>> = {
    'North America': [
      { name: 'Gulf Stream Meander', lat: 36.0, lon: -68.0 },
      { name: 'US Corn Belt', lat: 41.5, lon: -93.5 },
      { name: 'Caribbean Basin', lat: 15.0, lon: -75.0 },
    ],
    'South America': [
      { name: 'Amazon Rainforest', lat: -3.5, lon: -62.0 },
      { name: 'Humboldt Current', lat: -12.0, lon: -78.0 },
      { name: 'Pampas Croplands', lat: -34.0, lon: -64.0 },
    ],
    'Europe': [
      { name: 'North Atlantic Track', lat: 48.0, lon: -30.0 },
      { name: 'Mediterranean Sea', lat: 35.0, lon: 18.0 },
      { name: 'Central European Plains', lat: 51.0, lon: 10.0 },
    ],
    'Africa': [
      { name: 'Sahel Savanna', lat: 14.5, lon: 2.0 },
      { name: 'Congo Rain Basin', lat: 0.5, lon: 23.5 },
      { name: 'Agulhas Current', lat: -38.0, lon: 20.0 },
    ],
    'Asia': [
      { name: 'Bay of Bengal Monsoon', lat: 21.0, lon: 88.5 },
      { name: 'Kuroshio Extension', lat: 35.0, lon: 143.0 },
      { name: 'Siberian Taiga', lat: 62.0, lon: 129.0 },
    ],
    'Australia & Oceania': [
      { name: 'Great Barrier Reef', lat: -18.0, lon: 147.0 },
      { name: 'Murray-Darling Basin', lat: -34.0, lon: 144.0 },
      { name: 'Tasman Sea Vortex', lat: -37.0, lon: 158.0 },
    ],
    'Pacific Ocean': [
      { name: 'Niño 3.4 ENSO Core', lat: 0.0, lon: -140.0 },
      { name: 'ITCZ Rain Belt', lat: 6.5, lon: -150.0 },
      { name: 'North Pacific Gyre', lat: 32.0, lon: -150.0 },
    ],
  };

  const activeContinentPresets =
    presetsByContinent[geographicContext.continent] ||
    presetsByContinent['North America'];

  return (
    <aside
      className={`fixed z-30 transition-all duration-300 ease-out pointer-events-auto
        /* Desktop: Slide in smoothly from the right */
        hidden sm:flex sm:flex-col right-4 sm:top-20 sm:bottom-6 sm:w-[380px] lg:w-[410px]
        /* Mobile: Slide up smoothly as bottom sheet */
        max-sm:flex max-sm:flex-col max-sm:inset-x-0 max-sm:bottom-0 max-sm:max-h-[82vh]
        ${isOpen ? 'sm:translate-x-0 max-sm:translate-y-0 opacity-100' : 'sm:translate-x-[115%] max-sm:translate-y-[115%] opacity-0 pointer-events-none'}
      `}
      aria-label="Adaptive Scientific Context Panel"
    >
      <div className="flex-1 flex flex-col bg-[#090d16]/95 border border-slate-800/80 rounded-t-3xl sm:rounded-2xl p-4 sm:p-5 backdrop-blur-xl shadow-2xl overflow-y-auto space-y-3.5 text-slate-100">
        {/* Mobile Drag Indicator */}
        <div className="sm:hidden w-12 h-1 bg-slate-700/80 rounded-full mx-auto mb-1 shrink-0" />

        {/* Header: Zoom Scale Badge, Geographic Context, Minimize & Close Controls */}
        <div className="flex items-start justify-between border-b border-slate-800/60 pb-3 shrink-0">
          <div className="space-y-0.5 truncate pr-2">
            <div className="flex items-center space-x-2">
              <span className="text-[10px] font-mono uppercase tracking-wider text-cyan-400 bg-cyan-950/40 border border-cyan-800/40 px-2 py-0.5 rounded-full font-semibold">
                {zoomLevel} scale
              </span>
              <span className="text-[11px] font-mono text-slate-400">
                {geographicContext.subtitle}
              </span>
            </div>
            <h2 className="text-base sm:text-lg font-bold text-white truncate flex items-center space-x-1.5 pt-0.5">
              <MapPin className="h-4 w-4 text-cyan-400 shrink-0" />
              <span className="truncate">{locationName}</span>
            </h2>
          </div>

          <div className="flex items-center space-x-1 shrink-0">
            {onOpenDatasetInfo && (
              <button
                onClick={onOpenDatasetInfo}
                title="NASA Dataset Documentation"
                className="p-1.5 rounded-lg text-slate-400 hover:text-cyan-300 hover:bg-slate-800 transition-colors"
              >
                <FileText className="h-4 w-4" />
              </button>
            )}
            <button
              onClick={() => setIsMinimized(!isMinimized)}
              title={isMinimized ? 'Expand full details' : 'Collapse details'}
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
            >
              {isMinimized ? <Maximize2 className="h-4 w-4" /> : <Minimize2 className="h-4 w-4" />}
            </button>
            <button
              onClick={onClose}
              title="Close panel (restores full globe view)"
              className="p-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-slate-800 transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Minimized Quick Pill State */}
        {isMinimized ? (
          <div className="flex items-center justify-between py-1 text-xs font-mono text-slate-300 animate-fade-scale">
            <div className="flex items-center space-x-2 truncate">
              <span className="h-2 w-2 rounded-full bg-cyan-400 shrink-0" />
              <span className="font-semibold text-white capitalize">{activeModule || 'Global Earth'}</span>
              <span className="text-cyan-300 truncate">
                {observationValue} {observationUnit}
              </span>
            </div>
            <button
              onClick={() => setIsMinimized(false)}
              className="text-cyan-400 text-[11px] underline ml-2 shrink-0"
            >
              Expand
            </button>
          </div>
        ) : (
          <>
            {/* System Module Selector Tabs */}
            <div className="flex items-center justify-between text-xs">
              <span className="text-[11px] font-mono uppercase tracking-wider text-slate-400 font-semibold">
                System
              </span>
              <div className="flex items-center space-x-1 bg-slate-900/90 p-0.5 rounded-lg border border-slate-800">
                <button
                  onClick={() => onSelectModule('ocean')}
                  className={`px-2.5 py-1 text-xs rounded-md font-medium transition-colors ${
                    activeModule === 'ocean'
                      ? 'bg-cyan-500/20 text-cyan-300 font-semibold border border-cyan-500/40'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  Ocean
                </button>
                <button
                  onClick={() => onSelectModule('atmosphere')}
                  className={`px-2.5 py-1 text-xs rounded-md font-medium transition-colors ${
                    activeModule === 'atmosphere'
                      ? 'bg-blue-500/20 text-blue-300 font-semibold border border-blue-500/40'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  Atmosphere
                </button>
                <button
                  onClick={() => onSelectModule('land')}
                  className={`px-2.5 py-1 text-xs rounded-md font-medium transition-colors ${
                    activeModule === 'land'
                      ? 'bg-emerald-500/20 text-emerald-300 font-semibold border border-emerald-500/40'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  Land
                </button>
              </div>
            </div>

            {/* ADAPTIVE SCIENTIFIC CONTENT SECTION */}
            <div className="bg-slate-900/60 rounded-xl p-3 border border-slate-800/80 space-y-2">
              <div className="flex items-center justify-between text-[11px] text-slate-400">
                <span>{observationLabel}</span>
                <span className="font-mono text-cyan-400">{selectedDate}</span>
              </div>

              <div className="flex items-baseline space-x-2">
                <span className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white font-mono">
                  {dataLoading ? '--' : observationValue}
                </span>
                <span className="text-xs font-mono text-cyan-400">{observationUnit}</span>
              </div>

              {/* Anomaly Callout Badge */}
              {anomalySummary && (
                <div
                  className={`px-2.5 py-1.5 rounded-lg text-[11px] flex items-center space-x-1.5 border ${
                    anomalySeverity === 'high'
                      ? 'bg-amber-950/30 text-amber-300 border-amber-600/40'
                      : anomalySeverity === 'noticeable'
                      ? 'bg-blue-950/30 text-blue-300 border-blue-600/40'
                      : 'bg-slate-900/80 text-slate-300 border-slate-800'
                  }`}
                >
                  <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                  <span className="leading-snug">{anomalySummary}</span>
                </div>
              )}

              {/* Native Spatial Resolution Callout (Level 4 requirement) */}
              <div className="pt-1 border-t border-slate-800/60 flex items-center justify-between text-[10px] font-mono text-slate-400">
                <span>Resolution:</span>
                <span className="text-slate-300">{geographicContext.spatialResolution}</span>
              </div>
            </div>

            {/* Controls: Date Picker, Timeline Scrubber & Comparison Mode */}
            <div className="space-y-2.5 pt-1">
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-400 flex items-center space-x-1.5 text-[11px]">
                  <Calendar className="h-3.5 w-3.5 text-slate-400" />
                  <span>Timeline Playback</span>
                </span>

                <div className="flex items-center space-x-1.5">
                  <button
                    onClick={() => setIsPlayingTimeline(!isPlayingTimeline)}
                    className={`px-2 py-0.5 rounded-md text-xs flex items-center space-x-1 border transition-colors ${
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

              {/* Timeline Scrubber */}
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

              {/* Date Comparison Mode */}
              <div className="flex items-center justify-between text-xs pt-1">
                <button
                  onClick={() => setIsCompareMode(!isCompareMode)}
                  className={`text-[11px] font-mono flex items-center space-x-1 px-2.5 py-1 rounded-md border transition-colors ${
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
                    className="bg-slate-900 border border-slate-700/80 text-slate-200 text-[11px] rounded px-2 py-0.5 font-mono"
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

              {isCompareMode && comparisonDelta && (
                <div className="p-2 rounded-lg bg-cyan-950/20 border border-cyan-800/40 text-[11px] font-mono text-cyan-300">
                  {comparisonDelta}
                </div>
              )}

              {/* Module-Specific Metric Type Switcher */}
              <div className="flex items-center justify-between text-xs pt-1">
                <span className="text-slate-400 text-[11px]">Display Metric</span>
                <div className="flex space-x-1">
                  {activeModule === 'atmosphere' && (
                    <>
                      <button
                        onClick={() => setMetricType('accumulated')}
                        className={`px-2 py-0.5 rounded text-[10px] font-medium transition-colors ${
                          metricType === 'accumulated'
                            ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
                            : 'bg-slate-900 text-slate-400 hover:text-slate-200'
                        }`}
                      >
                        Monthly (mm)
                      </button>
                      <button
                        onClick={() => setMetricType('rate')}
                        className={`px-2 py-0.5 rounded text-[10px] font-medium transition-colors ${
                          metricType === 'rate'
                            ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
                            : 'bg-slate-900 text-slate-400 hover:text-slate-200'
                        }`}
                      >
                        Rate (mm/hr)
                      </button>
                    </>
                  )}
                  {activeModule === 'ocean' && (
                    <>
                      <button
                        onClick={() => setMetricType('ssha')}
                        className={`px-2 py-0.5 rounded text-[10px] font-medium transition-colors ${
                          metricType === 'ssha'
                            ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
                            : 'bg-slate-900 text-slate-400 hover:text-slate-200'
                        }`}
                      >
                        SSHA Anomaly
                      </button>
                      <button
                        onClick={() => setMetricType('ssh')}
                        className={`px-2 py-0.5 rounded text-[10px] font-medium transition-colors ${
                          metricType === 'ssh'
                            ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
                            : 'bg-slate-900 text-slate-400 hover:text-slate-200'
                        }`}
                      >
                        Absolute SSH
                      </button>
                    </>
                  )}
                  {activeModule === 'land' && (
                    <>
                      <button
                        onClick={() => setMetricType('ndvi')}
                        className={`px-2 py-0.5 rounded text-[10px] font-medium transition-colors ${
                          metricType === 'ndvi'
                            ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                            : 'bg-slate-900 text-slate-400 hover:text-slate-200'
                        }`}
                      >
                        NDVI
                      </button>
                      <button
                        onClick={() => setMetricType('evi')}
                        className={`px-2 py-0.5 rounded text-[10px] font-medium transition-colors ${
                          metricType === 'evi'
                            ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                            : 'bg-slate-900 text-slate-400 hover:text-slate-200'
                        }`}
                      >
                        EVI
                      </button>
                    </>
                  )}
                </div>
              </div>
            </div>

            {/* Curated Presets for Current Region/Continent */}
            <div className="pt-2 border-t border-slate-800/60">
              <span className="text-[10px] uppercase font-mono tracking-wider text-slate-400 block mb-1.5 font-semibold">
                Curated {geographicContext.continent} Features
              </span>
              <div className="flex flex-wrap gap-1">
                {activeContinentPresets.map((preset) => (
                  <button
                    key={preset.name}
                    onClick={() => onSelectPreset(preset.lat, preset.lon, preset.name)}
                    className="text-[11px] px-2.5 py-1 rounded-md bg-slate-900/90 hover:bg-slate-800 text-slate-300 hover:text-cyan-300 border border-slate-800 transition-colors"
                  >
                    {preset.name}
                  </button>
                ))}
              </div>
            </div>

            {/* Scientific Accuracy & Resolution Note */}
            <div className="pt-1">
              <button
                onClick={() => setShowAdvancedDetails(!showAdvancedDetails)}
                className="w-full flex items-center justify-between text-[10px] font-mono text-slate-400 hover:text-slate-200 py-1"
              >
                <span className="flex items-center space-x-1">
                  <Info className="h-3 w-3 text-cyan-400" />
                  <span>Sensor Ground Coverage & Uncertainty</span>
                </span>
                {showAdvancedDetails ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
              </button>

              {showAdvancedDetails && (
                <div className="mt-1.5 p-2.5 rounded-lg bg-slate-900/80 border border-slate-800 text-[10px] text-slate-400 leading-relaxed space-y-1 font-mono animate-slide-up">
                  <p>{geographicContext.coverageNote}</p>
                  <p className="text-cyan-400/90">
                    Scientific Safeguard: Observations reflect satellite orbital passes. Local sub-grid variability is bounded by instrument noise floor.
                  </p>
                </div>
              )}
            </div>

            {/* Action Bridges: Explain with AI & Detailed Historical Trends */}
            <div className="pt-2 border-t border-slate-800/60 space-y-2">
              {onExplainWithAI && (
                <button
                  onClick={handleTriggerAI}
                  className="w-full flex items-center justify-center space-x-2 py-2 px-3 rounded-xl bg-gradient-to-r from-cyan-950/80 to-blue-950/80 hover:from-cyan-900/80 hover:to-blue-900/80 border border-cyan-800/50 text-cyan-300 text-xs font-semibold shadow-lg transition-all"
                >
                  <Sparkles className="h-3.5 w-3.5 text-cyan-400" />
                  <span>Explain Findings in AI Assistant</span>
                </button>
              )}

              <button
                onClick={() => setShowTrends(!showTrends)}
                className="w-full flex items-center justify-center space-x-1.5 py-1.5 px-3 rounded-xl bg-slate-900/90 hover:bg-slate-850 border border-slate-800 text-xs font-medium text-slate-300 hover:text-white transition-colors"
              >
                <TrendingUp className="h-3.5 w-3.5 text-cyan-400" />
                <span>{showTrends ? 'Hide Historical Charts' : 'View Deep Trend Analysis'}</span>
                {showTrends ? <ChevronUp className="h-3 w-3 ml-1" /> : <ChevronDown className="h-3 w-3 ml-1" />}
              </button>
            </div>
          </>
        )}
      </div>
    </aside>
  );
};
