import React, { useEffect, useState } from 'react';
import { Navbar, MainView } from './components/Navbar';
import { EarthGlobe, EarthModule } from './components/EarthGlobe';
import { ModuleSelector } from './components/ModuleSelector';
import { ExplorationPanel } from './components/ExplorationPanel';
import { TrendDrawer } from './components/TrendDrawer';
import { AssistantView } from './components/AssistantView';
import { AboutView } from './components/AboutView';
import {
  fetchSystemHealth,
  fetchAtmosphereGrid,
  fetchAtmosphereTimeseries,
  fetchOceanObservations,
  fetchOceanTimeseries,
  fetchLandGrid,
  fetchLandTimeseries,
  fetchCrossSystemAnalysis,
  SystemHealth,
  GeoJSONFeatureCollection,
  GeoJSONFeature,
  AtmosphereTimeSeriesResponse,
  OceanTimeSeriesResponse,
  LandTimeSeriesResponse,
  CrossSystemResponse,
} from './services/api';
import { ArrowLeft } from 'lucide-react';

export const App: React.FC = () => {
  const [currentView, setCurrentView] = useState<MainView>('explore');
  const [activeModule, setActiveModule] = useState<EarthModule>(null);
  const [health, setHealth] = useState<SystemHealth | null>(null);

  // Exploration states
  const [selectedDate, setSelectedDate] = useState('2026-03');
  const [selectedFeature, setSelectedFeature] = useState<GeoJSONFeature | null>(null);
  const [metricType, setMetricType] = useState<string>('accumulated');
  const [showTrends, setShowTrends] = useState<boolean>(false);
  const [dataLoading, setDataLoading] = useState<boolean>(false);

  // Scientific data states
  const [atmosphereGrid, setAtmosphereGrid] = useState<GeoJSONFeatureCollection | null>(null);
  const [atmosphereTimeseries, setAtmosphereTimeseries] = useState<AtmosphereTimeSeriesResponse | null>(null);

  const [oceanGrid, setOceanGrid] = useState<GeoJSONFeatureCollection | null>(null);
  const [oceanTimeseries, setOceanTimeseries] = useState<OceanTimeSeriesResponse | null>(null);

  const [landGrid, setLandGrid] = useState<GeoJSONFeatureCollection | null>(null);
  const [landTimeseries, setLandTimeseries] = useState<LandTimeSeriesResponse | null>(null);

  const [crossSystemData, setCrossSystemData] = useState<CrossSystemResponse | null>(null);

  // Health check on mount
  useEffect(() => {
    fetchSystemHealth()
      .then(setHealth)
      .catch(() => setHealth(null));
  }, []);

  // Set default metric type on module change
  const handleSelectModule = (mod: EarthModule) => {
    setActiveModule(mod);
    setSelectedFeature(null);
    if (mod === 'atmosphere') setMetricType('accumulated');
    if (mod === 'ocean') setMetricType('ssha');
    if (mod === 'land') setMetricType('ndvi');
  };

  // Fetch data when module or date changes
  useEffect(() => {
    if (!activeModule) return;
    setDataLoading(true);

    if (activeModule === 'atmosphere') {
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
    } else if (activeModule === 'ocean') {
      fetchOceanObservations(selectedDate)
        .then((grid) => {
          setOceanGrid(grid);
          if (grid.features.length > 0 && !selectedFeature) {
            setSelectedFeature(grid.features[0]);
          }
        })
        .catch(console.error);

      const lat = selectedFeature?.properties.latitude ?? 36.0;
      const lon = selectedFeature?.properties.longitude ?? -68.0;
      fetchOceanTimeseries(lat, lon)
        .then(setOceanTimeseries)
        .catch(console.error)
        .finally(() => setDataLoading(false));
    } else if (activeModule === 'land') {
      fetchLandGrid(selectedDate)
        .then((grid) => {
          setLandGrid(grid);
          if (grid.features.length > 0 && !selectedFeature) {
            setSelectedFeature(grid.features[0]);
          }
        })
        .catch(console.error);

      const lat = selectedFeature?.properties.latitude ?? -3.5;
      const lon = selectedFeature?.properties.longitude ?? -62.0;
      fetchLandTimeseries(lat, lon)
        .then(setLandTimeseries)
        .catch(console.error)
        .finally(() => setDataLoading(false));
    }

    // Also fetch cross system teleconnection data for trends
    fetchCrossSystemAnalysis('enso_walker')
      .then(setCrossSystemData)
      .catch(console.error);
  }, [activeModule, selectedDate]);

  // Handle Point click on the 3D globe
  const handleFeatureSelect = (feat: GeoJSONFeature) => {
    setSelectedFeature(feat);
    const lat = feat.properties.latitude;
    const lon = feat.properties.longitude;

    if (activeModule === 'atmosphere') {
      fetchAtmosphereTimeseries(lat, lon).then(setAtmosphereTimeseries);
    } else if (activeModule === 'ocean') {
      fetchOceanTimeseries(lat, lon).then(setOceanTimeseries);
    } else if (activeModule === 'land') {
      fetchLandTimeseries(lat, lon).then(setLandTimeseries);
    }
  };

  // Handle Preset selection
  const handleSelectPreset = (lat: number, lon: number, name: string) => {
    const dummyFeature: GeoJSONFeature = {
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [lon, lat] },
      properties: {
        location_name: name,
        latitude: lat,
        longitude: lon,
      },
    };
    handleFeatureSelect(dummyFeature);
  };

  const getActiveData = () => {
    if (activeModule === 'ocean') return oceanGrid;
    if (activeModule === 'atmosphere') return atmosphereGrid;
    if (activeModule === 'land') return landGrid;
    return null;
  };

  return (
    <div className="min-h-screen bg-[#05070b] text-slate-100 flex flex-col font-sans selection:bg-cyan-500 selection:text-black">
      {/* Minimal Top Header */}
      <Navbar
        currentView={currentView}
        setCurrentView={setCurrentView}
        health={health}
        onResetExplore={() => setActiveModule(null)}
      />

      {/* Main Container */}
      <main className="flex-1 flex flex-col max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-4 sm:py-6">
        {/* ================= EXPLORE VIEW (HOME & EXPLORATION) ================= */}
        {currentView === 'explore' && (
          <div className="flex-1 flex flex-col space-y-6">
            {/* HOMEPAGE STATE: Globe-First with Introduction & Three Cards */}
            {activeModule === null ? (
              <div className="flex-1 flex flex-col justify-between py-2 sm:py-6 space-y-6 sm:space-y-8">
                {/* Simple Messaging */}
                <div className="text-center max-w-2xl mx-auto space-y-2">
                  <h1 className="text-3xl sm:text-5xl font-extrabold tracking-tight text-white">
                    Explore Earth's changing systems.
                  </h1>
                  <p className="text-sm sm:text-base text-slate-400 font-normal leading-relaxed">
                    Discover how our oceans, atmosphere and land are changing through observations
                    from NASA satellites.
                  </p>
                </div>

                {/* Central Interactive 3D Earth Globe */}
                <div className="w-full flex items-center justify-center">
                  <div className="w-full max-w-3xl h-[380px] sm:h-[480px]">
                    <EarthGlobe
                      activeModule={null}
                      data={null}
                      className="h-full rounded-3xl"
                    />
                  </div>
                </div>

                {/* Three Exploration Options */}
                <div className="w-full">
                  <ModuleSelector
                    activeModule={activeModule}
                    onSelectModule={handleSelectModule}
                  />
                </div>
              </div>
            ) : (
              /* EXPLORATION EXPERIENCE STATE: Prominent Globe + Floating Panel + Expandable Trends */
              <div className="flex-1 flex flex-col space-y-6">
                {/* Back to Overview button */}
                <div className="flex items-center justify-between">
                  <button
                    onClick={() => setActiveModule(null)}
                    className="flex items-center space-x-1.5 text-xs text-slate-400 hover:text-cyan-300 transition-colors"
                  >
                    <ArrowLeft className="h-4 w-4" />
                    <span>Back to Overview</span>
                  </button>

                  <span className="text-xs font-mono text-slate-400">
                    Active System:{' '}
                    <strong className="text-cyan-400 capitalize">{activeModule}</strong>
                  </span>
                </div>

                {/* Exploration Globe & Floating Panel Grid */}
                <div className="relative w-full h-[520px] sm:h-[580px] rounded-3xl overflow-hidden border border-slate-800/80 bg-[#070a12] shadow-2xl">
                  {/* Central Prominent Globe */}
                  <EarthGlobe
                    activeModule={activeModule}
                    data={getActiveData()}
                    loading={dataLoading}
                    onSelectFeature={handleFeatureSelect}
                    selectedFeature={selectedFeature}
                    metricType={metricType}
                    className="w-full h-full"
                  />

                  {/* Floating Exploration Panel */}
                  <div className="absolute top-4 left-4 z-20">
                    <ExplorationPanel
                      activeModule={activeModule}
                      onSelectModule={handleSelectModule}
                      selectedDate={selectedDate}
                      setSelectedDate={setSelectedDate}
                      selectedFeature={selectedFeature}
                      metricType={metricType}
                      setMetricType={setMetricType}
                      onSelectPreset={handleSelectPreset}
                      showTrends={showTrends}
                      setShowTrends={setShowTrends}
                    />
                  </div>
                </div>

                {/* Progressive Disclosure: Expandable Detailed Trends */}
                {showTrends && (
                  <TrendDrawer
                    activeModule={activeModule}
                    atmosphereData={atmosphereTimeseries}
                    oceanData={oceanTimeseries}
                    landData={landTimeseries}
                    crossSystemData={crossSystemData}
                    loading={dataLoading}
                  />
                )}
              </div>
            )}
          </div>
        )}

        {/* ================= AI ASSISTANT VIEW ================= */}
        {currentView === 'assistant' && (
          <AssistantView
            activeModule={activeModule}
            selectedLocationName={
              selectedFeature?.properties.location_name ||
              selectedFeature?.properties.region_name ||
              'Global Earth Systems'
            }
            selectedDate={selectedDate}
          />
        )}

        {/* ================= ABOUT VIEW ================= */}
        {currentView === 'about' && <AboutView />}
      </main>

      {/* Minimal Footer */}
      <footer className="border-t border-slate-800/60 py-4 px-6 text-center text-xs text-slate-500 font-mono">
        TerraLens • NASA Space Apps Challenge 2026 • Earth Observation Intelligence
      </footer>
    </div>
  );
};

export default App;
