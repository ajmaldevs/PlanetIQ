import React from 'react';
import { Globe2, Waves, CloudRain, Trees, Orbit, Bot, BookOpen, Activity } from 'lucide-react';
import { SystemHealth } from '../services/api';

export type ActiveTab = 'overview' | 'ocean' | 'atmosphere' | 'land' | 'cross-system' | 'assistant' | 'datasets';

interface NavbarProps {
  activeTab: ActiveTab;
  setActiveTab: (tab: ActiveTab) => void;
  health: SystemHealth | null;
  loadingHealth: boolean;
}

export const Navbar: React.FC<NavbarProps> = ({
  activeTab,
  setActiveTab,
  health,
  loadingHealth,
}) => {
  const navItems: Array<{ id: ActiveTab; label: string; icon: React.ReactNode; badge?: string }> = [
    { id: 'overview', label: 'Overview', icon: <Globe2 className="h-4 w-4" /> },
    { id: 'ocean', label: 'Ocean (SWOT)', icon: <Waves className="h-4 w-4" /> },
    { id: 'atmosphere', label: 'Atmosphere (GPM)', icon: <CloudRain className="h-4 w-4" /> },
    { id: 'land', label: 'Land (MODIS)', icon: <Trees className="h-4 w-4" /> },
    { id: 'cross-system', label: 'Coupled Systems', icon: <Orbit className="h-4 w-4" />, badge: 'ENSO' },
    { id: 'assistant', label: 'AI Assistant', icon: <Bot className="h-4 w-4" />, badge: 'Gemini' },
    { id: 'datasets', label: 'Documentation', icon: <BookOpen className="h-4 w-4" /> },
  ];

  return (
    <header className="border-b border-slate-800 bg-[#0a0d14]/90 backdrop-blur-md sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        {/* Brand */}
        <div className="flex items-center space-x-3 cursor-pointer" onClick={() => setActiveTab('overview')}>
          <div className="h-9 w-9 rounded-lg bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center shadow-lg shadow-cyan-500/20">
            <Globe2 className="h-5 w-5 text-white" />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <span className="text-xl font-bold tracking-tight text-white">
                Terra<span className="text-cyan-400">Lens</span>
              </span>
              <span className="text-[10px] bg-cyan-950/80 text-cyan-400 border border-cyan-800/60 px-1.5 py-0.5 rounded font-mono uppercase tracking-wider">
                Space Apps '26
              </span>
            </div>
            <p className="text-[11px] text-slate-400 leading-none">Planetary Earth Observation Platform</p>
          </div>
        </div>

        {/* Navigation Tabs */}
        <nav className="hidden md:flex items-center space-x-1">
          {navItems.map((item) => {
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id)}
                className={`flex items-center space-x-2 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                  isActive
                    ? 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/30 shadow-sm shadow-cyan-500/10'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
                }`}
              >
                {item.icon}
                <span>{item.label}</span>
                {item.badge && (
                  <span className="text-[9px] bg-slate-800 text-slate-300 px-1.5 py-0.2 rounded font-mono">
                    {item.badge}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        {/* System Health Status */}
        <div className="flex items-center space-x-3">
          <div className="flex items-center space-x-2 px-2.5 py-1 rounded-full bg-slate-900 border border-slate-800 text-xs">
            <Activity className="h-3.5 w-3.5 text-slate-400" />
            {loadingHealth ? (
              <span className="text-slate-500 text-[11px]">Connecting...</span>
            ) : health ? (
              <div className="flex items-center space-x-1.5">
                <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse"></span>
                <span className="text-emerald-400 font-mono text-[11px] font-medium">API Online</span>
              </div>
            ) : (
              <div className="flex items-center space-x-1.5">
                <span className="h-2 w-2 rounded-full bg-amber-400"></span>
                <span className="text-amber-400 font-mono text-[11px]">Backend Offline</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Mobile nav row */}
      <div className="md:hidden flex overflow-x-auto px-4 py-2 border-t border-slate-800/60 space-x-2 scrollbar-none">
        {navItems.map((item) => (
          <button
            key={item.id}
            onClick={() => setActiveTab(item.id)}
            className={`flex items-center space-x-1.5 whitespace-nowrap px-2.5 py-1 rounded text-xs shrink-0 ${
              activeTab === item.id
                ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
                : 'text-slate-400 bg-slate-900/60'
            }`}
          >
            {item.icon}
            <span>{item.label}</span>
          </button>
        ))}
      </div>
    </header>
  );
};
