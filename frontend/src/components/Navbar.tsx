import React from 'react';
import { Globe } from 'lucide-react';
import { SystemHealth } from '../services/api';

export type MainView = 'explore' | 'assistant' | 'about' | 'catalog';

interface NavbarProps {
  currentView: MainView;
  setCurrentView: (view: MainView) => void;
  health: SystemHealth | null;
  onResetExplore?: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  currentView,
  setCurrentView,
  health,
  onResetExplore,
}) => {
  return (
    <header className="sticky top-0 z-50 bg-[#05070b]/90 backdrop-blur-md border-b border-slate-800/80">
      <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-2">
        {/* Brand */}
        <button
          onClick={() => {
            setCurrentView('explore');
            if (onResetExplore) onResetExplore();
          }}
          className="flex items-center space-x-2 text-left focus:outline-hidden focus-visible:ring-2 focus-visible:ring-cyan-400 rounded-lg group shrink-0 cursor-pointer"
          aria-label="PlanetIQ Home"
        >
          <div className="h-8 w-8 rounded-full bg-slate-900 border border-slate-700/80 flex items-center justify-center text-cyan-400 group-hover:border-cyan-500/50 transition-colors relative">
            <Globe className="h-4 w-4" />
            {/* Mobile Connection Status Dot */}
            <span
              className={`absolute -top-0.5 -right-0.5 sm:hidden h-2 w-2 rounded-full border border-[#05070b] ${
                health ? 'bg-emerald-400' : 'bg-amber-400'
              }`}
              title={health ? 'Live Data Connected' : 'Offline Mode'}
            />
          </div>
          <div className="hidden sm:block">
            <span className="text-base sm:text-lg font-bold tracking-tight text-white group-hover:text-cyan-300 transition-colors">
              Terra<span className="text-cyan-400">Lens</span>
            </span>
          </div>
        </button>

        {/* Navigation: Explore | Dataset Catalog | AI Assistant | About */}
        <nav className="flex items-center space-x-1 sm:space-x-2">
          <button
            onClick={() => {
              setCurrentView('explore');
              if (onResetExplore) onResetExplore();
            }}
            className={`min-h-[36px] flex items-center justify-center px-2.5 sm:px-3.5 py-1.5 rounded-full text-[11px] sm:text-xs font-medium transition-all cursor-pointer focus:outline-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 focus-visible:ring-offset-1 focus-visible:ring-offset-slate-900 ${
              currentView === 'explore'
                ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 font-semibold shadow-sm'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
            }`}
          >
            Explore
          </button>

          <button
            onClick={() => setCurrentView('catalog')}
            className={`min-h-[36px] flex items-center justify-center px-2.5 sm:px-3.5 py-1.5 rounded-full text-[11px] sm:text-xs font-medium transition-all cursor-pointer focus:outline-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 focus-visible:ring-offset-1 focus-visible:ring-offset-slate-900 ${
              currentView === 'catalog'
                ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 font-semibold shadow-sm'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
            }`}
          >
            <span className="hidden sm:inline">Dataset </span>Catalog
          </button>

          <button
            onClick={() => setCurrentView('assistant')}
            className={`min-h-[36px] flex items-center justify-center px-2.5 sm:px-3.5 py-1.5 rounded-full text-[11px] sm:text-xs font-medium transition-all cursor-pointer focus:outline-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 focus-visible:ring-offset-1 focus-visible:ring-offset-slate-900 ${
              currentView === 'assistant'
                ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 font-semibold shadow-sm'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
            }`}
          >
            <span className="hidden sm:inline">AI </span>Assistant
          </button>

          <button
            onClick={() => setCurrentView('about')}
            className={`min-h-[36px] flex items-center justify-center px-2.5 sm:px-3.5 py-1.5 rounded-full text-[11px] sm:text-xs font-medium transition-all cursor-pointer focus:outline-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 focus-visible:ring-offset-1 focus-visible:ring-offset-slate-900 ${
              currentView === 'about'
                ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 font-semibold shadow-sm'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
            }`}
          >
            About
          </button>
        </nav>

        {/* Desktop Status Indicator */}
        <div className="hidden sm:flex items-center space-x-2 text-xs text-slate-400 shrink-0">
          <span
            className={`h-2 w-2 rounded-full ${
              health ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'
            }`}
          />
          <span className="text-[11px] font-mono text-slate-400">
            {health ? 'Live Data Connected' : 'Offline Mode'}
          </span>
        </div>
      </div>
    </header>
  );
};
