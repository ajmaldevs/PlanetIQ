import React, { useEffect, useState } from 'react';
import { fetchDatasetCatalog, DatasetCatalogItem } from '../services/api';
import { BookOpen, ExternalLink, AlertCircle } from 'lucide-react';

export const DatasetCatalogView: React.FC = () => {
  const [datasets, setDatasets] = useState<DatasetCatalogItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    fetchDatasetCatalog()
      .then((res) => {
        setDatasets(res);
        setLoading(false);
      })
      .catch((err) => {
        console.error('Error fetching catalog:', err);
        setLoading(false);
      });
  }, []);

  return (
    <div className="space-y-6">
      <div className="bg-[#0f141f] border border-slate-800 p-6 rounded-xl space-y-2">
        <div className="flex items-center space-x-2">
          <BookOpen className="h-5 w-5 text-cyan-400" />
          <h2 className="text-xl font-bold text-white tracking-tight">
            Scientific Dataset Catalog & Provenance
          </h2>
        </div>
        <p className="text-xs text-slate-400 max-w-3xl leading-relaxed">
          TerraLens strictly preserves approved NASA scientific datasets. Every observation, spatial resolution,
          measurement unit, and known instrument limitation is fully documented below.
        </p>
      </div>

      {loading ? (
        <div className="h-64 flex items-center justify-center bg-[#0d121d] rounded-xl border border-slate-800">
          <div className="flex items-center space-x-2 text-cyan-400 font-mono text-xs">
            <div className="h-4 w-4 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin" />
            <span>Loading Scientific Documentation & Metadata...</span>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {datasets.map((ds) => (
            <div
              key={ds.id}
              className="bg-[#0f141f] border border-slate-800 rounded-xl p-5 flex flex-col justify-between space-y-4 hover:border-slate-700 transition-all shadow-xl"
            >
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] uppercase font-mono px-2 py-0.5 rounded bg-cyan-950/80 text-cyan-400 border border-cyan-800/60 font-semibold">
                    {ds.module} Sphere
                  </span>
                  <span className="text-[10px] text-slate-400 font-mono">{ds.id}</span>
                </div>

                <div>
                  <h3 className="text-base font-bold text-white leading-snug">{ds.name}</h3>
                  <p className="text-[11px] text-cyan-400 font-mono pt-1">{ds.agency}</p>
                </div>

                <p className="text-xs text-slate-300 leading-relaxed">{ds.scientific_purpose}</p>

                {/* Metadata Grid */}
                <div className="bg-slate-900/80 p-3 rounded-lg border border-slate-800/80 space-y-1.5 text-xs font-mono">
                  <div className="flex justify-between">
                    <span className="text-slate-400">Sensor:</span>
                    <span className="text-slate-200 text-right truncate ml-2">{ds.sensor.split('(')[0]}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Spatial Res:</span>
                    <span className="text-cyan-300">{ds.spatial_resolution.split('/')[0]}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Cadence:</span>
                    <span className="text-slate-200">{ds.temporal_resolution}</span>
                  </div>
                  <div className="flex justify-between border-t border-slate-800 pt-1">
                    <span className="text-slate-400">Primary Units:</span>
                    <span className="text-emerald-400">{ds.units.join(', ')}</span>
                  </div>
                </div>

                {/* Known Scientific Limitations */}
                <div className="space-y-1.5 pt-1">
                  <div className="flex items-center space-x-1 text-[10px] uppercase font-mono text-amber-400 font-semibold">
                    <AlertCircle className="h-3 w-3" />
                    <span>Known Limitations & Uncertainty</span>
                  </div>
                  <ul className="space-y-1 text-[11px] text-slate-400 list-disc list-inside">
                    {ds.scientific_limitations.map((lim, lIdx) => (
                      <li key={lIdx} className="leading-tight">
                        {lim}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>

              {/* Action / Documentation Link */}
              <div className="pt-3 border-t border-slate-800/80 flex items-center justify-between">
                <span className="text-[10px] text-slate-400 font-mono">CMR: {ds.cmr_concept_id}</span>
                <a
                  href={ds.documentation_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-cyan-400 hover:text-cyan-300 flex items-center space-x-1 font-medium transition-colors"
                >
                  <span>NASA Docs</span>
                  <ExternalLink className="h-3 w-3" />
                </a>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
