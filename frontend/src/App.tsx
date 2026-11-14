import React, { useEffect, useState } from 'react';
import { Navbar, MainView } from './components/Navbar';
import { EarthGlobe, EarthModule } from './components/EarthGlobe';
import { ModuleSelector } from './components/ModuleSelector';
import { ExplorationPanel } from './components/ExplorationPanel';
import { TrendDrawer } from './components/TrendDrawer';
import { AssistantView } from './components/AssistantView';
import { AboutView } from './components/AboutView';
import { SearchBar } from './components/SearchBar';
import { DatasetInfoModal } from './components/DatasetInfoModal';
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
  const [showDatasetInfo, setShowDatasetInfo] = useState<boolean>(false);
  const [pendingAiPrompt, setPendingAiPrompt] = useState<string | undefined>(undefined);

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

  // Handle Preset selection with nearest authentic feature matching
  const handleSelectPreset = (lat: number, lon: number, name: string) => {
    const activeData = getActiveData();
    let matchedFeature: GeoJSONFeature | null = null;
    let minDistance = Infinity;

    if (activeData && activeData.features.length > 0) {
      for (const feat of activeData.features) {
        const featLat = feat.properties.latitude ?? feat.geometry.coordinates[1];
        const featLon = feat.properties.longitude ?? feat.geometry.coordinates[0];
        const dist = Math.pow(featLat - lat, 2) + Math.pow(featLon - lon, 2);
        if (dist < minDistance) {
          minDistance = dist;
          matchedFeature = feat;
        }
      }
    }

    if (matchedFeature && minDistance < 150) {
      handleFeatureSelect(matchedFeature);
    } else {
      const fallbackFeature: GeoJSONFeature = {
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [lon, lat] },
        properties: {
          location_name: name,
          latitude: lat,
          longitude: lon,
        },
      };
      handleFeatureSelect(fallbackFeature);
    }
  };

  // Geographic search selection with automatic Earth-system context inference
  const handleSearchSelect = (lat: number, lon: number, name: string) => {
    if (!activeModule) {
      const lower = name.toLowerCase();
      if (
        lower.includes('current') ||
        lower.includes('ocean') ||
        lower.includes('passage') ||
        lower.includes('retroflection') ||
        lower.includes('gulf') ||
        lower.includes('kuroshio') ||
        lower.includes('humboldt') ||
        lower.includes('pacific')
      ) {
        handleSelectModule('ocean');
      } else if (
        lower.includes('rain') ||
        lower.includes('convective') ||
        lower.includes('monsoon') ||
        lower.includes('itcz') ||
        lower.includes('storm')
      ) {
        handleSelectModule('atmosphere');
      } else {
        handleSelectModule('land');
      }
    }
    handleSelectPreset(lat, lon, name);
  };

  const getActiveData = () => {
    if (activeModule === 'ocean') return oceanGrid;
    if (activeModule === 'atmosphere') return atmosphereGrid;
    if (activeModule === 'land') return landGrid;
    return null;
  };

  return (
    <div className="min-h-screen bg-[#05070b] text-slate-100 flex flex-col font-sans selection:bg-cyan-500 selection:text-black overflow-x-hidden relative">
      {/* Immersive Boundless 3D Earth Globe Canvas (Persistent full viewport, zero rectangular clipping) */}
      <EarthGlobe
        activeModule={activeModule}
        data={getActiveData()}
        loading={dataLoading}
        onSelectFeature={handleFeatureSelect}
        selectedFeature={selectedFeature}
        metricType={metricType}
        visible={currentView === 'explore'}
      />

      {/* Minimal Top Header */}
      <Navbar
        currentView={currentView}
        setCurrentView={setCurrentView}
        health={health}
        onResetExplore={() => setActiveModule(null)}
      />

      {/* Main Container */}
      <main className="flex-1 flex flex-col max-w-7xl mx-auto w-full px-3 sm:px-6 lg:px-8 py-3 sm:py-6 overflow-x-hidden relative z-10 pointer-events-none">
        {/* ================= EXPLORE VIEW (HOME & EXPLORATION) ================= */}
        {currentView === 'explore' && (
          <div className="flex-1 flex flex-col space-y-4 pointer-events-none">
            {/* HOMEPAGE STATE: Realistic Satellite Earth Floating in Space */}
            {activeModule === null ? (
              <div className="flex-1 flex flex-col justify-between min-h-[calc(100vh-8.5rem)] py-2 sm:py-4 pointer-events-none">
                {/* Simple Messaging & Global Geographic Search */}
                <div className="text-center max-w-2xl mx-auto space-y-2 sm:space-y-3 pt-1 sm:pt-3 pointer-events-none">
                  <h1 className="text-2xl sm:text-4xl lg:text-5xl font-extrabold tracking-tight text-white drop-shadow-md">
                    Explore Earth's changing systems.
                  </h1>
                  <p className="text-xs sm:text-base text-slate-400 font-normal leading-relaxed max-w-xl mx-auto">
                    Discover how our oceans, atmosphere and land are changing through observations
                    from NASA satellites.
                  </p>
                  <div className="pt-1 max-w-md mx-auto pointer-events-auto">
                    <SearchBar onSelectLocation={handleSearchSelect} />
                  </div>
                </div>

                {/* Open Space Viewport: Earth Floats Freely in Deep Space */}
                <div className="flex-1 w-full min-h-[160px] pointer-events-none" />

                {/* Three Exploration Options */}
                <div className="w-full pt-2 pointer-events-auto">
                  <ModuleSelector
                    activeModule={activeModule}
                    onSelectModule={handleSelectModule}
                  />
                </div>
              </div>
            ) : (
              /* EXPLORATION EXPERIENCE STATE: Expansive Orbit Viewport + Floating Panel + Expandable Trends */
              <div className="flex-1 flex flex-col justify-between min-h-[calc(100vh-8.5rem)] py-2 sm:py-4 space-y-4 pointer-events-none">
                {/* Top Bar Controls */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 px-1 pointer-events-auto">
                  <div className="flex items-center space-x-2">
                    <button
                      onClick={() => setActiveModule(null)}
                      className="flex items-center space-x-1.5 text-xs text-slate-300 hover:text-cyan-300 bg-slate-900/85 px-3 py-1.5 rounded-full border border-slate-800/80 backdrop-blur-md transition-colors"
                    >
                      <ArrowLeft className="h-4 w-4" />
                      <span>Back to Overview</span>
                    </button>

                    <span className="text-xs font-mono text-slate-300 bg-slate-900/85 px-3 py-1.5 rounded-full border border-slate-800/80 backdrop-blur-md">
                      Active System: <strong className="text-cyan-400 capitalize">{activeModule}</strong>
                    </span>
                  </div>

                  <div className="w-full sm:w-80">
                    <SearchBar onSelectLocation={handleSearchSelect} />
                  </div>
                </div>

                {/* Floating Exploration Panel */}
                <div className="w-full sm:max-w-sm pointer-events-auto">
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
                    dataLoading={dataLoading}
                    onExplainWithAI={(prompt) => {
                      setPendingAiPrompt(prompt);
                      setCurrentView('assistant');
                    }}
                    onOpenDatasetInfo={() => setShowDatasetInfo(true)}
                  />
                </div>

                {/* Open Space for Earth Exploration */}
                <div className="flex-1 w-full min-h-[140px] pointer-events-none" />

                {/* Progressive Disclosure: Expandable Detailed Trends */}
                {showTrends && (
                  <div className="w-full pointer-events-auto">
                    <TrendDrawer
                      activeModule={activeModule}
                      atmosphereData={atmosphereTimeseries}
                      oceanData={oceanTimeseries}
                      landData={landTimeseries}
                      crossSystemData={crossSystemData}
                      loading={dataLoading}
                    />
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* ================= AI ASSISTANT VIEW ================= */}
        {currentView === 'assistant' && (
          <div className="w-full pointer-events-auto">
            <AssistantView
              activeModule={activeModule}
              selectedLocationName={
                selectedFeature?.properties.location_name ||
                selectedFeature?.properties.region_name ||
                'Global Earth Systems'
              }
              selectedDate={selectedDate}
              initialPrompt={pendingAiPrompt}
            />
          </div>
        )}

        {/* ================= ABOUT VIEW ================= */}
        {currentView === 'about' && (
          <div className="w-full pointer-events-auto">
            <AboutView />
          </div>
        )}
      </main>

      {/* Authentic Dataset Provenance & Limitations Modal */}
      {showDatasetInfo && activeModule && (
        <DatasetInfoModal
          activeModule={activeModule}
          onClose={() => setShowDatasetInfo(false)}
        />
      )}

      {/* Minimal Footer */}
      <footer className="relative z-10 border-t border-slate-800/60 py-3.5 px-6 text-center text-xs text-slate-500 font-mono bg-[#05070b]/80 backdrop-blur-sm pointer-events-auto">
        TerraLens • NASA Space Apps Challenge 2026 • Earth Observation Intelligence
      </footer>
    </div>
  );
};

export default App;
