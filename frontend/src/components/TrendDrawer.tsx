import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  CartesianGrid,
  ReferenceLine,
} from 'recharts';
import {
  AtmosphereTimeSeriesResponse,
  OceanTimeSeriesResponse,
  LandTimeSeriesResponse,
  CrossSystemResponse,
  PeriodComparisonResponse,
  fetchPeriodComparison,
} from '../services/api';
import { EarthModule } from './EarthGlobe';
import {
  AlertTriangle,
  TrendingUp,
  Info,
  Maximize2,
  Minimize2,
  X,
  ChevronUp,
  RefreshCw,
  AlertCircle,
  HelpCircle,
  Waves,
  CloudRain,
  Trees,
  ArrowRightLeft,
  Calendar,
  Compass,
  CheckCircle2,
} from 'lucide-react';
import { TIMELINE_MONTHS } from './SharedTimeline';

export type TrendDrawerStatus =
  | 'idle'
  | 'loading'
  | 'success'
  | 'no_data'
  | 'backend_unavailable'
  | 'error';

interface TrendDrawerProps {
  activeModule: EarthModule;
  activeModules?: ('ocean' | 'atmosphere' | 'land')[];
  onToggleModule?: (module: 'ocean' | 'atmosphere' | 'land') => void;
  atmosphereData: AtmosphereTimeSeriesResponse | null;
  oceanData: OceanTimeSeriesResponse | null;
  landData: LandTimeSeriesResponse | null;
  crossSystemData: CrossSystemResponse | null;
  loading: boolean;
  status?: TrendDrawerStatus;
  errorMessage?: string | null;
  selectedLocationName?: string | null;
  activeLocationCoords?: { lat: number; lon: number };
  selectedDate?: string;
  onRetry?: () => void;
  isOpen: boolean;
  onClose: () => void;
  onToggleOpen: () => void;
  isExpanded?: boolean;
  onToggleExpand?: () => void;
  sidePanelOpen?: boolean;
  initialTab?: 'trends' | 'comparison' | 'teleconnections';
}

export const TrendDrawer: React.FC<TrendDrawerProps> = ({
  activeModule,
  activeModules = [],
  onToggleModule,
  atmosphereData,
  oceanData,
  landData,
  crossSystemData,
  loading,
  status = 'idle',
  errorMessage = null,
  selectedLocationName = null,
  activeLocationCoords = { lat: 0, lon: 0 },
  selectedDate = '2026-03',
  onRetry,
  isOpen,
  onClose,
  onToggleOpen,
  isExpanded = false,
  onToggleExpand,
  sidePanelOpen = false,
  initialTab = 'trends',
}) => {
  const [activeTab, setActiveTab] = useState<'trends' | 'comparison' | 'teleconnections'>(initialTab);

  // Period Comparison states
  const [periodA, setPeriodA] = useState<string>('2024-03');
  const [periodB, setPeriodB] = useState<string>('2026-03');
  const [comparisonModule, setComparisonModule] = useState<'ocean' | 'atmosphere' | 'land'>(
    (activeModule as any) || 'atmosphere'
  );
  const [comparisonData, setComparisonData] = useState<PeriodComparisonResponse | null>(null);
  const [comparisonLoading, setComparisonLoading] = useState<boolean>(false);
  const [comparisonError, setComparisonError] = useState<string | null>(null);
  const comparisonAbortRef = useRef<AbortController | null>(null);

  // Synchronize comparison module if activeModule changes
  useEffect(() => {
    if (activeModule && (activeModule === 'ocean' || activeModule === 'atmosphere' || activeModule === 'land')) {
      setComparisonModule(activeModule);
    }
  }, [activeModule]);

  // Synchronize tab if initialTab changes
  useEffect(() => {
    if (initialTab) {
      setActiveTab(initialTab);
    }
  }, [initialTab]);

  // Fetch period comparison data when tab, periods, coordinates or comparisonModule change
  useEffect(() => {
    if (activeTab !== 'comparison') return;

    if (comparisonAbortRef.current) {
      comparisonAbortRef.current.abort();
    }
    const controller = new AbortController();
    comparisonAbortRef.current = controller;

    setComparisonLoading(true);
    setComparisonError(null);

    fetchPeriodComparison(
      comparisonModule,
      periodA,
      periodB,
      activeLocationCoords.lat,
      activeLocationCoords.lon,
      controller.signal
    )
      .then((res) => {
        setComparisonData(res);
        setComparisonLoading(false);
      })
      .catch((err) => {
        if (err.name === 'AbortError') return;
        setComparisonError(err.message || 'Failed to calculate historical period comparison');
        setComparisonLoading(false);
      });

    return () => {
      controller.abort();
    };
  }, [activeTab, comparisonModule, periodA, periodB, activeLocationCoords.lat, activeLocationCoords.lon]);

  // Determine which systems are currently active
  const effectiveModules = useMemo(() => {
    if (activeModules.length > 0) return activeModules;
    if (activeModule) return [activeModule];
    return ['atmosphere' as const];
  }, [activeModules, activeModule]);

  // If drawer is closed, show a minimal, elegant peek pill at the bottom center
  if (!isOpen) {
    return (
      <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-25 pointer-events-auto">
        <button
          onClick={onToggleOpen}
          className="flex items-center space-x-2 px-4 py-2 rounded-full bg-[#080c16]/95 hover:bg-slate-800 border border-slate-700/80 hover:border-cyan-500/50 text-xs font-semibold text-cyan-300 shadow-2xl backdrop-blur-md transition-all group"
          title="Open Historical Trends & Planetary Teleconnection Analysis"
        >
          <TrendingUp className="h-4 w-4 text-cyan-400 group-hover:scale-110 transition-transform" />
          <span>Historical Trends (2024–2026)</span>
          <ChevronUp className="h-3.5 w-3.5 text-slate-400 group-hover:text-cyan-300 transition-colors" />
        </button>
      </div>
    );
  }

  return (
    <aside
      className={`fixed bottom-0 left-0 z-25 bg-[#080c16]/98 border-t border-slate-800/90 shadow-2xl backdrop-blur-2xl transition-all duration-300 ease-in-out flex flex-col pointer-events-auto ${
        sidePanelOpen ? 'right-0 lg:right-[390px]' : 'right-0'
      } ${isExpanded ? 'h-[580px] max-h-[88dvh]' : 'h-80 sm:h-96 max-h-[60dvh]'}`}
      aria-label="Unified Earth System Time & Trends Workspace"
    >
      {/* Drawer Top Header Bar */}
      <div className="h-12 px-3 sm:px-4 border-b border-slate-800/80 bg-[#0a0f1c]/95 flex items-center justify-between shrink-0 gap-2">
        {/* Left: Title & Mode Tabs */}
        <div className="flex items-center space-x-2 sm:space-x-3 min-w-0">
          <div className="flex items-center space-x-1.5 shrink-0">
            <TrendingUp className="h-4 w-4 text-cyan-400" />
            <h3 className="text-xs sm:text-sm font-bold text-white truncate hidden md:inline">
              Time & Trends Workspace
            </h3>
          </div>

          {/* Navigation Tabs */}
          <div className="flex bg-slate-900/90 p-0.5 rounded-lg border border-slate-800 text-[11px] font-medium shrink-0">
            <button
              onClick={() => setActiveTab('trends')}
              className={`px-2 sm:px-2.5 py-1 rounded-md transition-all cursor-pointer ${
                activeTab === 'trends'
                  ? 'bg-cyan-500/20 text-cyan-300 font-semibold shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <span className="hidden sm:inline">Synchronized </span>Trends
            </button>
            <button
              onClick={() => setActiveTab('comparison')}
              className={`px-2 sm:px-2.5 py-1 rounded-md transition-all flex items-center space-x-1 cursor-pointer ${
                activeTab === 'comparison'
                  ? 'bg-cyan-500/20 text-cyan-300 font-semibold shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <ArrowRightLeft className="h-3 w-3 shrink-0" />
              <span className="hidden sm:inline">Compare Periods (A vs B)</span>
              <span className="sm:hidden">Compare</span>
            </button>
            <button
              onClick={() => setActiveTab('teleconnections')}
              className={`px-2 sm:px-2.5 py-1 rounded-md transition-all cursor-pointer ${
                activeTab === 'teleconnections'
                  ? 'bg-cyan-500/20 text-cyan-300 font-semibold shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <span className="hidden sm:inline">Coupled </span>Teleconnections
            </button>
          </div>
        </div>

        {/* Center / Right: Multi-System Toggles & Controls */}
        <div className="flex items-center space-x-2 shrink-0">
          {/* Multi-System Active Indicator / Quick Toggles */}
          {onToggleModule && (
            <div className="hidden lg:flex items-center space-x-1 bg-slate-900/80 p-0.5 rounded-lg border border-slate-800 text-[10px]">
              <button
                onClick={() => onToggleModule('ocean')}
                className={`px-2 py-0.5 rounded flex items-center space-x-1 transition-all ${
                  effectiveModules.includes('ocean')
                    ? 'bg-cyan-950 text-cyan-300 border border-cyan-700/60 font-semibold'
                    : 'text-slate-400 hover:text-slate-300'
                }`}
                title="Toggle Ocean (SWOT Altimetry) in Trends & Visualization"
              >
                <Waves className="h-3 w-3" />
                <span>Ocean</span>
              </button>
              <button
                onClick={() => onToggleModule('atmosphere')}
                className={`px-2 py-0.5 rounded flex items-center space-x-1 transition-all ${
                  effectiveModules.includes('atmosphere')
                    ? 'bg-blue-950 text-blue-300 border border-blue-700/60 font-semibold'
                    : 'text-slate-400 hover:text-slate-300'
                }`}
                title="Toggle Atmosphere (GPM IMERG Rain) in Trends & Visualization"
              >
                <CloudRain className="h-3 w-3" />
                <span>Atmosphere</span>
              </button>
              <button
                onClick={() => onToggleModule('land')}
                className={`px-2 py-0.5 rounded flex items-center space-x-1 transition-all ${
                  effectiveModules.includes('land')
                    ? 'bg-emerald-950 text-emerald-300 border border-emerald-700/60 font-semibold'
                    : 'text-slate-400 hover:text-slate-300'
                }`}
                title="Toggle Land (MODIS NDVI) in Trends & Visualization"
              >
                <Trees className="h-3 w-3" />
                <span>Land</span>
              </button>
            </div>
          )}

          {onToggleExpand && (
            <button
              onClick={onToggleExpand}
              title={isExpanded ? 'Restore normal drawer height' : 'Maximize drawer height'}
              aria-label={isExpanded ? 'Restore normal drawer height' : 'Maximize drawer height'}
              className="min-h-[36px] min-w-[36px] flex items-center justify-center p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors focus-visible:ring-2 focus-visible:ring-cyan-400 focus-visible:outline-none"
            >
              {isExpanded ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
            </button>
          )}

          <button
            onClick={onClose}
            title="Close trends drawer"
            aria-label="Close trends workspace drawer"
            className="min-h-[36px] min-w-[36px] flex items-center justify-center p-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-slate-800 transition-colors focus-visible:ring-2 focus-visible:ring-cyan-400 focus-visible:outline-none"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Drawer Body */}
      <div
        className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4 touch-pan-y"
        style={{ touchAction: 'pan-y' }}
      >
        {/* ================= TAB 1: SYNCHRONIZED HISTORICAL TRENDS ================= */}
        {activeTab === 'trends' && (
          <div className="space-y-4">
            {/* Active Loading */}
            {(loading || status === 'loading') && (
              <div className="h-56 flex flex-col items-center justify-center space-y-3 bg-slate-900/30 rounded-2xl border border-slate-800/60 p-6">
                <div className="flex items-center space-x-2 text-xs font-mono text-cyan-400">
                  <div className="h-5 w-5 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin" />
                  <span>Loading satellite observation time series...</span>
                </div>
                {selectedLocationName && (
                  <span className="text-[11px] font-mono text-slate-400">
                    Observation Coordinates: <strong className="text-white">{selectedLocationName}</strong>
                  </span>
                )}
              </div>
            )}

            {/* Error / Backend Unavailable */}
            {!loading && status === 'backend_unavailable' && (
              <div className="p-5 rounded-2xl bg-amber-950/30 border border-amber-600/50 space-y-3">
                <div className="flex items-center space-x-2 text-amber-400 font-semibold text-xs sm:text-sm">
                  <AlertTriangle className="h-4 w-4 shrink-0" />
                  <span>Scientific Backend Unavailable</span>
                </div>
                <p className="text-xs text-amber-200/90 leading-relaxed font-sans">
                  {errorMessage || 'Could not connect to the scientific API backend. Ensure the backend server is running.'}
                </p>
                {onRetry && (
                  <button
                    onClick={onRetry}
                    className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-amber-600/30 hover:bg-amber-600/50 text-amber-200 border border-amber-500/50 transition-colors"
                  >
                    <RefreshCw className="h-3.5 w-3.5" />
                    <span>Retry Connection</span>
                  </button>
                )}
              </div>
            )}

            {/* No Data Notice */}
            {!loading && (status === 'no_data' || (status === 'idle' && !atmosphereData && !oceanData && !landData)) && (
              <div className="p-5 rounded-2xl bg-slate-900/60 border border-slate-800/80 space-y-3">
                <div className="flex items-center space-x-2 text-cyan-400 font-semibold text-xs sm:text-sm">
                  <HelpCircle className="h-4 w-4 shrink-0" />
                  <span>No Observation Series for Current Coordinate</span>
                </div>
                <p className="text-xs text-slate-300 leading-relaxed font-sans">
                  {selectedLocationName ? `Target location: ${selectedLocationName}. ` : ''}
                  {selectedLocationName ? `No satellite observation series is available for ${selectedLocationName}.` : 'No satellite observation series is available for this location.'} Select an active observation location or ingest new granules.
                </p>
              </div>
            )}

            {/* Data Available: Synchronized Stacked Charts */}
            {!loading && (atmosphereData || oceanData || landData) && (
              <div className="space-y-4">
                {/* Header summary of current point */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-800/80 pb-2.5">
                  <div>
                    <h4 className="text-xs sm:text-sm font-semibold text-white flex items-center space-x-2">
                      <span>Synchronized Multi-Sphere Time-Series Timeline (2024–2026)</span>
                    </h4>
                    <p className="text-[11px] text-slate-400">
                      Coordinates: {selectedLocationName || 'Selected Location'} • Current Timeline: <strong className="text-cyan-300 font-mono">{selectedDate}</strong>
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 text-[10px] font-mono text-slate-400">
                    {effectiveModules.includes('ocean') && (
                      <span className="flex items-center space-x-1 px-2 py-0.5 rounded bg-cyan-950/80 text-cyan-300 border border-cyan-800/50">
                        <Waves className="h-3 w-3" />
                        <span>SWOT Altimetry (m)</span>
                      </span>
                    )}
                    {effectiveModules.includes('atmosphere') && (
                      <span className="flex items-center space-x-1 px-2 py-0.5 rounded bg-blue-950/80 text-blue-300 border border-blue-800/50">
                        <CloudRain className="h-3 w-3" />
                        <span>GPM Rainfall (mm)</span>
                      </span>
                    )}
                    {effectiveModules.includes('land') && (
                      <span className="flex items-center space-x-1 px-2 py-0.5 rounded bg-emerald-950/80 text-emerald-300 border border-emerald-800/50">
                        <Trees className="h-3 w-3" />
                        <span>MODIS NDVI [0..1]</span>
                      </span>
                    )}
                  </div>
                </div>

                {/* 1. ATMOSPHERE CHART (If atmosphere is active) */}
                {effectiveModules.includes('atmosphere') && atmosphereData && (
                  <div className="bg-slate-900/40 border border-slate-800/70 p-3 rounded-xl space-y-2">
                    <div className="flex items-center justify-between text-xs flex-wrap gap-2">
                      <span className="font-semibold text-blue-300 flex items-center space-x-1.5">
                        <CloudRain className="h-3.5 w-3.5" />
                        <span>Atmosphere: Monthly Precipitation Accumulation vs Climatological Normal</span>
                      </span>
                      <div className="flex items-center space-x-2">
                        {atmosphereData.is_observation ? (
                          <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded text-[9px] font-bold tracking-wider uppercase bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
                            <CheckCircle2 className="h-2.5 w-2.5" />
                            <span>Real Observation</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded text-[9px] font-bold tracking-wider uppercase bg-slate-800 text-slate-300 border border-slate-700">
                            <AlertTriangle className="h-2.5 w-2.5" />
                            <span>Observation Pending</span>
                          </span>
                        )}
                        <span className="font-mono text-[10px] text-slate-400">
                          Unit: mm / month • GPM_3IMERGM
                        </span>
                      </div>
                    </div>

                    <div className="h-44 sm:h-48 w-full min-w-0">
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={atmosphereData.timeseries} margin={{ top: 5, right: 15, left: -15, bottom: 0 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                          <XAxis dataKey="date" stroke="#64748b" tick={{ fontSize: 9 }} />
                          <YAxis stroke="#64748b" tick={{ fontSize: 9 }} unit=" mm" />
                          <Tooltip contentStyle={{ backgroundColor: '#090d16', borderColor: '#334155', borderRadius: '8px', fontSize: '11px' }} />
                          <Legend wrapperStyle={{ fontSize: '10px', paddingTop: '2px' }} />
                          <Line type="monotone" dataKey="precipitation_accumulated_mm" name={atmosphereData.is_observation ? "Satellite Rain Depth (mm)" : "Modelled Rain Depth (mm)"} stroke="#38bdf8" strokeWidth={2} dot={{ r: 2 }} />
                          <Line type="monotone" dataKey="climatological_normal_mm" name="1998-2020 Normal (mm)" stroke="#94a3b8" strokeWidth={1.5} strokeDasharray="4 4" dot={false} />
                          {selectedDate && <ReferenceLine x={selectedDate} stroke="#f59e0b" strokeWidth={1.5} label={{ value: 'Active', position: 'top', fill: '#f59e0b', fontSize: 9 }} />}
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                )}

                {/* 2. OCEAN CHART (If ocean is active) */}
                {effectiveModules.includes('ocean') && oceanData && (
                  <div className="bg-slate-900/40 border border-slate-800/70 p-3 rounded-xl space-y-2">
                    <div className="flex items-center justify-between text-xs flex-wrap gap-2">
                      <span className="font-semibold text-cyan-300 flex items-center space-x-1.5">
                        <Waves className="h-3.5 w-3.5" />
                        <span>Ocean: Sea Surface Height Anomaly (SSHA) & Extremes</span>
                      </span>
                      <div className="flex items-center space-x-2">
                        {oceanData.is_observation ? (
                          <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded text-[9px] font-bold tracking-wider uppercase bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
                            <CheckCircle2 className="h-2.5 w-2.5" />
                            <span>Real Observation</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded text-[9px] font-bold tracking-wider uppercase bg-slate-800 text-slate-300 border border-slate-700">
                            <AlertTriangle className="h-2.5 w-2.5" />
                            <span>Observation Pending</span>
                          </span>
                        )}
                        <span className="font-mono text-[10px] text-slate-400">
                          Unit: meters (m) • NASA/CNES SWOT KaRIn
                        </span>
                      </div>
                    </div>

                    <div className="h-44 sm:h-48 w-full min-w-0">
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={oceanData.timeseries} margin={{ top: 5, right: 15, left: -15, bottom: 0 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                          <XAxis dataKey="date" stroke="#64748b" tick={{ fontSize: 9 }} />
                          <YAxis stroke="#64748b" tick={{ fontSize: 9 }} unit=" m" domain={[-0.45, 0.45]} />
                          <ReferenceLine y={0} stroke="#475569" strokeDasharray="3 3" />
                          <Tooltip contentStyle={{ backgroundColor: '#090d16', borderColor: '#334155', borderRadius: '8px', fontSize: '11px' }} />
                          <Legend wrapperStyle={{ fontSize: '10px', paddingTop: '2px' }} />
                          <Line type="monotone" dataKey="ssha_mean_m" name={oceanData.is_observation ? "Satellite SSHA (m)" : "Mean SSHA (m)"} stroke="#06b6d4" strokeWidth={2.5} dot={{ r: 2 }} />
                          <Line type="monotone" dataKey="ssha_max_m" name="Swath Max (m)" stroke="#ef4444" strokeWidth={1} strokeDasharray="2 2" dot={false} />
                          <Line type="monotone" dataKey="ssha_min_m" name="Swath Min (m)" stroke="#3b82f6" strokeWidth={1} strokeDasharray="2 2" dot={false} />
                          {selectedDate && <ReferenceLine x={selectedDate} stroke="#f59e0b" strokeWidth={1.5} label={{ value: 'Active', position: 'top', fill: '#f59e0b', fontSize: 9 }} />}
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                )}

                {/* 3. LAND CHART (If land is active) */}
                {effectiveModules.includes('land') && landData && (
                  <div className="bg-slate-900/40 border border-slate-800/70 p-3 rounded-xl space-y-2">
                    <div className="flex items-center justify-between text-xs flex-wrap gap-2">
                      <span className="font-semibold text-emerald-300 flex items-center space-x-1.5">
                        <Trees className="h-3.5 w-3.5" />
                        <span>Land: Canopy Phenology (NDVI) vs Historical Median</span>
                      </span>
                      <div className="flex items-center space-x-2">
                        {landData.is_observation ? (
                          <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded text-[9px] font-bold tracking-wider uppercase bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
                            <CheckCircle2 className="h-2.5 w-2.5" />
                            <span>Real Observation</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded text-[9px] font-bold tracking-wider uppercase bg-slate-800 text-slate-300 border border-slate-700">
                            <AlertTriangle className="h-2.5 w-2.5" />
                            <span>Observation Pending</span>
                          </span>
                        )}
                        <span className="font-mono text-[10px] text-slate-400">
                          Index: [-0.2 .. 1.0] • MODIS MOD13C2 v061
                        </span>
                      </div>
                    </div>

                    <div className="h-44 sm:h-48 w-full min-w-0">
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={landData.timeseries} margin={{ top: 5, right: 15, left: -15, bottom: 0 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                          <XAxis dataKey="date" stroke="#64748b" tick={{ fontSize: 9 }} />
                          <YAxis stroke="#64748b" tick={{ fontSize: 9 }} domain={[0, 1]} />
                          <Tooltip contentStyle={{ backgroundColor: '#090d16', borderColor: '#334155', borderRadius: '8px', fontSize: '11px' }} />
                          <Legend wrapperStyle={{ fontSize: '10px', paddingTop: '2px' }} />
                          <Line type="monotone" dataKey="ndvi" name={landData.is_observation ? "Satellite NDVI (MOD13C2)" : "Modelled NDVI Example"} stroke="#10b981" strokeWidth={2} dot={{ r: 2 }} />
                          <Line type="monotone" dataKey="historical_ndvi_median" name="Historical Median" stroke="#94a3b8" strokeWidth={1.5} strokeDasharray="4 4" dot={false} />
                          {selectedDate && <ReferenceLine x={selectedDate} stroke="#f59e0b" strokeWidth={1.5} label={{ value: 'Active', position: 'top', fill: '#f59e0b', fontSize: 9 }} />}
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                )}

                {/* Spatial/Temporal Resolution Distinction Callout */}
                <div className="bg-[#0b101c] border border-slate-800 p-3 rounded-xl flex items-start space-x-2.5 text-xs text-slate-400 leading-relaxed">
                  <Info className="h-4 w-4 text-cyan-400 shrink-0 mt-0.5" />
                  <div>
                    <strong className="text-slate-200">Scientific Resolution Guidance:</strong> SWOT KaRIn radar altimetry operates at ~2 km pixel grid with 21-day orbit repeats; GPM IMERG Final provides 0.1° monthly accumulations; MODIS MOD13C2 delivers 0.05° 16-day composite vegetation phenology. Graph axes are scaled independently to prevent dimensional distortion across disparate physical quantities.
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ================= TAB 2: HISTORICAL PERIOD COMPARISON (A vs B) ================= */}
        {activeTab === 'comparison' && (
          <div className="space-y-4">
            {/* Top Period Selectors Bar */}
            <div className="p-3.5 bg-slate-900/60 border border-slate-800 rounded-xl space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center space-x-2">
                  <Calendar className="h-4 w-4 text-cyan-400" />
                  <span className="text-xs font-bold text-white uppercase tracking-wider">
                    Select Two Periods for Historical Comparison:
                  </span>
                </div>

                {/* Module selector */}
                <div className="flex items-center space-x-1 bg-slate-950 p-1 rounded-lg border border-slate-800 text-xs">
                  <span className="text-[11px] text-slate-500 mr-1 px-1">System:</span>
                  {(['atmosphere', 'ocean', 'land'] as const).map((mod) => (
                    <button
                      key={mod}
                      onClick={() => setComparisonModule(mod)}
                      className={`px-2 py-0.5 rounded capitalize transition-all ${
                        comparisonModule === mod
                          ? 'bg-cyan-500/20 text-cyan-300 font-semibold border border-cyan-500/40'
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      {mod}
                    </button>
                  ))}
                </div>
              </div>

              {/* Period A & Period B Selectors */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                <div className="bg-[#0b101c] p-2.5 rounded-lg border border-slate-800 flex items-center justify-between">
                  <span className="font-semibold text-slate-300">Period A (Baseline):</span>
                  <select
                    value={periodA}
                    onChange={(e) => setPeriodA(e.target.value)}
                    className="bg-slate-900 border border-slate-700 rounded px-2.5 py-1 text-slate-200 font-mono text-xs focus:outline-none focus:border-cyan-500"
                  >
                    {TIMELINE_MONTHS.map((m) => (
                      <option key={`comp-a-${m.id}`} value={m.id}>
                        {m.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="bg-[#0b101c] p-2.5 rounded-lg border border-slate-800 flex items-center justify-between">
                  <span className="font-semibold text-slate-300">Period B (Comparison):</span>
                  <select
                    value={periodB}
                    onChange={(e) => setPeriodB(e.target.value)}
                    className="bg-slate-900 border border-slate-700 rounded px-2.5 py-1 text-slate-200 font-mono text-xs focus:outline-none focus:border-cyan-500"
                  >
                    {TIMELINE_MONTHS.map((m) => (
                      <option key={`comp-b-${m.id}`} value={m.id}>
                        {m.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            {/* Comparison Loading */}
            {comparisonLoading && (
              <div className="h-44 flex items-center justify-center bg-slate-900/30 rounded-xl border border-slate-800">
                <div className="flex items-center space-x-2 text-xs font-mono text-cyan-400">
                  <div className="h-4 w-4 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin" />
                  <span>Computing Period Differential Statistics ({periodA} vs {periodB})...</span>
                </div>
              </div>
            )}

            {/* Comparison Error */}
            {!comparisonLoading && comparisonError && (
              <div className="p-4 rounded-xl bg-rose-950/30 border border-rose-600/50 space-y-2 text-xs text-rose-300">
                <div className="flex items-center space-x-2 font-semibold text-rose-400">
                  <AlertCircle className="h-4 w-4" />
                  <span>Comparison Calculation Error</span>
                </div>
                <p>{comparisonError}</p>
              </div>
            )}

            {/* Comparison Result Cards */}
            {!comparisonLoading && comparisonData && (
              <div className="space-y-4">
                {/* 4 Stat Highlights */}
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                  {/* Period A Observation */}
                  <div className="bg-[#0f141f] border border-slate-800 p-3 rounded-xl space-y-1">
                    <span className="text-[10px] uppercase font-mono text-slate-400">
                      Period A ({comparisonData.period_a})
                    </span>
                    <p className="text-lg font-bold font-mono text-white">
                      {comparisonData.observation_a.value}{' '}
                      <span className="text-xs font-normal text-slate-400">{comparisonData.unit}</span>
                    </p>
                    <span className="text-[10px] font-mono text-slate-500">
                      Baseline: {comparisonData.observation_a.normal_or_baseline ?? 'N/A'}
                    </span>
                  </div>

                  {/* Period B Observation */}
                  <div className="bg-[#0f141f] border border-slate-800 p-3 rounded-xl space-y-1">
                    <span className="text-[10px] uppercase font-mono text-slate-400">
                      Period B ({comparisonData.period_b})
                    </span>
                    <p className="text-lg font-bold font-mono text-cyan-300">
                      {comparisonData.observation_b.value}{' '}
                      <span className="text-xs font-normal text-slate-400">{comparisonData.unit}</span>
                    </p>
                    <span className="text-[10px] font-mono text-slate-500">
                      Baseline: {comparisonData.observation_b.normal_or_baseline ?? 'N/A'}
                    </span>
                  </div>

                  {/* Absolute Difference Δ */}
                  <div className="bg-[#0f141f] border border-slate-800 p-3 rounded-xl space-y-1">
                    <span className="text-[10px] uppercase font-mono text-slate-400">
                      Absolute Difference (Δ)
                    </span>
                    <p
                      className={`text-lg font-bold font-mono ${
                        comparisonData.absolute_difference >= 0 ? 'text-emerald-400' : 'text-amber-400'
                      }`}
                    >
                      {comparisonData.absolute_difference > 0 ? '+' : ''}
                      {comparisonData.absolute_difference}{' '}
                      <span className="text-xs font-normal text-slate-400">{comparisonData.unit}</span>
                    </p>
                    <span className="text-[10px] font-mono text-slate-500">Δ = Period B - Period A</span>
                  </div>

                  {/* Percentage Difference % */}
                  <div className="bg-[#0f141f] border border-slate-800 p-3 rounded-xl space-y-1">
                    <span className="text-[10px] uppercase font-mono text-slate-400">
                      Percentage Shift (%)
                    </span>
                    <p
                      className={`text-lg font-bold font-mono ${
                        comparisonData.percentage_difference === null || !comparisonData.percentage_meaningful
                          ? 'text-slate-400'
                          : (comparisonData.percentage_difference ?? 0) >= 0
                          ? 'text-emerald-400'
                          : 'text-amber-400'
                      }`}
                    >
                      {comparisonData.percentage_difference !== null && comparisonData.percentage_meaningful
                        ? `${(comparisonData.percentage_difference ?? 0) > 0 ? '+' : ''}${comparisonData.percentage_difference}%`
                        : 'Absolute Preferred'}
                    </p>
                    <span className="text-[10px] font-mono text-slate-500 truncate block" title={comparisonData.percentage_note || 'Percentage of baseline'}>
                      {comparisonData.percentage_note ? 'Numerical guard applied' : 'Percentage change'}
                    </span>
                  </div>
                </div>

                {/* Grounded Scientific Interpretation */}
                <div className="p-3.5 bg-slate-900/60 border border-slate-800 rounded-xl space-y-1.5">
                  <div className="flex items-center space-x-2 text-xs font-bold text-white">
                    <CheckCircle2 className="h-4 w-4 text-cyan-400" />
                    <span>Scientific Physical Interpretation</span>
                  </div>
                  <p className="text-xs text-slate-300 leading-relaxed font-sans">
                    {comparisonData.interpretation}
                  </p>
                  {comparisonData.percentage_note && (
                    <p className="text-[11px] text-amber-300/90 leading-relaxed font-sans border-t border-slate-800/80 pt-1.5 mt-1.5">
                      <Info className="h-3.5 w-3.5 inline mr-1 text-amber-400" />
                      {comparisonData.percentage_note}
                    </p>
                  )}
                </div>

                {/* Regional Geographic Differences Table */}
                {comparisonData.regional_differences.length > 0 && (
                  <div className="space-y-2">
                    <h5 className="text-xs font-semibold text-slate-300 uppercase tracking-wider font-mono">
                      Global Benchmark Regions Shift ({comparisonData.period_a} → {comparisonData.period_b})
                    </h5>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
                      {comparisonData.regional_differences.map((reg) => (
                        <div
                          key={reg.name}
                          className="bg-[#0c111d] border border-slate-800/80 p-2.5 rounded-lg space-y-1"
                        >
                          <div className="flex items-center justify-between text-xs">
                            <span className="font-semibold text-slate-200 truncate" title={reg.name}>
                              {reg.name}
                            </span>
                            <span
                              className={`font-mono text-xs font-bold ${
                                reg.delta >= 0 ? 'text-emerald-400' : 'text-amber-400'
                              }`}
                            >
                              {reg.delta > 0 ? '+' : ''}
                              {reg.delta} {reg.unit}
                            </span>
                          </div>
                          <div className="flex items-center justify-between text-[10px] text-slate-400 font-mono">
                            <span>A: {reg.value_a}</span>
                            <span>→</span>
                            <span>B: {reg.value_b}</span>
                          </div>
                          {reg.interpretation && (
                            <p className="text-[10px] text-slate-400 truncate" title={reg.interpretation}>
                              {reg.interpretation}
                            </p>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* ================= TAB 3: COUPLED PLANETARY TELECONNECTIONS ================= */}
        {activeTab === 'teleconnections' && (
          <div className="space-y-4">
            {crossSystemData ? (
              <div className="space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-800/60 pb-2.5">
                  <div>
                    <h4 className="text-xs sm:text-sm font-bold text-white flex items-center space-x-2">
                      <Compass className="h-4 w-4 text-cyan-400" />
                      <span>{crossSystemData.phenomenon_name}</span>
                    </h4>
                    <p className="text-[11px] text-slate-400 max-w-2xl leading-relaxed">
                      Cross-sphere energy and mass exchange between the Ocean (SWOT SSHA), Atmosphere (GPM Rain Anomaly), and Land (MODIS Canopy Departure).
                    </p>
                  </div>
                  <div className="flex items-center space-x-2 text-[10px] font-mono text-slate-400">
                    <span className="text-cyan-400">Ocean SSHA (m)</span>
                    <span>•</span>
                    <span className="text-blue-400">Rain Anomaly (mm)</span>
                    <span>•</span>
                    <span className="text-emerald-400">NDVI (×10)</span>
                  </div>
                </div>

                <div className="h-56 sm:h-64 w-full min-w-0 bg-slate-900/40 rounded-xl p-2 border border-slate-800/60">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart
                      data={crossSystemData.timeseries.map((pt) => ({
                        ...pt,
                        ndvi_scaled: Number((pt.land_ndvi_anomaly * 10).toFixed(2)),
                      }))}
                      margin={{ top: 10, right: 15, left: -15, bottom: 0 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                      <XAxis dataKey="date" stroke="#64748b" tick={{ fontSize: 10 }} />
                      <YAxis yAxisId="left" stroke="#38bdf8" tick={{ fontSize: 10 }} domain={[-0.45, 0.45]} unit="m" />
                      <YAxis yAxisId="right" orientation="right" stroke="#3b82f6" tick={{ fontSize: 10 }} unit="mm" />
                      <ReferenceLine yAxisId="left" y={0} stroke="#475569" strokeDasharray="2 2" />
                      <Tooltip contentStyle={{ backgroundColor: '#090d16', borderColor: '#334155', borderRadius: '8px', fontSize: '11px' }} />
                      <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '4px' }} />
                      <Line yAxisId="left" type="monotone" dataKey="ocean_ssha_m" name="Ocean SSHA (m)" stroke="#38bdf8" strokeWidth={2} dot={{ r: 2 }} />
                      <Line yAxisId="right" type="monotone" dataKey="atmosphere_precipitation_anomaly_mm" name="Precip Anomaly (mm)" stroke="#3b82f6" strokeWidth={2} dot={{ r: 2 }} />
                      <Line yAxisId="left" type="monotone" dataKey="ndvi_scaled" name="Canopy Departure (×10)" stroke="#10b981" strokeWidth={2} dot={{ r: 2 }} />
                      {selectedDate && <ReferenceLine x={selectedDate} stroke="#f59e0b" strokeWidth={1.5} label={{ value: 'Active', position: 'top', fill: '#f59e0b', fontSize: 9 }} />}
                    </LineChart>
                  </ResponsiveContainer>
                </div>

                {/* Mandatory Scientific Safeguard Callout */}
                <div className="bg-amber-950/25 border border-amber-600/40 rounded-xl p-3 flex items-start space-x-2.5">
                  <AlertTriangle className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" />
                  <p className="text-[11px] text-amber-200/90 leading-relaxed font-sans">
                    <strong className="font-semibold text-amber-300">Scientific Distinction (Correlation != Causation):</strong> Statistical correlations across ocean waves, atmospheric storms, and canopy greenness reflect planetary wave teleconnections. Terrestrial ground impacts are modulated by local soil memory, river catchments, and human irrigation.
                  </p>
                </div>
              </div>
            ) : (
              <div className="h-44 flex items-center justify-center bg-slate-900/30 rounded-xl border border-slate-800 text-xs text-slate-400">
                <span>Loading planetary teleconnections array...</span>
              </div>
            )}
          </div>
        )}
      </div>
    </aside>
  );
};

export default TrendDrawer;
