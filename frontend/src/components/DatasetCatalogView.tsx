import React, { useEffect, useState } from 'react';
import { fetchDatasetCatalog, DatasetCatalogItem } from '../services/api';
import { BookOpen, ExternalLink, AlertCircle } from 'lucide-react';

const FALLBACK_DATASETS: DatasetCatalogItem[] = [
  {
    id: 'SWOT_L2_LR_SSH',
    name: 'SWOT KaRIn Low Rate Ocean Sea Surface Height (Option A)',
    module: 'ocean',
    agency: 'NASA PO.DAAC / CNES / CSA / UKSA',
    sensor: 'Ka-band Radar Interferometer (KaRIn) and nadir altimeter',
    spatial_resolution: '2 km gridded / 120 km swath with 20 km nadir gap',
    temporal_resolution: '21-day repeat orbit (nominal science phase)',
    variables: [
      { name: 'ssha', description: 'Sea surface height anomaly relative to mean sea surface', unit: 'm' },
      { name: 'eke', description: 'Eddy kinetic energy dissipation proxy', unit: 'cm²/s²' },
    ],
    units: ['meters (m)', 'cm²/s²'],
    scientific_purpose: 'High-resolution 2D radar mapping of sub-mesoscale ocean eddies (15-100 km), kinetic energy dissipation, and boundary currents with ±2.4 cm target precision.',
    scientific_limitations: [
      'Nadir gap of approximately 20 km directly beneath satellite orbit track.',
      'High sensitivity to sea-state bias (SSB) and significant wave height corrections.',
      'Tidal model inaccuracies in shallow coastal waters and semi-enclosed seas.'
    ],
    cmr_concept_id: 'C2147820108-POCLOUD',
    documentation_url: 'https://podaac.jpl.nasa.gov/swot',
  },
  {
    id: 'GPM_3IMERGM',
    name: 'GPM IMERG Final Monthly Precipitation (GPM_3IMERGM v07)',
    module: 'atmosphere',
    agency: 'NASA GES DISC / JAXA',
    sensor: 'GPM Microwave Imager (GMI), Dual-frequency Radar (DPR) and constellation radiometers',
    spatial_resolution: '0.1° × 0.1° (~10 km at the equator)',
    temporal_resolution: 'Monthly (Final; GPCC gauge calibrated)',
    variables: [
      { name: 'precipitation', description: 'Monthly precipitation liquid depth accumulation', unit: 'mm' },
      { name: 'precipitationCal', description: 'Multi-satellite calibrated precipitation rate', unit: 'mm/hr' },
    ],
    units: ['mm (depth)', 'mm/hr (rate)'],
    scientific_purpose: 'Global precipitation measurement combining multi-satellite radar/radiometer observations with monthly ground gauge calibration for flood, drought, and monsoon climate analysis.',
    scientific_limitations: [
      'CRITICAL UNIT RULE: Precipitation rate (mm/hr) must never be conflated with monthly liquid accumulation depth (mm).',
      'Complex mountainous topography can cause radar beam blockage and precipitation undercatch.',
      'Passive microwave retrieval uncertainty over frozen or snow-covered land surfaces.'
    ],
    cmr_concept_id: 'C2723754864-GES_DISC',
    documentation_url: 'https://gpm.nasa.gov/data/imerg',
  },
  {
    id: 'MOD13C2',
    name: 'MODIS Terra/Aqua Monthly Global Vegetation Indices (MOD13C2 v061)',
    module: 'land',
    agency: 'NASA LP DAAC / USGS',
    sensor: 'Moderate Resolution Imaging Spectroradiometer (MODIS)',
    spatial_resolution: '0.05° × 0.05° Climate Modeling Grid (~5.6 km at equator)',
    temporal_resolution: 'Monthly composite',
    variables: [
      { name: 'NDVI', description: 'Normalized Difference Vegetation Index', unit: 'dimensionless' },
      { name: 'EVI', description: 'Enhanced Vegetation Index with atmospheric resistance', unit: 'dimensionless' },
      { name: 'VCI', description: 'Vegetation Condition Index relative to historical min/max', unit: 'percent' },
    ],
    units: ['dimensionless ratio (-0.20 to 1.00)', 'VCI percent (0-100%)'],
    scientific_purpose: 'Continuous global monitoring of vegetative canopy phenology, agricultural crop conditions, deforestation, and vegetative drought stress.',
    scientific_limitations: [
      'Persistent cloud cover in equatorial rainforests requires temporal cloud-clearing compositing.',
      'Atmospheric aerosols and biomass burning smoke can suppress surface reflectance in red bands.',
      'Scale factor of 0.0001 is applied to convert raw HDF integers into physical dimensionless ratios.'
    ],
    cmr_concept_id: 'C203669660-LPDAAC_ECS',
    documentation_url: 'https://lpdaac.usgs.gov/products/mod13c2v061/',
  },
];

export const DatasetCatalogView: React.FC = () => {
  const [datasets, setDatasets] = useState<DatasetCatalogItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    fetchDatasetCatalog()
      .then((res) => {
        setDatasets(res && res.length > 0 ? res : FALLBACK_DATASETS);
        setLoading(false);
      })
      .catch((err) => {
        console.warn('Backend catalog offline, using built-in catalog documentation:', err);
        setDatasets(FALLBACK_DATASETS);
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
          The catalog describes NASA products TerraLens is designed to use. This build has not ingested their observations; values shown in the explorer are modelled demonstrations.
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
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
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
