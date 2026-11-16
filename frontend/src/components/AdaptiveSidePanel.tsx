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
  Waves,
  CloudRain,
  Trees,
  CheckCircle2,
} from 'lucide-react';

export interface TimeseriesDataPoint {
  date: string;
  value: number;
}

interface AdaptiveSidePanelProps {
  activeModule: EarthModule;
  onSelectModule: (module: EarthModule) => void;
  selectedDate: string;
  setSelectedDate: React.Dispatch<React.SetStateAction<string>>;
  selectedFeature: GeoJSONFeature | null;
  timeseriesData?: TimeseriesDataPoint[] | null;
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
  onSelectModule: _onSelectModule,
  selectedDate,
  setSelectedDate,
  selectedFeature,
  timeseriesData = null,
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
  const [showSecondaryMetrics, setShowSecondaryMetrics] = useState(false);

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
  let hasObservation = false;
  let numericObsValue: number | undefined = undefined;

  // Sensor Provenance
  let systemName = 'Global Earth';
  let sensorTitle = 'Satellite Instrument';
  let systemIcon = <Info className="h-4 w-4 text-cyan-400" />;

  if (activeModule === 'ocean') {
    systemName = 'Ocean Altimetry';
    sensorTitle = 'Intended source: NASA SWOT KaRIn (Option A)';
    systemIcon = <Waves className="h-4 w-4 text-cyan-400" />;
    observationLabel = metricType === 'ssh' ? 'Sea Surface Height (Absolute)' : 'Sea Surface Height Anomaly (SSHA)';
    const sshaVal = selectedFeature?.properties.ssha_karin_m;
    const sshVal = selectedFeature?.properties.ssh_karin_m;
    numericObsValue = metricType === 'ssh' ? sshVal : sshaVal;
    observationUnit = 'meters (m)';

    if (numericObsValue !== undefined) {
      hasObservation = true;
      observationValue = `${numericObsValue > 0 && metricType !== 'ssh' ? '+' : ''}${numericObsValue}`;

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
    }
  } else if (activeModule === 'atmosphere') {
    systemName = 'Atmospheric Precipitation';
    sensorTitle = 'Intended source: NASA GPM IMERG Final';
    systemIcon = <CloudRain className="h-4 w-4 text-blue-400" />;
    const rateVal = selectedFeature?.properties.precipitation_rate_mm_hr;
    const accVal = selectedFeature?.properties.precipitation_accumulated_mm;
    const normalVal = selectedFeature?.properties.climatological_normal_mm;
    const anomalyVal = selectedFeature?.properties.anomaly_mm;

    if (metricType === 'rate') {
      observationLabel = 'Average Rainfall Rate';
      numericObsValue = rateVal;
      observationUnit = 'mm/hr';
    } else {
      observationLabel = 'Total Monthly Rain Depth';
      numericObsValue = accVal;
      observationUnit = 'mm';
    }

    if (numericObsValue !== undefined) {
      hasObservation = true;
      observationValue = `${numericObsValue}`;

      if (anomalyVal !== undefined && normalVal !== undefined) {
        const pct = Math.round((anomalyVal / Math.max(normalVal, 10)) * 100);
        if (anomalyVal > 50) {
          anomalySummary = `High Anomaly: +${anomalyVal}mm (+${pct}% above 1998–2020 normal)`;
          anomalySeverity = 'high';
        } else if (anomalyVal < -50) {
          anomalySummary = `Deficit: ${anomalyVal}mm (${pct}% below 1998–2020 normal)`;
          anomalySeverity = 'noticeable';
        } else {
          anomalySummary = `Within Normal Range (${anomalyVal > 0 ? '+' : ''}${anomalyVal}mm)`;
          anomalySeverity = 'normal';
        }
      }
    }
  } else if (activeModule === 'land') {
    systemName = 'Terrestrial Biosphere';
    sensorTitle = 'Intended source: NASA MODIS Terra/Aqua';
    systemIcon = <Trees className="h-4 w-4 text-emerald-400" />;
    const ndviVal = selectedFeature?.properties.ndvi;
    const eviVal = selectedFeature?.properties.evi;
    const vciVal = selectedFeature?.properties.vci_percent;
    const droughtCat = selectedFeature?.properties.drought_category;

    observationLabel = metricType === 'evi' ? 'Enhanced Vegetation Index (EVI)' : 'Normalized Difference Veg Index (NDVI)';
    numericObsValue = metricType === 'evi' ? eviVal : ndviVal;
    observationUnit = 'index ratio (0 to 1)';

    if (numericObsValue !== undefined) {
      hasObservation = true;
      observationValue = `${numericObsValue}`;

      if (vciVal !== undefined) {
        anomalySummary = `VCI ${vciVal}% • ${droughtCat || 'Normal Vegetation'}`;
        anomalySeverity = vciVal < 30 ? 'high' : vciVal > 75 ? 'noticeable' : 'normal';
      }
    }
  }

  // Calculate actual period-to-period delta from real historical measurements
  let comparisonDelta = '';
  if (isCompareMode) {
    if (!hasObservation || numericObsValue === undefined) {
      comparisonDelta = `Comparison unavailable: location outside satellite swath for ${selectedDate}`;
    } else if (timeseriesData && timeseriesData.length > 0) {
      const matchHistorical = timeseriesData.find((p) => p.date === compareDate);
      if (matchHistorical !== undefined && typeof matchHistorical.value === 'number') {
        const delta = Math.round((numericObsValue - matchHistorical.value) * 100) / 100;
        const unitSymbol = activeModule === 'ocean' ? 'm' : activeModule === 'atmosphere' ? (metricType === 'rate' ? 'mm/hr' : 'mm') : '';
        comparisonDelta = `Δ vs ${compareDate}: ${delta > 0 ? '+' : ''}${delta} ${unitSymbol} (Historical baseline: ${matchHistorical.value})`;
      } else {
        comparisonDelta = `No validated historical pass data at this coordinate for ${compareDate}`;
      }
    } else {
      comparisonDelta = `Historical timeseries records loading...`;
    }
  }

  const handleTriggerAI = () => {
    if (!onExplainWithAI) return;
    const prompt = `Please provide a scientific analysis of ${locationName} (${geographicContext.subtitle}) in the ${activeModule?.toUpperCase()} system during ${selectedDate}. Current ${observationLabel} is ${observationValue} ${observationUnit}. What are the primary planetary driving mechanisms and climate implications?`;
    onExplainWithAI(prompt);
  };

  // Curated presets for continents
  const presetsByContinent: Record<string, Array<{ name: string; lat: number; lon: number }>> = {
    'North America': [
      { name: 'Gulf Stream Meander', lat: 36.0, lon: -68.0 },
      { name: 'US Corn Belt', lat: 41.5, lon: -93.5 },
      { name: 'Caribbean Basin', lat: 15.0, lon: -75.0 },
      { name: 'California Upwelling', lat: 35.0, lon: -123.0 },
    ],
    'South America': [
      { name: 'Amazon Basin Convection', lat: -3.5, lon: -62.0 },
      { name: 'Humboldt Cold Current', lat: -12.0, lon: -78.0 },
      { name: 'Pampas Cropland', lat: -35.0, lon: -60.0 },
    ],
    'Europe': [
      { name: 'North Atlantic Drift', lat: 55.0, lon: -20.0 },
      { name: 'Mediterranean Sea', lat: 35.0, lon: 18.0 },
      { name: 'Central European Plains', lat: 51.0, lon: 10.0 },
    ],
    'Africa': [
      { name: 'Sahel Savanna Belt', lat: 14.5, lon: 2.0 },
      { name: 'Congo Rain Basin', lat: 0.5, lon: 23.5 },
      { name: 'Agulhas Retroflection', lat: -38.0, lon: 20.0 },
    ],
    'Asia': [
      { name: 'Bay of Bengal Monsoon', lat: 21.0, lon: 88.5 },
      { name: 'Kuroshio Extension Current', lat: 35.0, lon: 143.0 },
      { name: 'Siberian Taiga Forest', lat: 62.0, lon: 129.0 },
      { name: 'Kerala Malabar Coast', lat: 10.85, lon: 76.27 },
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
    <>
      {/* Mobile Backdrop Scrim */}
      {isOpen && (
        <div
          onClick={onClose}
          className="fixed inset-0 bg-black/60 backdrop-blur-xs z-35 lg:hidden pointer-events-auto"
          aria-hidden="true"
        />
      )}

      {/* Docked Desktop Sidebar / Slide-Over Tablet Drawer / Bottom Sheet Mobile Drawer */}
      <aside
        className={`fixed inset-x-0 bottom-0 top-auto rounded-t-3xl max-h-[82dvh] border-t border-slate-800/80 border-l-0 z-40 sm:inset-y-0 sm:right-0 sm:left-auto sm:top-0 sm:rounded-none sm:border-l sm:border-t-0 sm:max-h-none sm:w-[380px] lg:static lg:w-[390px] lg:z-20 flex flex-col shrink-0 bg-[#080c16]/98 backdrop-blur-2xl shadow-2xl transition-transform duration-300 ease-in-out pointer-events-auto overflow-hidden ${
          isOpen ? 'translate-y-0 sm:translate-x-0' : 'translate-y-full sm:translate-x-full lg:hidden'
        }`}
        aria-label="Adaptive Scientific Context Panel"
      >
        {/* Mobile Swipe / Drag Pill Handle */}
        <div className="w-12 h-1 rounded-full bg-slate-700/80 mx-auto my-2 sm:hidden shrink-0" />

        {/* ================= 1. HEADER: LOCATION & SCALE ================= */}
        <div className="p-3.5 sm:p-4 border-b border-slate-800/80 bg-[#0a0f1c]/90 shrink-0">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <div className="flex items-center space-x-2 mb-1">
                <span className="text-[10px] font-mono uppercase tracking-wider text-cyan-400 bg-cyan-950/60 border border-cyan-800/50 px-2 py-0.5 rounded-full font-semibold">
                  {zoomLevel} scale
                </span>
                <span className="text-[11px] font-mono text-slate-400 truncate">
                  {geographicContext.subtitle}
                </span>
              </div>
              <h2
                className="text-base sm:text-lg font-bold text-white break-words line-clamp-2 leading-snug flex items-start space-x-1.5"
                title={locationName}
              >
                <MapPin className="h-4 w-4 text-cyan-400 shrink-0 mt-0.5" />
                <span>{locationName}</span>
              </h2>
            </div>

            {/* Header Actions */}
            <div className="flex items-center space-x-1 shrink-0 pt-0.5">
              {onOpenDatasetInfo && (
                <button
                  onClick={onOpenDatasetInfo}
                  title="NASA Dataset Documentation"
                  className="min-h-[36px] min-w-[36px] flex items-center justify-center rounded-lg text-slate-400 hover:text-cyan-300 hover:bg-slate-800 transition-colors"
                >
                  <FileText className="h-4 w-4" />
                </button>
              )}
              <button
                onClick={() => setIsMinimized(!isMinimized)}
                title={isMinimized ? 'Expand full details' : 'Collapse panel'}
                className="min-h-[36px] min-w-[36px] flex items-center justify-center rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
              >
                {isMinimized ? <Maximize2 className="h-4 w-4" /> : <Minimize2 className="h-4 w-4" />}
              </button>
              <button
                onClick={onClose}
                title="Close context panel"
                className="min-h-[36px] min-w-[36px] flex items-center justify-center rounded-lg text-slate-400 hover:text-rose-400 hover:bg-slate-800 transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>

        {/* Minimized Viewport Pill */}
        {isMinimized ? (
          <div className="p-4 flex items-center justify-between text-xs font-mono text-slate-300 bg-[#070a12]/80">
            <div className="flex items-center space-x-2 truncate">
              <span className="h-2 w-2 rounded-full bg-cyan-400 shrink-0" />
              <span className="font-semibold text-white capitalize">{activeModule || 'Global Earth'}</span>
              <span className="text-cyan-300 truncate">
                {hasObservation ? `${observationValue} ${observationUnit}` : 'No Pass Data'}
              </span>
            </div>
            <button
              onClick={() => setIsMinimized(false)}
              className="text-cyan-400 text-xs font-semibold hover:underline ml-2 shrink-0"
            >
              Expand Details
            </button>
          </div>
        ) : (
          /* Scrollable Content Body */
          <div
            className="flex-1 overflow-y-auto p-4 space-y-4 text-slate-100 touch-pan-y"
            style={{ touchAction: 'pan-y' }}
          >
            {/* ================= 2. ACTIVE SCIENTIFIC SYSTEM & SENSOR ================= */}
            <div className="flex items-center justify-between p-2.5 rounded-xl bg-slate-900/60 border border-slate-800/80">
              <div className="flex items-center space-x-2">
                <div className="p-1.5 rounded-lg bg-slate-800/80 border border-slate-700/60">
                  {systemIcon}
                </div>
                <div>
                  <div className="text-xs font-semibold text-white">{systemName}</div>
                  <div className="text-[10px] font-mono text-slate-400 truncate max-w-[200px]" title={sensorTitle}>
                    {sensorTitle}
                  </div>
                </div>
              </div>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-md bg-slate-800 text-cyan-300 border border-slate-700">
                Modelled demo
              </span>
            </div>

            {/* ================= 3. PRIMARY OBSERVATION VALUE & STATUS ================= */}
            <div className="p-3.5 rounded-xl bg-slate-900/80 border border-slate-800/90 space-y-2.5">
              <div className="flex items-center justify-between text-xs text-slate-400">
                <span className="font-medium text-slate-300">{observationLabel}</span>
                <span className="font-mono text-cyan-400 text-[11px] bg-cyan-950/40 px-2 py-0.5 rounded-md border border-cyan-900/40">
                  {selectedDate}
                </span>
              </div>

              {hasObservation ? (
                <>
                  <div className="flex items-baseline space-x-2 pt-0.5">
                    <span className="text-3xl font-extrabold tracking-tight text-white font-mono">
                      {dataLoading ? '--' : observationValue}
                    </span>
                    <span className="text-xs font-mono text-cyan-400 font-semibold">{observationUnit}</span>
                  </div>

                  {/* Anomaly Callout Badge */}
                  {anomalySummary && (
                    <div
                      className={`px-3 py-2 rounded-lg text-xs flex items-center space-x-2 border ${
                        anomalySeverity === 'high'
                          ? 'bg-amber-950/40 text-amber-200 border-amber-600/50'
                          : anomalySeverity === 'noticeable'
                          ? 'bg-blue-950/40 text-blue-200 border-blue-600/50'
                          : 'bg-slate-900/90 text-slate-200 border-slate-800'
                      }`}
                    >
                      <AlertCircle className="h-4 w-4 shrink-0" />
                      <span className="leading-snug font-medium">{anomalySummary}</span>
                    </div>
                  )}
                </>
              ) : (
                <div className="py-2 space-y-1">
                  <div className="text-sm font-semibold text-slate-300 font-mono flex items-center space-x-2">
                    <span className="h-2 w-2 rounded-full bg-slate-500" />
                    <span>No demo value at this location</span>
                  </div>
                  <p className="text-xs text-slate-400 leading-relaxed font-sans">
                    No modelled value is available at this coordinate for {selectedDate}. Select an illuminated example point on the globe or choose another date.
                  </p>
                </div>
              )}

              {/* Spatial Resolution */}
              <div className="pt-2 border-t border-slate-800/60 flex items-center justify-between text-[11px] font-mono text-slate-400">
                <span>Spatial Resolution:</span>
                <span className="text-slate-200 font-medium">{geographicContext.spatialResolution}</span>
              </div>
            </div>

            {/* ================= 4. OBSERVATION DATE & TIMELINE PLAYBACK ================= */}
            <div className="p-3.5 rounded-xl bg-slate-900/60 border border-slate-800/80 space-y-3">
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-300 font-medium flex items-center space-x-1.5">
                  <Calendar className="h-3.5 w-3.5 text-cyan-400" />
                  <span>Timeline Playback</span>
                </span>

                <div className="flex items-center space-x-2">
                  <button
                    onClick={() => setIsPlayingTimeline(!isPlayingTimeline)}
                    className={`px-2.5 py-1 rounded-md text-xs flex items-center space-x-1.5 border transition-all ${
                      isPlayingTimeline
                        ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/50 shadow-sm'
                        : 'bg-slate-900 text-slate-300 border-slate-700 hover:text-white hover:bg-slate-800'
                    }`}
                    title={isPlayingTimeline ? 'Pause Timeline' : 'Play Timeline Progression'}
                  >
                    {isPlayingTimeline ? <Pause className="h-3 w-3" /> : <Play className="h-3 w-3" />}
                    <span className="text-[10px] font-mono font-semibold">{isPlayingTimeline ? 'Pause' : 'Play'}</span>
                  </button>

                  <select
                    value={selectedDate}
                    onChange={(e) => setSelectedDate(e.target.value)}
                    className="bg-slate-900 border border-slate-700 text-slate-200 text-xs rounded-lg px-2.5 py-1 font-mono focus:outline-hidden focus:border-cyan-500 cursor-pointer"
                  >
                    {dates.map((d) => (
                      <option key={d} value={d}>
                        {d}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Range Scrubber */}
              <div className="space-y-1.5">
                <input
                  type="range"
                  min={0}
                  max={dates.length - 1}
                  value={dates.indexOf(selectedDate) >= 0 ? dates.indexOf(selectedDate) : 0}
                  onChange={(e) => setSelectedDate(dates[parseInt(e.target.value, 10)])}
                  className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-cyan-400"
                />
                <div className="flex justify-between text-[10px] font-mono text-slate-400">
                  <span>2024-01</span>
                  <span>2025-04</span>
                  <span>2026-09</span>
                </div>
              </div>
            </div>

            {/* ================= 5. DATA AVAILABILITY & QUALITY INDICATOR ================= */}
            <div className="px-3.5 py-2.5 rounded-xl bg-slate-900/40 border border-slate-800/80 flex items-center justify-between text-xs">
              <div className="flex items-center space-x-2">
                {hasObservation ? (
                  <>
                    <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
                    <span className="text-slate-300 font-medium">Modelled value available</span>
                  </>
                ) : (
                  <>
                    <AlertCircle className="h-4 w-4 text-slate-400 shrink-0" />
                    <span className="text-slate-400">No modelled value</span>
                  </>
                )}
              </div>
              <span className="text-[10px] font-mono text-slate-400">
                {hasObservation ? 'Example value' : 'No example value'}
              </span>
            </div>

            {/* ================= 6. TIMELINE COMPARISON TOOL ================= */}
            <div className="p-3.5 rounded-xl bg-slate-900/60 border border-slate-800/80 space-y-2.5">
              <div className="flex items-center justify-between text-xs">
                <button
                  onClick={() => setIsCompareMode(!isCompareMode)}
                  className={`text-xs font-mono flex items-center space-x-1.5 px-3 py-1 rounded-md border transition-all ${
                    isCompareMode
                      ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/50 shadow-sm font-semibold'
                      : 'bg-slate-900/80 text-slate-400 border-slate-800 hover:text-slate-200'
                  }`}
                >
                  <GitCompare className="h-3.5 w-3.5" />
                  <span>Compare Periods</span>
                </button>

                {isCompareMode && (
                  <select
                    value={compareDate}
                    onChange={(e) => setCompareDate(e.target.value)}
                    className="bg-slate-900 border border-slate-700 text-slate-200 text-xs rounded-lg px-2.5 py-1 font-mono"
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
                <div className="p-2.5 rounded-lg bg-cyan-950/30 border border-cyan-800/50 text-xs font-mono text-cyan-300 leading-snug">
                  {comparisonDelta}
                </div>
              )}
            </div>

            {/* ================= 7. METRIC SWITCHER & SECONDARY METRICS ================= */}
            <div className="p-3.5 rounded-xl bg-slate-900/60 border border-slate-800/80 space-y-2.5">
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-300 font-medium">Display Metric</span>
                <div className="flex space-x-1">
                  {activeModule === 'atmosphere' && (
                    <>
                      <button
                        onClick={() => setMetricType('accumulated')}
                        className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-all ${
                          metricType === 'accumulated'
                            ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 font-semibold'
                            : 'bg-slate-900 text-slate-400 hover:text-slate-200 border border-transparent'
                        }`}
                      >
                        Monthly (mm)
                      </button>
                      <button
                        onClick={() => setMetricType('rate')}
                        className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-all ${
                          metricType === 'rate'
                            ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 font-semibold'
                            : 'bg-slate-900 text-slate-400 hover:text-slate-200 border border-transparent'
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
                        className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-all ${
                          metricType === 'ssha'
                            ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 font-semibold'
                            : 'bg-slate-900 text-slate-400 hover:text-slate-200 border border-transparent'
                        }`}
                      >
                        SSHA Anomaly
                      </button>
                      <button
                        onClick={() => setMetricType('ssh')}
                        className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-all ${
                          metricType === 'ssh'
                            ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 font-semibold'
                            : 'bg-slate-900 text-slate-400 hover:text-slate-200 border border-transparent'
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
                        className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-all ${
                          metricType === 'ndvi'
                            ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 font-semibold'
                            : 'bg-slate-900 text-slate-400 hover:text-slate-200 border border-transparent'
                        }`}
                      >
                        NDVI
                      </button>
                      <button
                        onClick={() => setMetricType('evi')}
                        className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-all ${
                          metricType === 'evi'
                            ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 font-semibold'
                            : 'bg-slate-900 text-slate-400 hover:text-slate-200 border border-transparent'
                        }`}
                      >
                        EVI
                      </button>
                    </>
                  )}
                </div>
              </div>

              {/* Collapsible Secondary Metrics Accordion */}
              <button
                onClick={() => setShowSecondaryMetrics(!showSecondaryMetrics)}
                className="w-full flex items-center justify-between text-[11px] font-mono text-slate-400 hover:text-slate-200 pt-1"
              >
                <span>Secondary Physical Parameters</span>
                {showSecondaryMetrics ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
              </button>

              {showSecondaryMetrics && (
                <div className="pt-2 border-t border-slate-800/60 space-y-1.5 text-[11px] font-mono text-slate-400 animate-slide-up">
                  {activeModule === 'ocean' && (
                    <>
                      <div className="flex justify-between">
                        <span>Eddy Kinetic Energy:</span>
                        <span className="text-white">
                          {selectedFeature?.properties.eddy_kinetic_energy_cm2_s2 ?? '485.2'} cm²/s²
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span>Geostrophic Velocity u/v:</span>
                        <span className="text-white">±0.45 m/s</span>
                      </div>
                    </>
                  )}
                  {activeModule === 'atmosphere' && (
                    <>
                      <div className="flex justify-between">
                        <span>Climatological Normal:</span>
                        <span className="text-white">
                          {selectedFeature?.properties.climatological_normal_mm ?? '142.0'} mm
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span>Monthly Anomaly Delta:</span>
                        <span className="text-cyan-300">
                          {selectedFeature?.properties.anomaly_mm ? `${selectedFeature.properties.anomaly_mm > 0 ? '+' : ''}${selectedFeature.properties.anomaly_mm} mm` : '0.0 mm'}
                        </span>
                      </div>
                    </>
                  )}
                  {activeModule === 'land' && (
                    <>
                      <div className="flex justify-between">
                        <span>Historical Median NDVI:</span>
                        <span className="text-white">
                          {selectedFeature?.properties.historical_ndvi_median ?? '0.68'}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span>Vegetation Condition (VCI):</span>
                        <span className="text-emerald-300">
                          {selectedFeature?.properties.vci_percent ? `${selectedFeature.properties.vci_percent}%` : '58%'}
                        </span>
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>

            {/* ================= 8. CURATED REGIONAL FEATURES ================= */}
            <div className="p-3.5 rounded-xl bg-slate-900/60 border border-slate-800/80 space-y-2">
              <span className="text-[10px] uppercase font-mono tracking-wider text-slate-400 block font-semibold">
                Curated {geographicContext.continent} Features
              </span>
              <div className="flex flex-wrap gap-1.5">
                {activeContinentPresets.map((preset) => (
                  <button
                    key={preset.name}
                    onClick={() => onSelectPreset(preset.lat, preset.lon, preset.name)}
                    className="text-xs px-2.5 py-1 rounded-lg bg-slate-900/90 hover:bg-slate-800 text-slate-300 hover:text-cyan-300 border border-slate-800 hover:border-slate-700 transition-colors"
                  >
                    {preset.name}
                  </button>
                ))}
              </div>
            </div>

            {/* ================= 9. SENSOR COVERAGE & UNCERTAINTY ================= */}
            <div className="p-3 rounded-xl bg-slate-900/40 border border-slate-800/60">
              <button
                onClick={() => setShowAdvancedDetails(!showAdvancedDetails)}
                className="w-full flex items-center justify-between text-[11px] font-mono text-slate-400 hover:text-slate-200"
              >
                <span className="flex items-center space-x-1.5">
                  <Info className="h-3.5 w-3.5 text-cyan-400" />
                  <span>Dataset Context & Limitations</span>
                </span>
                {showAdvancedDetails ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
              </button>

              {showAdvancedDetails && (
                <div className="mt-2 p-2.5 rounded-lg bg-slate-900/80 border border-slate-800 text-[11px] text-slate-400 leading-relaxed space-y-1.5 font-mono animate-slide-up">
                  <p>{geographicContext.coverageNote}</p>
                  <p className="text-cyan-400/90">
                    Product limitations describe the intended satellite dataset. This demonstration does not simulate QA flags, orbital coverage, or instrument uncertainty.
                  </p>
                </div>
              )}
            </div>

            {/* ================= 10 & 11. AI ACTION & TRENDS BRIDGES ================= */}
            <div className="space-y-2 pt-1 pb-2">
              {onExplainWithAI && (
                <button
                  onClick={handleTriggerAI}
                  className="w-full flex items-center justify-center space-x-2 py-2.5 px-3 rounded-xl bg-gradient-to-r from-cyan-950/80 to-blue-950/80 hover:from-cyan-900/80 hover:to-blue-900/80 border border-cyan-800/60 text-cyan-300 text-xs font-semibold shadow-lg hover:shadow-cyan-500/10 transition-all cursor-pointer"
                >
                  <Sparkles className="h-4 w-4 text-cyan-400" />
                  <span>Explain Findings with AI Assistant</span>
                </button>
              )}

              <button
                onClick={() => setShowTrends(!showTrends)}
                className="w-full flex items-center justify-center space-x-2 py-2 px-3 rounded-xl bg-slate-900/90 hover:bg-slate-800 border border-slate-800 text-xs font-medium text-slate-300 hover:text-white transition-all cursor-pointer"
              >
                <TrendingUp className="h-3.5 w-3.5 text-cyan-400" />
                <span>{showTrends ? 'Hide Historical Charts' : 'View Deep Trend Analysis'}</span>
                {showTrends ? <ChevronUp className="h-3.5 w-3.5 ml-1" /> : <ChevronDown className="h-3.5 w-3.5 ml-1" />}
              </button>
            </div>
          </div>
        )}
      </aside>
    </>
  );
};

export default AdaptiveSidePanel;
