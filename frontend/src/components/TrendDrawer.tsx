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
import { AlertTriangle, TrendingUp, Info } from 'lucide-react';

interface TrendDrawerProps {
  activeModule: EarthModule;
  atmosphereData: AtmosphereTimeSeriesResponse | null;
  oceanData: OceanTimeSeriesResponse | null;
  landData: LandTimeSeriesResponse | null;
  crossSystemData: CrossSystemResponse | null;
  loading: boolean;
}

export const TrendDrawer: React.FC<TrendDrawerProps> = ({
  activeModule,
  atmosphereData,
  oceanData,
  landData,
  crossSystemData,
  loading,
}) => {
  if (loading) {
    return (
      <div className="h-48 flex items-center justify-center bg-[#090d16] border border-slate-800/80 rounded-2xl">
        <div className="flex items-center space-x-2 text-xs font-mono text-slate-400">
          <div className="h-3.5 w-3.5 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin" />
          <span>Loading Historical Trends...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 pt-4 border-t border-slate-800/60 max-w-5xl mx-auto w-full">
      {/* ================= ATMOSPHERE HISTORICAL TRENDS ================= */}
      {activeModule === 'atmosphere' && atmosphereData && (
        <div className="bg-[#090d16]/90 border border-slate-800/80 rounded-2xl p-5 sm:p-6 backdrop-blur-md space-y-4 shadow-xl">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-800/60 pb-3">
            <div>
              <h4 className="text-sm font-bold text-white flex items-center space-x-2">
                <TrendingUp className="h-4 w-4 text-blue-400" />
                <span>Monthly Precipitation Trends (2024–2026) vs 1998–2020 Baseline</span>
              </h4>
              <p className="text-xs text-slate-400 pt-0.5">
                Location: {atmosphereData.location_name} • NASA GPM IMERG Final Monthly
              </p>
            </div>
            <div className="flex items-center space-x-3 text-xs font-mono text-slate-300">
              <span>Mean: <strong className="text-white">{atmosphereData.summary_statistics.mean_monthly_accumulation_mm} mm</strong></span>
              <span className="text-slate-600">•</span>
              <span>Baseline: <strong className="text-slate-300">{atmosphereData.summary_statistics.climatological_mean_mm} mm</strong></span>
            </div>
          </div>

          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={atmosphereData.timeseries} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                <XAxis dataKey="date" stroke="#64748b" tick={{ fontSize: 11 }} />
                <YAxis stroke="#64748b" tick={{ fontSize: 11 }} unit=" mm" />
                <Tooltip
                  contentStyle={{ backgroundColor: '#090d16', borderColor: '#334155', borderRadius: '8px', fontSize: '11px' }}
                />
                <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '8px' }} />
                <Line
                  type="monotone"
                  dataKey="precipitation_accumulated_mm"
                  name="Observed Rain Depth (mm)"
                  stroke="#38bdf8"
                  strokeWidth={2}
                  dot={{ r: 2 }}
                />
                <Line
                  type="monotone"
                  dataKey="climatological_normal_mm"
                  name="Historical Normal (mm)"
                  stroke="#94a3b8"
                  strokeWidth={1.5}
                  strokeDasharray="4 4"
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>

          <p className="text-xs text-slate-400 leading-relaxed pt-1">
            <Info className="h-3.5 w-3.5 inline mr-1 text-blue-400" />
            Monthly rainfall depth is accumulated over the total duration of the month. Comparing actual observations against the multi-decadal normal isolates extreme weather anomalies from regular seasonal monsoons.
          </p>
        </div>
      )}

      {/* ================= OCEAN HISTORICAL TRENDS ================= */}
      {activeModule === 'ocean' && oceanData && (
        <div className="bg-[#090d16]/90 border border-slate-800/80 rounded-2xl p-5 sm:p-6 backdrop-blur-md space-y-4 shadow-xl">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-800/60 pb-3">
            <div>
              <h4 className="text-sm font-bold text-white flex items-center space-x-2">
                <TrendingUp className="h-4 w-4 text-cyan-400" />
                <span>Sea Surface Height Anomaly (SSHA) Trends (2024–2026)</span>
              </h4>
              <p className="text-xs text-slate-400 pt-0.5">
                Region: {oceanData.region_name} • SWOT KaRIn Altimeter (Option A)
              </p>
            </div>
            <div className="flex items-center space-x-3 text-xs font-mono text-slate-300">
              <span>Mean: <strong className="text-cyan-400">{oceanData.summary_statistics.mean_ssha_m > 0 ? '+' : ''}{oceanData.summary_statistics.mean_ssha_m} m</strong></span>
            </div>
          </div>

          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={oceanData.timeseries} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                <XAxis dataKey="date" stroke="#64748b" tick={{ fontSize: 11 }} />
                <YAxis stroke="#64748b" tick={{ fontSize: 11 }} unit=" m" domain={[-0.5, 0.5]} />
                <ReferenceLine y={0} stroke="#475569" strokeDasharray="3 3" />
                <Tooltip
                  contentStyle={{ backgroundColor: '#090d16', borderColor: '#334155', borderRadius: '8px', fontSize: '11px' }}
                />
                <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '8px' }} />
                <Line
                  type="monotone"
                  dataKey="ssha_mean_m"
                  name="Mean SSHA (meters)"
                  stroke="#38bdf8"
                  strokeWidth={2.5}
                  dot={{ r: 2 }}
                />
                <Line
                  type="monotone"
                  dataKey="ssha_max_m"
                  name="Swath Max (m)"
                  stroke="#ef4444"
                  strokeWidth={1}
                  strokeDasharray="2 2"
                  dot={false}
                />
                <Line
                  type="monotone"
                  dataKey="ssha_min_m"
                  name="Swath Min (m)"
                  stroke="#3b82f6"
                  strokeWidth={1}
                  strokeDasharray="2 2"
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>

          <p className="text-xs text-slate-400 leading-relaxed pt-1">
            <Info className="h-3.5 w-3.5 inline mr-1 text-cyan-400" />
            Positive anomalies indicate warm thermal ocean expansion and anticyclonic eddies; negative anomalies indicate colder upwelling vortices. KaRIn provides 2 km spatial resolution with target accuracy of ±2.4 cm.
          </p>
        </div>
      )}

      {/* ================= LAND HISTORICAL TRENDS ================= */}
      {activeModule === 'land' && landData && (
        <div className="bg-[#090d16]/90 border border-slate-800/80 rounded-2xl p-5 sm:p-6 backdrop-blur-md space-y-4 shadow-xl">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-800/60 pb-3">
            <div>
              <h4 className="text-sm font-bold text-white flex items-center space-x-2">
                <TrendingUp className="h-4 w-4 text-emerald-400" />
                <span>Vegetation Canopy Phenology (NDVI) vs Climatological Median</span>
              </h4>
              <p className="text-xs text-slate-400 pt-0.5">
                Ecosystem: {landData.region_name} • NASA MODIS Terra/Aqua (MOD13C2)
              </p>
            </div>
            <div className="flex items-center space-x-3 text-xs font-mono text-slate-300">
              <span>Mean NDVI: <strong className="text-emerald-400">{landData.summary_statistics.mean_ndvi}</strong></span>
              <span className="text-slate-600">•</span>
              <span>Peak: <strong className="text-green-300">{landData.summary_statistics.peak_ndvi_observed}</strong></span>
            </div>
          </div>

          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={landData.timeseries} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                <XAxis dataKey="date" stroke="#64748b" tick={{ fontSize: 11 }} />
                <YAxis stroke="#64748b" tick={{ fontSize: 11 }} domain={[0, 1]} />
                <Tooltip
                  contentStyle={{ backgroundColor: '#090d16', borderColor: '#334155', borderRadius: '8px', fontSize: '11px' }}
                />
                <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '8px' }} />
                <Line
                  type="monotone"
                  dataKey="ndvi"
                  name="Observed NDVI Canopy"
                  stroke="#10b981"
                  strokeWidth={2}
                  dot={{ r: 2 }}
                />
                <Line
                  type="monotone"
                  dataKey="historical_ndvi_median"
                  name="Historical Median Phenology"
                  stroke="#94a3b8"
                  strokeWidth={1.5}
                  strokeDasharray="4 4"
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>

          <p className="text-xs text-slate-400 leading-relaxed pt-1">
            <Info className="h-3.5 w-3.5 inline mr-1 text-emerald-400" />
            NDVI is a dimensionless ratio between -0.2 and 1.0 reflecting chlorophyll activity. Departures from the historical curve indicate vegetative drought stress or favorable moisture conditions.
          </p>
        </div>
      )}

      {/* ================= CROSS-SYSTEM COUPLED TELECONNECTIONS ================= */}
      {crossSystemData && (
        <div className="bg-[#090d16]/90 border border-slate-800/80 rounded-2xl p-5 sm:p-6 backdrop-blur-md space-y-4 shadow-xl">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-800/60 pb-3">
            <div>
              <h4 className="text-sm font-bold text-white flex items-center space-x-2">
                <span>Coupled Planetary Systems: Ocean, Atmosphere & Land</span>
              </h4>
              <p className="text-xs text-slate-400 pt-0.5">
                {crossSystemData.phenomenon_name}
              </p>
            </div>
            <div className="flex items-center space-x-2 text-[11px] font-mono text-slate-400">
              <span className="text-cyan-400">Ocean SSHA (m)</span>
              <span>•</span>
              <span className="text-blue-400">Rain Anomaly (mm)</span>
              <span>•</span>
              <span className="text-emerald-400">NDVI (×10)</span>
            </div>
          </div>

          <div className="h-60 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart
                data={crossSystemData.timeseries.map((pt) => ({
                  ...pt,
                  ndvi_scaled: Number((pt.land_ndvi_anomaly * 10).toFixed(2)),
                }))}
                margin={{ top: 10, right: 10, left: -10, bottom: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                <XAxis dataKey="date" stroke="#64748b" tick={{ fontSize: 11 }} />
                <YAxis stroke="#64748b" tick={{ fontSize: 11 }} />
                <ReferenceLine y={0} stroke="#475569" strokeDasharray="2 2" />
                <Tooltip
                  contentStyle={{ backgroundColor: '#090d16', borderColor: '#334155', borderRadius: '8px', fontSize: '11px' }}
                />
                <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '8px' }} />
                <Line
                  type="monotone"
                  dataKey="ocean_ssha_m"
                  name="Ocean SSHA (m)"
                  stroke="#38bdf8"
                  strokeWidth={2}
                  dot={{ r: 2 }}
                />
                <Line
                  type="monotone"
                  dataKey="atmosphere_precipitation_anomaly_mm"
                  name="Precip Anomaly (mm)"
                  stroke="#3b82f6"
                  strokeWidth={2}
                  dot={{ r: 2 }}
                />
                <Line
                  type="monotone"
                  dataKey="ndvi_scaled"
                  name="Canopy Departure (×10)"
                  stroke="#10b981"
                  strokeWidth={2}
                  dot={{ r: 2 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>

          {/* Scientific Caution Alert */}
          <div className="bg-amber-950/20 border border-amber-600/30 rounded-xl p-3 flex items-start space-x-2.5">
            <AlertTriangle className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" />
            <p className="text-[11px] text-amber-200/90 leading-relaxed">
              <strong className="font-semibold text-amber-300">Correlation != Causation:</strong> Statistical correlations across ocean waves, storm tracks, and canopy greenness reflect planetary wave teleconnections. Local soil moisture memory and human irrigation dictate ground impacts.
            </p>
          </div>
        </div>
      )}
    </div>
  );
};
