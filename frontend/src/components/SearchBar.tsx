import React, { useState, useRef, useEffect } from 'react';
import { Search, MapPin, Globe, Compass, X } from 'lucide-react';

export interface SearchResult {
  name: string;
  category: 'Country' | 'City' | 'Ocean System' | 'Climate Region' | 'Continent';
  lat: number;
  lon: number;
  detail?: string;
}

const SEARCH_DATABASE: SearchResult[] = [
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

  // Major Countries
  { name: 'United States', category: 'Country', lat: 39.0, lon: -98.0, detail: 'North America' },
  { name: 'Brazil', category: 'Country', lat: -10.0, lon: -53.0, detail: 'South America' },
  { name: 'Canada', category: 'Country', lat: 56.0, lon: -106.0, detail: 'North America' },
  { name: 'China', category: 'Country', lat: 35.0, lon: 104.0, detail: 'Asia' },
  { name: 'India', category: 'Country', lat: 21.0, lon: 78.0, detail: 'Asia' },
  { name: 'Australia', category: 'Country', lat: -25.0, lon: 135.0, detail: 'Oceania' },
  { name: 'Germany', category: 'Country', lat: 51.0, lon: 10.0, detail: 'Europe' },
  { name: 'France', category: 'Country', lat: 46.5, lon: 2.5, detail: 'Europe' },
  { name: 'United Kingdom', category: 'Country', lat: 54.5, lon: -2.5, detail: 'Europe' },
  { name: 'Japan', category: 'Country', lat: 36.5, lon: 138.0, detail: 'Asia' },
  { name: 'Egypt', category: 'Country', lat: 26.5, lon: 30.0, detail: 'Africa' },
  { name: 'South Africa', category: 'Country', lat: -29.0, lon: 24.0, detail: 'Africa' },
  { name: 'Nigeria', category: 'Country', lat: 9.0, lon: 7.5, detail: 'Africa' },
  { name: 'Kenya', category: 'Country', lat: 0.5, lon: 37.5, detail: 'Africa' },
  { name: 'Mexico', category: 'Country', lat: 23.0, lon: -102.0, detail: 'North America' },
  { name: 'Argentina', category: 'Country', lat: -34.0, lon: -64.0, detail: 'South America' },
  { name: 'Indonesia', category: 'Country', lat: -1.0, lon: 118.0, detail: 'Maritime Continent Asia' },
  { name: 'Saudi Arabia', category: 'Country', lat: 24.0, lon: 45.0, detail: 'Middle East' },

  // Global Megacities & Research Nodes
  { name: 'Tokyo', category: 'City', lat: 35.68, lon: 139.76, detail: 'Japan' },
  { name: 'New York City', category: 'City', lat: 40.71, lon: -74.00, detail: 'United States' },
  { name: 'London', category: 'City', lat: 51.51, lon: -0.12, detail: 'United Kingdom' },
  { name: 'Paris', category: 'City', lat: 48.85, lon: 2.35, detail: 'France' },
  { name: 'Cairo', category: 'City', lat: 30.04, lon: 31.23, detail: 'Egypt (Nile Delta)' },
  { name: 'Mumbai', category: 'City', lat: 19.07, lon: 72.87, detail: 'India (Arabian Sea Coast)' },
  { name: 'São Paulo', category: 'City', lat: -23.55, lon: -46.63, detail: 'Brazil' },
  { name: 'Sydney', category: 'City', lat: -33.86, lon: 151.20, detail: 'Australia' },
  { name: 'Singapore', category: 'City', lat: 1.35, lon: 103.82, detail: 'Equatorial Maritime Hub' },
  { name: 'Nairobi', category: 'City', lat: -1.29, lon: 36.82, detail: 'Kenya (East African Rift)' },
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

  // Filter matching results
  const matches = query.trim()
    ? SEARCH_DATABASE.filter(
        (item) =>
          item.name.toLowerCase().includes(query.toLowerCase()) ||
          (item.detail && item.detail.toLowerCase().includes(query.toLowerCase())) ||
          item.category.toLowerCase().includes(query.toLowerCase())
      ).slice(0, 7)
    : [];

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
        return 'bg-blue-950/80 text-blue-300 border-blue-800/60';
      case 'Country':
        return 'bg-emerald-950/80 text-emerald-300 border-emerald-800/60';
      case 'City':
        return 'bg-slate-800 text-slate-300 border-slate-700';
      default:
        return 'bg-slate-800 text-slate-300 border-slate-700';
    }
  };

  const getCategoryIcon = (category: string) => {
    switch (category) {
      case 'Ocean System':
        return <Compass className="h-3.5 w-3.5 text-cyan-400 shrink-0" />;
      case 'Climate Region':
        return <Globe className="h-3.5 w-3.5 text-blue-400 shrink-0" />;
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
          placeholder="Search country, city, ocean current, or climate region..."
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

      {/* Autocomplete Dropdown */}
      {isOpen && matches.length > 0 && (
        <div className="absolute top-full left-0 right-0 mt-1.5 bg-[#090d16]/95 border border-slate-800 rounded-2xl shadow-2xl backdrop-blur-xl overflow-hidden z-50 py-1 divide-y divide-slate-800/60 max-h-80 overflow-y-auto">
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
