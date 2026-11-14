import React, { useEffect, useState, useRef, useMemo, useCallback } from 'react';
import { Navbar, MainView } from './components/Navbar';
import { EarthGlobe, EarthModule, ZoomLevel } from './components/EarthGlobe';
import { MapView } from './components/MapView';
import { ModuleSelector } from './components/ModuleSelector';
import { AdaptiveSidePanel, TimeseriesDataPoint } from './components/AdaptiveSidePanel';
import { TrendDrawer, TrendDrawerStatus } from './components/TrendDrawer';
import { SharedTimeline } from './components/SharedTimeline';
import { AssistantView } from './components/AssistantView';
import { AboutView } from './components/AboutView';
import { SearchBar, SearchResult } from './components/SearchBar';
import { DatasetInfoModal } from './components/DatasetInfoModal';
import { DataNotice } from './components/DataNotice';
import { resolveGeographicContext } from './services/geography';
import { GISPlace, searchGISPlaces } from './services/gisDatabase';
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
  GeocodingResult,
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
  Layers,
} from 'lucide-react';

export const App: React.FC = () => {
  const [currentView, setCurrentView] = useState<MainView>('explore');
  const [explorationMode, setExplorationMode] = useState<'3d' | '2d'>('3d');
  const [activeModule, setActiveModule] = useState<EarthModule>(null);
  const [activeModules, setActiveModules] = useState<('ocean' | 'atmosphere' | 'land')[]>([]);
  const [trendInitialTab, setTrendInitialTab] = useState<'trends' | 'comparison' | 'teleconnections'>('trends');
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
  const cameraDistanceRef = useRef<number>(4.6);
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

  // Trend drawer state tracking
  const [trendStatus, setTrendStatus] = useState<TrendDrawerStatus>('idle');
  const [trendError, setTrendError] = useState<string | null>(null);
  const trendAbortControllerRef = useRef<AbortController | null>(null);
  const trendReqIdRef = useRef(0);

  // Authoritative active location coordinates for satellite timeseries query
  const activeLocation = useMemo(() => {
    if (selectedFeature) {
      return {
        lat: selectedFeature.properties.latitude,
        lon: selectedFeature.properties.longitude,
        name:
          selectedFeature.properties.location_name ||
          selectedFeature.properties.region_name ||
          'Selected Observation Point',
      };
    }
    if (selectedPlace) {
      return {
        lat: selectedPlace.lat,
        lon: selectedPlace.lon,
        name: selectedPlace.name,
      };
    }
    if (centerCoords.lat !== null && centerCoords.lon !== null) {
      return {
        lat: centerCoords.lat,
        lon: centerCoords.lon,
        name: 'Observed Geographic Center',
      };
    }
    if (activeModule === 'ocean') return { lat: 36.0, lon: -68.0, name: 'North Atlantic Gyre' };
    if (activeModule === 'atmosphere') return { lat: 6.5, lon: -150.0, name: 'Pacific ITCZ' };
    if (activeModule === 'land') return { lat: -3.5, lon: -62.0, name: 'Amazon Basin' };
    return { lat: 0, lon: 0, name: 'Global Equator' };
  }, [selectedFeature, selectedPlace, centerCoords, activeModule]);

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
    if (mod) {
      setActiveModules((prev) => (prev.includes(mod) ? prev : [mod, ...prev]));
    } else {
      setActiveModules([]);
    }
    setSidePanelOpen(true);
    if (mod === 'atmosphere') setMetricType('accumulated');
    if (mod === 'ocean') setMetricType('ssha');
    if (mod === 'land') setMetricType('ndvi');
  };

  const handleToggleModule = (mod: 'ocean' | 'atmosphere' | 'land') => {
    setActiveModules((prev) => {
      let next: ('ocean' | 'atmosphere' | 'land')[];
      if (prev.includes(mod)) {
        if (prev.length <= 1) return prev; // keep at least one active
        next = prev.filter((m) => m !== mod);
      } else {
        next = [...prev, mod];
      }
      setActiveModule(next[0] || null);
      return next;
    });
  };

  // Harmonized multi-system spatial data dictionary
  const multiData = useMemo(() => ({
    ocean: (activeModules.includes('ocean') || activeModule === 'ocean') ? oceanGrid : null,
    atmosphere: (activeModules.includes('atmosphere') || activeModule === 'atmosphere') ? atmosphereGrid : null,
    land: (activeModules.includes('land') || activeModule === 'land') ? landGrid : null,
  }), [activeModules, activeModule, oceanGrid, atmosphereGrid, landGrid]);

  // Adaptive Zoom and Center Coordinate handlers with hysteresis and render throttling
  const handleZoomChange = useCallback((newZoom: ZoomLevel, dist: number) => {
    cameraDistanceRef.current = dist;
    setZoomLevel((prev) => (prev !== newZoom ? newZoom : prev));
    setIsIntroVisible((prev) => {
      // Hysteresis: fade out when zoomed in past global view (dist < 4.50 or non-global zoom level)
      // Restore when camera pulls all the way back out to deep space (dist > 4.65 && newZoom === 'global')
      if (prev && (dist < 4.50 || newZoom !== 'global')) return false;
      if (!prev && dist > 4.65 && newZoom === 'global') return true;
      return prev;
    });
  }, []);

  const handleCenterCoordinatesChange = useCallback((lat: number, lon: number) => {
    setCenterCoords((prev) => {
      if (Math.abs(prev.lat - lat) < 0.4 && Math.abs(prev.lon - lon) < 0.4) return prev;
      return { lat, lon };
    });
  }, []);

  // Dedicated Timeseries Loader with AbortController, request ID guard and error categorization
  const loadTrendTimeseries = useCallback(
    (lat: number, lon: number, _locationName?: string) => {
      if (!activeModule) {
        setTrendStatus('idle');
        return;
      }

      // Cancel previous pending timeseries fetch
      if (trendAbortControllerRef.current) {
        trendAbortControllerRef.current.abort();
      }
      const abortController = new AbortController();
      trendAbortControllerRef.current = abortController;
      const reqId = ++trendReqIdRef.current;

      setTrendStatus('loading');
      setTrendError(null);

      const handleSuccess = (hasData: boolean) => {
        if (reqId !== trendReqIdRef.current) return;
        if (!hasData) {
          setTrendStatus('no_data');
        } else {
          setTrendStatus('success');
        }
      };

      const handleError = (err: any) => {
        if (reqId !== trendReqIdRef.current) return;
        if (err?.name === 'AbortError') return;
        console.error('Error fetching trend timeseries:', err);
        const msg = err?.message || 'Failed to fetch satellite timeseries';
        if (
          msg.includes('Network') ||
          msg.includes('Failed to fetch') ||
          msg.includes('ECONNREFUSED') ||
          msg.includes('Load failed')
        ) {
          setTrendStatus('backend_unavailable');
          setTrendError('Cannot connect to the scientific backend server. Please verify backend service.');
        } else {
          setTrendStatus('error');
          setTrendError(msg);
        }
      };

      const systemsToFetch = activeModules.length > 0 ? activeModules : (activeModule ? [activeModule] : []);
      const promises: Promise<any>[] = [];

      if (systemsToFetch.includes('atmosphere')) {
        promises.push(
          fetchAtmosphereTimeseries(lat, lon, abortController.signal).then((ts) => {
            if (reqId !== trendReqIdRef.current) return;
            setAtmosphereTimeseries(ts);
          })
        );
      }
      if (systemsToFetch.includes('ocean')) {
        promises.push(
          fetchOceanTimeseries(lat, lon, abortController.signal).then((ts) => {
            if (reqId !== trendReqIdRef.current) return;
            setOceanTimeseries(ts);
          })
        );
      }
      if (systemsToFetch.includes('land')) {
        promises.push(
          fetchLandTimeseries(lat, lon, abortController.signal).then((ts) => {
            if (reqId !== trendReqIdRef.current) return;
            setLandTimeseries(ts);
          })
        );
      }

      if (promises.length === 0) {
        setTrendStatus('idle');
        return;
      }

      Promise.all(promises)
        .then(() => {
          if (reqId === trendReqIdRef.current) {
            handleSuccess(true);
          }
        })
        .catch(handleError);
    },
    [activeModule, activeModules]
  );

  // Automatically synchronize satellite timeseries with active location and module
  useEffect(() => {
    if (activeModule || activeModules.length > 0) {
      loadTrendTimeseries(activeLocation.lat, activeLocation.lon, activeLocation.name);
    } else {
      setTrendStatus('idle');
    }
  }, [activeLocation.lat, activeLocation.lon, activeModule, activeModules, loadTrendTimeseries]);

  // Fetch spatial observation grid when module or date changes
  useEffect(() => {
    if (activeModules.length === 0 && !activeModule) return;
    setDataLoading(true);
    const reqId = ++dataReqIdRef.current;

    const gridPromises: Promise<any>[] = [];

    if (activeModules.includes('atmosphere') || activeModule === 'atmosphere') {
      gridPromises.push(
        fetchAtmosphereGrid(selectedDate).then((grid) => {
          if (reqId !== dataReqIdRef.current) return;
          setAtmosphereGrid(grid);
          if (grid.features.length > 0 && !selectedFeature && !selectedPlace) {
            setSelectedFeature(grid.features[0]);
          }
        })
      );
    }
    if (activeModules.includes('ocean') || activeModule === 'ocean') {
      gridPromises.push(
        fetchOceanObservations(selectedDate).then((grid) => {
          if (reqId !== dataReqIdRef.current) return;
          setOceanGrid(grid);
          if (grid.features.length > 0 && !selectedFeature && !selectedPlace) {
            setSelectedFeature(grid.features[0]);
          }
        })
      );
    }
    if (activeModules.includes('land') || activeModule === 'land') {
      gridPromises.push(
        fetchLandGrid(selectedDate).then((grid) => {
          if (reqId !== dataReqIdRef.current) return;
          setLandGrid(grid);
          if (grid.features.length > 0 && !selectedFeature && !selectedPlace) {
            setSelectedFeature(grid.features[0]);
          }
        })
      );
    }

    gridPromises.push(
      fetchCrossSystemAnalysis('enso_walker').then((data) => {
        if (reqId !== dataReqIdRef.current) return;
        setCrossSystemData(data);
      })
    );

    Promise.all(gridPromises)
      .catch(console.error)
      .finally(() => {
        if (reqId === dataReqIdRef.current) setDataLoading(false);
      });
  }, [activeModule, activeModules, selectedDate]);

  // Handle Point click on the 3D globe or 2D map
  const handleFeatureSelect = (feat: GeoJSONFeature) => {
    setSelectedFeature(feat);
    setSelectedPlace(null);
    setSidePanelOpen(true);
  };

  // Handle GIS place label selection (cities, countries, states, oceans)
  const handlePlaceSelect = (place: GISPlace) => {
    setSelectedPlace(place);
    setSelectedFeature(null);
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
    setSelectedPlace(null);
    setSidePanelOpen(true);
  };

  // Helper to map search category strings to GISPlace categories
  const mapPlaceCategory = (cat?: string): GISPlace['category'] => {
    if (!cat) return 'city';
    const c = cat.toLowerCase();
    if (c.includes('country')) return 'country';
    if (c.includes('state') || c.includes('province')) return 'state';
    if (c.includes('continent')) return 'continent';
    if (c.includes('ocean') || c.includes('sea')) return 'ocean';
    if (c.includes('natural') || c.includes('river') || c.includes('lake') || c.includes('mountain')) {
      return 'natural_feature';
    }
    return 'city';
  };

  // Search selection handler with Google Maps-style navigation & bounding boxes
  const handleSearchSelect = (
    lat: number,
    lon: number,
    name: string,
    placeObj?: SearchResult | GISPlace | GeocodingResult
  ) => {
    // Auto-select relevant module if none is active and search target clearly belongs to a domain
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
      }
    }

    let resolvedBbox = placeObj?.bbox;
    let resolvedIsoA3 = (placeObj as any)?.iso_a3;
    let resolvedIsoA2 = (placeObj as any)?.iso_a2;

    // If no bbox provided in placeObj, check client-side GIS database
    if (!resolvedBbox) {
      const gisMatches = searchGISPlaces(name);
      if (gisMatches.length > 0) {
        resolvedBbox = gisMatches[0].bbox;
        resolvedIsoA3 = resolvedIsoA3 || gisMatches[0].iso_a3;
        resolvedIsoA2 = resolvedIsoA2 || gisMatches[0].iso_a2;
      }
    }

    const canonicalPlace: GISPlace = {
      id: (placeObj as any)?.id || `search-${lat}-${lon}`,
      name,
      formal_name: (placeObj as any)?.formal_name,
      iso_a2: resolvedIsoA2,
      iso_a3: resolvedIsoA3,
      lat,
      lon,
      category: mapPlaceCategory((placeObj as any)?.category),
      level: ((placeObj as any)?.level as 1 | 2 | 3 | 4) || 2,
      priority: (placeObj as any)?.priority || 50,
      parentCountry: (placeObj as any)?.parentCountry || (placeObj as any)?.parent_country,
      parentState: (placeObj as any)?.parentState || (placeObj as any)?.parent_state,
      parentContinent: (placeObj as any)?.parentContinent || (placeObj as any)?.parent_continent,
      bbox: resolvedBbox,
      detail: (placeObj as any)?.detail,
    };

    handlePlaceSelect(canonicalPlace);
  };

  const getActiveData = () => {
    if (activeModule === 'ocean') return oceanGrid;
    if (activeModule === 'atmosphere') return atmosphereGrid;
    if (activeModule === 'land') return landGrid;
    return null;
  };

  const explicitLocationName =
    selectedFeature?.properties.location_name ||
    selectedFeature?.properties.region_name ||
    selectedPlace?.name;

  const currentLat = selectedFeature?.properties.latitude ?? selectedPlace?.lat ?? centerCoords.lat;
  const currentLon = selectedFeature?.properties.longitude ?? selectedPlace?.lon ?? centerCoords.lon;

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
        activeModules={activeModules}
        data={getActiveData()}
        multiData={multiData}
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
        cameraDistance={cameraDistanceRef.current}
        sidePanelOpen={sidePanelOpen}
        trendsOpen={showTrends}
        trendsExpanded={trendsExpanded}
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
          right:
            sidePanelOpen &&
            activeModule !== null &&
            currentView === 'explore' &&
            typeof window !== 'undefined' &&
            window.innerWidth >= 1024
              ? '390px'
              : '0px',
          bottom: showTrends
            ? trendsExpanded
              ? '520px'
              : typeof window !== 'undefined' && window.innerWidth >= 640
              ? '384px'
              : '320px'
            : '0px',
        }}
      >
        <MapView
          module={activeModule || 'overview'}
          activeModules={activeModules}
          data={getActiveData()}
          multiData={multiData}
          loading={dataLoading}
          selectedDate={selectedDate}
          setSelectedDate={setSelectedDate}
          onSelectFeature={handleFeatureSelect}
          selectedFeature={selectedFeature}
          activeMetric={metricType}
          setActiveMetric={setMetricType}
          center={centerCoords}
          onCenterChange={handleCenterCoordinatesChange}
          cameraDistance={cameraDistanceRef.current}
          onZoomChange={handleZoomChange}
          selectedPlace={selectedPlace}
          onSelectPlace={handlePlaceSelect}
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
              className={`text-center max-w-2xl mx-auto px-4 z-10 transition-all duration-500 ease-out ${
                isIntroVisible
                  ? 'opacity-100 translate-y-0 pt-8 sm:pt-12 pb-4 max-h-[500px] pointer-events-auto'
                  : 'opacity-0 -translate-y-8 max-h-0 py-0 my-0 overflow-hidden pointer-events-none'
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
              className={`px-4 z-10 max-w-4xl mx-auto w-full transition-all duration-500 ease-out ${
                isIntroVisible
                  ? 'opacity-100 translate-y-0 pb-6 sm:pb-8 max-h-[500px] pointer-events-auto'
                  : 'opacity-0 translate-y-8 max-h-0 py-0 my-0 overflow-hidden pointer-events-none'
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
              className={`z-10 px-4 text-center text-xs text-slate-500 font-mono bg-[#05070b]/60 backdrop-blur-xs border-t transition-all duration-500 ${
                isIntroVisible
                  ? 'opacity-100 py-2.5 max-h-12 border-slate-800/40'
                  : 'opacity-0 py-0 max-h-0 border-transparent overflow-hidden pointer-events-none'
              }`}
            >
              TerraLens • NASA Space Apps Challenge 2026 • Earth Observation Intelligence
            </footer>
          </div>
        ) : (
          /* ================= EXPLORE WORKSPACE STATE ================= */
          <div className="flex-1 flex flex-col overflow-hidden relative pointer-events-none">
            {/* Dedicated Workspace Sub-Header Bar (Toolbar) */}
            <div className="h-13 bg-[#080c16]/95 border-b border-slate-800/80 px-3 sm:px-4 flex items-center justify-between gap-2 z-30 shrink-0 backdrop-blur-md pointer-events-auto">
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

                {/* Unified System Selector Tabs & Multi-System Toggles */}
                <div className="inline-flex items-center p-0.5 rounded-lg bg-slate-900/90 border border-slate-800">
                  <button
                    onClick={() => handleToggleModule('ocean')}
                    className={`flex items-center space-x-1.5 px-2.5 sm:px-3 py-1 rounded-md text-xs font-semibold transition-all ${
                      activeModules.includes('ocean')
                        ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 shadow-sm'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                    title="Toggle Ocean (SWOT Altimetry)"
                  >
                    <Waves className="h-3.5 w-3.5 text-cyan-400" />
                    <span className="capitalize">Ocean</span>
                  </button>

                  <button
                    onClick={() => handleToggleModule('atmosphere')}
                    className={`flex items-center space-x-1.5 px-2.5 sm:px-3 py-1 rounded-md text-xs font-semibold transition-all ${
                      activeModules.includes('atmosphere')
                        ? 'bg-blue-500/20 text-blue-300 border border-blue-500/40 shadow-sm'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                    title="Toggle Atmosphere (GPM Precipitation)"
                  >
                    <CloudRain className="h-3.5 w-3.5 text-blue-400" />
                    <span className="capitalize">Atmosphere</span>
                  </button>

                  <button
                    onClick={() => handleToggleModule('land')}
                    className={`flex items-center space-x-1.5 px-2.5 sm:px-3 py-1 rounded-md text-xs font-semibold transition-all ${
                      activeModules.includes('land')
                        ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 shadow-sm'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                    title="Toggle Land (MODIS Vegetation)"
                  >
                    <Trees className="h-3.5 w-3.5 text-emerald-400" />
                    <span className="capitalize">Land</span>
                  </button>

                  <button
                    onClick={() => {
                      if (activeModules.length === 3) {
                        setActiveModules(['ocean']);
                        setActiveModule('ocean');
                      } else {
                        setActiveModules(['ocean', 'atmosphere', 'land']);
                        setActiveModule('ocean');
                      }
                      setSidePanelOpen(true);
                    }}
                    className={`hidden md:flex items-center space-x-1 px-2 py-1 rounded-md text-[11px] font-semibold transition-all ${
                      activeModules.length === 3
                        ? 'bg-purple-500/20 text-purple-300 border border-purple-500/40 shadow-sm'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                    title="Toggle All 3 Earth Systems Simultaneously"
                  >
                    <Layers className="h-3 w-3" />
                    <span>All 3</span>
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
                    <span className="hidden sm:inline">3D Globe</span>
                    <span className="sm:hidden">3D</span>
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
                    <span className="hidden sm:inline">2D Map</span>
                    <span className="sm:hidden">2D</span>
                  </button>
                </div>

                <div className="h-5 w-px bg-slate-800 hidden sm:block" />

                {/* Trends Drawer Toggle Button */}
                <button
                  onClick={() => setShowTrends(!showTrends)}
                  className={`flex items-center space-x-1 px-2 sm:px-2.5 py-1 rounded-lg text-xs font-medium border transition-all ${
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
                  className={`flex items-center space-x-1 px-2 sm:px-2.5 py-1 rounded-lg text-xs font-medium border transition-all ${
                    sidePanelOpen
                      ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/50 shadow-sm'
                      : 'bg-slate-900/90 text-slate-300 border-slate-800 hover:bg-slate-800 hover:text-white'
                  }`}
                  title="Toggle Scientific Context Panel"
                >
                  <Compass className="h-3.5 w-3.5 text-cyan-400" />
                  <span className="hidden md:inline">Context</span>
                  <span className="hidden sm:inline text-[10px] font-mono text-cyan-400 bg-cyan-950/60 px-1.5 py-0.2 rounded-full capitalize">
                    {zoomLevel}
                  </span>
                </button>
              </div>
            </div>

            {/* Workspace Body: Viewport Canvas + Side-by-Side Context Panel */}
            <div className="flex-1 relative flex overflow-hidden pointer-events-none">
              {/* Viewport Area: Globe or 2D Map + Bottom TrendDrawer */}
              <div className="flex-1 h-full relative overflow-hidden pointer-events-none">
                {(activeModule !== null || activeModules.length > 0) && (
                  <div className="absolute z-40 top-3 left-3 right-3 sm:left-4 sm:right-auto sm:max-w-lg pointer-events-auto">
                    <DataNotice type="demo" title="Demonstration data — not NASA observations">
                      Scientific layers, time series, comparisons, and cross-system examples are modelled by this build. NASA product citations describe intended data sources; no NASA granules are currently loaded.
                    </DataNotice>
                  </div>
                )}
                {/* Unified Earth System Shared Timeline */}
                <SharedTimeline
                  selectedDate={selectedDate}
                  onDateChange={(newDate) => setSelectedDate(newDate)}
                  activeModules={activeModules.length > 0 ? activeModules : (activeModule ? [activeModule] : [])}
                  sidePanelOpen={sidePanelOpen}
                  trendsOpen={showTrends}
                  onOpenPeriodComparison={() => {
                    setShowTrends(true);
                    setTrendsExpanded(true);
                    setTrendInitialTab('comparison');
                  }}
                />

                {/* Expandable Bottom Analysis Drawer (Trends & Teleconnections) */}
                <TrendDrawer
                  activeModule={activeModule}
                  activeModules={activeModules}
                  onToggleModule={handleToggleModule}
                  atmosphereData={atmosphereTimeseries}
                  oceanData={oceanTimeseries}
                  landData={landTimeseries}
                  crossSystemData={crossSystemData}
                  loading={trendStatus === 'loading'}
                  status={trendStatus}
                  errorMessage={trendError}
                  selectedLocationName={activeLocation.name}
                  activeLocationCoords={{ lat: activeLocation.lat, lon: activeLocation.lon }}
                  selectedDate={selectedDate}
                  initialTab={trendInitialTab}
                  onRetry={() => loadTrendTimeseries(activeLocation.lat, activeLocation.lon, activeLocation.name)}
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
