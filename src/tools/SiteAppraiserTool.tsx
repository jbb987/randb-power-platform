import { useState, useEffect, useRef } from 'react';
import { useAppraisal } from '../hooks/useAppraisal';
import Layout from '../components/Layout';
import RecentHistory from '../components/RecentHistory';
import SiteSelector from '../components/SiteSelector';
import type { SiteSelectorSite } from '../components/SiteSelector';
import { useSiteRegistry } from '../hooks/useSiteRegistry';
import { useUserHistory } from '../hooks/useUserHistory';
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
  const [selectedSiteId, setSelectedSiteId] = useState<string | null>(null);
  const result = useAppraisal(inputs);
  const { sites: registrySites, loading: sitesLoading } = useSiteRegistry();
  const { logActivity, getToolHistory, loading: historyLoading } = useUserHistory();
  const recentEntries = getToolHistory('site-appraiser');

  // Log to history when meaningful inputs are set. The MW slider is
  // intentionally excluded from the trigger key + deps: dragging it through
  // 99 distinct values would otherwise bypass the 60s history dedup and burn
  // a Firestore write per tick. The current mw value is still captured in
  // the entry payload (so prefill from history works), it just doesn't
  // re-fire the effect.
  const lastLoggedRef = useRef('');
  useEffect(() => {
    if (!inputs.coordinates || !inputs.totalAcres) return;
    const key = `${inputs.coordinates}|${inputs.totalAcres}|${inputs.ppaLow}|${inputs.ppaHigh}`;
    if (lastLoggedRef.current === key) return;
    lastLoggedRef.current = key;
    logActivity('site-appraiser', inputs.siteName || 'Untitled', inputs.coordinates, 'Site appraisal', selectedSiteId ?? undefined, {
      siteName: inputs.siteName,
      coordinates: inputs.coordinates,
      totalAcres: inputs.totalAcres,
      mw: inputs.mw,
      ppaLow: inputs.ppaLow,
      ppaHigh: inputs.ppaHigh,
    });
  }, [inputs.coordinates, inputs.totalAcres, inputs.ppaLow, inputs.ppaHigh]); // eslint-disable-line react-hooks/exhaustive-deps

  function set<K extends keyof SiteInputs>(key: K, value: SiteInputs[K]) {
    setInputs((prev) => ({ ...prev, [key]: value }));
  }

  function handleSiteSelect(site: SiteSelectorSite) {
    setSelectedSiteId(site.id);
    setInputs((prev) => ({
      ...prev,
      siteName: site.name || prev.siteName,
      address: site.address || prev.address,
      coordinates: site.coordinates
        ? `${site.coordinates.lat}, ${site.coordinates.lng}`
        : prev.coordinates,
      totalAcres: site.acreage ?? prev.totalAcres,
      mw: site.mwCapacity ?? prev.mw,
      ppaLow: site.dollarPerAcreLow ?? prev.ppaLow,
      ppaHigh: site.dollarPerAcreHigh ?? prev.ppaHigh,
      owner: site.owner || prev.owner,
      county: site.county || prev.county,
      parcelId: site.parcelId || prev.parcelId,
      priorUsage: site.priorUsage || prev.priorUsage,
      legalDescription: site.legalDescription || prev.legalDescription,
    }));
  }

  function handleSiteClear() {
    setSelectedSiteId(null);
  }

  function handleReplay(replayInputs: Record<string, unknown>) {
    setInputs((prev) => ({
      ...prev,
      siteName: (replayInputs.siteName as string) || prev.siteName,
      coordinates: (replayInputs.coordinates as string) || prev.coordinates,
      totalAcres: (replayInputs.totalAcres as number) || prev.totalAcres,
      mw: (replayInputs.mw as number) || prev.mw,
      ppaLow: (replayInputs.ppaLow as number) || prev.ppaLow,
      ppaHigh: (replayInputs.ppaHigh as number) || prev.ppaHigh,
    }));
  }

  const isDefault = !inputs.coordinates && !inputs.totalAcres && !inputs.ppaLow && !inputs.ppaHigh;

  return (
    <Layout>
      <div className="mx-auto max-w-4xl space-y-6">
        {/* ── Site Selector ──────────────────────────────────────────── */}
        <SiteSelector
          sites={registrySites}
          loading={sitesLoading}
          selectedSiteId={selectedSiteId}
          onSelect={handleSiteSelect}
          onClear={handleSiteClear}
        />

        {/* ── Recent History (shown when inputs are all defaults) ───── */}
        {isDefault && (
          <RecentHistory
            entries={recentEntries}
            loading={historyLoading}
            icon={
              <svg className="h-8 w-8 text-[#ED202B]" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18.75a60.07 60.07 0 0115.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 013 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 00-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 01-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 003 15h-.75M15 10.5a3 3 0 11-6 0 3 3 0 016 0zm3 0h.008v.008H18V10.5zm-12 0h.008v.008H6V10.5z" />
              </svg>
            }
            emptyMessage={
              <p>Enter site details below or select a saved site to calculate land valuation.</p>
            }
            onReplay={handleReplay}
          />
        )}

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
