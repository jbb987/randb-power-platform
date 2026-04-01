import { useState } from 'react';
import { useAppraisal } from '../hooks/useAppraisal';
import Layout from '../components/Layout';
import SiteMapCard from '../components/appraiser/SiteMapCard';
import PresentationView from '../components/PresentationView';
import type { SiteInputs } from '../types';

const inputClass =
  'w-full rounded-lg border border-[#D8D5D0] bg-white/80 px-3 py-2.5 text-sm text-[#201F1E] outline-none transition focus:border-[#ED202B] focus:ring-2 focus:ring-[#ED202B]/20 placeholder:text-[#7A756E]';

const defaultInputs: SiteInputs = {
  id: '',
  projectId: '',
  siteName: '',
  totalAcres: 0,
  ppaLow: 0,
  ppaHigh: 0,
  mw: 50,
  address: '',
  coordinates: '',
  legalDescription: '',
  county: '',
  parcelId: '',
  owner: '',
  priorUsage: '',
  iso: '',
  utilityTerritory: '',
  tsp: '',
  lastAnalyzedAt: null,
  nearestPoiName: '',
  nearestPoiDistMi: 0,
  nearbySubstations: [],
  nearbyLines: [],
  nearbyPowerPlants: [],
  floodZone: null,
  solarWind: null,
  electricityPrice: null,
  detectedState: null,
};

export default function SiteAppraiserTool() {
  const [inputs, setInputs] = useState<SiteInputs>(defaultInputs);
  const result = useAppraisal(inputs);

  function set<K extends keyof SiteInputs>(key: K, value: SiteInputs[K]) {
    setInputs((prev) => ({ ...prev, [key]: value }));
  }

  // Registry sync removed — PIDDR now owns the site registry

  return (
    <Layout>
      <div className="mx-auto max-w-4xl space-y-6">
        {/* ── Input Card ──────────────────────────────────────────────── */}
        <div className="bg-white rounded-2xl border border-[#D8D5D0] p-5 md:p-6">
          <h2 className="font-heading text-lg font-semibold text-[#201F1E] mb-4">
            Site Details
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Site Name */}
            <div>
              <label className="block text-xs font-medium text-[#7A756E] uppercase tracking-wider mb-1.5">
                Site Name
              </label>
              <input
                type="text"
                className={inputClass}
                placeholder="e.g. Sunny Acres"
                value={inputs.siteName}
                onChange={(e) => set('siteName', e.target.value)}
              />
            </div>

            {/* Address */}
            <div>
              <label className="block text-xs font-medium text-[#7A756E] uppercase tracking-wider mb-1.5">
                Address
              </label>
              <input
                type="text"
                className={inputClass}
                placeholder="123 Main St, City, ST"
                value={inputs.address}
                onChange={(e) => set('address', e.target.value)}
              />
            </div>

            {/* Coordinates */}
            <div>
              <label className="block text-xs font-medium text-[#7A756E] uppercase tracking-wider mb-1.5">
                Coordinates
              </label>
              <input
                type="text"
                className={inputClass}
                placeholder="33.4484, -112.0740"
                value={inputs.coordinates}
                onChange={(e) => set('coordinates', e.target.value)}
              />
            </div>

            {/* Acreage */}
            <div>
              <label className="block text-xs font-medium text-[#7A756E] uppercase tracking-wider mb-1.5">
                Acreage
              </label>
              <input
                type="number"
                className={inputClass}
                placeholder="0"
                value={inputs.totalAcres || ''}
                onChange={(e) => set('totalAcres', Number(e.target.value))}
              />
            </div>

            {/* $/Acre Low */}
            <div>
              <label className="block text-xs font-medium text-[#7A756E] uppercase tracking-wider mb-1.5">
                $/Acre Low
              </label>
              <input
                type="number"
                className={inputClass}
                placeholder="0"
                value={inputs.ppaLow || ''}
                onChange={(e) => set('ppaLow', Number(e.target.value))}
              />
            </div>

            {/* $/Acre High */}
            <div>
              <label className="block text-xs font-medium text-[#7A756E] uppercase tracking-wider mb-1.5">
                $/Acre High
              </label>
              <input
                type="number"
                className={inputClass}
                placeholder="0"
                value={inputs.ppaHigh || ''}
                onChange={(e) => set('ppaHigh', Number(e.target.value))}
              />
            </div>

            {/* MW Slider — full width */}
            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-[#7A756E] uppercase tracking-wider mb-1.5">
                Power Capacity — {inputs.mw} MW
              </label>
              <input
                type="range"
                min={10}
                max={1000}
                step={10}
                value={inputs.mw}
                onChange={(e) => set('mw', Number(e.target.value))}
                className="w-full accent-[#ED202B]"
              />
              <div className="flex justify-between text-[10px] text-[#7A756E] mt-0.5">
                <span>10 MW</span>
                <span>1,000 MW</span>
              </div>
            </div>
          </div>
        </div>

        {/* ── Map ─────────────────────────────────────────────────────── */}
        <SiteMapCard coordinates={inputs.coordinates} />

        {/* ── Calculator / Presentation ───────────────────────────────── */}
        <PresentationView
          inputs={inputs}
          result={result}
          onMWChange={(mw) => set('mw', mw)}
          onSiteNameChange={(name) => set('siteName', name)}
        />
      </div>
    </Layout>
  );
}
