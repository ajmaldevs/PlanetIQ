import React, { useEffect, useRef, useState } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { GeoJSONFeatureCollection, GeoJSONFeature } from '../services/api';
import { GISPlace, GIS_PLACES, findPlaceById } from '../services/gisDatabase';
import { Calendar, Navigation, AlertTriangle, RefreshCw } from 'lucide-react';

export interface MapViewProps {
  module: 'ocean' | 'atmosphere' | 'land' | 'overview';
  data: GeoJSONFeatureCollection | null;
  loading: boolean;
  selectedDate: string;
  setSelectedDate: (date: string) => void;
  onSelectFeature?: (feature: GeoJSONFeature) => void;
  selectedFeature?: GeoJSONFeature | null;
  activeMetric: string;
  setActiveMetric: (metric: string) => void;
  center?: { lat: number; lon: number };
  onCenterChange?: (lat: number, lon: number) => void;
  selectedPlace?: GISPlace | null;
  onSelectPlace?: (place: GISPlace) => void;
  sidePanelOpen?: boolean;
  trendsOpen?: boolean;
  trendsExpanded?: boolean;
  visible?: boolean;
}

const CARTO_DARK_STYLE = 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json';

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
  data,
  loading,
  selectedDate,
  setSelectedDate,
  onSelectFeature,
  selectedFeature,
  activeMetric,
  setActiveMetric,
  center,
  onCenterChange,
  selectedPlace,
  onSelectPlace,
  sidePanelOpen = false,
  trendsOpen = false,
  trendsExpanded = false,
  visible = true,
}) => {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<maplibregl.Map | null>(null);
  const [mapLoaded, setMapLoaded] = useState(false);
  const [usingFallbackStyle, setUsingFallbackStyle] = useState(false);
  const isInternalFlyRef = useRef(false);

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

    try {
      const m = new maplibregl.Map({
        container: mapContainer.current,
        style: CARTO_DARK_STYLE,
        center: startCenter,
        zoom: 2.0,
        minZoom: 1,
        maxZoom: 14,
        attributionControl: false,
      });

      m.addControl(new maplibregl.NavigationControl({ showCompass: true }), 'bottom-right');

      m.on('load', () => {
        setMapLoaded(true);
      });

      m.on('error', (e) => {
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

      m.on('moveend', () => {
        if (!map.current || isInternalFlyRef.current) return;
        const c = map.current.getCenter();
        if (onCenterChange) {
          onCenterChange(c.lat, c.lng);
        }
      });

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
          maxZoom: 14,
          attributionControl: false,
        });
        m.addControl(new maplibregl.NavigationControl({ showCompass: true }), 'bottom-right');
        m.on('load', () => setMapLoaded(true));
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

  // Synchronize map center when selectedFeature changes
  useEffect(() => {
    if (!map.current || !mapLoaded || !selectedFeature) return;
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
    return () => clearTimeout(timer);
  }, [selectedFeature, mapLoaded]);

  // Synchronize map center when selectedPlace changes
  useEffect(() => {
    if (!map.current || !mapLoaded || !selectedPlace) return;
    isInternalFlyRef.current = true;
    const targetZoom =
      selectedPlace.level === 4
        ? 6.5
        : selectedPlace.level === 3
        ? 5.0
        : selectedPlace.level === 2
        ? 3.8
        : 2.2;
    map.current.flyTo({
      center: [selectedPlace.lon, selectedPlace.lat],
      zoom: targetZoom,
      essential: true,
    });
    const timer = setTimeout(() => {
      isInternalFlyRef.current = false;
    }, 700);
    return () => clearTimeout(timer);
  }, [selectedPlace, mapLoaded]);

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
          'text-font': ['Open Sans Bold', 'Arial Unicode MS Bold'],
          'text-size': ['interpolate', ['linear'], ['zoom'], 1, 11, 3, 15],
          'text-transform': 'uppercase',
          'text-letter-spacing': 0.15,
          'text-allow-overlap': false,
          'text-ignore-placement': false,
        },
        paint: {
          'text-color': ['case', ['==', ['get', 'category'], 'ocean'], '#7dd3fc', '#94a3b8'],
          'text-halo-color': 'rgba(5, 7, 11, 0.95)',
          'text-halo-width': 2,
          'text-opacity': ['interpolate', ['linear'], ['zoom'], 1, 1.0, 3.2, 0.8, 3.8, 0.0],
        },
      });
    }

    // 2. Sovereign Countries & Major Seas (Level 2: zoom 2.2 to 8.0)
    if (!m.getLayer('terralens-labels-countries')) {
      m.addLayer({
        id: 'terralens-labels-countries',
        type: 'symbol',
        source: sourceId,
        filter: ['==', ['get', 'level'], 2],
        minzoom: 2.2,
        maxzoom: 8.0,
        layout: {
          'text-field': ['get', 'name'],
          'text-font': ['Open Sans Bold', 'Arial Unicode MS Bold'],
          'text-size': ['interpolate', ['linear'], ['zoom'], 2.5, 10.5, 4.5, 13, 7, 15.5],
          'symbol-sort-key': ['-', 1000, ['get', 'priority']],
          'text-allow-overlap': false,
          'text-ignore-placement': false,
        },
        paint: {
          'text-color': '#ffffff',
          'text-halo-color': 'rgba(5, 7, 11, 0.95)',
          'text-halo-width': 2,
          'text-opacity': ['interpolate', ['linear'], ['zoom'], 2.2, 0.0, 3.0, 1.0, 6.5, 1.0, 8.0, 0.4],
        },
      });
    }

    // 3. States & Provinces (Level 3: zoom 4.2 to 10.0)
    if (!m.getLayer('terralens-labels-states')) {
      m.addLayer({
        id: 'terralens-labels-states',
        type: 'symbol',
        source: sourceId,
        filter: ['==', ['get', 'level'], 3],
        minzoom: 4.2,
        maxzoom: 10.0,
        layout: {
          'text-field': ['get', 'name'],
          'text-font': ['Open Sans Regular', 'Arial Unicode MS Regular'],
          'text-size': ['interpolate', ['linear'], ['zoom'], 4.5, 10.5, 7, 13.5],
          'symbol-sort-key': ['-', 1000, ['get', 'priority']],
          'text-allow-overlap': false,
          'text-ignore-placement': false,
        },
        paint: {
          'text-color': '#fbbf24',
          'text-halo-color': 'rgba(5, 7, 11, 0.95)',
          'text-halo-width': 2,
          'text-opacity': ['interpolate', ['linear'], ['zoom'], 4.2, 0.0, 5.0, 1.0],
        },
      });
    }

    // 4. Cities Location Anchor Dots (Level 4: zoom >= 5.2)
    if (!m.getLayer('terralens-labels-cities-points')) {
      m.addLayer({
        id: 'terralens-labels-cities-points',
        type: 'circle',
        source: sourceId,
        filter: ['==', ['get', 'level'], 4],
        minzoom: 5.2,
        paint: {
          'circle-radius': ['interpolate', ['linear'], ['zoom'], 5.2, 2.5, 8, 3.5],
          'circle-color': '#38bdf8',
          'circle-stroke-width': 1.5,
          'circle-stroke-color': '#05070b',
          'circle-opacity': ['interpolate', ['linear'], ['zoom'], 5.2, 0.0, 6.0, 1.0],
        },
      });
    }

    // 5. Cities Text Labels (Level 4: zoom >= 5.2)
    if (!m.getLayer('terralens-labels-cities')) {
      m.addLayer({
        id: 'terralens-labels-cities',
        type: 'symbol',
        source: sourceId,
        filter: ['==', ['get', 'level'], 4],
        minzoom: 5.2,
        layout: {
          'text-field': ['get', 'name'],
          'text-font': ['Open Sans Regular', 'Arial Unicode MS Regular'],
          'text-size': ['interpolate', ['linear'], ['zoom'], 5.2, 10, 8, 12.5, 11, 14.5],
          'text-offset': [0.6, 0],
          'text-anchor': 'left',
          'symbol-sort-key': ['-', 1000, ['get', 'priority']],
          'text-allow-overlap': false,
          'text-ignore-placement': false,
        },
        paint: {
          'text-color': '#f1f5f9',
          'text-halo-color': 'rgba(5, 7, 11, 0.95)',
          'text-halo-width': 2,
          'text-opacity': ['interpolate', ['linear'], ['zoom'], 5.2, 0.0, 6.0, 1.0],
        },
      });
    }

    const interactiveLabelLayers = [
      'terralens-labels-continents',
      'terralens-labels-countries',
      'terralens-labels-states',
      'terralens-labels-cities',
      'terralens-labels-cities-points',
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

    interactiveLabelLayers.forEach((layerId) => {
      m.on('mouseenter', layerId, () => {
        m.getCanvas().style.cursor = 'pointer';
      });
      m.on('mouseleave', layerId, () => {
        m.getCanvas().style.cursor = '';
      });
    });

    m.on('click', onLabelClick);

    return () => {
      m.off('click', onLabelClick);
    };
  }, [mapLoaded, onSelectPlace]);

  // Update Data Layers & Highlight Ring
  useEffect(() => {
    if (!map.current || !mapLoaded) return;

    const sourceId = 'terralens-observations';
    const layerId = 'observation-points';
    const highlightSourceId = 'terralens-selected-highlight';
    const highlightLayerId = 'selected-point-highlight';

    if (!data || !data.features || data.features.length === 0) {
      if (map.current.getSource(sourceId)) {
        (map.current.getSource(sourceId) as maplibregl.GeoJSONSource).setData({
          type: 'FeatureCollection',
          features: [],
        });
      }
      return;
    }

    // Dynamic color expression based on active module & metric
    let circleColor: any = '#38bdf8';
    let circleRadius: any = 7;

    if (module === 'atmosphere') {
      if (activeMetric === 'rate') {
        circleColor = [
          'interpolate', ['linear'], ['get', 'precipitation_rate_mm_hr'],
          0.02, '#38bdf8',
          0.10, '#0284c7',
          0.25, '#2563eb',
          0.45, '#7c3aed',
          0.70, '#db2777',
        ];
      } else {
        circleColor = [
          'interpolate', ['linear'], ['get', 'precipitation_accumulated_mm'],
          20, '#38bdf8',
          80, '#0284c7',
          180, '#2563eb',
          300, '#7c3aed',
          500, '#db2777',
        ];
      }
      circleRadius = 7.5;
    } else if (module === 'ocean') {
      circleColor = [
        'interpolate', ['linear'], ['get', 'ssha_karin_m'],
        -0.40, '#1d4ed8', // deep cyclonic cold
        -0.10, '#38bdf8',
        0.00, '#e2e8f0',  // neutral
        0.15, '#f59e0b',
        0.35, '#ef4444',  // anticyclonic warm
      ];
      circleRadius = 8;
    } else if (module === 'land') {
      circleColor = [
        'interpolate', ['linear'], ['get', 'ndvi'],
        0.05, '#d97706', // barren
        0.20, '#eab308', // sparse
        0.45, '#84cc16', // moderate
        0.70, '#10b981', // dense
        0.88, '#065f46', // lush canopy
      ];
      circleRadius = 8;
    }

    if (map.current.getSource(sourceId)) {
      (map.current.getSource(sourceId) as maplibregl.GeoJSONSource).setData(data as any);
      if (map.current.getLayer(layerId)) {
        map.current.setPaintProperty(layerId, 'circle-color', circleColor);
        map.current.setPaintProperty(layerId, 'circle-radius', circleRadius);
      }
    } else {
      // Add GeoJSON Source and Layer
      map.current.addSource(sourceId, {
        type: 'geojson',
        data: data as any,
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

    // Selected Feature Highlight Ring with setData updates
    if (map.current.getSource(highlightSourceId)) {
      (map.current.getSource(highlightSourceId) as maplibregl.GeoJSONSource).setData({
        type: 'FeatureCollection',
        features: selectedFeature ? [selectedFeature as any] : [],
      });
    } else if (selectedFeature) {
      map.current.addSource(highlightSourceId, {
        type: 'geojson',
        data: {
          type: 'FeatureCollection',
          features: [selectedFeature as any],
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
        if (module === 'ocean') {
          const ssha = Number(props.ssha_karin_m);
          reading = `SSHA: ${ssha > 0 ? '+' : ''}${ssha?.toFixed(2)} m (±2.4cm)`;
        } else if (module === 'atmosphere') {
          if (activeMetric === 'rate') {
            reading = `Rain Rate: ${Number(props.precipitation_rate_mm_hr)?.toFixed(2)} mm/hr`;
          } else {
            reading = `Accumulated: ${Number(props.precipitation_accumulated_mm)?.toFixed(0)} mm`;
          }
        } else if (module === 'land') {
          reading = `NDVI: ${Number(props.ndvi)?.toFixed(2)} • ${props.drought_category || 'Vegetation'}`;
        }

        popup
          .setLngLat(coords)
          .setHTML(`
            <div style="background:#090d16; color:#f8fafc; font-family:monospace; padding:6px 10px; border-radius:8px; border:1px solid #334155; font-size:11px; box-shadow:0 10px 25px -5px rgba(0,0,0,0.5);">
              <div style="font-weight:600; color:#38bdf8; margin-bottom:2px;">${name}</div>
              <div style="color:#94a3b8; font-size:10px;">${reading}</div>
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
  }, [mapLoaded, data, module, activeMetric, selectedFeature]);

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
      <div className="absolute bottom-4 left-4 z-10 flex items-center space-x-2.5 pointer-events-auto">
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
                className={`px-1.5 py-0.5 rounded text-[10px] transition-colors ${
                  activeMetric === 'accumulated'
                    ? 'bg-blue-500/20 text-blue-300 font-semibold'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Accum
              </button>
              <button
                onClick={() => setActiveMetric('rate')}
                className={`px-1.5 py-0.5 rounded text-[10px] transition-colors ${
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
                className={`px-1.5 py-0.5 rounded text-[10px] transition-colors ${
                  activeMetric === 'ssha'
                    ? 'bg-cyan-500/20 text-cyan-300 font-semibold'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                SSHA
              </button>
              <button
                onClick={() => setActiveMetric('ssh')}
                className={`px-1.5 py-0.5 rounded text-[10px] transition-colors ${
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
                className={`px-1.5 py-0.5 rounded text-[10px] transition-colors ${
                  activeMetric === 'ndvi'
                    ? 'bg-emerald-500/20 text-emerald-300 font-semibold'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                NDVI
              </button>
              <button
                onClick={() => setActiveMetric('evi')}
                className={`px-1.5 py-0.5 rounded text-[10px] transition-colors ${
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

        {/* Date Selector Pill */}
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
