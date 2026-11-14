import React, { useEffect, useState } from 'react';
import { Navbar, ActiveTab } from './components/Navbar';
import { MapView } from './components/MapView';
import { ScientificCharts } from './components/ScientificCharts';
import { CrossSystemView } from './components/CrossSystemView';
import { AssistantView } from './components/AssistantView';
import { DatasetCatalogView } from './components/DatasetCatalogView';
import { AboutMethodologyView } from './components/AboutMethodologyView';
import { DataNotice } from './components/DataNotice';
import {
  fetchSystemHealth,
  fetchAtmosphereGrid,
  fetchAtmosphereTimeseries,
  fetchOceanObservations,
  fetchOceanTimeseries,
  fetchLandGrid,
  fetchLandTimeseries,
  SystemHealth,
  GeoJSONFeatureCollection,
  GeoJSONFeature,
  AtmosphereTimeSeriesResponse,
  OceanTimeSeriesResponse,
  LandTimeSeriesResponse,
} from './services/api';
import {
  Globe2,
  Waves,
  CloudRain,
  Trees,
  ArrowRight,
} from 'lucide-react';

export const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<ActiveTab>('overview');
  const [health, setHealth] = useState<SystemHealth | null>(null);
  const [loadingHealth, setLoadingHealth] = useState(true);

  // Common Map State
  const [selectedDate, setSelectedDate] = useState('2026-03');
  const [selectedFeature, setSelectedFeature] = useState<GeoJSONFeature | null>(null);
  const [activeMetric, setActiveMetric] = useState<string>('accumulated');

  // Scientific Data States
  const [atmosphereGrid, setAtmosphereGrid] = useState<GeoJSONFeatureCollection | null>(null);
  const [atmosphereTimeseries, setAtmosphereTimeseries] = useState<AtmosphereTimeSeriesResponse | null>(null);

  const [oceanGrid, setOceanGrid] = useState<GeoJSONFeatureCollection | null>(null);
  const [oceanTimeseries, setOceanTimeseries] = useState<OceanTimeSeriesResponse | null>(null);

  const [landGrid, setLandGrid] = useState<GeoJSONFeatureCollection | null>(null);
  const [landTimeseries, setLandTimeseries] = useState<LandTimeSeriesResponse | null>(null);

  const [dataLoading, setDataLoading] = useState(false);

  // Initial Health check
  useEffect(() => {
    fetchSystemHealth()
      .then((data) => {
        setHealth(data);
        setLoadingHealth(false);
      })
      .catch(() => {
        setHealth(null);
        setLoadingHealth(false);
      });
  }, []);

  // Update active metric default when tab changes
  useEffect(() => {
    if (activeTab === 'atmosphere') setActiveMetric('accumulated');
    if (activeTab === 'ocean') setActiveMetric('ssha');
    if (activeTab === 'land') setActiveMetric('ndvi');
  }, [activeTab]);

  // Load Spatial and Timeseries Data
  useEffect(() => {
    setDataLoading(true);

    if (activeTab === 'atmosphere' || activeTab === 'overview') {
      fetchAtmosphereGrid(selectedDate)
        .then((grid) => {
          setAtmosphereGrid(grid);
          if (grid.features.length > 0 && !selectedFeature) {
            setSelectedFeature(grid.features[0]);
          }
        })
        .catch(console.error);

      const lat = selectedFeature?.properties.latitude ?? 6.5;
      const lon = selectedFeature?.properties.longitude ?? -150.0;
      fetchAtmosphereTimeseries(lat, lon)
        .then(setAtmosphereTimeseries)
        .catch(console.error)
        .finally(() => setDataLoading(false));
    } else if (activeTab === 'ocean') {
      fetchOceanObservations(selectedDate)
        .then((grid) => {
          setOceanGrid(grid);
          if (grid.features.length > 0) setSelectedFeature(grid.features[0]);
        })
        .catch(console.error);

      const lat = selectedFeature?.properties.latitude ?? 36.0;
      const lon = selectedFeature?.properties.longitude ?? -68.0;
      fetchOceanTimeseries(lat, lon)
        .then(setOceanTimeseries)
        .catch(console.error)
        .finally(() => setDataLoading(false));
    } else if (activeTab === 'land') {
      fetchLandGrid(selectedDate)
        .then((grid) => {
          setLandGrid(grid);
          if (grid.features.length > 0) setSelectedFeature(grid.features[0]);
        })
        .catch(console.error);

      const lat = selectedFeature?.properties.latitude ?? -3.5;
      const lon = selectedFeature?.properties.longitude ?? -62.0;
      fetchLandTimeseries(lat, lon)
        .then(setLandTimeseries)
        .catch(console.error)
        .finally(() => setDataLoading(false));
    } else {
      setDataLoading(false);
    }
  }, [activeTab, selectedDate]);

  // Handle Feature selection from Map
  const handleFeatureSelect = (feat: GeoJSONFeature) => {
    setSelectedFeature(feat);
    const lat = feat.properties.latitude;
    const lon = feat.properties.longitude;

    if (activeTab === 'atmosphere') {
      fetchAtmosphereTimeseries(lat, lon).then(setAtmosphereTimeseries);
    } else if (activeTab === 'ocean') {
      fetchOceanTimeseries(lat, lon).then(setOceanTimeseries);
    } else if (activeTab === 'land') {
      fetchLandTimeseries(lat, lon).then(setLandTimeseries);
    }
  };

  const getActiveMapData = () => {
    if (activeTab === 'ocean') return oceanGrid;
    if (activeTab === 'atmosphere') return atmosphereGrid;
    if (activeTab === 'land') return landGrid;
    return atmosphereGrid;
  };

  return (
    <div className="min-h-screen bg-[#07090e] text-slate-100 flex flex-col font-sans selection:bg-cyan-500 selection:text-black">
      {/* Top Navbar */}
      <Navbar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        health={health}
        loadingHealth={loadingHealth}
      />

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        {/* ================= OVERVIEW TAB ================= */}
        {activeTab === 'overview' && (
          <div className="space-y-6">
            {/* Hero Banner */}
            <div className="relative rounded-2xl bg-gradient-to-r from-[#0d121d] via-[#111728] to-[#0d121d] border border-slate-800 p-8 overflow-hidden shadow-2xl">
              <div className="absolute right-0 top-0 bottom-0 w-1/3 bg-radial from-cyan-500/10 to-transparent pointer-events-none" />
              <div className="max-w-3xl space-y-3 relative z-10">
                <div className="flex items-center space-x-2">
                  <span className="text-xs bg-cyan-950/90 text-cyan-400 border border-cyan-800/80 px-2.5 py-0.5 rounded-full font-mono uppercase tracking-widest">
                    NASA Space Apps Challenge 2026
                  </span>
                  <span className="text-xs text-slate-400 font-mono">• Planetary Systems Intelligence</span>
                </div>
                <h1 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold text-white tracking-tight leading-tight">
                  Understand Earth's Interconnected Systems.
                </h1>
                <p className="text-sm sm:text-base text-slate-300 leading-relaxed pt-1">
                  TerraLens harmonizes high-resolution satellite measurements across the{' '}
                  <strong className="text-cyan-400">Ocean</strong> (SWOT KaRIn altimetry),{' '}
                  <strong className="text-blue-400">Atmosphere</strong> (GPM IMERG precipitation), and{' '}
                  <strong className="text-emerald-400">Land</strong> (MODIS vegetation indices) into an interactive
                  scientific observation dashboard.
                </p>

                <div className="flex flex-wrap gap-3 pt-3">
                  <button
                    onClick={() => setActiveTab('ocean')}
                    className="px-4 py-2 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-slate-950 text-xs font-semibold flex items-center space-x-1.5 transition-all shadow-md shadow-cyan-500/20"
                  >
                    <span>Explore Ocean (SWOT)</span>
                    <ArrowRight className="h-3.5 w-3.5" />
                  </button>
                  <button
                    onClick={() => setActiveTab('atmosphere')}
                    className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-white text-xs font-semibold flex items-center space-x-1.5 transition-all border border-slate-700"
                  >
                    <span>Atmosphere (GPM)</span>
                  </button>
                  <button
                    onClick={() => setActiveTab('cross-system')}
                    className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-white text-xs font-semibold flex items-center space-x-1.5 transition-all border border-slate-700"
                  >
                    <span>Coupled Teleconnections</span>
                  </button>
                </div>
              </div>
            </div>

            {/* Scientific Notice */}
            <DataNotice type="info" title="Scientific Accuracy Notice">
              TerraLens adheres strictly to NASA scientific data standards. Instantaneous precipitation rate
              (mm/hr) is strictly differentiated from monthly accumulated rainfall (mm). Ocean altimetry is calibrated
              against the GOT4.10c ocean tide model, and terrestrial NDVI operates in standard dimensionless units.
            </DataNotice>

            {/* Three MVP Spheres Highlights */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {/* Ocean Card */}
              <div
                onClick={() => setActiveTab('ocean')}
                className="bg-[#0f141f] border border-cyan-500/30 hover:border-cyan-500/70 p-6 rounded-xl space-y-3 cursor-pointer transition-all group shadow-xl"
              >
                <div className="flex items-center justify-between">
                  <div className="h-10 w-10 rounded-lg bg-cyan-950/80 border border-cyan-800/80 flex items-center justify-center text-cyan-400 group-hover:scale-105 transition-transform">
                    <Waves className="h-5 w-5" />
                  </div>
                  <span className="text-[10px] font-mono text-cyan-400 bg-cyan-950 px-2 py-0.5 rounded border border-cyan-800/60">
                    Option A
                  </span>
                </div>
                <div>
                  <h3 className="text-base font-bold text-white group-hover:text-cyan-400 transition-colors">
                    Ocean Sea Surface Height
                  </h3>
                  <p className="text-[11px] font-mono text-slate-400">SWOT KaRIn Radar Altimetry</p>
                </div>
                <p className="text-xs text-slate-300 leading-relaxed">
                  Submesoscale and mesoscale eddy detection, sea surface height anomalies (SSHA), and geostrophic surface current topography in meters.
                </p>
              </div>

              {/* Atmosphere Card */}
              <div
                onClick={() => setActiveTab('atmosphere')}
                className="bg-[#0f141f] border border-blue-500/30 hover:border-blue-500/70 p-6 rounded-xl space-y-3 cursor-pointer transition-all group shadow-xl"
              >
                <div className="flex items-center justify-between">
                  <div className="h-10 w-10 rounded-lg bg-blue-950/80 border border-blue-800/80 flex items-center justify-center text-blue-400 group-hover:scale-105 transition-transform">
                    <CloudRain className="h-5 w-5" />
                  </div>
                  <span className="text-[10px] font-mono text-blue-400 bg-blue-950 px-2 py-0.5 rounded border border-blue-800/60">
                    GPM_3IMERGM
                  </span>
                </div>
                <div>
                  <h3 className="text-base font-bold text-white group-hover:text-blue-400 transition-colors">
                    Atmospheric Precipitation
                  </h3>
                  <p className="text-[11px] font-mono text-slate-400">GPM IMERG Final Monthly v07</p>
                </div>
                <p className="text-xs text-slate-300 leading-relaxed">
                  Monthly accumulated rainfall depth (mm), average intensity (mm/hr), and historical departure from 1998–2020 normal baselines.
                </p>
              </div>

              {/* Land Card */}
              <div
                onClick={() => setActiveTab('land')}
                className="bg-[#0f141f] border border-emerald-500/30 hover:border-emerald-500/70 p-6 rounded-xl space-y-3 cursor-pointer transition-all group shadow-xl"
              >
                <div className="flex items-center justify-between">
                  <div className="h-10 w-10 rounded-lg bg-emerald-950/80 border border-emerald-800/80 flex items-center justify-center text-emerald-400 group-hover:scale-105 transition-transform">
                    <Trees className="h-5 w-5" />
                  </div>
                  <span className="text-[10px] font-mono text-emerald-400 bg-emerald-950 px-2 py-0.5 rounded border border-emerald-800/60">
                    MOD13C2
                  </span>
                </div>
                <div>
                  <h3 className="text-base font-bold text-white group-hover:text-emerald-400 transition-colors">
                    Terrestrial Canopy Vitality
                  </h3>
                  <p className="text-[11px] font-mono text-slate-400">MODIS Global NDVI / EVI 0.05°</p>
                </div>
                <p className="text-xs text-slate-300 leading-relaxed">
                  Photosynthetic vitality, seasonal phenology cycles, agricultural drought stress classification, and vegetative canopy memory.
                </p>
              </div>
            </div>

            {/* Interactive Global Observation Map */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-bold text-white flex items-center space-x-2">
                    <Globe2 className="h-5 w-5 text-cyan-400" />
                    <span>Global Observation Viewport</span>
                  </h3>
                  <p className="text-xs text-slate-400">
                    Interact directly with satellite observations across the globe. Click any point to inspect scientific properties.
                  </p>
                </div>
              </div>

              <MapView
                module="overview"
                data={getActiveMapData()}
                loading={dataLoading}
                selectedDate={selectedDate}
                setSelectedDate={setSelectedDate}
                onSelectFeature={handleFeatureSelect}
                selectedFeature={selectedFeature}
                activeMetric={activeMetric}
                setActiveMetric={setActiveMetric}
              />
            </div>
          </div>
        )}

        {/* ================= OCEAN MODULE TAB ================= */}
        {activeTab === 'ocean' && (
          <div className="space-y-6">
            <div className="bg-[#0f141f] border border-cyan-500/40 p-6 rounded-xl space-y-2">
              <div className="flex items-center space-x-2 text-cyan-400">
                <Waves className="h-5 w-5" />
                <h2 className="text-xl font-bold text-white">Ocean Sea Surface Height – SWOT Option A</h2>
              </div>
              <p className="text-xs text-slate-300 max-w-3xl leading-relaxed">
                NASA/CNES <strong>Surface Water and Ocean Topography (SWOT)</strong> Ka-band Radar Interferometer (KaRIn)
                measures ocean dynamic topography at 2 km spatial resolution. Track warm-core anticyclonic vortices, cold upwelling eddies, and boundary current anomalies.
              </p>
            </div>

            <MapView
              module="ocean"
              data={oceanGrid}
              loading={dataLoading}
              selectedDate={selectedDate}
              setSelectedDate={setSelectedDate}
              onSelectFeature={handleFeatureSelect}
              selectedFeature={selectedFeature}
              activeMetric={activeMetric}
              setActiveMetric={setActiveMetric}
            />

            <ScientificCharts
              module="ocean"
              oceanData={oceanTimeseries}
              loading={dataLoading}
            />
          </div>
        )}

        {/* ================= ATMOSPHERE MODULE TAB ================= */}
        {activeTab === 'atmosphere' && (
          <div className="space-y-6">
            <div className="bg-[#0f141f] border border-blue-500/40 p-6 rounded-xl space-y-2">
              <div className="flex items-center space-x-2 text-blue-400">
                <CloudRain className="h-5 w-5" />
                <h2 className="text-xl font-bold text-white">Atmosphere Precipitation – GPM IMERG (GPM_3IMERGM)</h2>
              </div>
              <p className="text-xs text-slate-300 max-w-3xl leading-relaxed">
                NASA GES DISC / JAXA <strong>Global Precipitation Measurement (GPM)</strong> IMERG Final Monthly
                precipitation product. Differentiate instantaneous rain rates (mm/hr) from monthly total liquid accumulation depth (mm).
              </p>
            </div>

            <MapView
              module="atmosphere"
              data={atmosphereGrid}
              loading={dataLoading}
              selectedDate={selectedDate}
              setSelectedDate={setSelectedDate}
              onSelectFeature={handleFeatureSelect}
              selectedFeature={selectedFeature}
              activeMetric={activeMetric}
              setActiveMetric={setActiveMetric}
            />

            <ScientificCharts
              module="atmosphere"
              atmosphereData={atmosphereTimeseries}
              loading={dataLoading}
            />
          </div>
        )}

        {/* ================= LAND MODULE TAB ================= */}
        {activeTab === 'land' && (
          <div className="space-y-6">
            <div className="bg-[#0f141f] border border-emerald-500/40 p-6 rounded-xl space-y-2">
              <div className="flex items-center space-x-2 text-emerald-400">
                <Trees className="h-5 w-5" />
                <h2 className="text-xl font-bold text-white">Land Dynamics – MODIS Vegetation Indices (MOD13C2)</h2>
              </div>
              <p className="text-xs text-slate-300 max-w-3xl leading-relaxed">
                NASA LP DAAC / USGS <strong>MODIS Terra/Aqua Monthly Global Vegetation Indices</strong> at 0.05° CMG.
                Quantify photosynthetic canopy vigor via NDVI and EVI, track seasonal phenology curves, and assess agricultural drought stress.
              </p>
            </div>

            <MapView
              module="land"
              data={landGrid}
              loading={dataLoading}
              selectedDate={selectedDate}
              setSelectedDate={setSelectedDate}
              onSelectFeature={handleFeatureSelect}
              selectedFeature={selectedFeature}
              activeMetric={activeMetric}
              setActiveMetric={setActiveMetric}
            />

            <ScientificCharts
              module="land"
              landData={landTimeseries}
              loading={dataLoading}
            />
          </div>
        )}

        {/* ================= CROSS-SYSTEM COUPLED TELECONNECTIONS ================= */}
        {activeTab === 'cross-system' && <CrossSystemView />}

        {/* ================= AI SCIENTIFIC ASSISTANT ================= */}
        {activeTab === 'assistant' && <AssistantView activeModule={activeTab} />}

        {/* ================= DATASET DOCUMENTATION ================= */}
        {activeTab === 'datasets' && <DatasetCatalogView />}

        {/* ================= ABOUT & METHODOLOGY ================= */}
        {activeTab === 'about' && <AboutMethodologyView />}
      </main>

      {/* Scientific Platform Footer */}
      <footer className="border-t border-slate-800/80 bg-[#07090e] px-6 py-6 text-xs text-slate-500">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center space-x-2">
            <Globe2 className="h-4 w-4 text-cyan-400" />
            <span className="font-semibold text-slate-300">TerraLens</span>
            <span>• NASA Space Apps Challenge 2026</span>
          </div>
          <div className="flex items-center space-x-4 text-[11px] font-mono text-slate-400">
            <span>SWOT KaRIn (PO.DAAC)</span>
            <span>•</span>
            <span>GPM IMERG (GES DISC)</span>
            <span>•</span>
            <span>MODIS (LP DAAC)</span>
          </div>
          <p className="text-[11px] text-slate-500">
            Calibrated against NASA Earthdata Standards. All rights reserved.
          </p>
        </div>
      </footer>
    </div>
  );
};

export default App;
