import React from 'react';
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
} from 'lucide-react';

export type TrendDrawerStatus =
  | 'idle'
  | 'loading'
  | 'success'
  | 'no_data'
  | 'backend_unavailable'
  | 'error';

interface TrendDrawerProps {
  activeModule: EarthModule;
  atmosphereData: AtmosphereTimeSeriesResponse | null;
  oceanData: OceanTimeSeriesResponse | null;
  landData: LandTimeSeriesResponse | null;
  crossSystemData: CrossSystemResponse | null;
  loading: boolean;
  status?: TrendDrawerStatus;
  errorMessage?: string | null;
  selectedLocationName?: string | null;
  onRetry?: () => void;
  isOpen: boolean;
  onClose: () => void;
  onToggleOpen: () => void;
  isExpanded?: boolean;
  onToggleExpand?: () => void;
  sidePanelOpen?: boolean;
}

export const TrendDrawer: React.FC<TrendDrawerProps> = ({
  activeModule,
  atmosphereData,
  oceanData,
  landData,
  crossSystemData,
  loading,
  status = 'idle',
  errorMessage = null,
  selectedLocationName = null,
  onRetry,
  isOpen,
  onClose,
  onToggleOpen,
  isExpanded = false,
  onToggleExpand,
  sidePanelOpen = false,
}) => {
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
      } ${isExpanded ? 'h-[520px] max-h-[85vh]' : 'h-80 sm:h-96'}`}
      aria-label="Scientific Trends & Teleconnections Drawer"
    >
      {/* Drawer Top Header Bar */}
      <div className="h-11 px-4 border-b border-slate-800/80 bg-[#0a0f1c]/90 flex items-center justify-between shrink-0">
        <div className="flex items-center space-x-2 min-w-0">
          <TrendingUp className="h-4 w-4 text-cyan-400 shrink-0" />
          <h3 className="text-xs sm:text-sm font-bold text-white truncate">
            Historical Trends & Planetary Teleconnections (2024–2026)
          </h3>
          <span className="hidden sm:inline-block text-[10px] font-mono px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 border border-slate-700">
            {activeModule?.toUpperCase()} Baseline Analysis
          </span>
        </div>

        <div className="flex items-center space-x-1 shrink-0">
          {onToggleExpand && (
            <button
              onClick={onToggleExpand}
              title={isExpanded ? 'Restore normal drawer height' : 'Maximize drawer height'}
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
            >
              {isExpanded ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
            </button>
          )}
          <button
            onClick={onClose}
            title="Close trends drawer"
            className="p-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-slate-800 transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Drawer Body: Responsive Charts & Teleconnection Details */}
      <div
        className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-5 touch-pan-y"
        style={{ touchAction: 'pan-y' }}
      >
        {/* State 1: Active Loading */}
        {(loading || status === 'loading') && (
          <div className="h-56 flex flex-col items-center justify-center space-y-3 bg-slate-900/30 rounded-2xl border border-slate-800/60 p-6">
            <div className="flex items-center space-x-2 text-xs font-mono text-cyan-400">
              <div className="h-5 w-5 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin" />
              <span>Streaming Historical Satellite Timeseries (2024–2026)...</span>
            </div>
            {selectedLocationName && (
              <span className="text-[11px] font-mono text-slate-400">
                Target: <strong className="text-white">{selectedLocationName}</strong>
              </span>
            )}
          </div>
        )}

        {/* State 2: Backend Unavailable (Network or Server Offline) */}
        {!loading && status === 'backend_unavailable' && (
          <div className="p-5 rounded-2xl bg-amber-950/30 border border-amber-600/50 space-y-3">
            <div className="flex items-center space-x-2 text-amber-400 font-semibold text-xs sm:text-sm">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              <span>Scientific Backend Unavailable</span>
            </div>
            <p className="text-xs text-amber-200/90 leading-relaxed font-sans">
              {errorMessage || 'Could not connect to the scientific API backend. Ensure the backend server is running and accessible over your network.'}
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

        {/* State 3: Generic Error State */}
        {!loading && status === 'error' && (
          <div className="p-5 rounded-2xl bg-rose-950/30 border border-rose-600/50 space-y-3">
            <div className="flex items-center space-x-2 text-rose-400 font-semibold text-xs sm:text-sm">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>Time-Series Request Failed</span>
            </div>
            <p className="text-xs text-rose-200/90 leading-relaxed font-sans">
              {errorMessage || 'Failed to retrieve historical observations for the selected coordinates.'}
            </p>
            {onRetry && (
              <button
                onClick={onRetry}
                className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-rose-600/30 hover:bg-rose-600/50 text-rose-200 border border-rose-500/50 transition-colors"
              >
                <RefreshCw className="h-3.5 w-3.5" />
                <span>Retry Analysis</span>
              </button>
            )}
          </div>
        )}

        {/* State 4: No Observations for Chosen Coordinate */}
        {!loading && (status === 'no_data' || (status === 'idle' && !atmosphereData && !oceanData && !landData)) && (
          <div className="p-5 rounded-2xl bg-slate-900/60 border border-slate-800/80 space-y-3">
            <div className="flex items-center space-x-2 text-cyan-400 font-semibold text-xs sm:text-sm">
              <HelpCircle className="h-4 w-4 shrink-0" />
              <span>No Satellite Track Observations at Chosen Coordinate</span>
            </div>
            <p className="text-xs text-slate-300 leading-relaxed font-sans">
              {selectedLocationName ? `Target location: ${selectedLocationName}. ` : ''}
              NASA SWOT KaRIn swath orbits (120 km width) and MODIS vegetation records track specific geographical passes. Select an observation marker on the globe or pick a planetary preset from the Context panel to inspect continuous observations.
            </p>
            <div className="flex items-center space-x-2 text-[11px] font-mono text-slate-400">
              <span>Scientific dataset:</span>
              <strong className="text-cyan-300 uppercase">{activeModule || 'Earth Systems'} Baseline</strong>
            </div>
          </div>
        )}

        {/* State 5: Data Available (Render Scientific Time Series) */}
        {!loading && status !== 'loading' && (atmosphereData || oceanData || landData) && (
          <>
            {/* ================= ATMOSPHERE HISTORICAL TRENDS ================= */}
            {activeModule === 'atmosphere' && atmosphereData && (
              <div className="space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div>
                    <h4 className="text-xs sm:text-sm font-semibold text-white flex items-center space-x-2">
                      <span>Monthly Precipitation vs 1998–2020 Climatological Baseline</span>
                    </h4>
                    <p className="text-[11px] text-slate-400">
                      Location: {atmosphereData.location_name} • NASA GPM IMERG Final Run
                    </p>
                  </div>
                  <div className="flex items-center space-x-3 text-xs font-mono text-slate-300">
                    <span>
                      Observed Mean: <strong className="text-white">{atmosphereData.summary_statistics.mean_monthly_accumulation_mm} mm</strong>
                    </span>
                    <span className="text-slate-600">•</span>
                    <span>
                      Baseline: <strong className="text-slate-400">{atmosphereData.summary_statistics.climatological_mean_mm} mm</strong>
                    </span>
                  </div>
                </div>

                <div className="h-56 sm:h-64 w-full min-w-0 bg-slate-900/40 rounded-xl p-2 border border-slate-800/60">
                  <ResponsiveContainer key={`atm-${isExpanded ? 'exp' : 'norm'}`} width="100%" height="100%">
                    <LineChart data={atmosphereData.timeseries} margin={{ top: 10, right: 15, left: -15, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                      <XAxis dataKey="date" stroke="#64748b" tick={{ fontSize: 10 }} />
                      <YAxis stroke="#64748b" tick={{ fontSize: 10 }} unit=" mm" />
                      <Tooltip contentStyle={{ backgroundColor: '#090d16', borderColor: '#334155', borderRadius: '8px', fontSize: '11px' }} />
                      <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '4px' }} />
                      <Line type="monotone" dataKey="precipitation_accumulated_mm" name="Observed Rain Depth (mm)" stroke="#38bdf8" strokeWidth={2} dot={{ r: 2 }} />
                      <Line type="monotone" dataKey="climatological_normal_mm" name="Historical Normal (mm)" stroke="#94a3b8" strokeWidth={1.5} strokeDasharray="4 4" dot={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>

                <p className="text-xs text-slate-400 leading-relaxed font-sans">
                  <Info className="h-3.5 w-3.5 inline mr-1 text-blue-400" />
                  Monthly rainfall depth is accumulated over the total duration of each calendar month. Comparing observations against the multi-decadal normal isolates extreme weather anomalies from regular seasonal monsoons.
                </p>
              </div>
            )}

            {/* ================= OCEAN HISTORICAL TRENDS ================= */}
            {activeModule === 'ocean' && oceanData && (
              <div className="space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div>
                    <h4 className="text-xs sm:text-sm font-semibold text-white flex items-center space-x-2">
                      <span>Sea Surface Height Anomaly (SSHA) Trends & Extremes</span>
                    </h4>
                    <p className="text-[11px] text-slate-400">
                      Region: {oceanData.region_name} • NASA SWOT KaRIn Radar Altimeter (Option A)
                    </p>
                  </div>
                  <div className="flex items-center space-x-3 text-xs font-mono text-slate-300">
                    <span>
                      Swath Mean SSHA: <strong className="text-cyan-400">{oceanData.summary_statistics.mean_ssha_m > 0 ? '+' : ''}{oceanData.summary_statistics.mean_ssha_m} m</strong>
                    </span>
                  </div>
                </div>

                <div className="h-56 sm:h-64 w-full min-w-0 bg-slate-900/40 rounded-xl p-2 border border-slate-800/60">
                  <ResponsiveContainer key={`ocn-${isExpanded ? 'exp' : 'norm'}`} width="100%" height="100%">
                    <LineChart data={oceanData.timeseries} margin={{ top: 10, right: 15, left: -15, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                      <XAxis dataKey="date" stroke="#64748b" tick={{ fontSize: 10 }} />
                      <YAxis stroke="#64748b" tick={{ fontSize: 10 }} unit=" m" domain={[-0.5, 0.5]} />
                      <ReferenceLine y={0} stroke="#475569" strokeDasharray="3 3" />
                      <Tooltip contentStyle={{ backgroundColor: '#090d16', borderColor: '#334155', borderRadius: '8px', fontSize: '11px' }} />
                      <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '4px' }} />
                      <Line type="monotone" dataKey="ssha_mean_m" name="Mean SSHA (m)" stroke="#38bdf8" strokeWidth={2.5} dot={{ r: 2 }} />
                      <Line type="monotone" dataKey="ssha_max_m" name="Swath Max (m)" stroke="#ef4444" strokeWidth={1} strokeDasharray="2 2" dot={false} />
                      <Line type="monotone" dataKey="ssha_min_m" name="Swath Min (m)" stroke="#3b82f6" strokeWidth={1} strokeDasharray="2 2" dot={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>

                <p className="text-xs text-slate-400 leading-relaxed font-sans">
                  <Info className="h-3.5 w-3.5 inline mr-1 text-cyan-400" />
                  Positive anomalies indicate warm thermal ocean expansion and anticyclonic eddies; negative anomalies indicate colder upwelling vortices. KaRIn provides 2 km spatial resolution with target precision of ±2.4 cm.
                </p>
              </div>
            )}

            {/* ================= LAND HISTORICAL TRENDS ================= */}
            {activeModule === 'land' && landData && (
              <div className="space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div>
                    <h4 className="text-xs sm:text-sm font-semibold text-white flex items-center space-x-2">
                      <span>Vegetation Canopy Phenology (NDVI) vs Climatological Median</span>
                    </h4>
                    <p className="text-[11px] text-slate-400">
                      Ecosystem: {landData.region_name} • NASA MODIS Terra/Aqua (MOD13C2)
                    </p>
                  </div>
                  <div className="flex items-center space-x-3 text-xs font-mono text-slate-300">
                    <span>
                      Observed Mean NDVI: <strong className="text-emerald-400">{landData.summary_statistics.mean_ndvi}</strong>
                    </span>
                    <span className="text-slate-600">•</span>
                    <span>
                      Peak: <strong className="text-green-300">{landData.summary_statistics.peak_ndvi_observed}</strong>
                    </span>
                  </div>
                </div>

                <div className="h-56 sm:h-64 w-full min-w-0 bg-slate-900/40 rounded-xl p-2 border border-slate-800/60">
                  <ResponsiveContainer key={`lnd-${isExpanded ? 'exp' : 'norm'}`} width="100%" height="100%">
                    <LineChart data={landData.timeseries} margin={{ top: 10, right: 15, left: -15, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                      <XAxis dataKey="date" stroke="#64748b" tick={{ fontSize: 10 }} />
                      <YAxis stroke="#64748b" tick={{ fontSize: 10 }} domain={[0, 1]} />
                      <Tooltip contentStyle={{ backgroundColor: '#090d16', borderColor: '#334155', borderRadius: '8px', fontSize: '11px' }} />
                      <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '4px' }} />
                      <Line type="monotone" dataKey="ndvi" name="Observed NDVI Canopy" stroke="#10b981" strokeWidth={2} dot={{ r: 2 }} />
                      <Line type="monotone" dataKey="historical_ndvi_median" name="Historical Median Phenology" stroke="#94a3b8" strokeWidth={1.5} strokeDasharray="4 4" dot={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>

                <p className="text-xs text-slate-400 leading-relaxed font-sans">
                  <Info className="h-3.5 w-3.5 inline mr-1 text-emerald-400" />
                  NDVI is a normalized difference index between -0.2 and 1.0 reflecting photosynthetic activity. Departures from the historical curve indicate vegetative drought stress or favorable canopy greening.
                </p>
              </div>
            )}

            {/* ================= CROSS-SYSTEM COUPLED TELECONNECTIONS ================= */}
            {crossSystemData && (
              <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800/80 space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-800/60 pb-2.5">
                  <div>
                    <h4 className="text-xs sm:text-sm font-bold text-white flex items-center space-x-2">
                      <span>Coupled Planetary Teleconnections: Ocean, Atmosphere & Land</span>
                    </h4>
                    <p className="text-[11px] text-slate-400">
                      {crossSystemData.phenomenon_name}
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

                <div className="h-52 w-full min-w-0">
                  <ResponsiveContainer key={`tele-${isExpanded ? 'exp' : 'norm'}`} width="100%" height="100%">
                    <LineChart
                      data={crossSystemData.timeseries.map((pt) => ({
                        ...pt,
                        ndvi_scaled: Number((pt.land_ndvi_anomaly * 10).toFixed(2)),
                      }))}
                      margin={{ top: 10, right: 15, left: -15, bottom: 0 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                      <XAxis dataKey="date" stroke="#64748b" tick={{ fontSize: 10 }} />
                      <YAxis stroke="#64748b" tick={{ fontSize: 10 }} />
                      <ReferenceLine y={0} stroke="#475569" strokeDasharray="2 2" />
                      <Tooltip contentStyle={{ backgroundColor: '#090d16', borderColor: '#334155', borderRadius: '8px', fontSize: '11px' }} />
                      <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '4px' }} />
                      <Line type="monotone" dataKey="ocean_ssha_m" name="Ocean SSHA (m)" stroke="#38bdf8" strokeWidth={2} dot={{ r: 2 }} />
                      <Line type="monotone" dataKey="atmosphere_precipitation_anomaly_mm" name="Precip Anomaly (mm)" stroke="#3b82f6" strokeWidth={2} dot={{ r: 2 }} />
                      <Line type="monotone" dataKey="ndvi_scaled" name="Canopy Departure (×10)" stroke="#10b981" strokeWidth={2} dot={{ r: 2 }} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>

                {/* Scientific Safeguard Callout */}
                <div className="bg-amber-950/25 border border-amber-600/40 rounded-xl p-3 flex items-start space-x-2.5">
                  <AlertTriangle className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" />
                  <p className="text-[11px] text-amber-200/90 leading-relaxed font-sans">
                    <strong className="font-semibold text-amber-300">Scientific Distinction (Correlation != Causation):</strong> Statistical correlations across ocean waves, storm tracks, and canopy greenness reflect planetary wave teleconnections. Local soil moisture memory and human irrigation dictate ground impacts.
                  </p>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </aside>
  );
};

export default TrendDrawer;
