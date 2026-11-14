import React, { useEffect, useState } from 'react';
import { Globe2, Activity, Database, Satellite } from 'lucide-react';

interface HealthStatus {
  status: string;
  service: string;
  version: string;
}

export const App: React.FC = () => {
  const [health, setHealth] = useState<HealthStatus | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('http://localhost:8000/api/v1/health')
      .then((res) => res.json())
      .then((data: HealthStatus) => {
        setHealth(data);
        setLoading(false);
      })
      .catch(() => {
        setHealth(null);
        setLoading(false);
      });
  }, []);

  return (
    <div className="min-h-screen bg-[#0a0d14] text-slate-100 flex flex-col">
      {/* Top Navigation */}
      <header className="border-b border-slate-800 bg-[#0f141f]/80 backdrop-blur px-6 py-4 flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <Globe2 className="h-6 w-6 text-cyan-400" />
          <span className="text-xl font-bold tracking-tight text-white">
            Terra<span className="text-cyan-400">Lens</span>
          </span>
          <span className="text-xs bg-cyan-950/80 text-cyan-400 border border-cyan-800/60 px-2 py-0.5 rounded-full font-mono">
            Phase 0 Initialized
          </span>
        </div>
        <div className="flex items-center space-x-2 text-sm text-slate-400">
          <Satellite className="h-4 w-4 text-cyan-500" />
          <span>NASA Earth Observation Engine</span>
        </div>
      </header>

      {/* Main Container */}
      <main className="flex-1 max-w-6xl mx-auto w-full p-8 flex flex-col justify-center">
        <div className="text-center space-y-4 mb-10">
          <h1 className="text-4xl md:text-5xl font-extrabold tracking-tight text-white">
            Planetary Systems Intelligence
          </h1>
          <p className="text-slate-400 max-w-2xl mx-auto text-base md:text-lg">
            Interactive Earth observation and environmental analysis platform integrating
            SWOT Ocean altimetry, GPM IMERG precipitation, and terrestrial data.
          </p>
        </div>

        {/* Status Card Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="bg-[#111726] border border-slate-800 p-6 rounded-xl space-y-2">
            <div className="flex items-center space-x-2 text-cyan-400 font-medium">
              <Activity className="h-5 w-5" />
              <span>Backend Connectivity</span>
            </div>
            <div className="pt-2">
              {loading ? (
                <span className="text-xs text-slate-500">Checking API status...</span>
              ) : health ? (
                <div className="space-y-1">
                  <div className="flex items-center space-x-2">
                    <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse"></span>
                    <span className="text-sm text-emerald-400 font-mono font-medium capitalize">
                      {health.status}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500">
                    {health.service} v{health.version}
                  </p>
                </div>
              ) : (
                <div className="flex items-center space-x-2">
                  <span className="h-2 w-2 rounded-full bg-amber-400"></span>
                  <span className="text-sm text-amber-400 font-mono">
                    Backend Offline (Run uvicorn)
                  </span>
                </div>
              )}
            </div>
          </div>

          <div className="bg-[#111726] border border-slate-800 p-6 rounded-xl space-y-2">
            <div className="flex items-center space-x-2 text-sky-400 font-medium">
              <Satellite className="h-5 w-5" />
              <span>MVP Modules</span>
            </div>
            <p className="text-xs text-slate-400 leading-relaxed pt-2">
              • Ocean: SWOT KaRIn SSH (Option A)<br />
              • Atmosphere: GPM_3IMERGM<br />
              • Land: Awaiting Decision Approval
            </p>
          </div>

          <div className="bg-[#111726] border border-slate-800 p-6 rounded-xl space-y-2">
            <div className="flex items-center space-x-2 text-emerald-400 font-medium">
              <Database className="h-5 w-5" />
              <span>PostGIS Integration</span>
            </div>
            <p className="text-xs text-slate-400 leading-relaxed pt-2">
              PostgreSQL 16 + PostGIS 3.4 spatial raster & vector configuration prepared.
            </p>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-800/80 px-6 py-4 text-center text-xs text-slate-500">
        TerraLens Platform • Planetary Observation Systems
      </footer>
    </div>
  );
};

export default App;
