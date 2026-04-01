import { useState } from 'react';
import Layout from '../components/Layout';
import RecentHistory from '../components/RecentHistory';
import SiteSelector from '../components/SiteSelector';
import type { SiteSelectorSite } from '../components/SiteSelector';
import GasReport from '../components/gas/GasReport';
import { useGasAnalysis } from '../hooks/useGasAnalysis';
import { useSiteRegistry } from '../hooks/useSiteRegistry';
import { useUserHistory } from '../hooks/useUserHistory';

export default function GasAnalysisTool() {
  const [coordinates, setCoordinates] = useState('');
  const [targetMW, setTargetMW] = useState(100);
  const [capacityFactor, setCapacityFactor] = useState(0.85);
  const [selectedSiteId, setSelectedSiteId] = useState<string | null>(null);
  const { loading, error, result, analyze, clear } = useGasAnalysis();
  const { sites: registrySites, loading: sitesLoading } = useSiteRegistry();
  const { logActivity, getToolHistory, loading: historyLoading } = useUserHistory();
  const recentEntries = getToolHistory('gas-analysis');

  function handleSiteSelect(site: SiteSelectorSite) {
    setSelectedSiteId(site.id);
    if (site.coordinates) {
      setCoordinates(`${site.coordinates.lat}, ${site.coordinates.lng}`);
    }
    if (site.mwCapacity) setTargetMW(site.mwCapacity);
  }

  function handleSiteClear() {
    setSelectedSiteId(null);
  }

  const canAnalyze = coordinates.trim().length > 0;

  const handleAnalyze = async () => {
    if (!canAnalyze) return;
    await analyze({
      coordinates: coordinates.trim(),
      targetMW,
      capacityFactor,
    });
    logActivity('gas-analysis', '', coordinates.trim(), 'Gas analysis', selectedSiteId ?? undefined, {
      coordinates: coordinates.trim(),
      targetMW,
      capacityFactor,
    });
  };

  const handleClear = () => {
    setCoordinates('');
    clear();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && canAnalyze && !loading) handleAnalyze();
  };

  const handleReplay = (inputs: Record<string, unknown>) => {
    const coords = inputs.coordinates as string;
    const mw = (inputs.targetMW as number) ?? 100;
    const cf = (inputs.capacityFactor as number) ?? 0.85;
    setCoordinates(coords);
    setTargetMW(mw);
    setCapacityFactor(cf);
    analyze({ coordinates: coords, targetMW: mw, capacityFactor: cf });
  };

  return (
    <Layout>
      <main className="py-6">
        {/* Site Selector */}
        <SiteSelector
          sites={registrySites}
          loading={sitesLoading}
          selectedSiteId={selectedSiteId}
          onSelect={handleSiteSelect}
          onClear={handleSiteClear}
        />

        {/* Header */}
        <div className="mb-6">
          <h2 className="font-heading text-2xl font-semibold text-[#201F1E]">
            Gas Infrastructure Analysis
          </h2>
          <p className="text-sm text-[#7A756E] mt-0.5">
            Identify nearby gas pipelines, calculate demand, and estimate lateral construction costs for a gas-fired power project.
          </p>
        </div>

        {/* Input Card */}
        <div className="bg-white rounded-2xl border border-[#D8D5D0] p-5 md:p-6 mb-6">
          {/* Location Section */}
          <h3 className="font-heading text-base font-semibold text-[#201F1E] mb-4">
            Site Location
          </h3>

          <div className="flex gap-3 mb-5">
            <input
              type="text"
              value={coordinates}
              onChange={(e) => setCoordinates(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={'Decimal (31.96, -99.90) or DMS (28\u00B039\'22.0"N 98\u00B050\'38.3"W)'}
              className="flex-1 rounded-lg border border-[#D8D5D0] bg-white px-3 py-2.5 text-sm text-[#201F1E] placeholder:text-[#7A756E]/50 focus:border-[#ED202B] focus:ring-2 focus:ring-[#ED202B]/20 focus:outline-none transition"
            />
          </div>

          {/* Project Parameters */}
          <div className="border-t border-[#D8D5D0] pt-5">
            <h3 className="font-heading text-base font-semibold text-[#201F1E] mb-4">
              Project Parameters
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              {/* MW Slider */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-sm font-medium text-[#201F1E]">
                    Target Capacity
                  </label>
                  <span className="text-sm font-semibold text-[#ED202B]">{targetMW} MW</span>
                </div>
                <input
                  type="range"
                  min={10}
                  max={1000}
                  step={10}
                  value={targetMW}
                  onChange={(e) => setTargetMW(Number(e.target.value))}
                  className="w-full h-2 bg-[#D8D5D0] rounded-lg appearance-none cursor-pointer accent-[#ED202B]"
                />
                <div className="flex justify-between text-xs text-[#7A756E] mt-1">
                  <span>10 MW</span>
                  <span>1,000 MW</span>
                </div>
              </div>

              {/* Capacity Factor */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-sm font-medium text-[#201F1E]">
                    Capacity Factor
                  </label>
                  <span className="text-sm font-semibold text-[#ED202B]">
                    {Math.round(capacityFactor * 100)}%
                  </span>
                </div>
                <input
                  type="range"
                  min={0.1}
                  max={1.0}
                  step={0.01}
                  value={capacityFactor}
                  onChange={(e) => setCapacityFactor(Number(e.target.value))}
                  className="w-full h-2 bg-[#D8D5D0] rounded-lg appearance-none cursor-pointer accent-[#ED202B]"
                />
                <div className="flex justify-between text-xs text-[#7A756E] mt-1">
                  <span>10%</span>
                  <span>100%</span>
                </div>
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-3 mt-5 pt-5 border-t border-[#D8D5D0]">
            <button
              type="button"
              onClick={handleAnalyze}
              disabled={!canAnalyze || loading}
              className="inline-flex items-center gap-1.5 rounded-lg bg-[#ED202B] px-5 py-2.5 text-sm font-medium text-white transition hover:bg-[#9B0E18] disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {loading ? (
                <>
                  <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Analyzing…
                </>
              ) : (
                <>
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M17.657 18.657A8 8 0 016.343 7.343S7 9 9 10c0-2 .5-5 2.986-7C14 5 16.09 5.777 17.656 7.343A7.975 7.975 0 0120 13a7.975 7.975 0 01-2.343 5.657z" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9.879 16.121A3 3 0 1012.015 11L11 14H9c0 .768.293 1.536.879 2.121z" />
                  </svg>
                  Analyze Gas Infrastructure
                </>
              )}
            </button>

            {result && (
              <button
                type="button"
                onClick={handleClear}
                className="rounded-lg border border-[#D8D5D0] bg-white px-3 py-2.5 text-sm text-[#7A756E] hover:bg-[#F5F4F2] transition"
              >
                Clear
              </button>
            )}
          </div>

          {error && (
            <div className="mt-3 rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-700">
              {error}
            </div>
          )}
        </div>

        {/* Results */}
        {result && <GasReport result={result} />}

        {/* Empty state with recent history */}
        {!result && !loading && (
          <RecentHistory
            entries={recentEntries}
            loading={historyLoading}
            icon={
              <svg className="h-8 w-8 text-[#ED202B]" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M17.657 18.657A8 8 0 016.343 7.343S7 9 9 10c0-2 .5-5 2.986-7C14 5 16.09 5.777 17.656 7.343A7.975 7.975 0 0120 13a7.975 7.975 0 01-2.343 5.657z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M9.879 16.121A3 3 0 1012.015 11L11 14H9c0 .768.293 1.536.879 2.121z" />
              </svg>
            }
            emptyMessage={
              <p className="max-w-sm mx-auto">
                Enter site coordinates, set your project capacity, and click{' '}
                <strong>Analyze Gas Infrastructure</strong> to generate the due diligence report.
              </p>
            }
            onReplay={handleReplay}
          />
        )}
      </main>
    </Layout>
  );
}
