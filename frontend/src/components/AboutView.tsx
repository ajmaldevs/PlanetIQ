import React from 'react';
import { Waves, CloudRain, Trees, ShieldCheck, ExternalLink } from 'lucide-react';

export const AboutView: React.FC = () => {
  return (
    <div className="max-w-4xl mx-auto w-full space-y-8 py-4">
      {/* Intro */}
      <div className="space-y-3">
        <div className="inline-flex items-center space-x-2 text-xs font-mono text-cyan-400 bg-cyan-950/60 border border-cyan-800/40 px-3 py-1 rounded-full">
          <span>NASA Space Apps Challenge 2026</span>
        </div>
        <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-white">
          About TerraLens
        </h1>
        <p className="text-base sm:text-lg text-slate-300 leading-relaxed font-normal">
          TerraLens is an interactive Earth observation platform that helps high school students, college researchers,
          and the public understand how Earth's interconnected planetary systems are changing.
        </p>
      </div>

      {/* Three Systems Overview */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="p-5 rounded-2xl bg-[#090d16]/80 border border-slate-800/80 space-y-2">
          <div className="flex items-center space-x-2 text-cyan-400 font-semibold text-xs uppercase tracking-wider">
            <Waves className="h-4 w-4" />
            <span>Ocean</span>
          </div>
          <h4 className="text-sm font-bold text-white">SWOT Mission (Option A)</h4>
          <p className="text-xs text-slate-400 leading-relaxed">
            NASA/CNES Ka-band Radar Interferometer (KaRIn) measures sea surface height at 2 km resolution, revealing meso-scale eddies and dynamic currents in meters (m).
          </p>
        </div>

        <div className="p-5 rounded-2xl bg-[#090d16]/80 border border-slate-800/80 space-y-2">
          <div className="flex items-center space-x-2 text-blue-400 font-semibold text-xs uppercase tracking-wider">
            <CloudRain className="h-4 w-4" />
            <span>Atmosphere</span>
          </div>
          <h4 className="text-sm font-bold text-white">GPM IMERG Final Monthly</h4>
          <p className="text-xs text-slate-400 leading-relaxed">
            NASA GES DISC / JAXA precipitation product (GPM_3IMERGM v07). Differentiates instantaneous intensity (mm/hr) from monthly accumulated liquid depth (mm).
          </p>
        </div>

        <div className="p-5 rounded-2xl bg-[#090d16]/80 border border-slate-800/80 space-y-2">
          <div className="flex items-center space-x-2 text-emerald-400 font-semibold text-xs uppercase tracking-wider">
            <Trees className="h-4 w-4" />
            <span>Land</span>
          </div>
          <h4 className="text-sm font-bold text-white">MODIS Vegetation Indices</h4>
          <p className="text-xs text-slate-400 leading-relaxed">
            NASA LP DAAC / USGS MOD13C2 v061. Tracks canopy phenology via NDVI and EVI (dimensionless -0.2 to 1.0) and assesses agricultural drought via VCI %.
          </p>
        </div>
      </div>

      {/* Scientific Principles & Integrity */}
      <div className="p-6 rounded-2xl bg-[#090d16]/80 border border-slate-800/80 space-y-4">
        <div className="flex items-center space-x-2 text-white font-semibold text-sm">
          <ShieldCheck className="h-5 w-5 text-cyan-400" />
          <span>Scientific Accuracy Guidelines</span>
        </div>
        <div className="space-y-3 text-xs text-slate-300 leading-relaxed">
          <p>
            • <strong>No Fabricated Observations:</strong> TerraLens strictly presents authentic NASA Earth science observations. Synthetic or demonstration values are never displayed as genuine satellite measurements.
          </p>
          <p>
            • <strong>Strict Unit Fidelity:</strong> Precipitation rates in mm/hr are never conflated with monthly accumulated liquid depth in mm (P_accum = P_rate × 24 × D_month). Sea surface heights are referenced to standard ellipsoids and Mean Sea Surface.
          </p>
          <p>
            • <strong>Correlation != Causation:</strong> Cross-system teleconnections (such as ENSO Walker circulation shifts) demonstrate statistical couplings mediated by atmospheric waves. They do not imply direct local causation, as ground soil moisture memory and topography strongly modulate outcomes.
          </p>
        </div>
      </div>

      {/* Official Data Links */}
      <div className="p-6 rounded-2xl bg-[#090d16]/80 border border-slate-800/80 space-y-3">
        <h4 className="text-xs font-mono uppercase tracking-wider text-slate-400 font-semibold">
          Official NASA Repositories & Documentation
        </h4>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <a
            href="https://podaac.jpl.nasa.gov/swot"
            target="_blank"
            rel="noopener noreferrer"
            className="p-3 rounded-xl bg-slate-900/60 hover:bg-slate-900 text-xs text-slate-200 border border-slate-800 flex items-center justify-between hover:text-cyan-300 transition-colors"
          >
            <div>
              <span className="font-semibold block">PO.DAAC</span>
              <span className="text-[11px] text-slate-400">SWOT KaRIn Ocean</span>
            </div>
            <ExternalLink className="h-3.5 w-3.5 opacity-60" />
          </a>

          <a
            href="https://gpm.nasa.gov/data/imerg"
            target="_blank"
            rel="noopener noreferrer"
            className="p-3 rounded-xl bg-slate-900/60 hover:bg-slate-900 text-xs text-slate-200 border border-slate-800 flex items-center justify-between hover:text-blue-300 transition-colors"
          >
            <div>
              <span className="font-semibold block">GES DISC</span>
              <span className="text-[11px] text-slate-400">GPM IMERG Rain</span>
            </div>
            <ExternalLink className="h-3.5 w-3.5 opacity-60" />
          </a>

          <a
            href="https://lpdaac.usgs.gov/products/mod13c2v061/"
            target="_blank"
            rel="noopener noreferrer"
            className="p-3 rounded-xl bg-slate-900/60 hover:bg-slate-900 text-xs text-slate-200 border border-slate-800 flex items-center justify-between hover:text-emerald-300 transition-colors"
          >
            <div>
              <span className="font-semibold block">LP DAAC</span>
              <span className="text-[11px] text-slate-400">MODIS Vegetation</span>
            </div>
            <ExternalLink className="h-3.5 w-3.5 opacity-60" />
          </a>
        </div>
      </div>
    </div>
  );
};
