import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Search, MapPin, Globe, Compass, X } from 'lucide-react';
import { GIS_PLACES } from '../services/gisDatabase';

export interface SearchResult {
  name: string;
  formal_name?: string;
  iso_a2?: string;
  iso_a3?: string;
  category: 'Country' | 'State / Province' | 'City' | 'Ocean System' | 'Climate Region' | 'Continent' | 'Natural Feature';
  lat: number;
  lon: number;
  detail?: string;
}

const SCIENTIFIC_SEARCH_DATABASE: SearchResult[] = [
  // Ocean Systems & Boundary Currents
  { name: 'Gulf Stream Boundary Current', category: 'Ocean System', lat: 36.0, lon: -68.0, detail: 'North Atlantic warm current & intense eddy field' },
  { name: 'Kuroshio Extension Meander', category: 'Ocean System', lat: 35.0, lon: 143.0, detail: 'Western Pacific boundary current & mesoscale vortices' },
  { name: 'Equatorial Pacific (Niño 3.4)', category: 'Ocean System', lat: 0.0, lon: -140.0, detail: 'ENSO sea surface height & thermal anomaly region' },
  { name: 'Agulhas Retroflection Rings', category: 'Ocean System', lat: -38.0, lon: 20.0, detail: 'South Atlantic-Indian inter-ocean eddy exchange' },
  { name: 'Drake Passage ACC Jet', category: 'Ocean System', lat: -58.0, lon: -65.0, detail: 'Antarctic Circumpolar Current high-energy passage' },
  { name: 'California Current Upwelling', category: 'Ocean System', lat: 35.0, lon: -123.0, detail: 'Eastern boundary cold upwelling ecosystem' },
  { name: 'Humboldt (Peru) Current', category: 'Ocean System', lat: -12.0, lon: -78.0, detail: 'Highly productive Pacific coastal upwelling' },

  // Climate & Atmosphere Regions
  { name: 'Intertropical Convergence Zone (ITCZ)', category: 'Climate Region', lat: 6.5, lon: -150.0, detail: 'Global thermal equator & deep convective rain belt' },
  { name: 'South Asian Monsoon (Bay of Bengal)', category: 'Climate Region', lat: 21.0, lon: 88.5, detail: 'High seasonal precipitation & flood risk corridor' },
  { name: 'Amazon Basin Convective Core', category: 'Climate Region', lat: -3.1, lon: -60.0, detail: 'Equatorial continental moisture recycling zone' },
  { name: 'Sahel Semi-Arid Transition Belt', category: 'Climate Region', lat: 14.5, lon: 2.0, detail: 'High interannual precipitation variability' },
  { name: 'North Atlantic Storm Track', category: 'Climate Region', lat: 48.0, lon: -30.0, detail: 'Extratropical cyclone genesis & frontal rainfall' },
  { name: 'Congo Basin Rain Belt', category: 'Climate Region', lat: 0.5, lon: 23.5, detail: 'Year-round equatorial convective precipitation' },

  // Continents & Land Ecosystems
  { name: 'Amazon Evergreen Rainforest', category: 'Climate Region', lat: -3.5, lon: -62.0, detail: 'Dense tropical canopy & terrestrial carbon sink' },
  { name: 'US Corn Belt Agricultural Plains', category: 'Climate Region', lat: 41.5, lon: -93.5, detail: 'Intensive cropland phenology & vegetative index' },
  { name: 'Sahara Desert Hyper-Arid Zone', category: 'Climate Region', lat: 23.0, lon: 12.0, detail: 'Lowest global NDVI & high surface albedo' },
  { name: 'Siberian Boreal Taiga Forest', category: 'Climate Region', lat: 62.0, lon: 129.0, detail: 'Sub-arctic coniferous forest & seasonal snow cover' },
  { name: 'Himalayan High Altitude Plateau', category: 'Climate Region', lat: 28.0, lon: 86.0, detail: 'Third Pole glacier water tower & alpine terrain' },
];

interface SearchBarProps {
  onSelectLocation: (lat: number, lon: number, name: string) => void;
  className?: string;
}

export const SearchBar: React.FC<SearchBarProps> = ({ onSelectLocation, className = '' }) => {
  const [query, setQuery] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Unified GIS and Scientific Places Search Database
  const searchDatabase = useMemo(() => {
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
        name: p.name,
        formal_name: p.formal_name,
        iso_a2: p.iso_a2,
        iso_a3: p.iso_a3,
        category: cat,
        lat: p.lat,
        lon: p.lon,
        detail: detailParts.join(' • '),
      });
      existingNames.add(p.name.toLowerCase());
    });

    return items;
  }, []);

  // Filter matching results with priority ordering
  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];

    return searchDatabase
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
        const aExact = a.name.toLowerCase() === q || a.iso_a2?.toLowerCase() === q || a.iso_a3?.toLowerCase() === q ? 2 : 0;
        const bExact = b.name.toLowerCase() === q || b.iso_a2?.toLowerCase() === q || b.iso_a3?.toLowerCase() === q ? 2 : 0;
        if (aExact !== bExact) return bExact - aExact;

        // Prioritize prefix match
        const aStarts = a.name.toLowerCase().startsWith(q) || a.iso_a3?.toLowerCase().startsWith(q) ? 1 : 0;
        const bStarts = b.name.toLowerCase().startsWith(q) || b.iso_a3?.toLowerCase().startsWith(q) ? 1 : 0;
        return bStarts - aStarts;
      })
      .slice(0, 10);
  }, [query, searchDatabase]);

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

  const handleSelect = (item: SearchResult) => {
    onSelectLocation(item.lat, item.lon, item.name);
    setQuery(item.name);
    setIsOpen(false);
    setHighlightedIndex(-1);
    if (inputRef.current) inputRef.current.blur();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!isOpen || matches.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightedIndex((prev) => (prev < matches.length - 1 ? prev + 1 : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightedIndex((prev) => (prev > 0 ? prev - 1 : matches.length - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (highlightedIndex >= 0 && highlightedIndex < matches.length) {
        handleSelect(matches[highlightedIndex]);
      } else if (matches.length > 0) {
        handleSelect(matches[0]);
      }
    } else if (e.key === 'Escape') {
      setIsOpen(false);
    }
  };

  const getCategoryBadge = (category: string) => {
    switch (category) {
      case 'Ocean System':
        return 'bg-cyan-950/80 text-cyan-300 border-cyan-800/60';
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
        <Search className="absolute left-3.5 h-4 w-4 text-slate-400 pointer-events-none" />
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
          placeholder="Search country, state, city (e.g. Kozhikode), or ocean..."
          className="w-full bg-[#090d16]/90 border border-slate-700/80 hover:border-slate-600 focus:border-cyan-500 rounded-full pl-10 pr-9 py-2 text-xs sm:text-sm text-slate-100 placeholder-slate-400 shadow-xl backdrop-blur-md focus:outline-hidden transition-colors"
        />
        {query && (
          <button
            onClick={() => {
              setQuery('');
              setIsOpen(false);
              if (inputRef.current) inputRef.current.focus();
            }}
            className="absolute right-3 p-0.5 rounded-full text-slate-400 hover:text-white transition-colors"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {/* Autocomplete Dropdown with Smooth Fluid Fade-In */}
      {isOpen && matches.length > 0 && (
        <div className="absolute top-full left-0 right-0 mt-1.5 bg-[#090d16]/95 border border-slate-800 rounded-2xl shadow-2xl backdrop-blur-xl overflow-hidden z-50 py-1 divide-y divide-slate-800/60 max-h-80 overflow-y-auto animate-fade-scale">
          {matches.map((item, idx) => (
            <button
              key={`${item.name}-${idx}`}
              onClick={() => handleSelect(item)}
              onMouseEnter={() => setHighlightedIndex(idx)}
              className={`w-full px-3.5 py-2.5 text-left flex items-start justify-between space-x-2 transition-colors ${
                highlightedIndex === idx
                  ? 'bg-slate-800/80 text-white'
                  : 'hover:bg-slate-800/50 text-slate-200'
              }`}
            >
              <div className="flex items-start space-x-2.5 min-w-0">
                <div className="mt-0.5">{getCategoryIcon(item.category)}</div>
                <div className="min-w-0">
                  <div className="text-xs font-semibold text-white truncate">{item.name}</div>
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
          ))}
        </div>
      )}
    </div>
  );
};

export default SearchBar;
