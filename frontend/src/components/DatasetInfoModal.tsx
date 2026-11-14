import React from 'react';
import { X, ExternalLink, ShieldCheck, AlertTriangle, Layers, Compass } from 'lucide-react';
import { EarthModule } from './EarthGlobe';

interface DatasetInfoModalProps {
  activeModule: EarthModule;
  onClose: () => void;
}

export const DatasetInfoModal: React.FC<DatasetInfoModalProps> = ({ activeModule, onClose }) => {
  const metadata = {
    ocean: {
      title: 'SWOT KaRIn Low Rate Ocean Sea Surface Height (Option A)',
      datasetId: 'SWOT_L2_LR_SSH',
      agency: 'NASA PO.DAAC / CNES / CSA / UKSA',
      sensor: 'Ka-band Radar Interferometer (KaRIn) and Jason-class nadir altimeter',
      spatialResolution: '2 km gridded / 120 km swath with 20 km nadir gap',
      temporalResolution: '21-day repeat orbit (nominal science phase)',
      variables: [
        { name: 'ssha_karin_m', unit: 'meters (m)', desc: 'Sea Surface Height Anomaly relative to Mean Sea Surface (MSS)' },
        { name: 'ssh_karin_m', unit: 'meters (m)', desc: 'Absolute Sea Surface Height relative to WGS84 ellipsoid' },
        { name: 'dynamic_topography_m', unit: 'meters (m)', desc: 'Absolute Dynamic Topography (SSH minus geoid)' },
      ],
      purpose:
        'First high-resolution 2D radar interferometry mapping of sub-mesoscale ocean eddies (15-100 km), ocean kinetic energy dissipation, and boundary currents with ±2.4 cm target precision.',
      limitations: [
        'Nadir gap of approximately 20 km directly beneath satellite orbit track.',
        'High sensitivity to sea-state bias (SSB) and significant wave height corrections.',
        'Tidal model inaccuracies in shallow coastal waters and semi-enclosed seas.',
      ],
      documentationUrl: 'https://podaac.jpl.nasa.gov/swot',
    },
    atmosphere: {
      title: 'GPM IMERG Final Monthly Precipitation (GPM_3IMERGM v07)',
      datasetId: 'GPM_3IMERGM',
      agency: 'NASA GES DISC / JAXA',
      sensor: 'GPM Microwave Imager (GMI), Dual-frequency Radar (DPR) and constellation radiometers',
      spatialResolution: '0.1° × 0.1° (~10 km at the equator)',
      temporalResolution: 'Intended product cadence: Monthly (Final; GPCC gauge calibrated)',
      variables: [
        { name: 'precipitation_accumulated_mm', unit: 'mm (liquid depth)', desc: 'Monthly total accumulated liquid precipitation' },
        { name: 'precipitation_rate_mm_hr', unit: 'mm/hr', desc: 'Average monthly precipitation rate' },
        { name: 'climatological_normal_mm', unit: 'mm', desc: 'Historical 1998-2020 multi-decadal normal baseline' },
        { name: 'anomaly_mm', unit: 'mm', desc: 'Departure from 1998-2020 climatological normal' },
      ],
      purpose:
        'Global precipitation measurement combining multi-satellite radar/radiometer observations with monthly ground gauge calibration for flood, drought, and monsoon climate analysis.',
      limitations: [
        'CRITICAL UNIT RULE: Precipitation rate (mm/hr) must never be conflated with monthly liquid accumulation depth (mm).',
        'Complex mountainous topography can cause radar beam blockage and precipitation undercatch.',
        'Passive microwave retrieval uncertainty over frozen or snow-covered land surfaces.',
      ],
      documentationUrl: 'https://gpm.nasa.gov/data/imerg',
    },
    land: {
      title: 'MODIS Terra/Aqua Monthly Global Vegetation Indices (MOD13C2 v061)',
      datasetId: 'MOD13C2',
      agency: 'NASA LP DAAC / USGS',
      sensor: 'Moderate Resolution Imaging Spectroradiometer (MODIS)',
      spatialResolution: '0.05° × 0.05° Climate Modeling Grid (~5.6 km at equator)',
      temporalResolution: 'Monthly composite',
      variables: [
        { name: 'ndvi', unit: 'ratio (-0.20 to 1.00)', desc: 'Normalized Difference Vegetation Index: (NIR - Red) / (NIR + Red)' },
        { name: 'evi', unit: 'ratio (-0.20 to 1.00)', desc: 'Enhanced Vegetation Index (de-saturates over dense rainforest canopies)' },
        { name: 'vci_percent', unit: 'percent (0-100%)', desc: 'Vegetation Condition Index relative to historical min/max' },
      ],
      purpose:
        'Continuous global monitoring of vegetative canopy phenology, agricultural crop conditions, deforestation, and vegetative drought stress.',
      limitations: [
        'Persistent cloud cover in equatorial rainforests requires temporal cloud-clearing compositing.',
        'Atmospheric aerosols and biomass burning smoke can suppress surface reflectance in red bands.',
        'Scale factor of 0.0001 is applied to convert raw HDF integers into physical dimensionless ratios.',
      ],
      documentationUrl: 'https://lpdaac.usgs.gov/products/mod13c2v061/',
    },
  };

  const current = (activeModule && metadata[activeModule]) || metadata.ocean;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-md">
      <div className="relative w-full max-w-2xl bg-[#090d16] border border-slate-800 rounded-3xl p-6 sm:p-7 shadow-2xl space-y-5 max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-start justify-between border-b border-slate-800/80 pb-4">
          <div>
            <div className="inline-flex items-center space-x-1.5 text-xs font-mono text-cyan-400 bg-cyan-950/60 border border-cyan-800/50 px-2.5 py-0.5 rounded-full mb-1">
              <Compass className="h-3.5 w-3.5" />
              <span>NASA Scientific Provenance</span>
            </div>
            <h3 className="text-lg font-bold text-white">{current.title}</h3>
            <p className="text-xs text-slate-400 font-mono pt-0.5">
              ID: {current.datasetId} • {current.agency}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-full text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Specifications Table */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
          <div className="p-3 rounded-xl bg-slate-900/80 border border-slate-800">
            <span className="text-slate-400 font-mono text-[10px] uppercase block">Sensor / Instrument</span>
            <span className="font-medium text-slate-200">{current.sensor}</span>
          </div>
          <div className="p-3 rounded-xl bg-slate-900/80 border border-slate-800">
            <span className="text-slate-400 font-mono text-[10px] uppercase block">Spatial Resolution</span>
            <span className="font-medium text-slate-200">{current.spatialResolution}</span>
          </div>
          <div className="p-3 rounded-xl bg-slate-900/80 border border-slate-800">
            <span className="text-slate-400 font-mono text-[10px] uppercase block">Temporal Resolution</span>
            <span className="font-medium text-slate-200">{current.temporalResolution}</span>
          </div>
          <div className="p-3 rounded-xl bg-slate-900/80 border border-slate-800 flex items-center justify-between">
            <div>
              <span className="text-slate-400 font-mono text-[10px] uppercase block">NASA Documentation</span>
              <span className="text-cyan-400 font-medium">Official Repository</span>
            </div>
            <a
              href={current.documentationUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="p-2 rounded-lg bg-slate-800 text-cyan-300 hover:text-cyan-200 hover:bg-slate-700 transition-colors"
            >
              <ExternalLink className="h-4 w-4" />
            </a>
          </div>
        </div>

        {/* Variables & Units */}
        <div className="space-y-2">
          <h4 className="text-xs font-mono uppercase tracking-wider text-slate-400 font-semibold flex items-center space-x-1.5">
            <Layers className="h-3.5 w-3.5 text-cyan-400" />
            <span>Physical Variables & Units</span>
          </h4>
          <div className="space-y-1.5">
            {current.variables.map((v) => (
              <div
                key={v.name}
                className="p-2.5 rounded-lg bg-slate-900/50 border border-slate-800 flex items-center justify-between text-xs"
              >
                <div>
                  <span className="font-mono text-cyan-300 font-semibold">{v.name}</span>
                  <p className="text-slate-400 text-[11px]">{v.desc}</p>
                </div>
                <span className="font-mono text-[11px] text-slate-300 bg-slate-800 px-2 py-0.5 rounded border border-slate-700">
                  {v.unit}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Scientific Purpose & Limitations */}
        <div className="space-y-3 pt-1">
          <div className="p-3.5 rounded-xl bg-cyan-950/20 border border-cyan-800/40 text-xs text-slate-300 leading-relaxed">
            <ShieldCheck className="h-4 w-4 inline mr-1 text-cyan-400" />
            <strong>Scientific Purpose:</strong> {current.purpose}
          </div>

          <div className="p-3.5 rounded-xl bg-amber-950/20 border border-amber-800/40 text-xs text-amber-200/90 leading-relaxed space-y-1">
            <div className="flex items-center space-x-1.5 text-amber-300 font-semibold">
              <AlertTriangle className="h-4 w-4" />
              <span>Known Limitations & Data Constraints:</span>
            </div>
            <ul className="list-disc list-inside space-y-0.5 text-[11px] text-amber-200/80 pt-1">
              {current.limitations.map((lim, idx) => (
                <li key={idx}>{lim}</li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
};
export default DatasetInfoModal;
