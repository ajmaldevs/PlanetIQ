import React from 'react';
import { Globe } from 'lucide-react';
import { SystemHealth } from '../services/api';

export type MainView = 'explore' | 'assistant' | 'about';

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
    <header className="sticky top-0 z-50 bg-[#05070b]/80 backdrop-blur-md border-b border-slate-800/60">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        {/* Brand */}
        <button
          onClick={() => {
            setCurrentView('explore');
            if (onResetExplore) onResetExplore();
          }}
          className="flex items-center space-x-2.5 text-left focus:outline-hidden group"
        >
          <div className="h-8 w-8 rounded-full bg-slate-900 border border-slate-700/80 flex items-center justify-center text-cyan-400 group-hover:border-cyan-500/50 transition-colors">
            <Globe className="h-4 w-4" />
          </div>
          <div>
            <span className="text-lg font-semibold tracking-tight text-white group-hover:text-cyan-300 transition-colors">
              Terra<span className="text-cyan-400">Lens</span>
            </span>
          </div>
        </button>

        {/* Minimal Navigation: Explore | AI Assistant | About */}
        <nav className="flex items-center space-x-1 sm:space-x-2">
          <button
            onClick={() => {
              setCurrentView('explore');
              if (onResetExplore) onResetExplore();
            }}
            className={`px-3.5 py-1.5 rounded-full text-xs font-medium transition-all ${
              currentView === 'explore'
                ? 'bg-cyan-500/15 text-cyan-300 border border-cyan-500/30'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/40'
            }`}
          >
            Explore
          </button>

          <button
            onClick={() => setCurrentView('assistant')}
            className={`px-3.5 py-1.5 rounded-full text-xs font-medium transition-all ${
              currentView === 'assistant'
                ? 'bg-cyan-500/15 text-cyan-300 border border-cyan-500/30'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/40'
            }`}
          >
            AI Assistant
          </button>

          <button
            onClick={() => setCurrentView('about')}
            className={`px-3.5 py-1.5 rounded-full text-xs font-medium transition-all ${
              currentView === 'about'
                ? 'bg-cyan-500/15 text-cyan-300 border border-cyan-500/30'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/40'
            }`}
          >
            About
          </button>
        </nav>

        {/* Subtle Status Indicator */}
        <div className="hidden sm:flex items-center space-x-2 text-xs text-slate-400">
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
