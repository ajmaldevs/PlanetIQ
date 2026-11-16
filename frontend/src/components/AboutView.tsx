import React, { useState } from 'react';
import { Waves, CloudRain, Trees, ShieldCheck, ExternalLink, BookOpen, Layers, Cpu, Orbit } from 'lucide-react';
import { DatasetCatalogView } from './DatasetCatalogView';
import { AboutMethodologyView } from './AboutMethodologyView';
import { CrossSystemView } from './CrossSystemView';

export type AboutTab = 'overview' | 'catalog' | 'methodology' | 'teleconnections';

interface AboutViewProps {
  initialTab?: AboutTab;
}

export const AboutView: React.FC<AboutViewProps> = ({ initialTab = 'overview' }) => {
  const [activeTab, setActiveTab] = useState<AboutTab>(initialTab);

  return (
    <div className="max-w-5xl mx-auto w-full space-y-6 py-4">
      {/* Tab Navigation Pill Bar */}
      <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 p-1.5 rounded-2xl bg-[#090d16]/90 border border-slate-800/80 backdrop-blur-md">
        <button
          onClick={() => setActiveTab('overview')}
          className={`flex items-center space-x-2 px-3 sm:px-3.5 py-2 min-h-[38px] rounded-xl text-xs font-semibold transition-all ${
            activeTab === 'overview'
              ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 shadow-sm'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/40'
          }`}
        >
          <BookOpen className="h-3.5 w-3.5 shrink-0" />
          <span>Platform Overview</span>
        </button>

        <button
          onClick={() => setActiveTab('catalog')}
          className={`flex items-center space-x-2 px-3 sm:px-3.5 py-2 min-h-[38px] rounded-xl text-xs font-semibold transition-all ${
            activeTab === 'catalog'
              ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 shadow-sm'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/40'
          }`}
        >
          <Layers className="h-3.5 w-3.5 shrink-0" />
          <span>Dataset Catalog & CMR</span>
        </button>

        <button
          onClick={() => setActiveTab('methodology')}
          className={`flex items-center space-x-2 px-3 sm:px-3.5 py-2 min-h-[38px] rounded-xl text-xs font-semibold transition-all ${
            activeTab === 'methodology'
              ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 shadow-sm'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/40'
          }`}
        >
          <Cpu className="h-3.5 w-3.5 shrink-0" />
          <span>Methodology & Pipelines</span>
        </button>

        <button
          onClick={() => setActiveTab('teleconnections')}
          className={`flex items-center space-x-2 px-3 sm:px-3.5 py-2 min-h-[38px] rounded-xl text-xs font-semibold transition-all ${
            activeTab === 'teleconnections'
              ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 shadow-sm'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/40'
          }`}
        >
          <Orbit className="h-3.5 w-3.5 shrink-0" />
          <span>Planetary Teleconnections</span>
        </button>
      </div>

      {/* Tab 1: Overview */}
      {activeTab === 'overview' && (
        <div className="space-y-8 animate-fade-scale">
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
              and the public explore Earth's interconnected systems. Current map layers and time series are demonstration models, not satellite measurements.
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
                Intended dataset: NASA/CNES Ka-band Radar Interferometer (KaRIn), with product grid resolution around 2 km. The current map layer is a model, not a measurement.
              </p>
            </div>

            <div className="p-5 rounded-2xl bg-[#090d16]/80 border border-slate-800/80 space-y-2">
              <div className="flex items-center space-x-2 text-blue-400 font-semibold text-xs uppercase tracking-wider">
                <CloudRain className="h-4 w-4" />
                <span>Atmosphere</span>
              </div>
              <h4 className="text-sm font-bold text-white">GPM IMERG Final Monthly</h4>
              <p className="text-xs text-slate-400 leading-relaxed">
                Intended dataset: NASA GES DISC / JAXA GPM_3IMERGM v07. This build distinguishes rate (mm/hr) from monthly depth (mm) in its examples; it does not display retrieved precipitation.
              </p>
            </div>

            <div className="p-5 rounded-2xl bg-[#090d16]/80 border border-slate-800/80 space-y-2">
              <div className="flex items-center space-x-2 text-emerald-400 font-semibold text-xs uppercase tracking-wider">
                <Trees className="h-4 w-4" />
                <span>Land</span>
              </div>
              <h4 className="text-sm font-bold text-white">MODIS Vegetation Indices</h4>
              <p className="text-xs text-slate-400 leading-relaxed">
                Intended dataset: NASA LP DAAC / USGS MOD13C2 v061. The app demonstrates NDVI/EVI and VCI concepts with generated values; it does not display retrieved MODIS pixels.
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
                • <strong>Demonstration Data:</strong> This build displays modelled example values, not retrieved NASA observations. NASA dataset citations describe intended sources; generated values must not be interpreted as satellite measurements.
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
      )}

      {/* Tab 2: Dataset Catalog & Provenance */}
      {activeTab === 'catalog' && (
        <div className="animate-fade-scale">
          <DatasetCatalogView />
        </div>
      )}

      {/* Tab 3: Intended Dataset Methodology */}
      {activeTab === 'methodology' && (
        <div className="animate-fade-scale">
          <AboutMethodologyView />
        </div>
      )}

      {/* Tab 4: Coupled Planetary Teleconnections */}
      {activeTab === 'teleconnections' && (
        <div className="animate-fade-scale">
          <CrossSystemView />
        </div>
      )}
    </div>
  );
};

export default AboutView;
