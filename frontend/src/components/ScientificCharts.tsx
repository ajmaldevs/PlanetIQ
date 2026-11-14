import React from 'react';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  CartesianGrid,
  ReferenceLine,
  Area,
  AreaChart,
} from 'recharts';
import {
  AtmosphereTimeSeriesResponse,
  OceanTimeSeriesResponse,
  LandTimeSeriesResponse,
} from '../services/api';
import { TrendingUp, BarChart2 } from 'lucide-react';

interface ScientificChartsProps {
  module: 'atmosphere' | 'ocean' | 'land';
  atmosphereData?: AtmosphereTimeSeriesResponse | null;
  oceanData?: OceanTimeSeriesResponse | null;
  landData?: LandTimeSeriesResponse | null;
  loading: boolean;
}

export const ScientificCharts: React.FC<ScientificChartsProps> = ({
  module,
  atmosphereData,
  oceanData,
  landData,
  loading,
}) => {
  if (loading) {
    return (
      <div className="h-64 flex items-center justify-center bg-[#0d121d] rounded-xl border border-slate-800">
        <div className="flex items-center space-x-2 text-slate-400 text-xs font-mono">
          <div className="h-4 w-4 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin" />
          <span>Computing Scientific Time-Series Harmonization...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* ================= ATMOSPHERE CHARTS ================= */}
      {module === 'atmosphere' && atmosphereData && (
        <div className="space-y-4">
          {/* Statistical Highlights */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="bg-[#0f141f] border border-slate-800 p-3 rounded-lg">
              <span className="text-[10px] uppercase font-mono text-slate-400">Mean Monthly</span>
              <p className="text-lg font-bold font-mono text-cyan-400">
                {atmosphereData.summary_statistics.mean_monthly_accumulation_mm}{' '}
                <span className="text-xs font-normal text-slate-400">mm</span>
              </p>
            </div>
            <div className="bg-[#0f141f] border border-slate-800 p-3 rounded-lg">
              <span className="text-[10px] uppercase font-mono text-slate-400">Climatological Normal</span>
              <p className="text-lg font-bold font-mono text-slate-200">
                {atmosphereData.summary_statistics.climatological_mean_mm}{' '}
                <span className="text-xs font-normal text-slate-400">mm</span>
              </p>
            </div>
            <div className="bg-[#0f141f] border border-slate-800 p-3 rounded-lg">
              <span className="text-[10px] uppercase font-mono text-slate-400">Peak Month Accum.</span>
              <p className="text-lg font-bold font-mono text-emerald-400">
                {atmosphereData.summary_statistics.peak_month_accumulation_mm}{' '}
                <span className="text-xs font-normal text-slate-400">mm</span>
              </p>
            </div>
            <div className="bg-[#0f141f] border border-slate-800 p-3 rounded-lg">
              <span className="text-[10px] uppercase font-mono text-slate-400">Net Multi-Year Anomaly</span>
              <p
                className={`text-lg font-bold font-mono ${
                  atmosphereData.summary_statistics.net_anomaly_mm >= 0 ? 'text-emerald-400' : 'text-amber-400'
                }`}
              >
                {atmosphereData.summary_statistics.net_anomaly_mm > 0 ? '+' : ''}
                {atmosphereData.summary_statistics.net_anomaly_mm}{' '}
                <span className="text-xs font-normal text-slate-400">mm</span>
              </p>
            </div>
          </div>

          {/* Chart 1: Time Series vs Normal Baseline */}
          <div className="bg-[#0d121d] border border-slate-800 p-4 rounded-xl">
            <div className="flex items-center justify-between mb-3">
              <div>
                <h4 className="text-sm font-semibold text-white flex items-center space-x-2">
                  <TrendingUp className="h-4 w-4 text-cyan-400" />
                  <span>Monthly Precipitation Accumulation vs Climatological Baseline</span>
                </h4>
                <p className="text-[11px] text-slate-400">
                  Location: {atmosphereData.location_name} • Sensor: GPM Microwave & Radar (GPM_3IMERGM)
                </p>
              </div>
              <span className="text-[11px] font-mono text-cyan-400 bg-cyan-950/80 px-2 py-0.5 rounded border border-cyan-800/40">
                Unit: mm / month
              </span>
            </div>

            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={atmosphereData.timeseries} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                  <XAxis dataKey="date" stroke="#64748b" tick={{ fontSize: 10 }} />
                  <YAxis stroke="#64748b" tick={{ fontSize: 10 }} />
                  <Tooltip
                    contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', fontSize: '11px' }}
                    itemStyle={{ color: '#e2e8f0' }}
                  />
                  <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '8px' }} />
                  <Line
                    type="monotone"
                    dataKey="precipitation_accumulated_mm"
                    name="Observed Accumulation (mm)"
                    stroke="#38bdf8"
                    strokeWidth={2}
                    dot={{ r: 2 }}
                    activeDot={{ r: 5 }}
                  />
                  <Line
                    type="monotone"
                    dataKey="climatological_normal_mm"
                    name="1998-2020 Normal Baseline (mm)"
                    stroke="#94a3b8"
                    strokeWidth={1.5}
                    strokeDasharray="4 4"
                    dot={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Chart 2: Monthly Anomaly Departure */}
          <div className="bg-[#0d121d] border border-slate-800 p-4 rounded-xl">
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-sm font-semibold text-white flex items-center space-x-2">
                <BarChart2 className="h-4 w-4 text-emerald-400" />
                <span>Precipitation Departure (Anomaly from Normal)</span>
              </h4>
              <span className="text-[10px] text-slate-400 font-mono">Surplus (+mm) / Deficit (-mm)</span>
            </div>
            <div className="h-48 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={atmosphereData.timeseries} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                  <XAxis dataKey="date" stroke="#64748b" tick={{ fontSize: 10 }} />
                  <YAxis stroke="#64748b" tick={{ fontSize: 10 }} />
                  <ReferenceLine y={0} stroke="#475569" />
                  <Tooltip
                    contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', fontSize: '11px' }}
                  />
                  <Bar
                    dataKey="anomaly_mm"
                    name="Anomaly (mm)"
                    fill="#38bdf8"
                    radius={[2, 2, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      )}

      {/* ================= OCEAN (SWOT) CHARTS ================= */}
      {module === 'ocean' && oceanData && (
        <div className="space-y-4">
          {/* Statistical Highlights */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="bg-[#0f141f] border border-slate-800 p-3 rounded-lg">
              <span className="text-[10px] uppercase font-mono text-slate-400">Mean SSHA</span>
              <p className="text-lg font-bold font-mono text-cyan-400">
                {oceanData.summary_statistics.mean_ssha_m > 0 ? '+' : ''}
                {oceanData.summary_statistics.mean_ssha_m}{' '}
                <span className="text-xs font-normal text-slate-400">m</span>
              </p>
            </div>
            <div className="bg-[#0f141f] border border-slate-800 p-3 rounded-lg">
              <span className="text-[10px] uppercase font-mono text-slate-400">Max Elevation (Warm)</span>
              <p className="text-lg font-bold font-mono text-rose-400">
                +{oceanData.summary_statistics.max_ssha_observed_m}{' '}
                <span className="text-xs font-normal text-slate-400">m</span>
              </p>
            </div>
            <div className="bg-[#0f141f] border border-slate-800 p-3 rounded-lg">
              <span className="text-[10px] uppercase font-mono text-slate-400">Min Depression (Cold)</span>
              <p className="text-lg font-bold font-mono text-blue-400">
                {oceanData.summary_statistics.min_ssha_observed_m}{' '}
                <span className="text-xs font-normal text-slate-400">m</span>
              </p>
            </div>
            <div className="bg-[#0f141f] border border-slate-800 p-3 rounded-lg">
              <span className="text-[10px] uppercase font-mono text-slate-400">Mean Eddy Kinetic Energy</span>
              <p className="text-lg font-bold font-mono text-amber-400">
                {oceanData.summary_statistics.mean_eke_cm2_s2}{' '}
                <span className="text-xs font-normal text-slate-400">cm²/s²</span>
              </p>
            </div>
          </div>

          {/* Chart 1: SSHA Range Band */}
          <div className="bg-[#0d121d] border border-slate-800 p-4 rounded-xl">
            <div className="flex items-center justify-between mb-3">
              <div>
                <h4 className="text-sm font-semibold text-white flex items-center space-x-2">
                  <TrendingUp className="h-4 w-4 text-cyan-400" />
                  <span>Sea Surface Height Anomaly (SSHA) Multi-Year Envelope</span>
                </h4>
                <p className="text-[11px] text-slate-400">
                  Region: {oceanData.region_name} • Instrument: SWOT KaRIn Altimeter (Option A)
                </p>
              </div>
              <span className="text-[11px] font-mono text-cyan-400 bg-cyan-950/80 px-2 py-0.5 rounded border border-cyan-800/40">
                Unit: meters (m)
              </span>
            </div>

            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={oceanData.timeseries} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                  <XAxis dataKey="date" stroke="#64748b" tick={{ fontSize: 10 }} />
                  <YAxis stroke="#64748b" tick={{ fontSize: 10 }} />
                  <Tooltip
                    contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', fontSize: '11px' }}
                  />
                  <ReferenceLine y={0} stroke="#475569" strokeDasharray="3 3" />
                  <Area
                    type="monotone"
                    dataKey="ssha_max_m"
                    name="Max Swath Elevation (m)"
                    stroke="#ef4444"
                    fill="#ef4444"
                    fillOpacity={0.15}
                  />
                  <Area
                    type="monotone"
                    dataKey="ssha_mean_m"
                    name="Mean SSHA (m)"
                    stroke="#38bdf8"
                    strokeWidth={2}
                    fill="#38bdf8"
                    fillOpacity={0.25}
                  />
                  <Area
                    type="monotone"
                    dataKey="ssha_min_m"
                    name="Min Swath Depression (m)"
                    stroke="#3b82f6"
                    fill="#3b82f6"
                    fillOpacity={0.15}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      )}

      {/* ================= LAND (MODIS) CHARTS ================= */}
      {module === 'land' && landData && (
        <div className="space-y-4">
          {/* Statistical Highlights */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="bg-[#0f141f] border border-slate-800 p-3 rounded-lg">
              <span className="text-[10px] uppercase font-mono text-slate-400">Mean NDVI Index</span>
              <p className="text-lg font-bold font-mono text-emerald-400">
                {landData.summary_statistics.mean_ndvi}
              </p>
            </div>
            <div className="bg-[#0f141f] border border-slate-800 p-3 rounded-lg">
              <span className="text-[10px] uppercase font-mono text-slate-400">Peak Canopy Green-Up</span>
              <p className="text-lg font-bold font-mono text-green-300">
                {landData.summary_statistics.peak_ndvi_observed}
              </p>
            </div>
            <div className="bg-[#0f141f] border border-slate-800 p-3 rounded-lg">
              <span className="text-[10px] uppercase font-mono text-slate-400">Minimum Senescence</span>
              <p className="text-lg font-bold font-mono text-amber-400">
                {landData.summary_statistics.minimum_ndvi_observed}
              </p>
            </div>
            <div className="bg-[#0f141f] border border-slate-800 p-3 rounded-lg">
              <span className="text-[10px] uppercase font-mono text-slate-400">Terrestrial Biome</span>
              <p className="text-xs font-semibold text-slate-200 truncate mt-1">
                {landData.summary_statistics.vegetation_cover_type}
              </p>
            </div>
          </div>

          {/* Chart 1: NDVI Phenology Curve */}
          <div className="bg-[#0d121d] border border-slate-800 p-4 rounded-xl">
            <div className="flex items-center justify-between mb-3">
              <div>
                <h4 className="text-sm font-semibold text-white flex items-center space-x-2">
                  <TrendingUp className="h-4 w-4 text-emerald-400" />
                  <span>Vegetation Canopy Phenology: Observed NDVI vs Climatological Median</span>
                </h4>
                <p className="text-[11px] text-slate-400">
                  Ecosystem: {landData.region_name} • Sensor: MODIS Terra/Aqua (MOD13C2 v061)
                </p>
              </div>
              <span className="text-[11px] font-mono text-emerald-400 bg-emerald-950/80 px-2 py-0.5 rounded border border-emerald-800/40">
                Dimensionless [-0.2 to +1.0]
              </span>
            </div>

            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={landData.timeseries} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                  <XAxis dataKey="date" stroke="#64748b" tick={{ fontSize: 10 }} />
                  <YAxis domain={[0, 1]} stroke="#64748b" tick={{ fontSize: 10 }} />
                  <Tooltip
                    contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', fontSize: '11px' }}
                  />
                  <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '8px' }} />
                  <Line
                    type="monotone"
                    dataKey="ndvi"
                    name="Observed NDVI Canopy"
                    stroke="#10b981"
                    strokeWidth={2}
                    dot={{ r: 2 }}
                    activeDot={{ r: 5 }}
                  />
                  <Line
                    type="monotone"
                    dataKey="evi"
                    name="Enhanced Veg Index (EVI)"
                    stroke="#06b6d4"
                    strokeWidth={1.5}
                    dot={false}
                  />
                  <Line
                    type="monotone"
                    dataKey="historical_ndvi_median"
                    name="Historical Phenology Median"
                    stroke="#94a3b8"
                    strokeWidth={1.5}
                    strokeDasharray="4 4"
                    dot={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
