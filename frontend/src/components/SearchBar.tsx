import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { Search, MapPin, Globe, Compass, X, Mountain, Waves, Loader2 } from 'lucide-react';
import { GIS_PLACES, GISPlace } from '../services/gisDatabase';
import { fetchGeocodingSearch, GeocodingResult } from '../services/api';

export interface SearchResult {
  id?: string;
  name: string;
  formal_name?: string;
  iso_a2?: string;
  iso_a3?: string;
  category:
    | 'Country'
    | 'State / Province'
    | 'City'
    | 'Ocean System'
    | 'Climate Region'
    | 'Continent'
    | 'Natural Feature'
    | 'River'
    | 'Lake'
    | 'Mountain';
  lat: number;
  lon: number;
  bbox?: [number, number, number, number];
  level?: 1 | 2 | 3 | 4;
  priority?: number;
  parentCountry?: string;
  parentState?: string;
  parentContinent?: string;
  detail?: string;
}

function isDuplicatePlace(a: SearchResult, b: SearchResult): boolean {
  const normalizedName = (value: string) => value.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();
  if (normalizedName(a.name) !== normalizedName(b.name) || a.category !== b.category) return false;
  if (a.parentCountry && b.parentCountry && normalizedName(a.parentCountry) !== normalizedName(b.parentCountry)) return false;
  const toRadians = (degrees: number) => (degrees * Math.PI) / 180;
  const latDelta = toRadians(b.lat - a.lat);
  const lonDelta = toRadians(b.lon - a.lon);
  const haversine = Math.sin(latDelta / 2) ** 2 + Math.cos(toRadians(a.lat)) * Math.cos(toRadians(b.lat)) * Math.sin(lonDelta / 2) ** 2;
  const distanceKm = 6371 * 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));
  return distanceKm < 5;
}

const SCIENTIFIC_SEARCH_DATABASE: SearchResult[] = [
  // Ocean Systems & Boundary Currents
  {
    id: 'gulf-stream',
    name: 'Gulf Stream Boundary Current',
    category: 'Ocean System',
    lat: 36.0,
    lon: -68.0,
    bbox: [-80.0, 25.0, -50.0, 45.0],
    level: 1,
    detail: 'North Atlantic warm current & intense eddy field',
  },
  {
    id: 'kuroshio-extension',
    name: 'Kuroshio Extension Meander',
    category: 'Ocean System',
    lat: 35.0,
    lon: 143.0,
    bbox: [130.0, 28.0, 160.0, 42.0],
    level: 1,
    detail: 'Western Pacific boundary current & mesoscale vortices',
  },
  {
    id: 'nino-34',
    name: 'Equatorial Pacific (Niño 3.4)',
    category: 'Ocean System',
    lat: 0.0,
    lon: -140.0,
    bbox: [-170.0, -5.0, -120.0, 5.0],
    level: 1,
    detail: 'ENSO sea surface height & thermal anomaly region',
  },
  {
    id: 'agulhas-rings',
    name: 'Agulhas Retroflection Rings',
    category: 'Ocean System',
    lat: -38.0,
    lon: 20.0,
    bbox: [10.0, -45.0, 32.0, -32.0],
    level: 1,
    detail: 'South Atlantic-Indian inter-ocean eddy exchange',
  },
  {
    id: 'drake-passage',
    name: 'Drake Passage ACC Jet',
    category: 'Ocean System',
    lat: -58.0,
    lon: -65.0,
    bbox: [-75.0, -64.0, -55.0, -54.0],
    level: 1,
    detail: 'Antarctic Circumpolar Current high-energy passage',
  },
  {
    id: 'california-current',
    name: 'California Current Upwelling',
    category: 'Ocean System',
    lat: 35.0,
    lon: -123.0,
    bbox: [-128.0, 28.0, -118.0, 42.0],
    level: 1,
    detail: 'Eastern boundary cold upwelling ecosystem',
  },
  {
    id: 'humboldt-current',
    name: 'Humboldt (Peru) Current',
    category: 'Ocean System',
    lat: -12.0,
    lon: -78.0,
    bbox: [-85.0, -30.0, -70.0, -4.0],
    level: 1,
    detail: 'Highly productive Pacific coastal upwelling',
  },

  // Climate & Atmosphere Regions
  {
    id: 'itcz',
    name: 'Intertropical Convergence Zone (ITCZ)',
    category: 'Climate Region',
    lat: 6.5,
    lon: -150.0,
    bbox: [-180.0, 0.0, 180.0, 12.0],
    level: 1,
    detail: 'Global thermal equator & deep convective rain belt',
  },
  {
    id: 'south-asian-monsoon',
    name: 'South Asian Monsoon (Bay of Bengal)',
    category: 'Climate Region',
    lat: 21.0,
    lon: 88.5,
    bbox: [75.0, 10.0, 95.0, 26.0],
    level: 1,
    detail: 'High seasonal precipitation & flood risk corridor',
  },
  {
    id: 'amazon-convective-core',
    name: 'Amazon Basin Convective Core',
    category: 'Climate Region',
    lat: -3.1,
    lon: -60.0,
    bbox: [-75.0, -12.0, -50.0, 4.0],
    level: 1,
    detail: 'Equatorial continental moisture recycling zone',
  },
  {
    id: 'sahel-belt',
    name: 'Sahel Semi-Arid Transition Belt',
    category: 'Climate Region',
    lat: 14.5,
    lon: 2.0,
    bbox: [-18.0, 11.0, 35.0, 18.0],
    level: 1,
    detail: 'High interannual precipitation variability',
  },
  {
    id: 'north-atlantic-storm-track',
    name: 'North Atlantic Storm Track',
    category: 'Climate Region',
    lat: 48.0,
    lon: -30.0,
    bbox: [-65.0, 35.0, 5.0, 62.0],
    level: 1,
    detail: 'Extratropical cyclone genesis & frontal rainfall',
  },
  {
    id: 'congo-basin-rain-belt',
    name: 'Congo Basin Rain Belt',
    category: 'Climate Region',
    lat: 0.5,
    lon: 23.5,
    bbox: [12.0, -6.0, 32.0, 7.0],
    level: 1,
    detail: 'Year-round equatorial convective precipitation',
  },

  // Continents & Land Ecosystems
  {
    id: 'amazon-rainforest',
    name: 'Amazon Evergreen Rainforest',
    category: 'Climate Region',
    lat: -3.5,
    lon: -62.0,
    bbox: [-75.0, -15.0, -48.0, 5.0],
    level: 1,
    detail: 'Dense tropical canopy & terrestrial carbon sink',
  },
  {
    id: 'us-corn-belt',
    name: 'US Corn Belt Agricultural Plains',
    category: 'Climate Region',
    lat: 41.5,
    lon: -93.5,
    bbox: [-100.0, 38.0, -84.0, 45.0],
    level: 2,
    detail: 'Intensive cropland phenology & vegetative index',
  },
  {
    id: 'sahara-desert',
    name: 'Sahara Desert Hyper-Arid Zone',
    category: 'Climate Region',
    lat: 23.0,
    lon: 12.0,
    bbox: [-15.0, 15.0, 35.0, 32.0],
    level: 1,
    detail: 'Lowest global NDVI & high surface albedo',
  },
  {
    id: 'siberian-taiga',
    name: 'Siberian Boreal Taiga Forest',
    category: 'Climate Region',
    lat: 62.0,
    lon: 129.0,
    bbox: [60.0, 55.0, 150.0, 70.0],
    level: 1,
    detail: 'Sub-arctic coniferous forest & seasonal snow cover',
  },
  {
    id: 'himalayan-plateau',
    name: 'Himalayan High Altitude Plateau',
    category: 'Climate Region',
    lat: 28.0,
    lon: 86.0,
    bbox: [75.0, 26.0, 95.0, 32.0],
    level: 1,
    detail: 'Third Pole glacier water tower & alpine terrain',
  },
];

interface SearchBarProps {
  onSelectLocation: (
    lat: number,
    lon: number,
    name: string,
    place?: SearchResult | GISPlace | GeocodingResult
  ) => void;
  className?: string;
}

export const SearchBar: React.FC<SearchBarProps> = ({ onSelectLocation, className = '' }) => {
  const [query, setQuery] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const [isSearchingBackend, setIsSearchingBackend] = useState(false);
  const [backendResults, setBackendResults] = useState<GeocodingResult[]>([]);

  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Unified GIS and Scientific Places Search Database for instant client matching
  const clientDatabase = useMemo(() => {
    const items: SearchResult[] = [...SCIENTIFIC_SEARCH_DATABASE];
    const existingNames = new Set(items.map((i) => i.name.toLowerCase()));

    GIS_PLACES.forEach((p) => {
      if (existingNames.has(p.name.toLowerCase())) return;

      let cat: SearchResult['category'] = 'City';
      if (p.category === 'country') cat = 'Country';
      else if (p.category === 'state') cat = 'State / Province';
      else if (p.category === 'continent') cat = 'Continent';
      else if (p.category === 'ocean') cat = 'Ocean System';
      else if (p.category === 'natural_feature') cat = 'Natural Feature';

      const detailParts: string[] = [];
      if (p.iso_a3) detailParts.push(p.iso_a3);
      if (p.parentState) detailParts.push(p.parentState);
      if (p.parentCountry) detailParts.push(p.parentCountry);
      if (p.parentContinent) detailParts.push(p.parentContinent);
      if (p.detail) detailParts.push(p.detail);

      items.push({
        id: p.id,
        name: p.name,
        formal_name: p.formal_name,
        iso_a2: p.iso_a2,
        iso_a3: p.iso_a3,
        category: cat,
        lat: p.lat,
        lon: p.lon,
        bbox: p.bbox,
        level: p.level,
        priority: p.priority,
        parentCountry: p.parentCountry,
        parentState: p.parentState,
        parentContinent: p.parentContinent,
        detail: detailParts.join(' • '),
      });
      existingNames.add(p.name.toLowerCase());
    });

    return items;
  }, []);

  // Filter client-side matching results instantly
  const clientMatches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];

    return clientDatabase
      .filter(
        (item) =>
          item.name.toLowerCase().includes(q) ||
          (item.formal_name && item.formal_name.toLowerCase().includes(q)) ||
          (item.iso_a2 && item.iso_a2.toLowerCase() === q) ||
          (item.iso_a3 && item.iso_a3.toLowerCase() === q) ||
          (item.detail && item.detail.toLowerCase().includes(q)) ||
          item.category.toLowerCase().includes(q)
      )
      .sort((a, b) => {
        // Prioritize exact match on name or ISO code
        const aExact =
          a.name.toLowerCase() === q ||
          a.iso_a2?.toLowerCase() === q ||
          a.iso_a3?.toLowerCase() === q
            ? 2
            : 0;
        const bExact =
          b.name.toLowerCase() === q ||
          b.iso_a2?.toLowerCase() === q ||
          b.iso_a3?.toLowerCase() === q
            ? 2
            : 0;
        if (aExact !== bExact) return bExact - aExact;

        // Prioritize prefix match
        const aStarts =
          a.name.toLowerCase().startsWith(q) || a.iso_a3?.toLowerCase().startsWith(q) ? 1 : 0;
        const bStarts =
          b.name.toLowerCase().startsWith(q) || b.iso_a3?.toLowerCase().startsWith(q) ? 1 : 0;
        return bStarts - aStarts;
      })
      .slice(0, 10);
  }, [query, clientDatabase]);

  // Debounced backend geocoding fetch with Natural Earth bounding boxes & disambiguation
  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setBackendResults([]);
      setIsSearchingBackend(false);
      return;
    }

    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    debounceTimerRef.current = setTimeout(async () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      const controller = new AbortController();
      abortControllerRef.current = controller;
      setIsSearchingBackend(true);

      try {
        const resp = await fetchGeocodingSearch(q, 10, controller.signal);
        if (!controller.signal.aborted) {
          setBackendResults(resp.results || []);
        }
      } catch (err: any) {
        if (err?.name !== 'AbortError') {
          // Fall back gracefully to client matches
          setBackendResults([]);
        }
      } finally {
        if (!controller.signal.aborted) {
          setIsSearchingBackend(false);
        }
      }
    }, 200);

    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, [query]);

  // Merge backend results with client-side scientific & GIS places
  const combinedMatches = useMemo(() => {
    const items: SearchResult[] = [];
    const seenKeys = new Set<string>();
    const addIfUnique = (item: SearchResult) => {
      const key = `${item.name.toLowerCase()}-${item.lat.toFixed(2)}-${item.lon.toFixed(2)}`;
      if (seenKeys.has(key) || items.some((existing) => isDuplicatePlace(existing, item))) return;
      seenKeys.add(key);
      items.push(item);
    };

    const getCategoryType = (catStr: string): SearchResult['category'] => {
      const c = catStr.toLowerCase();
      if (c === 'country') return 'Country';
      if (c === 'state' || c.includes('state') || c.includes('province')) return 'State / Province';
      if (c === 'continent') return 'Continent';
      if (c === 'ocean' || c.includes('sea')) return 'Ocean System';
      if (c === 'river') return 'River';
      if (c === 'lake') return 'Lake';
      if (c === 'mountain') return 'Mountain';
      if (c === 'natural_feature') return 'Natural Feature';
      return 'City';
    };

    // 1. Backend results (primary authority with accurate bounding boxes)
    backendResults.forEach((b) => {
      const detailParts: string[] = [];
      if (b.detail) {
        detailParts.push(b.detail);
      } else {
        if (b.iso_a3) detailParts.push(b.iso_a3);
        if (b.parent_state) detailParts.push(b.parent_state);
        if (b.parent_country) detailParts.push(b.parent_country);
        if (b.parent_continent) detailParts.push(b.parent_continent);
      }

      addIfUnique({
        id: b.id,
        name: b.name,
        formal_name: b.formal_name,
        iso_a2: b.iso_a2,
        iso_a3: b.iso_a3,
        category: getCategoryType(b.category),
        lat: b.latitude,
        lon: b.longitude,
        bbox: b.bbox,
        level: b.level as 1 | 2 | 3 | 4,
        priority: b.priority,
        parentCountry: b.parent_country,
        parentState: b.parent_state,
        parentContinent: b.parent_continent,
        detail: detailParts.join(' • '),
      });
    });

    // 2. Client-side matches (scientific regions, marine currents, local cache)
    clientMatches.forEach((c) => {
      addIfUnique(c);
    });

    return items.slice(0, 10);
  }, [backendResults, clientMatches]);

  // Close dropdown on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSelect = useCallback(
    (item: SearchResult) => {
      onSelectLocation(item.lat, item.lon, item.name, item);
      setQuery(item.name);
      setIsOpen(false);
      setHighlightedIndex(-1);
      if (inputRef.current) inputRef.current.blur();
    },
    [onSelectLocation]
  );

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!isOpen || combinedMatches.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightedIndex((prev) => (prev < combinedMatches.length - 1 ? prev + 1 : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightedIndex((prev) => (prev > 0 ? prev - 1 : combinedMatches.length - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (highlightedIndex >= 0 && highlightedIndex < combinedMatches.length) {
        handleSelect(combinedMatches[highlightedIndex]);
      } else if (combinedMatches.length > 0) {
        handleSelect(combinedMatches[0]);
      }
    } else if (e.key === 'Escape') {
      setIsOpen(false);
    }
  };

  const getCategoryBadge = (category: string) => {
    switch (category) {
      case 'Ocean System':
        return 'bg-cyan-950/80 text-cyan-300 border-cyan-800/60';
      case 'River':
      case 'Lake':
        return 'bg-sky-950/80 text-sky-300 border-sky-800/60';
      case 'Mountain':
        return 'bg-violet-950/80 text-violet-300 border-violet-800/60';
      case 'Climate Region':
      case 'Natural Feature':
        return 'bg-blue-950/80 text-blue-300 border-blue-800/60';
      case 'Country':
        return 'bg-emerald-950/80 text-emerald-300 border-emerald-800/60';
      case 'State / Province':
        return 'bg-amber-950/80 text-amber-300 border-amber-800/60';
      case 'City':
        return 'bg-slate-850 text-slate-300 border-slate-700';
      default:
        return 'bg-slate-800 text-slate-300 border-slate-700';
    }
  };

  const getCategoryIcon = (category: string) => {
    switch (category) {
      case 'Ocean System':
        return <Compass className="h-3.5 w-3.5 text-cyan-400 shrink-0" />;
      case 'River':
      case 'Lake':
        return <Waves className="h-3.5 w-3.5 text-sky-400 shrink-0" />;
      case 'Mountain':
        return <Mountain className="h-3.5 w-3.5 text-violet-400 shrink-0" />;
      case 'Climate Region':
      case 'Continent':
        return <Globe className="h-3.5 w-3.5 text-blue-400 shrink-0" />;
      case 'State / Province':
        return <MapPin className="h-3.5 w-3.5 text-amber-400 shrink-0" />;
      default:
        return <MapPin className="h-3.5 w-3.5 text-emerald-400 shrink-0" />;
    }
  };

  return (
    <div ref={containerRef} className={`relative w-full max-w-md ${className}`}>
      <div className="relative flex items-center">
        {isSearchingBackend ? (
          <Loader2 className="absolute left-3.5 h-4 w-4 text-cyan-400 animate-spin pointer-events-none" />
        ) : (
          <Search className="absolute left-3.5 h-4 w-4 text-slate-400 pointer-events-none" />
        )}
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setIsOpen(true);
            setHighlightedIndex(-1);
          }}
          onFocus={() => {
            if (query.trim()) setIsOpen(true);
          }}
          onKeyDown={handleKeyDown}
          placeholder="Search countries, cities, oceans, rivers, mountains..."
          className="w-full bg-[#090d16]/90 border border-slate-700/80 hover:border-slate-600 focus:border-cyan-500 rounded-full pl-10 pr-9 py-2 text-xs sm:text-sm text-slate-100 placeholder-slate-400 shadow-xl backdrop-blur-md focus:outline-hidden transition-colors"
          aria-label="Search geographic locations and features"
        />
        {query && (
          <button
            onClick={() => {
              setQuery('');
              setIsOpen(false);
              setBackendResults([]);
              if (inputRef.current) inputRef.current.focus();
            }}
            className="absolute right-3 p-0.5 rounded-full text-slate-400 hover:text-white transition-colors"
            aria-label="Clear search query"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {/* Autocomplete Dropdown with Smooth Fluid Fade-In */}
      {isOpen && query.trim().length >= 1 && (
        <div className="absolute top-full left-0 right-0 mt-1.5 bg-[#090d16]/98 border border-slate-800 rounded-2xl shadow-2xl backdrop-blur-xl overflow-hidden z-50 py-1 divide-y divide-slate-800/60 max-h-[min(340px,calc(100vh-160px))] overflow-y-auto animate-fade-scale">
          {combinedMatches.length > 0 ? (
            combinedMatches.map((item, idx) => (
              <button
                key={`${item.id || item.name}-${idx}`}
                onClick={() => handleSelect(item)}
                onMouseEnter={() => setHighlightedIndex(idx)}
                className={`w-full px-3.5 py-2.5 text-left flex items-start justify-between space-x-2 transition-colors cursor-pointer ${
                  highlightedIndex === idx
                    ? 'bg-slate-800/80 text-white'
                    : 'hover:bg-slate-800/50 text-slate-200'
                }`}
              >
                <div className="flex items-start space-x-2.5 min-w-0">
                  <div className="mt-0.5">{getCategoryIcon(item.category)}</div>
                  <div className="min-w-0">
                    <div className="text-xs font-semibold text-white truncate flex items-center space-x-1.5">
                      <span>{item.name}</span>
                      {item.bbox && (
                        <span className="text-[9px] font-mono text-cyan-400/80 bg-cyan-950/50 px-1 rounded">
                          BBox
                        </span>
                      )}
                    </div>
                    {item.detail && (
                      <div className="text-[11px] text-slate-400 truncate">{item.detail}</div>
                    )}
                  </div>
                </div>
                <span
                  className={`text-[10px] font-mono px-2 py-0.5 rounded-md border shrink-0 ${getCategoryBadge(
                    item.category
                  )}`}
                >
                  {item.category}
                </span>
              </button>
            ))
          ) : (
            <div className="px-4 py-3 text-center text-xs text-slate-400 space-y-1">
              {isSearchingBackend ? (
                <div className="flex items-center justify-center space-x-2 text-cyan-400">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  <span>Searching global geography database...</span>
                </div>
              ) : (
                <>
                  <p className="text-slate-300 font-medium">No places found matching "{query}"</p>
                  <p className="text-[11px] text-slate-500">
                    Try searching country (France), city (Kozhikode), mountain (Everest), river (Nile), or ocean.
                  </p>
                </>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default SearchBar;
