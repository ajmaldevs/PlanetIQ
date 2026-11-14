import React, { useEffect, useState, useRef, useMemo } from 'react';
import { Navbar, MainView } from './components/Navbar';
import { EarthGlobe, EarthModule, ZoomLevel } from './components/EarthGlobe';
import { MapView } from './components/MapView';
import { ModuleSelector } from './components/ModuleSelector';
import { AdaptiveSidePanel, TimeseriesDataPoint } from './components/AdaptiveSidePanel';
import { TrendDrawer } from './components/TrendDrawer';
import { AssistantView } from './components/AssistantView';
import { AboutView } from './components/AboutView';
import { SearchBar } from './components/SearchBar';
import { DatasetInfoModal } from './components/DatasetInfoModal';
import { resolveGeographicContext } from './services/geography';
import { GISPlace } from './services/gisDatabase';
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
import {
  ArrowLeft,
  Compass,
  Globe as GlobeIcon,
  Map as MapIcon,
  Waves,
  CloudRain,
  Trees,
  TrendingUp,
} from 'lucide-react';

export const App: React.FC = () => {
  const [currentView, setCurrentView] = useState<MainView>('explore');
  const [explorationMode, setExplorationMode] = useState<'3d' | '2d'>('3d');
  const [activeModule, setActiveModule] = useState<EarthModule>(null);
  const [health, setHealth] = useState<SystemHealth | null>(null);

  // Exploration states
  const [selectedDate, setSelectedDate] = useState('2026-03');
  const [selectedFeature, setSelectedFeature] = useState<GeoJSONFeature | null>(null);
  const [selectedPlace, setSelectedPlace] = useState<GISPlace | null>(null);
  const [metricType, setMetricType] = useState<string>('accumulated');
  const [showTrends, setShowTrends] = useState<boolean>(false);
  const [trendsExpanded, setTrendsExpanded] = useState<boolean>(false);
  const [dataLoading, setDataLoading] = useState<boolean>(false);
  const [showDatasetInfo, setShowDatasetInfo] = useState<boolean>(false);
  const [pendingAiPrompt, setPendingAiPrompt] = useState<string | undefined>(undefined);

  // Adaptive Zoom and Contextual Side Panel States
  const [zoomLevel, setZoomLevel] = useState<ZoomLevel>('global');
  const [_cameraDistance, setCameraDistance] = useState<number>(4.6);
  const [isIntroVisible, setIsIntroVisible] = useState<boolean>(true);
  const [sidePanelOpen, setSidePanelOpen] = useState<boolean>(false);
  const [centerCoords, setCenterCoords] = useState<{ lat: number; lon: number }>({
    lat: 10.0,
    lon: -30.0,
  });

  // Scientific data states
  const [atmosphereGrid, setAtmosphereGrid] = useState<GeoJSONFeatureCollection | null>(null);
  const [atmosphereTimeseries, setAtmosphereTimeseries] = useState<AtmosphereTimeSeriesResponse | null>(null);

  const [oceanGrid, setOceanGrid] = useState<GeoJSONFeatureCollection | null>(null);
  const [oceanTimeseries, setOceanTimeseries] = useState<OceanTimeSeriesResponse | null>(null);

  const [landGrid, setLandGrid] = useState<GeoJSONFeatureCollection | null>(null);
  const [landTimeseries, setLandTimeseries] = useState<LandTimeSeriesResponse | null>(null);

  const [crossSystemData, setCrossSystemData] = useState<CrossSystemResponse | null>(null);
  const dataReqIdRef = useRef(0);

  const activeTimeseriesPoints = useMemo((): TimeseriesDataPoint[] | null => {
    if (activeModule === 'atmosphere' && atmosphereTimeseries) {
      return atmosphereTimeseries.timeseries.map((pt) => ({
        date: pt.date,
        value: metricType === 'rate' ? pt.precipitation_rate_mm_hr : pt.precipitation_accumulated_mm,
      }));
    }
    if (activeModule === 'ocean' && oceanTimeseries) {
      return oceanTimeseries.timeseries.map((pt) => ({
        date: pt.date,
        value: pt.ssha_mean_m,
      }));
    }
    if (activeModule === 'land' && landTimeseries) {
      return landTimeseries.timeseries.map((pt) => ({
        date: pt.date,
        value: pt.ndvi,
      }));
    }
    return null;
  }, [activeModule, metricType, atmosphereTimeseries, oceanTimeseries, landTimeseries]);

  // Health check on mount
  useEffect(() => {
    fetchSystemHealth()
      .then(setHealth)
      .catch(() => setHealth(null));
  }, []);

  // Set default metric type on module change while preserving spatial selections
  const handleSelectModule = (mod: EarthModule) => {
    setActiveModule(mod);
    setSidePanelOpen(true);
    if (mod === 'atmosphere') setMetricType('accumulated');
    if (mod === 'ocean') setMetricType('ssha');
    if (mod === 'land') setMetricType('ndvi');
  };

  // Adaptive Zoom and Center Coordinate handlers with hysteresis
  const handleZoomChange = (newZoom: ZoomLevel, dist: number) => {
    setZoomLevel(newZoom);
    setCameraDistance(dist);
    setIsIntroVisible((prev) => {
      // Hysteresis: fade out when zoomed below 4.25, restore when zoomed above 4.35
      if (prev && dist < 4.25) return false;
      if (!prev && dist > 4.35) return true;
      return prev;
    });
  };

  const handleCenterCoordinatesChange = (lat: number, lon: number) => {
    setCenterCoords({ lat, lon });
  };

  // Fetch data when module or date changes with request ID sequence tracking to eliminate race conditions
  useEffect(() => {
    if (!activeModule) return;
    setDataLoading(true);
    const reqId = ++dataReqIdRef.current;

    if (activeModule === 'atmosphere') {
      fetchAtmosphereGrid(selectedDate)
        .then((grid) => {
          if (reqId !== dataReqIdRef.current) return;
          setAtmosphereGrid(grid);
          if (grid.features.length > 0 && !selectedFeature) {
            setSelectedFeature(grid.features[0]);
          }
        })
        .catch(console.error);

      const lat = selectedFeature?.properties.latitude ?? centerCoords.lat ?? 6.5;
      const lon = selectedFeature?.properties.longitude ?? centerCoords.lon ?? -150.0;
      fetchAtmosphereTimeseries(lat, lon)
        .then((ts) => {
          if (reqId !== dataReqIdRef.current) return;
          setAtmosphereTimeseries(ts);
        })
        .catch(console.error)
        .finally(() => {
          if (reqId === dataReqIdRef.current) setDataLoading(false);
        });
    } else if (activeModule === 'ocean') {
      fetchOceanObservations(selectedDate)
        .then((grid) => {
          if (reqId !== dataReqIdRef.current) return;
          setOceanGrid(grid);
          if (grid.features.length > 0 && !selectedFeature) {
            setSelectedFeature(grid.features[0]);
          }
        })
        .catch(console.error);

      const lat = selectedFeature?.properties.latitude ?? centerCoords.lat ?? 36.0;
      const lon = selectedFeature?.properties.longitude ?? centerCoords.lon ?? -68.0;
      fetchOceanTimeseries(lat, lon)
        .then((ts) => {
          if (reqId !== dataReqIdRef.current) return;
          setOceanTimeseries(ts);
        })
        .catch(console.error)
        .finally(() => {
          if (reqId === dataReqIdRef.current) setDataLoading(false);
        });
    } else if (activeModule === 'land') {
      fetchLandGrid(selectedDate)
        .then((grid) => {
          if (reqId !== dataReqIdRef.current) return;
          setLandGrid(grid);
          if (grid.features.length > 0 && !selectedFeature) {
            setSelectedFeature(grid.features[0]);
          }
        })
        .catch(console.error);

      const lat = selectedFeature?.properties.latitude ?? centerCoords.lat ?? -3.5;
      const lon = selectedFeature?.properties.longitude ?? centerCoords.lon ?? -62.0;
      fetchLandTimeseries(lat, lon)
        .then((ts) => {
          if (reqId !== dataReqIdRef.current) return;
          setLandTimeseries(ts);
        })
        .catch(console.error)
        .finally(() => {
          if (reqId === dataReqIdRef.current) setDataLoading(false);
        });
    }

    // Also fetch cross system teleconnection data for trends
    fetchCrossSystemAnalysis('enso_walker')
      .then((data) => {
        if (reqId !== dataReqIdRef.current) return;
        setCrossSystemData(data);
      })
      .catch(console.error);
  }, [activeModule, selectedDate]);

  // Handle Point click on the 3D globe or 2D map
  const handleFeatureSelect = (feat: GeoJSONFeature) => {
    setSelectedFeature(feat);
    setSidePanelOpen(true);
    const lat = feat.properties.latitude;
    const lon = feat.properties.longitude;

    if (activeModule === 'atmosphere') {
      fetchAtmosphereTimeseries(lat, lon)
        .then(setAtmosphereTimeseries)
        .catch(console.error);
    } else if (activeModule === 'ocean') {
      fetchOceanTimeseries(lat, lon)
        .then(setOceanTimeseries)
        .catch(console.error);
    } else if (activeModule === 'land') {
      fetchLandTimeseries(lat, lon)
        .then(setLandTimeseries)
        .catch(console.error);
    }
  };

  // Handle GIS place label selection (cities, countries, states, oceans)
  const handlePlaceSelect = (place: GISPlace) => {
    setSelectedPlace(place);
    setSidePanelOpen(true);
  };

  // Handle Preset feature selection from Context Panel
  const handleSelectPreset = (lat: number, lon: number, name: string) => {
    const dummyFeature: GeoJSONFeature = {
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [lon, lat] },
      properties: {
        location_name: name,
        region_name: name,
        latitude: lat,
        longitude: lon,
      },
    };
    setSelectedFeature(dummyFeature);
    setSidePanelOpen(true);

    if (activeModule === 'atmosphere') {
      fetchAtmosphereTimeseries(lat, lon)
        .then(setAtmosphereTimeseries)
        .catch(console.error);
    } else if (activeModule === 'ocean') {
      fetchOceanTimeseries(lat, lon)
        .then(setOceanTimeseries)
        .catch(console.error);
    } else if (activeModule === 'land') {
      fetchLandTimeseries(lat, lon)
        .then(setLandTimeseries)
        .catch(console.error);
    }
  };

  // Search selection handler
  const handleSearchSelect = (lat: number, lon: number, name: string) => {
    if (!activeModule) {
      const lower = name.toLowerCase();
      if (
        lower.includes('ocean') ||
        lower.includes('current') ||
        lower.includes('sea') ||
        lower.includes('passage') ||
        lower.includes('reef') ||
        lower.includes('eddy')
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

  const explicitLocationName =
    selectedFeature?.properties.location_name ||
    selectedFeature?.properties.region_name;

  const currentLat = selectedFeature?.properties.latitude ?? centerCoords.lat;
  const currentLon = selectedFeature?.properties.longitude ?? centerCoords.lon;

  const geographicContext = resolveGeographicContext(
    currentLat,
    currentLon,
    zoomLevel,
    activeModule,
    explicitLocationName
  );

  return (
    <div className="h-screen w-screen bg-[#05070b] text-slate-100 flex flex-col font-sans selection:bg-cyan-500 selection:text-black overflow-hidden relative select-none">
      {/* 3D Realistic Earth Globe Canvas */}
      <EarthGlobe
        activeModule={activeModule}
        data={getActiveData()}
        loading={dataLoading}
        onSelectFeature={handleFeatureSelect}
        selectedFeature={selectedFeature}
        onSelectPlace={handlePlaceSelect}
        selectedPlace={selectedPlace}
        metricType={metricType}
        visible={currentView === 'explore' && explorationMode === '3d'}
        onZoomChange={handleZoomChange}
        onCenterCoordinatesChange={handleCenterCoordinatesChange}
        center={centerCoords}
        sidePanelOpen={sidePanelOpen}
        trendsOpen={showTrends}
      />

      {/* 2D Planar Map Canvas */}
      <div
        className={`fixed z-0 overflow-hidden transition-all duration-300 ease-out ${
          currentView === 'explore' && explorationMode === '2d'
            ? 'opacity-100 pointer-events-auto'
            : 'opacity-0 pointer-events-none'
        }`}
        style={{
          top: activeModule !== null ? '116px' : '64px',
          left: '0px',
          right: sidePanelOpen && typeof window !== 'undefined' && window.innerWidth >= 768 ? '390px' : '0px',
          bottom: showTrends ? (trendsExpanded ? '480px' : '320px') : '0px',
        }}
      >
        <MapView
          module={activeModule || 'overview'}
          data={getActiveData()}
          loading={dataLoading}
          selectedDate={selectedDate}
          setSelectedDate={setSelectedDate}
          onSelectFeature={handleFeatureSelect}
          selectedFeature={selectedFeature}
          activeMetric={metricType}
          setActiveMetric={setMetricType}
          center={centerCoords}
          onCenterChange={handleCenterCoordinatesChange}
          selectedPlace={selectedPlace}
          sidePanelOpen={sidePanelOpen}
          trendsOpen={showTrends}
          trendsExpanded={trendsExpanded}
          visible={currentView === 'explore' && explorationMode === '2d'}
        />
      </div>

      {/* 1. Global Navigation Header (Sticky, minimal, professional) */}
      <Navbar
        currentView={currentView}
        setCurrentView={setCurrentView}
        health={health}
        onResetExplore={() => {
          setActiveModule(null);
          setSelectedFeature(null);
          setSelectedPlace(null);
          setSidePanelOpen(false);
          setShowTrends(false);
        }}
      />

      {/* 2. Main Content Area */}
      {/* Compact Left-Side Module Selector (Active during exploration or when zoomed in) */}
      {(activeModule !== null || !isIntroVisible) && currentView === 'explore' && (
        <div className="fixed left-3 sm:left-6 top-20 sm:top-24 z-30 flex flex-col space-y-1.5 p-1.5 rounded-2xl bg-[#080c16]/90 border border-slate-800/80 backdrop-blur-md shadow-2xl animate-fade-scale">
          <div className="px-2 py-0.5 text-[9px] font-mono uppercase tracking-wider text-slate-500 font-semibold hidden sm:block">
            Systems
          </div>

          <button
            onClick={() => handleSelectModule('ocean')}
            className={`group relative flex items-center space-x-2 px-2.5 py-2 rounded-xl text-xs font-semibold transition-all ${
              activeModule === 'ocean'
                ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 shadow-sm'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
            }`}
            title="Ocean Explorer (SWOT KaRIn Sea Surface Height Anomaly)"
          >
            <Waves className="h-4 w-4 text-cyan-400 shrink-0" />
            <span className="hidden sm:inline">Ocean</span>
            {activeModule === 'ocean' && (
              <span className="h-1.5 w-1.5 rounded-full bg-cyan-400 ml-auto" />
            )}
          </button>

          <button
            onClick={() => handleSelectModule('atmosphere')}
            className={`group relative flex items-center space-x-2 px-2.5 py-2 rounded-xl text-xs font-semibold transition-all ${
              activeModule === 'atmosphere'
                ? 'bg-blue-500/20 text-blue-300 border border-blue-500/40 shadow-sm'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
            }`}
            title="Atmosphere Explorer (GPM IMERG Precipitation)"
          >
            <CloudRain className="h-4 w-4 text-blue-400 shrink-0" />
            <span className="hidden sm:inline">Atmosphere</span>
            {activeModule === 'atmosphere' && (
              <span className="h-1.5 w-1.5 rounded-full bg-blue-400 ml-auto" />
            )}
          </button>

          <button
            onClick={() => handleSelectModule('land')}
            className={`group relative flex items-center space-x-2 px-2.5 py-2 rounded-xl text-xs font-semibold transition-all ${
              activeModule === 'land'
                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 shadow-sm'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
            }`}
            title="Land Explorer (MODIS Vegetation Phenology & Drought)"
          >
            <Trees className="h-4 w-4 text-emerald-400 shrink-0" />
            <span className="hidden sm:inline">Land</span>
            {activeModule === 'land' && (
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 ml-auto" />
            )}
          </button>
        </div>
      )}

      {currentView === 'explore' ? (
        activeModule === null ? (
          /* ================= HOMEPAGE / INTRODUCTORY STATE ================= */
          <div className="flex-1 relative flex flex-col justify-between overflow-hidden pointer-events-none">
            {/* Minimal Hero Header & Centered Search with smooth adaptive fade */}
            <div
              className={`pt-8 sm:pt-12 pb-4 text-center max-w-2xl mx-auto px-4 z-10 transition-all duration-500 ease-out ${
                isIntroVisible
                  ? 'opacity-100 translate-y-0 pointer-events-auto'
                  : 'opacity-0 -translate-y-8 pointer-events-none'
              }`}
            >
              <h1 className="text-3xl sm:text-4xl md:text-5xl font-extrabold tracking-tight text-white drop-shadow-lg">
                Explore Earth's changing systems.
              </h1>
              <p className="mt-2 text-sm sm:text-base text-slate-400 font-normal leading-relaxed max-w-lg mx-auto">
                Discover how our oceans, atmosphere and land are changing through real observations from NASA satellites.
              </p>
              <div className="mt-4 flex flex-col sm:flex-row items-center justify-center gap-2 max-w-xl mx-auto pointer-events-auto">
                <div className="w-full sm:flex-1">
                  <SearchBar onSelectLocation={handleSearchSelect} />
                </div>
                <div className="inline-flex items-center p-0.5 rounded-xl bg-slate-900/90 border border-slate-800 shadow-xl shrink-0 backdrop-blur-md">
                  <button
                    onClick={() => setExplorationMode('3d')}
                    className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                      explorationMode === '3d'
                        ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/50 shadow-sm'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                    aria-label="Switch to 3D Globe View"
                  >
                    <GlobeIcon className="h-3.5 w-3.5" />
                    <span>3D Globe</span>
                  </button>
                  <button
                    onClick={() => setExplorationMode('2d')}
                    className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                      explorationMode === '2d'
                        ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/50 shadow-sm'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                    aria-label="Switch to 2D Planar Map View"
                  >
                    <MapIcon className="h-3.5 w-3.5" />
                    <span>2D Map</span>
                  </button>
                </div>
              </div>
            </div>

            {/* When intro text is faded out on zoom, provide a floating top search bar with 3D/2D controls */}
            {!isIntroVisible && (
              <div className="fixed top-18 left-1/2 -translate-x-1/2 z-20 w-full max-w-xl px-4 flex items-center gap-2 pointer-events-auto transition-all duration-300">
                <div className="flex-1">
                  <SearchBar onSelectLocation={handleSearchSelect} />
                </div>
                <div className="inline-flex items-center p-0.5 rounded-xl bg-slate-900/90 border border-slate-800 shadow-xl shrink-0 backdrop-blur-md">
                  <button
                    onClick={() => setExplorationMode('3d')}
                    className={`flex items-center space-x-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                      explorationMode === '3d'
                        ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/50 shadow-sm'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                    aria-label="Switch to 3D Globe View"
                  >
                    <GlobeIcon className="h-3.5 w-3.5" />
                    <span className="hidden sm:inline">3D Globe</span>
                  </button>
                  <button
                    onClick={() => setExplorationMode('2d')}
                    className={`flex items-center space-x-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                      explorationMode === '2d'
                        ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/50 shadow-sm'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                    aria-label="Switch to 2D Planar Map View"
                  >
                    <MapIcon className="h-3.5 w-3.5" />
                    <span className="hidden sm:inline">2D Map</span>
                  </button>
                </div>
              </div>
            )}

            {/* Generous Central Open Space where Earth floats freely */}
            <div className="flex-1 w-full pointer-events-none" />

            {/* Three Clear Exploration Choices in a Clean Row with smooth adaptive fade */}
            <div
              className={`pb-6 sm:pb-8 px-4 z-10 max-w-4xl mx-auto w-full transition-all duration-500 ease-out ${
                isIntroVisible
                  ? 'opacity-100 translate-y-0 pointer-events-auto'
                  : 'opacity-0 translate-y-8 pointer-events-none'
              }`}
            >
              <div className="text-center mb-2.5">
                <span className="text-[11px] font-mono tracking-widest uppercase text-slate-500 font-semibold">
                  Select a Scientific System to Begin
                </span>
              </div>
              <ModuleSelector
                activeModule={null}
                onSelectModule={handleSelectModule}
              />
            </div>

            {/* Clean Minimal Footer for Homepage */}
            <footer
              className={`z-10 py-2.5 px-4 text-center text-xs text-slate-500 font-mono bg-[#05070b]/60 backdrop-blur-xs border-t border-slate-800/40 transition-all duration-500 ${
                isIntroVisible ? 'opacity-100' : 'opacity-0 pointer-events-none'
              }`}
            >
              TerraLens • NASA Space Apps Challenge 2026 • Earth Observation Intelligence
            </footer>
          </div>
        ) : (
          /* ================= EXPLORE WORKSPACE STATE ================= */
          <div className="flex-1 flex flex-col overflow-hidden relative">
            {/* Dedicated Workspace Sub-Header Bar (Toolbar) */}
            <div className="h-13 bg-[#080c16]/95 border-b border-slate-800/80 px-3 sm:px-4 flex items-center justify-between gap-2 z-30 shrink-0 backdrop-blur-md">
              {/* Left: Overview back + Module switcher pills */}
              <div className="flex items-center space-x-2 shrink-0">
                <button
                  onClick={() => {
                    setActiveModule(null);
                    setSelectedFeature(null);
                    setSelectedPlace(null);
                    setSidePanelOpen(false);
                    setShowTrends(false);
                  }}
                  className="flex items-center space-x-1 px-2.5 py-1.5 rounded-lg text-xs font-medium text-slate-300 hover:text-white bg-slate-900/90 hover:bg-slate-800 border border-slate-800 transition-colors"
                  title="Return to global overview"
                >
                  <ArrowLeft className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">Overview</span>
                </button>

                <div className="h-5 w-px bg-slate-800 hidden sm:block" />

                {/* Unified System Selector Tabs */}
                <div className="inline-flex items-center p-0.5 rounded-lg bg-slate-900/90 border border-slate-800">
                  <button
                    onClick={() => handleSelectModule('ocean')}
                    className={`flex items-center space-x-1.5 px-2.5 sm:px-3 py-1 rounded-md text-xs font-semibold transition-all ${
                      activeModule === 'ocean'
                        ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 shadow-sm'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    <Waves className="h-3.5 w-3.5 text-cyan-400" />
                    <span className="capitalize">Ocean</span>
                  </button>

                  <button
                    onClick={() => handleSelectModule('atmosphere')}
                    className={`flex items-center space-x-1.5 px-2.5 sm:px-3 py-1 rounded-md text-xs font-semibold transition-all ${
                      activeModule === 'atmosphere'
                        ? 'bg-blue-500/20 text-blue-300 border border-blue-500/40 shadow-sm'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    <CloudRain className="h-3.5 w-3.5 text-blue-400" />
                    <span className="capitalize">Atmosphere</span>
                  </button>

                  <button
                    onClick={() => handleSelectModule('land')}
                    className={`flex items-center space-x-1.5 px-2.5 sm:px-3 py-1 rounded-md text-xs font-semibold transition-all ${
                      activeModule === 'land'
                        ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 shadow-sm'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    <Trees className="h-3.5 w-3.5 text-emerald-400" />
                    <span className="capitalize">Land</span>
                  </button>
                </div>
              </div>

              {/* Center: Geographic Search Bar */}
              <div className="flex-1 max-w-xs sm:max-w-sm md:max-w-md mx-2">
                <SearchBar onSelectLocation={handleSearchSelect} />
              </div>

              {/* Right: 3D/2D Mode Switcher + Trends + Context Panel Toggles */}
              <div className="flex items-center space-x-1.5 shrink-0">
                {/* 2D / 3D Switch */}
                <div className="inline-flex items-center p-0.5 rounded-lg bg-slate-900/90 border border-slate-800">
                  <button
                    onClick={() => setExplorationMode('3d')}
                    className={`flex items-center space-x-1.5 px-2.5 py-1 rounded-md text-xs font-semibold transition-all ${
                      explorationMode === '3d'
                        ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 shadow-sm'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                    title="Switch to 3D Spherical Earth Globe"
                    aria-label="Switch to 3D Globe View"
                  >
                    <GlobeIcon className="h-3.5 w-3.5" />
                    <span>3D Globe</span>
                  </button>
                  <button
                    onClick={() => setExplorationMode('2d')}
                    className={`flex items-center space-x-1.5 px-2.5 py-1 rounded-md text-xs font-semibold transition-all ${
                      explorationMode === '2d'
                        ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 shadow-sm'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                    title="Switch to 2D Planar Map"
                    aria-label="Switch to 2D Planar Map View"
                  >
                    <MapIcon className="h-3.5 w-3.5" />
                    <span>2D Map</span>
                  </button>
                </div>

                <div className="h-5 w-px bg-slate-800 hidden sm:block" />

                {/* Trends Drawer Toggle Button */}
                <button
                  onClick={() => setShowTrends(!showTrends)}
                  className={`flex items-center space-x-1 px-2.5 py-1 rounded-lg text-xs font-medium border transition-all ${
                    showTrends
                      ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/50 shadow-sm'
                      : 'bg-slate-900/90 text-slate-300 border-slate-800 hover:bg-slate-800 hover:text-white'
                  }`}
                  title="Toggle Historical Trends & Teleconnections"
                >
                  <TrendingUp className="h-3.5 w-3.5 text-cyan-400" />
                  <span className="hidden md:inline">Trends</span>
                </button>

                {/* Context Panel Toggle Button */}
                <button
                  onClick={() => setSidePanelOpen(!sidePanelOpen)}
                  className={`flex items-center space-x-1 px-2.5 py-1 rounded-lg text-xs font-medium border transition-all ${
                    sidePanelOpen
                      ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/50 shadow-sm'
                      : 'bg-slate-900/90 text-slate-300 border-slate-800 hover:bg-slate-800 hover:text-white'
                  }`}
                  title="Toggle Scientific Context Panel"
                >
                  <Compass className="h-3.5 w-3.5 text-cyan-400" />
                  <span className="hidden md:inline">Context</span>
                  <span className="text-[10px] font-mono text-cyan-400 bg-cyan-950/60 px-1.5 py-0.2 rounded-full capitalize">
                    {zoomLevel}
                  </span>
                </button>
              </div>
            </div>

            {/* Workspace Body: Viewport Canvas + Side-by-Side Context Panel */}
            <div className="flex-1 relative flex overflow-hidden">
              {/* Viewport Area: Globe or 2D Map + Bottom TrendDrawer */}
              <div className="flex-1 h-full relative overflow-hidden">
                {/* Expandable Bottom Analysis Drawer (Trends & Teleconnections) */}
                <TrendDrawer
                  activeModule={activeModule}
                  atmosphereData={atmosphereTimeseries}
                  oceanData={oceanTimeseries}
                  landData={landTimeseries}
                  crossSystemData={crossSystemData}
                  loading={dataLoading}
                  isOpen={showTrends}
                  onClose={() => setShowTrends(false)}
                  onToggleOpen={() => setShowTrends(!showTrends)}
                  isExpanded={trendsExpanded}
                  onToggleExpand={() => setTrendsExpanded(!trendsExpanded)}
                  sidePanelOpen={sidePanelOpen}
                />
              </div>

              {/* Contextual Information Panel (Docks cleanly on right) */}
              <AdaptiveSidePanel
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
                zoomLevel={zoomLevel}
                geographicContext={geographicContext}
                timeseriesData={activeTimeseriesPoints}
                isOpen={sidePanelOpen}
                onClose={() => setSidePanelOpen(false)}
              />
            </div>
          </div>
        )
      ) : currentView === 'catalog' ? (
        /* ================= DATASET CATALOG VIEW ================= */
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8 pointer-events-auto">
          <div className="max-w-5xl mx-auto">
            <AboutView initialTab="catalog" />
          </div>
        </div>
      ) : currentView === 'assistant' ? (
        /* ================= AI ASSISTANT VIEW ================= */
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8 pointer-events-auto">
          <div className="max-w-4xl mx-auto">
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
        </div>
      ) : (
        /* ================= ABOUT VIEW ================= */
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8 pointer-events-auto">
          <div className="max-w-5xl mx-auto">
            <AboutView initialTab="overview" />
          </div>
        </div>
      )}

      {/* Authentic Dataset Provenance & Limitations Modal */}
      {showDatasetInfo && activeModule && (
        <DatasetInfoModal
          activeModule={activeModule}
          onClose={() => setShowDatasetInfo(false)}
        />
      )}
    </div>
  );
};

export default App;
