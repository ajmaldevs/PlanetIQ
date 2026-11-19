import React, { useEffect, useRef, useState } from 'react';
import * as maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import maplibreWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url';

if (typeof maplibregl.setWorkerUrl === 'function') {
  maplibregl.setWorkerUrl(maplibreWorkerUrl);
}
import { GeoJSONFeatureCollection, GeoJSONFeature } from '../services/api';
import { GISPlace, GIS_PLACES, findPlaceById } from '../services/gisDatabase';
import { distanceToMapZoom, mapZoomToDistance } from '../services/surfaceLabels';
import { ZoomLevel } from './EarthGlobe';
import { getScientificObservationHexColor } from '../services/geography';
import { Calendar, Navigation, AlertTriangle, RefreshCw } from 'lucide-react';

export interface MapViewProps {
  module: 'ocean' | 'atmosphere' | 'land' | 'overview';
  activeModules?: ('ocean' | 'atmosphere' | 'land')[];
  data: GeoJSONFeatureCollection | null;
  multiData?: {
    ocean?: GeoJSONFeatureCollection | null;
    atmosphere?: GeoJSONFeatureCollection | null;
    land?: GeoJSONFeatureCollection | null;
  };
  loading: boolean;
  selectedDate: string;
  setSelectedDate: (date: string) => void;
  onSelectFeature?: (feature: GeoJSONFeature) => void;
  selectedFeature?: GeoJSONFeature | null;
  activeMetric: string;
  setActiveMetric: (metric: string) => void;
  center?: { lat: number; lon: number };
  onCenterChange?: (lat: number, lon: number) => void;
  cameraDistance?: number;
  onZoomChange?: (zoom: ZoomLevel, distance: number) => void;
  selectedPlace?: GISPlace | null;
  onSelectPlace?: (place: GISPlace) => void;
  sidePanelOpen?: boolean;
  trendsOpen?: boolean;
  trendsExpanded?: boolean;
  introMode?: boolean;
  visible?: boolean;
}

const CARTO_DARK_STYLE = 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json';

function getMapDetailLevel(zoom: number): 'global' | 'continental' | 'country' | 'regional' | 'local' {
  if (zoom < 2.3) return 'global';
  if (zoom < 3.8) return 'continental';
  if (zoom < 5.5) return 'country';
  if (zoom < 8.5) return 'regional';
  return 'local';
}

// Zero-network fallback style utilizing local authentic Natural Earth GeoJSON boundaries
const OFFLINE_FALLBACK_STYLE: maplibregl.StyleSpecification = {
  version: 8,
  sources: {
    countries_poly: {
      type: 'geojson',
      data: '/data/geo/ne_countries.geojson',
    },
    country_boundaries: {
      type: 'geojson',
      data: '/data/geo/ne_country_boundaries.geojson',
    },
    coastline: {
      type: 'geojson',
      data: '/data/geo/ne_110m_coastline.geojson',
    },
    states: {
      type: 'geojson',
      data: '/data/geo/ne_50m_admin_1_states_provinces_lines.geojson',
    },
  },
  layers: [
    {
      id: 'background',
      type: 'background',
      paint: { 'background-color': '#05070b' },
    },
    {
      id: 'country-fills-offline',
      type: 'fill',
      source: 'countries_poly',
      paint: {
        'fill-color': '#09101e',
        'fill-opacity': 0.85,
      },
    },
    {
      id: 'coastline-layer',
      type: 'line',
      source: 'coastline',
      paint: { 'line-color': '#38bdf8', 'line-width': 1.2, 'line-opacity': 0.65 },
    },
    {
      id: 'country-boundaries',
      type: 'line',
      source: 'country_boundaries',
      paint: { 'line-color': '#cbd5e1', 'line-width': 0.9, 'line-opacity': 0.75 },
    },
    {
      id: 'state-boundaries',
      type: 'line',
      source: 'states',
      paint: { 'line-color': '#f59e0b', 'line-width': 0.6, 'line-opacity': 0.45 },
    },
  ],
  glyphs: 'https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf',
};

// Authoritative GeoJSON FeatureCollection of all 1,214 global GIS places for progressive 2D labeling
const GIS_PLACES_GEOJSON = {
  type: 'FeatureCollection',
  features: GIS_PLACES.map((p) => ({
    type: 'Feature',
    id: p.id,
    geometry: {
      type: 'Point',
      coordinates: [p.lon, p.lat],
    },
    properties: {
      id: p.id,
      name: p.name,
      formal_name: p.formal_name,
      category: p.category,
      level: p.level,
      priority: p.priority,
      population: p.population,
    },
  })),
};

export const MapView: React.FC<MapViewProps> = ({
  module,
  activeModules = [],
  data,
  multiData,
  loading,
  selectedDate,
  setSelectedDate,
  onSelectFeature,
  selectedFeature,
  activeMetric,
  setActiveMetric,
  center,
  onCenterChange,
  cameraDistance = 4.6,
  onZoomChange,
  selectedPlace,
  onSelectPlace,
  sidePanelOpen = false,
  trendsOpen = false,
  trendsExpanded = false,
  introMode = false,
  visible = true,
}) => {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<maplibregl.Map | null>(null);
  const [mapLoaded, setMapLoaded] = useState(false);
  const [usingFallbackStyle, setUsingFallbackStyle] = useState(false);
  const isInternalFlyRef = useRef(false);
  const onCenterChangeRef = useRef(onCenterChange);
  onCenterChangeRef.current = onCenterChange;
  const onZoomChangeRef = useRef(onZoomChange);
  onZoomChangeRef.current = onZoomChange;

  // Available dates for historical exploration
  const dateOptions = [
    '2024-01', '2024-04', '2024-07', '2024-10',
    '2025-01', '2025-04', '2025-07', '2025-10',
    '2026-01', '2026-03', '2026-06', '2026-09',
  ];

  // Planetary Region Viewports
  const presets = [
    { name: 'Amazon Basin', lat: -3.5, lon: -62.0, zoom: 4.2 },
    { name: 'Gulf Stream', lat: 36.0, lon: -68.0, zoom: 4.2 },
    { name: 'Bay of Bengal', lat: 21.0, lon: 88.5, zoom: 4.2 },
    { name: 'Niño 3.4', lat: 0.0, lon: -140.0, zoom: 3.2 },
    { name: 'Sahel Belt', lat: 14.5, lon: 2.0, zoom: 4.0 },
    { name: 'Western Europe', lat: 50.0, lon: 7.5, zoom: 4.0 },
  ];

  // Initialize MapLibre GL
  useEffect(() => {
    if (!mapContainer.current || map.current) return;

    const startCenter: [number, number] = center ? [center.lon, center.lat] : [0, 20];

    const reportZoomState = () => {
      if (!map.current) return;
      const c = map.current.getCenter();
      const z = map.current.getZoom();
      mapContainer.current?.setAttribute('data-map-zoom', z.toFixed(2));
      mapContainer.current?.setAttribute('data-map-detail-level', getMapDetailLevel(z));
      mapContainer.current?.setAttribute('data-map-center', `${c.lat.toFixed(3)},${c.lng.toFixed(3)}`);
      if (!isInternalFlyRef.current && onZoomChangeRef.current) {
        const equivDist = mapZoomToDistance(z);
        const equivLevel: ZoomLevel =
          z < 2.3
            ? 'global'
            : z < 3.8
            ? 'continental'
            : z < 5.5
            ? 'country'
            : 'regional';
        onZoomChangeRef.current(equivLevel, equivDist);
      }
    };

    const reportSettledCenter = () => {
      if (!map.current) return;
      const { lat, lng } = map.current.getCenter();
      mapContainer.current?.setAttribute('data-map-center', `${lat.toFixed(3)},${lng.toFixed(3)}`);
      if (!isInternalFlyRef.current) onCenterChangeRef.current?.(lat, lng);
    };

    try {
      const m = new maplibregl.Map({
        container: mapContainer.current,
        style: CARTO_DARK_STYLE,
        center: startCenter,
        zoom: 2.0,
        minZoom: 1,
        maxZoom: 15,
        attributionControl: false,
      });

      m.addControl(new maplibregl.NavigationControl({ showCompass: true }), 'top-right');

      m.on('load', () => {
        setMapLoaded(true);
        mapContainer.current?.setAttribute('data-map-zoom', m.getZoom().toFixed(2));
        mapContainer.current?.setAttribute('data-map-detail-level', getMapDetailLevel(m.getZoom()));
        const initialCenter = m.getCenter();
        mapContainer.current?.setAttribute('data-map-center', `${initialCenter.lat.toFixed(3)},${initialCenter.lng.toFixed(3)}`);
        // Suppress Carto's faint built-in place layers to prevent collision suppression of authoritative labels
        // and eliminate unwanted permanent dot/pointer artifacts
        const cartoLayersToHide = [
          'place_country_1',
          'place_country_2',
          'place_continent',
          'place_state',
          'place_city_r6',
          'place_city_r5',
          'place_city_dot_r7',
          'place_city_dot_r4',
          'place_city_dot_r2',
          'place_city_dot_z7',
          'place_capital_dot_z7',
          'place_town',
          'place_villages',
          'place_suburbs',
          'place_hamlet',
        ];
        cartoLayersToHide.forEach((layerId) => {
          if (m.getLayer(layerId)) {
            m.setLayoutProperty(layerId, 'visibility', 'none');
          }
        });
      });

      m.on('error', (e: any) => {
        console.warn('MapLibre error occurred:', e);
        if (!m.isStyleLoaded()) {
          try {
            m.setStyle(OFFLINE_FALLBACK_STYLE);
            setUsingFallbackStyle(true);
          } catch (err) {
            console.error('Failed to set offline fallback style:', err);
          }
        }
      });

      m.on('zoom', reportZoomState);
      m.on('moveend', reportSettledCenter);
      m.on('dragend', reportSettledCenter);

      map.current = m;
    } catch (e) {
      console.warn('MapLibre GL initialization error, falling back to offline style: ', e);
      try {
        const m = new maplibregl.Map({
          container: mapContainer.current,
          style: OFFLINE_FALLBACK_STYLE,
          center: startCenter,
          zoom: 2.0,
          minZoom: 1,
          maxZoom: 15,
          attributionControl: false,
        });
        m.addControl(new maplibregl.NavigationControl({ showCompass: true }), 'top-right');
        m.on('load', () => {
          setMapLoaded(true);
          mapContainer.current?.setAttribute('data-map-zoom', m.getZoom().toFixed(2));
          mapContainer.current?.setAttribute('data-map-detail-level', getMapDetailLevel(m.getZoom()));
          const initialCenter = m.getCenter();
          mapContainer.current?.setAttribute('data-map-center', `${initialCenter.lat.toFixed(3)},${initialCenter.lng.toFixed(3)}`);
        });
        m.on('zoom', reportZoomState);
        m.on('moveend', reportSettledCenter);
        m.on('dragend', reportSettledCenter);
        map.current = m;
        setUsingFallbackStyle(true);
      } catch (err) {
        console.error('MapLibre fallback initialization failed:', err);
      }
    }

    return () => {
      if (map.current) {
        map.current.remove();
        map.current = null;
      }
    };
  }, []);

  // ResizeObserver to adjust map canvas on any layout/container change
  useEffect(() => {
    if (!mapContainer.current) return;
    const ro = new ResizeObserver(() => {
      if (map.current) {
        map.current.resize();
      }
    });
    ro.observe(mapContainer.current);
    return () => ro.disconnect();
  }, []);

  // Trigger resize on side panel or trends drawer transitions
  useEffect(() => {
    if (!map.current) return;
    const timer = setTimeout(() => {
      map.current?.resize();
    }, 120);
    return () => clearTimeout(timer);
  }, [sidePanelOpen, trendsOpen, trendsExpanded, visible]);

  // Synchronize 2D map center & zoom context when switching from 3D to 2D
  const prevVisibleRef = useRef(false);
  useEffect(() => {
    if (!mapLoaded) return;
    const wasVisible = prevVisibleRef.current;
    prevVisibleRef.current = visible;
    if (!wasVisible && visible && map.current) {
      const targetZoom = distanceToMapZoom(cameraDistance ?? 4.6);
      map.current.resize();
      if (center && !selectedPlace && !selectedFeature) {
        map.current.jumpTo({
          center: [center.lon, center.lat],
          zoom: targetZoom,
        });
      }
      map.current.resize();
    }
  }, [visible, mapLoaded, center, cameraDistance, selectedPlace, selectedFeature]);

  // Synchronize map center when selectedFeature changes
  useEffect(() => {
    if (!map.current || !mapLoaded || !visible || !selectedFeature) return;
    const [lon, lat] = selectedFeature.geometry.coordinates;
    isInternalFlyRef.current = true;
    map.current.flyTo({
      center: [lon, lat],
      zoom: Math.max(map.current.getZoom(), 4.2),
      essential: true,
    });
    const timer = setTimeout(() => {
      isInternalFlyRef.current = false;
    }, 700);
    return () => {
      clearTimeout(timer);
      if (map.current?.isMoving()) map.current.stop();
      isInternalFlyRef.current = false;
    };
  }, [selectedFeature, mapLoaded, visible]);

  // Synchronize map center and bounds when selectedPlace changes
  useEffect(() => {
    if (!map.current || !mapLoaded || !visible || !selectedPlace) return;
    isInternalFlyRef.current = true;

    // Google Maps-style fitBounds if bounding box is available
    if (selectedPlace.bbox && selectedPlace.bbox.length === 4) {
      const [minLon, minLat, maxLon, maxLat] = selectedPlace.bbox;
      const padding = {
        // App sizes the map canvas around docked panels and the trend drawer,
        // so only a small visual gutter is needed here.
        top: 50,
        bottom: 50,
        left: 50,
        right: 50,
      };

      const maxZoom =
        selectedPlace.level === 1
          ? 4.0
          : selectedPlace.level === 2
          ? 6.5
          : selectedPlace.level === 3
          ? 8.5
          : 12.0;

      map.current.fitBounds(
        [
          [minLon, minLat],
          [maxLon, maxLat],
        ],
        {
          padding,
          maxZoom,
          duration: 1200,
          essential: true,
        }
      );
    } else {
      // Point-based flyTo with LOD-scaled zoom
      const targetZoom =
        selectedPlace.level === 4
          ? 7.2
          : selectedPlace.level === 3
          ? 5.5
          : selectedPlace.level === 2
          ? 3.8
          : 2.2;

      map.current.flyTo({
        center: [selectedPlace.lon, selectedPlace.lat],
        zoom: targetZoom,
        duration: 1200,
        essential: true,
      });
    }

    const timer = setTimeout(() => {
      isInternalFlyRef.current = false;
    }, 1300);
    return () => {
      clearTimeout(timer);
      if (map.current?.isMoving()) map.current.stop();
      isInternalFlyRef.current = false;
    };
  }, [selectedPlace, mapLoaded, visible, sidePanelOpen, trendsOpen, trendsExpanded]);

  // Attach Authoritative Global Natural Earth Country Boundaries & Interactivity
  useEffect(() => {
    if (!map.current || !mapLoaded) return;
    const m = map.current;

    const countryPolySource = 'terralens-countries-poly';
    const countryLineSource = 'terralens-country-lines';
    const stateLineSource = 'terralens-state-lines';

    // Add sources if not already present
    if (!m.getSource(countryPolySource)) {
      m.addSource(countryPolySource, {
        type: 'geojson',
        data: '/data/geo/ne_countries.geojson',
      });
    }

    if (!m.getSource(countryLineSource)) {
      m.addSource(countryLineSource, {
        type: 'geojson',
        data: '/data/geo/ne_country_boundaries.geojson',
      });
    }

    if (!m.getSource(stateLineSource)) {
      m.addSource(stateLineSource, {
        type: 'geojson',
        data: '/data/geo/ne_50m_admin_1_states_provinces_lines.geojson',
      });
    }

    // Add Country Fills for hover/selection
    if (!m.getLayer('terralens-country-fills')) {
      m.addLayer(
        {
          id: 'terralens-country-fills',
          type: 'fill',
          source: countryPolySource,
          paint: {
            'fill-color': '#38bdf8',
            'fill-opacity': [
              'case',
              ['boolean', ['feature-state', 'hover'], false],
              0.14,
              0.0,
            ],
          },
        },
        m.getLayer('observation-points') ? 'observation-points' : undefined
      );
    }

    // Add Sovereign Country Boundaries (visible across all zoom levels)
    if (!m.getLayer('terralens-country-boundaries-line')) {
      m.addLayer(
        {
          id: 'terralens-country-boundaries-line',
          type: 'line',
          source: countryLineSource,
          paint: {
            'line-color': '#cbd5e1',
            'line-width': ['interpolate', ['linear'], ['zoom'], 1, 0.8, 4, 1.3, 8, 2.0],
            'line-opacity': 0.70,
          },
        },
        m.getLayer('observation-points') ? 'observation-points' : undefined
      );
    }

    // Add First-Level Administrative States/Provinces (fade in at zoom >= 3.2)
    if (!m.getLayer('terralens-state-boundaries-line')) {
      m.addLayer(
        {
          id: 'terralens-state-boundaries-line',
          type: 'line',
          source: stateLineSource,
          minzoom: 3.2,
          paint: {
            'line-color': '#f59e0b',
            'line-width': ['interpolate', ['linear'], ['zoom'], 3.2, 0.4, 6, 1.0],
            'line-opacity': ['interpolate', ['linear'], ['zoom'], 3.2, 0.0, 4.5, 0.55],
            'line-dasharray': [2, 2],
          },
        },
        m.getLayer('observation-points') ? 'observation-points' : undefined
      );
    }

    // Country hover popup & selection
    const countryPopup = new maplibregl.Popup({
      closeButton: false,
      closeOnClick: false,
      offset: 10,
      className: 'terralens-country-popup',
    });

    const onCountryMouseMove = (e: maplibregl.MapMouseEvent) => {
      if (m.getCanvas().style.cursor === 'pointer') return; // Observation points take precedence
      const features = m.queryRenderedFeatures(e.point, { layers: ['terralens-country-fills'] });
      if (features.length > 0) {
        const feat = features[0];
        const props = feat.properties || {};
        const name = props.name || props.formal_name || 'Country';
        const iso = props.iso_a3 || props.iso_a2 || '';
        const cont = props.continent || '';

        countryPopup
          .setLngLat(e.lngLat)
          .setHTML(
            `<div style="background:#090d16; color:#f8fafc; font-family:monospace; padding:4px 8px; border-radius:6px; border:1px solid #334155; font-size:10px;">
              <span style="color:#38bdf8; font-weight:600;">${name}</span>
              ${iso ? `<span style="color:#64748b; margin-left:4px;">[${iso}]</span>` : ''}
              ${cont ? `<div style="color:#94a3b8; font-size:9px;">${cont}</div>` : ''}
            </div>`
          )
          .addTo(m);
      } else {
        countryPopup.remove();
      }
    };

    const onCountryMouseLeave = () => {
      countryPopup.remove();
    };

    const onCountryClick = (e: maplibregl.MapMouseEvent) => {
      const features = m.queryRenderedFeatures(e.point, { layers: ['terralens-country-fills'] });
      if (features.length > 0) {
        const props = features[0].properties || {};
        const iso = props.iso_a3 || props.iso_a2 || '';
        const place = findPlaceById(props.id || iso) || {
          id: props.id || `cntry-${iso.toLowerCase()}`,
          name: props.name || 'Country',
          category: 'country' as const,
          lat: Number(props.center_lat) || e.lngLat.lat,
          lon: Number(props.center_lon) || e.lngLat.lng,
          level: 2 as const,
          priority: 85,
          parentContinent: props.continent,
        };
        if (onSelectPlace) {
          onSelectPlace(place);
        }
      }
    };

    m.on('mousemove', 'terralens-country-fills', onCountryMouseMove);
    m.on('mouseleave', 'terralens-country-fills', onCountryMouseLeave);
    m.on('click', 'terralens-country-fills', onCountryClick);

    return () => {
      m.off('mousemove', 'terralens-country-fills', onCountryMouseMove);
      m.off('mouseleave', 'terralens-country-fills', onCountryMouseLeave);
      m.off('click', 'terralens-country-fills', onCountryClick);
      countryPopup.remove();
    };
  }, [mapLoaded, onSelectPlace]);

  // Attach Surface-Anchored GIS Place Labels to 2D Map (Google Earth-style progressive LOD)
  useEffect(() => {
    if (!map.current || !mapLoaded) return;
    const m = map.current;
    const sourceId = 'terralens-gis-places';

    if (!m.getSource(sourceId)) {
      m.addSource(sourceId, {
        type: 'geojson',
        data: GIS_PLACES_GEOJSON as any,
      });
    }

    // Clean up any legacy point/pointer layers to ensure no unwanted permanent dots/indicators appear
    if (m.getLayer('terralens-labels-cities-major-points')) {
      m.removeLayer('terralens-labels-cities-major-points');
    }
    if (m.getLayer('terralens-labels-towns-points')) {
      m.removeLayer('terralens-labels-towns-points');
    }

    // 1. Continents & Major Oceans (Level 1: zoom < 3.8)
    if (!m.getLayer('terralens-labels-continents')) {
      m.addLayer({
        id: 'terralens-labels-continents',
        type: 'symbol',
        source: sourceId,
        filter: ['==', ['get', 'level'], 1],
        maxzoom: 3.8,
        layout: {
          'text-field': ['get', 'name'],
          'text-font': ['Open Sans Bold', 'Noto Sans Regular'],
          'text-size': ['interpolate', ['linear'], ['zoom'], 1, 11, 3, 15],
          'text-transform': 'uppercase',
          'text-letter-spacing': 0.16,
          'text-variable-anchor': ['center', 'top', 'bottom'],
          'text-padding': 4,
          'text-allow-overlap': false,
          'text-ignore-placement': false,
        },
        paint: {
          'text-color': ['case', ['==', ['get', 'category'], 'ocean'], '#38bdf8', '#cbd5e1'],
          'text-halo-color': 'rgba(5, 7, 11, 0.95)',
          'text-halo-width': 2.2,
          'text-opacity': ['interpolate', ['linear'], ['zoom'], 1, 1.0, 3.2, 0.85, 3.8, 0.0],
        },
      });
    }

    // 2. Sovereign Countries & Major Seas (Level 2: zoom 1.8 to 8.5)
    if (!m.getLayer('terralens-labels-countries')) {
      m.addLayer({
        id: 'terralens-labels-countries',
        type: 'symbol',
        source: sourceId,
        filter: ['==', ['get', 'level'], 2],
        minzoom: 1.8,
        maxzoom: 8.5,
        layout: {
          'text-field': ['get', 'name'],
          'text-font': ['Open Sans Bold', 'Noto Sans Regular'],
          'text-size': ['interpolate', ['linear'], ['zoom'], 2, 10.5, 3.5, 12, 5, 14, 7, 16],
          'symbol-sort-key': ['-', 1000, ['get', 'priority']],
          'text-variable-anchor': ['center', 'top', 'bottom', 'left', 'right'],
          'text-padding': 3,
          'text-allow-overlap': false,
          'text-ignore-placement': false,
        },
        paint: {
          'text-color': '#ffffff',
          'text-halo-color': 'rgba(5, 7, 11, 0.95)',
          'text-halo-width': 2.2,
          'text-opacity': ['interpolate', ['linear'], ['zoom'], 1.8, 0.0, 2.4, 1.0, 6.5, 1.0, 8.5, 0.4],
        },
      });
    }

    // 3. States & Provinces (Level 3: zoom 3.8 to 10.0)
    if (!m.getLayer('terralens-labels-states')) {
      m.addLayer({
        id: 'terralens-labels-states',
        type: 'symbol',
        source: sourceId,
        filter: ['==', ['get', 'level'], 3],
        minzoom: 3.8,
        maxzoom: 10.0,
        layout: {
          'text-field': ['get', 'name'],
          'text-font': ['Open Sans Regular', 'Noto Sans Regular'],
          'text-size': ['interpolate', ['linear'], ['zoom'], 4, 10, 6, 12, 8, 14],
          'symbol-sort-key': ['-', 1000, ['get', 'priority']],
          'text-variable-anchor': ['center', 'top', 'bottom', 'left', 'right'],
          'text-padding': 3,
          'text-allow-overlap': false,
          'text-ignore-placement': false,
        },
        paint: {
          'text-color': '#fbbf24',
          'text-halo-color': 'rgba(5, 7, 11, 0.95)',
          'text-halo-width': 2.0,
          'text-opacity': ['interpolate', ['linear'], ['zoom'], 3.8, 0.0, 4.4, 1.0],
        },
      });
    }

    // 4. Major Cities (Capitals & Metropolises: zoom >= 4.4)
    if (!m.getLayer('terralens-labels-cities-major')) {
      m.addLayer({
        id: 'terralens-labels-cities-major',
        type: 'symbol',
        source: sourceId,
        filter: ['all', ['==', ['get', 'level'], 4], ['>=', ['get', 'priority'], 70]],
        minzoom: 4.4,
        layout: {
          'text-field': ['get', 'name'],
          'text-font': ['Open Sans Bold', 'Noto Sans Regular'],
          'text-size': ['interpolate', ['linear'], ['zoom'], 4.4, 10.5, 7, 12.5, 10, 15],
          'symbol-sort-key': ['-', 1000, ['get', 'priority']],
          'text-variable-anchor': ['center', 'top', 'bottom', 'left', 'right'],
          'text-padding': 3,
          'text-allow-overlap': false,
          'text-ignore-placement': false,
        },
        paint: {
          'text-color': '#f8fafc',
          'text-halo-color': 'rgba(5, 7, 11, 0.95)',
          'text-halo-width': 2.2,
          'text-opacity': ['interpolate', ['linear'], ['zoom'], 4.4, 0.0, 5.0, 1.0],
        },
      });
    }

    // 5. Towns & Local Populated Places (Regional density: zoom >= 6.5)
    if (!m.getLayer('terralens-labels-towns')) {
      m.addLayer({
        id: 'terralens-labels-towns',
        type: 'symbol',
        source: sourceId,
        filter: ['all', ['==', ['get', 'level'], 4], ['<', ['get', 'priority'], 70]],
        minzoom: 6.5,
        layout: {
          'text-field': ['get', 'name'],
          'text-font': ['Open Sans Regular', 'Noto Sans Regular'],
          'text-size': ['interpolate', ['linear'], ['zoom'], 6.5, 9.5, 8.5, 11.5, 11, 13.5],
          'symbol-sort-key': ['-', 1000, ['get', 'priority']],
          'text-variable-anchor': ['center', 'top', 'bottom', 'left', 'right'],
          'text-padding': 2,
          'text-allow-overlap': false,
          'text-ignore-placement': false,
        },
        paint: {
          'text-color': '#e2e8f0',
          'text-halo-color': 'rgba(5, 7, 11, 0.95)',
          'text-halo-width': 1.8,
          'text-opacity': ['interpolate', ['linear'], ['zoom'], 6.5, 0.0, 7.2, 0.95],
        },
      });
    }

    const interactiveLabelLayers = [
      'terralens-labels-continents',
      'terralens-labels-countries',
      'terralens-labels-states',
      'terralens-labels-cities-major',
      'terralens-labels-towns',
    ];

    const onLabelClick = (e: maplibregl.MapMouseEvent) => {
      // Observation points take precedence if clicked together
      if (m.getLayer('observation-points')) {
        const obs = m.queryRenderedFeatures(e.point, { layers: ['observation-points'] });
        if (obs.length > 0) return;
      }

      const features = m.queryRenderedFeatures(e.point, { layers: interactiveLabelLayers });
      if (features.length > 0) {
        const placeId = features[0].properties?.id;
        const place = findPlaceById(placeId) || GIS_PLACES.find((p) => p.id === placeId);
        if (place && onSelectPlace) {
          onSelectPlace(place);
        }
      }
    };

    const onLabelMouseEnter = () => {
        m.getCanvas().style.cursor = 'pointer';
    };
    const onLabelMouseLeave = () => {
        m.getCanvas().style.cursor = '';
    };

    interactiveLabelLayers.forEach((layerId) => {
      m.on('mouseenter', layerId, onLabelMouseEnter);
      m.on('mouseleave', layerId, onLabelMouseLeave);
    });

    m.on('click', onLabelClick);

    return () => {
      m.off('click', onLabelClick);
      interactiveLabelLayers.forEach((layerId) => {
        m.off('mouseenter', layerId, onLabelMouseEnter);
        m.off('mouseleave', layerId, onLabelMouseLeave);
      });
    };
  }, [mapLoaded, onSelectPlace]);

function getFeatureHexColor(feature: GeoJSONFeature, moduleName: string, metricType: string): string {
  return getScientificObservationHexColor(feature.properties, moduleName, metricType);
}

  // Update Data Layers & Highlight Ring
  useEffect(() => {
    if (!map.current || !mapLoaded) return;

    const sourceId = 'terralens-observations';
    const layerId = 'observation-points';
    const highlightSourceId = 'terralens-selected-highlight';
    const highlightLayerId = 'selected-point-highlight';

    // Prepare unified multi-system features
    const allFeatures: GeoJSONFeature[] = [];
    if (multiData && activeModules.length > 0) {
      activeModules.forEach((m) => {
        const col = multiData[m];
        if (col && col.features) {
          col.features.forEach((feat) => {
            allFeatures.push({
              ...feat,
              properties: {
                ...feat.properties,
                _system: m,
                _color: getFeatureHexColor(feat, m, activeMetric),
              },
            });
          });
        }
      });
    } else if (data && data.features) {
      data.features.forEach((feat) => {
        allFeatures.push({
          ...feat,
          properties: {
            ...feat.properties,
            _system: module,
            _color: getFeatureHexColor(feat, module, activeMetric),
          },
        });
      });
    }

    if (allFeatures.length === 0) {
      if (map.current.getSource(sourceId)) {
        (map.current.getSource(sourceId) as maplibregl.GeoJSONSource).setData({
          type: 'FeatureCollection',
          features: [],
        });
      }
      return;
    }

    const featureCollectionData = {
      type: 'FeatureCollection',
      features: allFeatures,
    };

    const circleColor: any = ['coalesce', ['get', '_color'], '#38bdf8'];
    const circleRadius = 7.5;

    if (map.current.getSource(sourceId)) {
      (map.current.getSource(sourceId) as maplibregl.GeoJSONSource).setData(featureCollectionData as any);
      if (map.current.getLayer(layerId)) {
        map.current.setPaintProperty(layerId, 'circle-color', circleColor);
        map.current.setPaintProperty(layerId, 'circle-radius', circleRadius);
      }
    } else {
      // Add GeoJSON Source and Layer
      map.current.addSource(sourceId, {
        type: 'geojson',
        data: featureCollectionData as any,
      });

      map.current.addLayer({
        id: layerId,
        type: 'circle',
        source: sourceId,
        paint: {
          'circle-radius': circleRadius,
          'circle-color': circleColor,
          'circle-stroke-width': 1.5,
          'circle-stroke-color': '#080c16',
          'circle-opacity': 0.88,
        },
      });
    }

    // Selected Feature or Selected Place Highlight Ring with setData updates
    const highlightFeature = selectedFeature
      ? (selectedFeature as any)
      : selectedPlace
      ? {
          type: 'Feature',
          geometry: { type: 'Point', coordinates: [selectedPlace.lon, selectedPlace.lat] },
          properties: { name: selectedPlace.name, category: selectedPlace.category },
        }
      : null;

    if (map.current.getSource(highlightSourceId)) {
      (map.current.getSource(highlightSourceId) as maplibregl.GeoJSONSource).setData({
        type: 'FeatureCollection',
        features: highlightFeature ? [highlightFeature] : [],
      });
    } else if (highlightFeature) {
      map.current.addSource(highlightSourceId, {
        type: 'geojson',
        data: {
          type: 'FeatureCollection',
          features: [highlightFeature],
        },
      });

      map.current.addLayer({
        id: highlightLayerId,
        type: 'circle',
        source: highlightSourceId,
        paint: {
          'circle-radius': 14,
          'circle-color': 'transparent',
          'circle-stroke-width': 2.5,
          'circle-stroke-color': '#38bdf8',
          'circle-stroke-opacity': 0.95,
        },
      });
    }

    // Click handler on observation points
    const handleClick = (e: maplibregl.MapMouseEvent) => {
      if (!map.current) return;
      const bbox: [maplibregl.PointLike, maplibregl.PointLike] = [
        [e.point.x - 6, e.point.y - 6],
        [e.point.x + 6, e.point.y + 6],
      ];
      const features = map.current.queryRenderedFeatures(bbox, { layers: [layerId] });
      if (features.length > 0 && onSelectFeature) {
        onSelectFeature(features[0] as unknown as GeoJSONFeature);
      }
    };

    map.current.on('click', layerId, handleClick);

    // Interactive Hover Popup
    const popup = new maplibregl.Popup({
      closeButton: false,
      closeOnClick: false,
      offset: 12,
      className: 'terralens-maplibre-popup',
    });

    const handleMouseEnter = (e: maplibregl.MapMouseEvent) => {
      if (!map.current) return;
      map.current.getCanvas().style.cursor = 'pointer';
      const features = map.current.queryRenderedFeatures(e.point, { layers: [layerId] });
      if (features.length > 0) {
        const feat = features[0];
        const props = feat.properties || {};
        const coords = (feat.geometry as any).coordinates.slice();
        const name = props.location_name || props.region_name || 'Observation Point';

        let reading = '';
        const featureSystem = props._system || module;
        if (featureSystem === 'ocean') {
          const ssha = Number(props.ssha_karin_m);
          reading = `SSHA: ${ssha > 0 ? '+' : ''}${ssha?.toFixed(2)} m (±2.4cm)`;
        } else if (featureSystem === 'atmosphere') {
          if (activeMetric === 'rate') {
            reading = `Rain Rate: ${Number(props.precipitation_rate_mm_hr)?.toFixed(2)} mm/hr`;
          } else {
            reading = `Accumulated: ${Number(props.precipitation_accumulated_mm)?.toFixed(0)} mm`;
          }
        } else if (featureSystem === 'land') {
          reading = `NDVI: ${Number(props.ndvi)?.toFixed(2)} • ${props.drought_category || 'Vegetation'}`;
        }

        const isObs = props.is_observation === true || props.data_status === 'observation';
        const isUnavailable = props.data_status === 'unavailable';
        const badge = isObs
          ? `<span style="background:rgba(16,185,129,0.2);color:#34d399;border:1px solid rgba(16,185,129,0.4);border-radius:4px;padding:1px 4px;font-size:8px;font-weight:700;letter-spacing:0.5px;margin-left:6px;">REAL OBSERVATION</span>`
          : (isUnavailable
            ? `<span style="background:rgba(239,68,68,0.2);color:#f87171;border:1px solid rgba(239,68,68,0.4);border-radius:4px;padding:1px 4px;font-size:8px;font-weight:700;letter-spacing:0.5px;margin-left:6px;">DATA UNAVAILABLE</span>`
            : `<span style="background:rgba(245,158,11,0.2);color:#fbbf24;border:1px solid rgba(245,158,11,0.4);border-radius:4px;padding:1px 4px;font-size:8px;font-weight:700;letter-spacing:0.5px;margin-left:6px;">SIMULATED DEMO</span>`);
        const granule = props.granule_id
          ? `<div style="color:#64748b;font-size:8px;margin-top:3px;font-family:monospace;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:240px;">Granule: ${props.granule_id}</div>`
          : '';

        popup
          .setLngLat(coords)
          .setHTML(`
            <div style="background:#090d16; color:#f8fafc; font-family:monospace; padding:6px 10px; border-radius:8px; border:1px solid #334155; font-size:11px; box-shadow:0 10px 25px -5px rgba(0,0,0,0.5);">
              <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:3px;gap:8px;">
                <span style="font-weight:600; color:#38bdf8;">${name}</span>
                ${badge}
              </div>
              <div style="color:#94a3b8; font-size:10px;">${reading}</div>
              ${granule}
            </div>
          `)
          .addTo(map.current);
      }
    };

    const handleMouseLeave = () => {
      if (!map.current) return;
      map.current.getCanvas().style.cursor = '';
      popup.remove();
    };

    map.current.on('mouseenter', layerId, handleMouseEnter);
    map.current.on('mouseleave', layerId, handleMouseLeave);

    return () => {
      if (map.current) {
        map.current.off('click', layerId, handleClick);
        map.current.off('mouseenter', layerId, handleMouseEnter);
        map.current.off('mouseleave', layerId, handleMouseLeave);
      }
      popup.remove();
    };
  }, [mapLoaded, data, multiData, module, activeModules, activeMetric, selectedFeature, selectedPlace]);

  const flyToPreset = (lat: number, lon: number, zoom: number) => {
    if (!map.current) return;
    map.current.flyTo({ center: [lon, lat], zoom, essential: true });
  };

  const retryOnlineBasemap = () => {
    if (!map.current) return;
    try {
      map.current.setStyle(CARTO_DARK_STYLE);
      setUsingFallbackStyle(false);
    } catch (e) {
      console.warn('Retry failed:', e);
    }
  };

  return (
    <div className="relative w-full h-full overflow-hidden bg-[#060912] select-none">
      {/* MapLibre WebGL Canvas Container */}
      <div ref={mapContainer} className="w-full h-full" />

      {/* Loading Overlay */}
      {loading && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-20 flex items-center space-x-2 px-3.5 py-1.5 rounded-full bg-slate-900/90 border border-slate-800 text-[11px] font-mono text-cyan-300 shadow-2xl backdrop-blur-md pointer-events-none">
          <div className="h-3 w-3 rounded-full border-2 border-cyan-400 border-t-transparent animate-spin" />
          <span>Updating Observations...</span>
        </div>
      )}

      {/* Offline Fallback Banner (shows only if CartoCDN fails) */}
      {usingFallbackStyle && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-20 flex items-center space-x-2 px-3 py-1.5 rounded-xl bg-slate-900/95 border border-amber-500/40 text-[11px] font-mono text-amber-300 shadow-2xl backdrop-blur-md">
          <AlertTriangle className="h-3.5 w-3.5 text-amber-400 shrink-0" />
          <span>Using Local Vector Basemap (Natural Earth Boundaries)</span>
          <button
            onClick={retryOnlineBasemap}
            className="flex items-center space-x-1 px-2 py-0.5 rounded bg-amber-500/20 hover:bg-amber-500/30 text-amber-200 border border-amber-500/40 transition-colors ml-1"
          >
            <RefreshCw className="h-3 w-3" />
            <span>Retry Tiles</span>
          </button>
        </div>
      )}

      {/* Bottom Floating Dynamic Scale Legend */}
      <div className={`absolute left-3 sm:left-4 z-10 flex items-center space-x-2 sm:space-x-2.5 pointer-events-auto max-w-[calc(100vw-24px)] overflow-x-auto no-scrollbar transition-all duration-300 ${
        trendsOpen
          ? trendsExpanded
            ? 'bottom-[min(596px,calc(100dvh-120px))]'
            : 'bottom-[335px] sm:bottom-[395px]'
          : 'bottom-3 sm:bottom-4'
      } ${introMode && module === 'overview' ? 'hidden' : ''}`}>
        <div className="flex items-center space-x-2 px-3 py-2 rounded-xl bg-[#090d16]/90 border border-slate-800/80 text-[11px] font-mono backdrop-blur-md shadow-2xl text-slate-300">
          <span className="text-[9px] uppercase text-slate-500 font-semibold tracking-wider">
            {module} Scale:
          </span>
          {module === 'atmosphere' && (
            <div className="flex items-center space-x-1.5">
              <span>Dry (0)</span>
              <div className="h-2 w-24 rounded-full bg-gradient-to-r from-sky-400 via-blue-600 via-purple-600 to-pink-500" />
              <span>Heavy ({activeMetric === 'rate' ? '>0.7 mm/h' : '>400 mm'})</span>
            </div>
          )}
          {module === 'ocean' && (
            <div className="flex items-center space-x-1.5">
              <span>Cold (-0.4m)</span>
              <div className="h-2 w-24 rounded-full bg-gradient-to-r from-blue-700 via-slate-200 to-red-600" />
              <span>Warm (+0.35m)</span>
            </div>
          )}
          {module === 'land' && (
            <div className="flex items-center space-x-1.5">
              <span>Barren (0.05)</span>
              <div className="h-2 w-24 rounded-full bg-gradient-to-r from-amber-600 via-lime-500 to-emerald-800" />
              <span>Lush Canopy (0.85)</span>
            </div>
          )}
          {module === 'overview' && (
            <div className="flex items-center space-x-1.5">
              <span>Low</span>
              <div className="h-2 w-20 rounded-full bg-gradient-to-r from-cyan-400 to-blue-600" />
              <span>High</span>
            </div>
          )}

          {/* Module Metric Toggles */}
          {module === 'atmosphere' && (
            <div className="flex items-center space-x-1 pl-1.5 border-l border-slate-800">
              <button
                onClick={() => setActiveMetric('accumulated')}
                aria-label="Display Accumulated Precipitation"
                className={`px-1.5 py-0.5 rounded text-[10px] transition-colors focus-visible:ring-2 focus-visible:ring-cyan-400 focus-visible:outline-none ${
                  activeMetric === 'accumulated'
                    ? 'bg-blue-500/20 text-blue-300 font-semibold'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Accum
              </button>
              <button
                onClick={() => setActiveMetric('rate')}
                aria-label="Display Precipitation Rate"
                className={`px-1.5 py-0.5 rounded text-[10px] transition-colors focus-visible:ring-2 focus-visible:ring-cyan-400 focus-visible:outline-none ${
                  activeMetric === 'rate'
                    ? 'bg-blue-500/20 text-blue-300 font-semibold'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Rate
              </button>
            </div>
          )}

          {module === 'ocean' && (
            <div className="flex items-center space-x-1 pl-1.5 border-l border-slate-800">
              <button
                onClick={() => setActiveMetric('ssha')}
                aria-label="Display Sea Surface Height Anomaly (SSHA)"
                className={`px-1.5 py-0.5 rounded text-[10px] transition-colors focus-visible:ring-2 focus-visible:ring-cyan-400 focus-visible:outline-none ${
                  activeMetric === 'ssha'
                    ? 'bg-cyan-500/20 text-cyan-300 font-semibold'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                SSHA
              </button>
              <button
                onClick={() => setActiveMetric('ssh')}
                aria-label="Display Sea Surface Height (SSH)"
                className={`px-1.5 py-0.5 rounded text-[10px] transition-colors focus-visible:ring-2 focus-visible:ring-cyan-400 focus-visible:outline-none ${
                  activeMetric === 'ssh'
                    ? 'bg-cyan-500/20 text-cyan-300 font-semibold'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                SSH
              </button>
            </div>
          )}

          {module === 'land' && (
            <div className="flex items-center space-x-1 pl-1.5 border-l border-slate-800">
              <button
                onClick={() => setActiveMetric('ndvi')}
                aria-label="Display Normalized Difference Vegetation Index (NDVI)"
                className={`px-1.5 py-0.5 rounded text-[10px] transition-colors focus-visible:ring-2 focus-visible:ring-cyan-400 focus-visible:outline-none ${
                  activeMetric === 'ndvi'
                    ? 'bg-emerald-500/20 text-emerald-300 font-semibold'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                NDVI
              </button>
              <button
                onClick={() => setActiveMetric('evi')}
                aria-label="Display Enhanced Vegetation Index (EVI)"
                className={`px-1.5 py-0.5 rounded text-[10px] transition-colors focus-visible:ring-2 focus-visible:ring-cyan-400 focus-visible:outline-none ${
                  activeMetric === 'evi'
                    ? 'bg-emerald-500/20 text-emerald-300 font-semibold'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                EVI
              </button>
            </div>
          )}
        </div>

        {/* Date Selector Pill (visible only in overview mode when global timeline is not active) */}
        {module === 'overview' && activeModules.length === 0 && (
          <div className="flex items-center space-x-1.5 px-3 py-2 rounded-xl bg-[#090d16]/90 border border-slate-800/80 backdrop-blur-md shadow-2xl text-[11px] font-mono text-slate-300">
            <Calendar className="h-3.5 w-3.5 text-cyan-400 shrink-0" />
            <select
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="bg-transparent text-cyan-300 font-semibold focus:outline-hidden cursor-pointer"
              title="Observation Date"
            >
              {dateOptions.map((d) => (
                <option key={d} value={d} className="bg-slate-900 text-slate-200">
                  {d}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Quick Region Presets Pill */}
        <div className="hidden lg:flex items-center space-x-1 px-2.5 py-1.5 rounded-xl bg-[#090d16]/90 border border-slate-800/80 backdrop-blur-md text-[10px] font-mono">
          <Navigation className="h-3 w-3 text-cyan-400 shrink-0 mr-1" />
          {presets.slice(0, 4).map((p) => (
            <button
              key={p.name}
              onClick={() => flyToPreset(p.lat, p.lon, p.zoom)}
              className="px-2 py-0.5 rounded-lg bg-slate-900/80 hover:bg-slate-800 text-slate-300 hover:text-cyan-300 border border-slate-800 transition-colors"
            >
              {p.name}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};

export default MapView;
