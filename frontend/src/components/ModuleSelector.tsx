import React from 'react';
import { Waves, CloudRain, Trees, ArrowUpRight } from 'lucide-react';
import { EarthModule } from './EarthGlobe';

interface ModuleSelectorProps {
  activeModule: EarthModule;
  onSelectModule: (module: EarthModule) => void;
}

export const ModuleSelector: React.FC<ModuleSelectorProps> = ({
  activeModule,
  onSelectModule,
}) => {
  const modules: Array<{
    id: 'ocean' | 'atmosphere' | 'land';
    title: string;
    description: string;
    icon: React.ReactNode;
    color: string;
    activeBorder: string;
    accentText: string;
  }> = [
    {
      id: 'ocean',
      title: 'OCEAN',
      description: 'Explore sea surface height and ocean changes using SWOT.',
      icon: <Waves className="h-5 w-5 text-cyan-400" />,
      color: 'hover:border-cyan-500/50 hover:bg-cyan-950/20',
      activeBorder: 'border-cyan-500/60 bg-cyan-950/25',
      accentText: 'text-cyan-400',
    },
    {
      id: 'atmosphere',
      title: 'ATMOSPHERE',
      description: 'Explore rainfall patterns and precipitation changes using GPM IMERG.',
      icon: <CloudRain className="h-5 w-5 text-blue-400" />,
      color: 'hover:border-blue-500/50 hover:bg-blue-950/20',
      activeBorder: 'border-blue-500/60 bg-blue-950/25',
      accentText: 'text-blue-400',
    },
    {
      id: 'land',
      title: 'LAND',
      description: 'Explore vegetation health and changes using MODIS.',
      icon: <Trees className="h-5 w-5 text-emerald-400" />,
      color: 'hover:border-emerald-500/50 hover:bg-emerald-950/20',
      activeBorder: 'border-emerald-500/60 bg-emerald-950/25',
      accentText: 'text-emerald-400',
    },
  ];

  return (
    <div className="grid grid-cols-3 gap-2 sm:gap-4 max-w-4xl mx-auto w-full">
      {modules.map((m) => {
        const isSelected = activeModule === m.id;
        return (
          <button
            key={m.id}
            onClick={() => onSelectModule(m.id)}
            className={`text-left p-2.5 sm:p-4 md:p-5 rounded-xl border bg-[#0b0e17]/85 backdrop-blur-sm transition-all duration-200 group flex flex-col justify-between space-y-1.5 sm:space-y-4 shadow-lg cursor-pointer ${
              isSelected
                ? `${m.activeBorder} shadow-cyan-500/5`
                : `border-slate-800/80 ${m.color}`
            }`}
          >
            <div className="space-y-1 sm:space-y-2.5 w-full">
              <div className="flex items-center justify-between">
                <div className="p-1.5 sm:p-2 rounded-lg bg-slate-900 border border-slate-800 group-hover:scale-105 transition-transform shrink-0">
                  {m.icon}
                </div>
                <span className="hidden sm:flex items-center space-x-1 text-xs text-slate-500 group-hover:text-slate-300 transition-colors">
                  <span>Explore</span>
                  <ArrowUpRight className="h-3.5 w-3.5 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
                </span>
              </div>
              <h3 className={`text-xs sm:text-sm font-bold tracking-wider ${m.accentText} truncate`}>
                {m.title}
              </h3>
              <p className="hidden sm:block text-xs text-slate-400 leading-relaxed font-normal">
                {m.description}
              </p>
            </div>
          </button>
        );
      })}
    </div>
  );
};
