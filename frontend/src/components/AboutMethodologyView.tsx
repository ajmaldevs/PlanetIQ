import React from 'react';
import { BookOpen, ShieldCheck, Cpu, Database, Award, Info } from 'lucide-react';

export const AboutMethodologyView: React.FC = () => {
  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="bg-[#0f141f] border border-slate-800 p-6 rounded-xl space-y-3">
        <div className="flex items-center space-x-2">
          <BookOpen className="h-6 w-6 text-cyan-400" />
          <h2 className="text-2xl font-bold text-white tracking-tight">
            About PlanetIQ & Scientific Methodology
          </h2>
        </div>
        <p className="text-sm text-slate-300 leading-relaxed">
          PlanetIQ is an interactive Earth observation and environmental analysis platform engineered for the{' '}
          <strong className="text-cyan-400">NASA Space Apps Challenge 2026</strong>. It provides high school
          students, university scholars, and the science-curious public with a rigorous, accessible window into the
          interconnected physics governing Earth's ocean, atmosphere, and terrestrial systems.
        </p>
      </div>

      {/* Core Principles */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-[#0f141f] border border-cyan-500/30 p-5 rounded-xl space-y-2.5">
          <ShieldCheck className="h-5 w-5 text-cyan-400" />
          <h3 className="text-sm font-bold text-white">Scientific Accuracy First</h3>
          <p className="text-xs text-slate-400 leading-relaxed">
            PlanetIQ enforces strict scientific integrity. In production, unverified or synthetic demonstration data is completely disabled. Only authoritative NASA Earthdata satellite observations are served to ensure scientific reliability.
          </p>
        </div>

        <div className="bg-[#0f141f] border border-blue-500/30 p-5 rounded-xl space-y-2.5">
          <Cpu className="h-5 w-5 text-blue-400" />
          <h3 className="text-sm font-bold text-white">Unit Precision</h3>
          <p className="text-xs text-slate-400 leading-relaxed">
            We strictly differentiate instantaneous precipitation rate (mm/hr) from monthly accumulated liquid depth
            (mm). Ocean sea heights are referenced to standard ellipsoids and Mean Sea Surface (MSS).
          </p>
        </div>

        <div className="bg-[#0f141f] border border-emerald-500/30 p-5 rounded-xl space-y-2.5">
          <Database className="h-5 w-5 text-emerald-400" />
          <h3 className="text-sm font-bold text-white">Correlation != Causation</h3>
          <p className="text-xs text-slate-400 leading-relaxed">
            Cross-system teleconnections between ocean height and vegetation anomalies are presented with explicit
            physical caveats: planetary waves mediate correlations, but local soil memory and human management dictate
            ground impacts.
          </p>
        </div>
      </div>

      {/* Mission & Dataset Processing Methodology */}
      <div className="bg-[#0d121d] border border-slate-800 p-6 rounded-xl space-y-5">
        <h3 className="text-base font-bold text-white flex items-center space-x-2">
          <Award className="h-5 w-5 text-cyan-400" />
          <span>Intended Products & Measurement Notes</span>
        </h3>

        <div className="space-y-4 text-xs text-slate-300">
          <div className="border-l-2 border-cyan-500 pl-4 space-y-1">
            <h4 className="text-sm font-semibold text-white">1. Ocean: SWOT KaRIn Low Rate Ocean Products (Option A)</h4>
            <p className="leading-relaxed text-slate-400">
              Intended source: NASA PO.DAAC / CNES, at the product's stated 2 km grid resolution. A future ingestion pipeline would need to account for
              wet-tropospheric radiometer delays, sea state bias (SSB) adjustments, and GOT4.10c ocean tidal removal to
              isolate absolute dynamic topography and meso-scale vortex anomalies.
            </p>
          </div>

          <div className="border-l-2 border-blue-500 pl-4 space-y-1">
            <h4 className="text-sm font-semibold text-white">2. Atmosphere: GPM IMERG Final Monthly (GPM_3IMERGM v07)</h4>
            <p className="leading-relaxed text-slate-400">
              NASA GES DISC / JAXA GPM IMERG Final Monthly (0.1° × 0.1°). The pipeline ingests multi-satellite precipitation with gauge calibration. Monthly depth conversion follows P_accum = P_rate × 24 × D_month applied to validated monthly mean rates.
            </p>
          </div>

          <div className="border-l-2 border-emerald-500 pl-4 space-y-1">
            <h4 className="text-sm font-semibold text-white">3. Land: MODIS Monthly Global Vegetation Indices (MOD13C2 v061)</h4>
            <p className="leading-relaxed text-slate-400">
              NASA LP DAAC / USGS MOD13C2 v061 (0.05° Climate Modeling Grid). The pipeline ingests QA-filtered cloud-screened composites, monthly NDVI/EVI, and vegetation condition index (VCI) baseline comparisons.
            </p>
          </div>
        </div>
      </div>

      {/* Target Audiences & Educational Impact */}
      <div className="bg-[#0f141f] border border-slate-800 p-6 rounded-xl space-y-3">
        <h3 className="text-sm font-bold text-white flex items-center space-x-2">
          <Info className="h-4 w-4 text-cyan-400" />
          <span>Designed for Education & Open Science</span>
        </h3>
        <p className="text-xs text-slate-400 leading-relaxed">
          PlanetIQ bridges the gap between raw scientific HDF5/NetCDF files and human comprehension. Students can
          interactively explore how a warming event in the equatorial Pacific Ocean propagates through the atmosphere to
          influence rainfall across the Americas, and subsequently alters the photosynthetic canopy of the Amazon
          Rainforest.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
          <div className="p-3 bg-slate-900/80 rounded-lg border border-slate-800 text-[11px] text-slate-300">
            <span className="font-semibold text-cyan-400 block mb-1">High School Students</span>
            Explore interactive maps, intuitive visual color scales, and plain-English AI explanations.
          </div>
          <div className="p-3 bg-slate-900/80 rounded-lg border border-slate-800 text-[11px] text-slate-300">
            <span className="font-semibold text-blue-400 block mb-1">College Researchers</span>
            Examine multi-year time-series statistics, climatological normals, and exact coordinates.
          </div>
          <div className="p-3 bg-slate-900/80 rounded-lg border border-slate-800 text-[11px] text-slate-300">
            <span className="font-semibold text-emerald-400 block mb-1">General Public</span>
            Understand planetary climate interconnectedness without overwhelming jargon.
          </div>
        </div>
      </div>
    </div>
  );
};
