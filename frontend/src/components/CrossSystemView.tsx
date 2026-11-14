import React, { useEffect, useState } from 'react';
import {
  fetchCrossSystemAnalysis,
  CrossSystemResponse,
} from '../services/api';
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
import { Orbit, AlertTriangle, Lightbulb, Compass, Waves, CloudRain, Trees } from 'lucide-react';

export const CrossSystemView: React.FC = () => {
  const [phenomenon, setPhenomenon] = useState<string>('enso_walker');
  const [data, setData] = useState<CrossSystemResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    setLoading(true);
    fetchCrossSystemAnalysis(phenomenon)
      .then((res) => {
        setData(res);
        setLoading(false);
      })
      .catch((err) => {
        console.error('Error fetching cross-system data:', err);
        setLoading(false);
      });
  }, [phenomenon]);

  return (
    <div className="space-y-6">
      {/* Top Banner & Scenario Selector */}
      <div className="bg-[#0f141f] border border-slate-800 p-6 rounded-xl space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center space-x-2">
              <Orbit className="h-5 w-5 text-cyan-400" />
              <h2 className="text-xl font-bold text-white tracking-tight">
                Planetary Teleconnections & Cross-System Coupling
              </h2>
            </div>
            <p className="text-xs text-slate-400 max-w-3xl leading-relaxed">
              Explore how energy and mass transfer across the <strong>Ocean (SWOT SSH)</strong>,{' '}
              <strong>Atmosphere (GPM Precipitation)</strong>, and <strong>Land (MODIS NDVI)</strong>{' '}
              drive continental-scale environmental shifts.
            </p>
          </div>

          {/* Scenario Tabs */}
          <div className="flex bg-slate-900 p-1 rounded-lg border border-slate-800 shrink-0">
            <button
              onClick={() => setPhenomenon('enso_walker')}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${
                phenomenon === 'enso_walker'
                  ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              ENSO & Walker Cell
            </button>
            <button
              onClick={() => setPhenomenon('iod_indian_ocean')}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${
                phenomenon === 'iod_indian_ocean'
                  ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Indian Ocean Dipole (IOD)
            </button>
          </div>
        </div>

        {/* Essential Scientific Alert: Correlation vs Causation */}
        <div className="bg-amber-950/20 border border-amber-600/40 p-4 rounded-lg flex items-start space-x-3">
          <AlertTriangle className="h-5 w-5 text-amber-400 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <span className="text-[11px] font-mono uppercase font-bold text-amber-300 tracking-wider">
              Scientific Principle: Correlation Does Not Equal Causation
            </span>
            <p className="text-xs text-amber-200/90 leading-relaxed">
              {data?.causation_vs_correlation_note ||
                'Observed statistical couplings represent planetary wave teleconnections, not immediate local causation. Terrestrial vegetation responses depend heavily on ground soil retention, elevation barriers, and human land management.'}
            </p>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="h-64 flex items-center justify-center bg-[#0d121d] rounded-xl border border-slate-800">
          <div className="flex items-center space-x-2 text-cyan-400 font-mono text-xs">
            <div className="h-4 w-4 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin" />
            <span>Loading modelled cross-system examples...</span>
          </div>
        </div>
      ) : data ? (
        <div className="space-y-6">
          {/* Synchronized Multi-System Comparison Chart */}
          <div className="bg-[#0d121d] border border-slate-800 p-5 rounded-xl space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-800/80 pb-3">
              <div>
                <h3 className="text-sm font-semibold text-white flex items-center space-x-2">
                  <Compass className="h-4 w-4 text-cyan-400" />
                  <span>Modelled Cross-System Examples (2024–2026)</span>
                </h3>
                <p className="text-[11px] text-slate-400">
                  Tracking ocean sea surface anomalies against lagged atmospheric rain shifts and vegetation responses.
                </p>
              </div>
              <div className="flex items-center space-x-3 text-[10px] font-mono text-slate-400">
                <span className="flex items-center space-x-1">
                  <span className="h-2 w-2 rounded-full bg-cyan-400" />
                  <span>Ocean SSHA (m)</span>
                </span>
                <span className="flex items-center space-x-1">
                  <span className="h-2 w-2 rounded-full bg-blue-500" />
                  <span>Rain Anomaly (mm)</span>
                </span>
                <span className="flex items-center space-x-1">
                  <span className="h-2 w-2 rounded-full bg-emerald-400" />
                  <span>NDVI Anomaly (×10)</span>
                </span>
              </div>
            </div>

            {/* Normalized Overlay Chart */}
            <div className="h-72 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart
                  data={data.timeseries.map((pt) => ({
                    ...pt,
                    // Scale NDVI anomaly by factor of 10 for visual balance alongside meters and mm
                    ndvi_anomaly_scaled: Number((pt.land_ndvi_anomaly * 10).toFixed(2)),
                  }))}
                  margin={{ top: 10, right: 10, left: -10, bottom: 0 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                  <XAxis dataKey="date" stroke="#64748b" tick={{ fontSize: 10 }} />
                  <YAxis stroke="#64748b" tick={{ fontSize: 10 }} />
                  <ReferenceLine y={0} stroke="#475569" strokeDasharray="2 2" />
                  <Tooltip
                    contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', fontSize: '11px' }}
                  />
                  <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '8px' }} />
                  <Line
                    type="monotone"
                    dataKey="ocean_ssha_m"
                    name="Ocean SSHA (meters)"
                    stroke="#38bdf8"
                    strokeWidth={2.5}
                    dot={{ r: 3 }}
                  />
                  <Line
                    type="monotone"
                    dataKey="atmosphere_precipitation_anomaly_mm"
                    name="Atmosphere Precip Anomaly (mm)"
                    stroke="#3b82f6"
                    strokeWidth={2}
                    dot={{ r: 3 }}
                  />
                  <Line
                    type="monotone"
                    dataKey="ndvi_anomaly_scaled"
                    name="Land NDVI Departure (×10)"
                    stroke="#10b981"
                    strokeWidth={2}
                    dot={{ r: 3 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Three-Sphere Coupling Architecture Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-[#0f141f] border border-cyan-500/30 p-4 rounded-xl space-y-2">
              <div className="flex items-center space-x-2 text-cyan-400 font-semibold text-xs uppercase tracking-wider">
                <Waves className="h-4 w-4" />
                <span>1. Ocean Dynamics (SWOT)</span>
              </div>
              <p className="text-xs text-slate-300 leading-relaxed">
                {data.primary_ocean_metric}. High-rate KaRIn interferometry captures Kelvin wave crests and boundary current heat accumulation.
              </p>
            </div>

            <div className="bg-[#0f141f] border border-blue-500/30 p-4 rounded-xl space-y-2">
              <div className="flex items-center space-x-2 text-blue-400 font-semibold text-xs uppercase tracking-wider">
                <CloudRain className="h-4 w-4" />
                <span>2. Atmospheric Shift (GPM)</span>
              </div>
              <p className="text-xs text-slate-300 leading-relaxed">
                {data.primary_atmosphere_metric}. Reorganization of deep convective heating alters regional monsoon intensity and cyclone frequencies.
              </p>
            </div>

            <div className="bg-[#0f141f] border border-emerald-500/30 p-4 rounded-xl space-y-2">
              <div className="flex items-center space-x-2 text-emerald-400 font-semibold text-xs uppercase tracking-wider">
                <Trees className="h-4 w-4" />
                <span>3. Terrestrial Canopy (MODIS)</span>
              </div>
              <p className="text-xs text-slate-300 leading-relaxed">
                {data.primary_land_metric}. Root-zone vadose moisture buffer induces a 30–60 day lag before canopy photosynthetic stress manifests.
              </p>
            </div>
          </div>

          {/* Key Scientific Insights */}
          <div className="bg-[#0f141f] border border-slate-800 p-5 rounded-xl space-y-3">
            <div className="flex items-center space-x-2 text-white font-medium text-xs">
              <Lightbulb className="h-4 w-4 text-cyan-400" />
              <span>Key Analytical Findings & Teleconnection Physics</span>
            </div>
            <ul className="space-y-2 text-xs text-slate-300">
              {data.key_insights.map((insight, idx) => (
                <li key={idx} className="flex items-start space-x-2">
                  <span className="h-1.5 w-1.5 rounded-full bg-cyan-400 shrink-0 mt-1.5" />
                  <span>{insight}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      ) : null}
    </div>
  );
};
