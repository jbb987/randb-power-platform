import { useState } from 'react';
import Layout from '../components/Layout';
import RecentHistory from '../components/RecentHistory';
import SiteSelector from '../components/SiteSelector';
import type { SiteSelectorSite } from '../components/SiteSelector';
import { useInfraLookup } from '../hooks/useInfraLookup';
import { useSiteRegistry } from '../hooks/useSiteRegistry';
import { useUserHistory } from '../hooks/useUserHistory';
import { saveInfraToSite } from '../lib/siteRegistry';
import InfrastructureResults from '../components/power-calculator/InfrastructureResults';
import type { InfrastructureData } from '../components/power-calculator/InfrastructureResults';

const inputClass =
  'w-full rounded-lg border border-[#D8D5D0] bg-white/80 px-3 py-2.5 text-sm text-[#201F1E] outline-none transition focus:border-[#ED202B] focus:ring-2 focus:ring-[#ED202B]/20 placeholder:text-[#7A756E]';

const emptyData: InfrastructureData = {
  iso: '',
  utilityTerritory: '',
  tsp: '',
  nearestPoiName: '',
  nearestPoiDistMi: 0,
  nearbySubstations: [],
  nearbyLines: [],
  nearbyPowerPlants: [],
  floodZone: null,
  solarWind: null,
  electricityPrice: null,
  stateGenerationByFuel: null,
  detectedState: null,
  lastAnalyzedAt: null,
};

export default function PowerCalculatorTool() {
  const [coordinates, setCoordinates] = useState('');
  const [selectedSiteId, setSelectedSiteId] = useState<string | null>(null);
  const [hasRunAnalysis, setHasRunAnalysis] = useState(false);
  const [data, setData] = useState<InfrastructureData>(emptyData);
  const { loading, error, lookup } = useInfraLookup();
  const { sites: registrySites, loading: sitesLoading } = useSiteRegistry();
  const { logActivity, getToolHistory, loading: historyLoading } = useUserHistory();
  const recentEntries = getToolHistory('power-calculator');

  function handleSiteSelect(site: SiteSelectorSite) {
    setSelectedSiteId(site.id);
    if (site.coordinates) {
      setCoordinates(`${site.coordinates.lat}, ${site.coordinates.lng}`);
    }
  }

  function handleSiteClear() {
    setSelectedSiteId(null);
  }

  async function handleAnalyze() {
    const res = await lookup({ coordinates });
    if (res) {
      setHasRunAnalysis(true);
      const infraData: InfrastructureData = {
        iso: res.iso.length > 0 ? res.iso.join(' / ') : 'Not Available',
        utilityTerritory: res.utilityTerritory.length > 0 ? res.utilityTerritory.join(' / ') : 'Not Available',
        tsp: res.tsp.length > 0 ? res.tsp.join(' / ') : 'Not Available',
        nearestPoiName: res.nearestPoiName,
        nearestPoiDistMi: res.nearestPoiDistMi,
        nearbySubstations: res.nearbySubstations,
        nearbyLines: res.nearbyLines,
        nearbyPowerPlants: res.nearbyPowerPlants,
        floodZone: res.floodZone,
        solarWind: res.solarWind ?? null,
        electricityPrice: res.electricityPrice ?? null,
        stateGenerationByFuel: res.stateGenerationByFuel ?? null,
        detectedState: res.detectedState ?? null,
        lastAnalyzedAt: Date.now(),
      };
      setData(infraData);

      // Log to history
      logActivity('power-calculator', '', coordinates.trim(), 'Power infra analysis', selectedSiteId ?? undefined, {
        coordinates: coordinates.trim(),
      });

      // Write back to site registry if a site is selected
      if (selectedSiteId) {
        void saveInfraToSite(selectedSiteId, infraData as unknown as Record<string, unknown>).then(
          () => console.log('[PowerCalculator] Infra results saved to site registry'),
          (err) => console.error('[PowerCalculator] Failed to save infra results:', err),
        );
      }
    }
  }

  function handleReplay(inputs: Record<string, unknown>) {
    const coords = inputs.coordinates as string;
    setCoordinates(coords);
    // Trigger analysis after setting coordinates
    void (async () => {
      const res = await lookup({ coordinates: coords });
      if (res) {
        setHasRunAnalysis(true);
        setData({
          iso: res.iso.length > 0 ? res.iso.join(' / ') : 'Not Available',
          utilityTerritory: res.utilityTerritory.length > 0 ? res.utilityTerritory.join(' / ') : 'Not Available',
          tsp: res.tsp.length > 0 ? res.tsp.join(' / ') : 'Not Available',
          nearestPoiName: res.nearestPoiName,
          nearestPoiDistMi: res.nearestPoiDistMi,
          nearbySubstations: res.nearbySubstations,
          nearbyLines: res.nearbyLines,
          nearbyPowerPlants: res.nearbyPowerPlants,
          floodZone: res.floodZone,
          solarWind: res.solarWind ?? null,
          electricityPrice: res.electricityPrice ?? null,
          stateGenerationByFuel: res.stateGenerationByFuel ?? null,
          detectedState: res.detectedState ?? null,
          lastAnalyzedAt: Date.now(),
        });
      }
    })();
  }

  const canAnalyze = !loading && coordinates.trim() !== '';

  return (
    <Layout>
      <main className="py-6 max-w-4xl">
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
          <h1 className="font-heading text-2xl font-semibold text-[#201F1E]">
            Power Calculator
          </h1>
          <p className="text-sm text-[#7A756E] mt-1">
            Analyze power infrastructure for any location. Enter coordinates to get started.
          </p>
        </div>

        {/* Input Section */}
        <div className="bg-white rounded-2xl border border-[#D8D5D0] p-5 md:p-6 mb-6">
          <h3 className="font-heading text-base font-semibold text-[#201F1E] mb-5">
            Location
          </h3>

          <div className="grid grid-cols-1 gap-5">
            <label className="flex flex-col gap-1.5">
              <span className="text-xs font-medium text-[#7A756E]">Coordinates</span>
              <input
                type="text"
                className={inputClass}
                value={coordinates}
                onChange={(e) => setCoordinates(e.target.value)}
                placeholder={'Decimal (28.44, -99.75) or DMS (28\u00B039\'22.0"N 98\u00B050\'38.3"W)'}
              />
              <span className="text-[10px] text-[#7A756E]">Decimal or DMS format</span>
            </label>
          </div>

          <div className="mt-5 flex items-center gap-3">
            <button
              type="button"
              onClick={handleAnalyze}
              disabled={!canAnalyze}
              className="inline-flex items-center gap-2 rounded-lg bg-[#ED202B] px-5 py-2.5 text-sm font-medium text-white transition hover:bg-[#9B0E18] disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {loading ? (
                <>
                  <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Analyzing...
                </>
              ) : (
                <>
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                  Analyze Power Infrastructure
                </>
              )}
            </button>

            {data.lastAnalyzedAt && (
              <span className="text-[10px] text-[#7A756E]">
                Last analyzed {new Date(data.lastAnalyzedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })}
              </span>
            )}
          </div>

          {error && (
            <div className="mt-4 rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-700">
              {error}
            </div>
          )}
        </div>

        {/* Empty state with recent history */}
        {!hasRunAnalysis && !loading && (
          <RecentHistory
            entries={recentEntries}
            loading={historyLoading}
            icon={
              <svg className="h-8 w-8 text-[#ED202B]" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" />
              </svg>
            }
            emptyMessage={
              <p>Enter coordinates above and click <strong>Analyze Power Infrastructure</strong> to get started.</p>
            }
            onReplay={handleReplay}
          />
        )}

        {/* Results Section */}
        {(hasRunAnalysis || loading) && (
          <div className="bg-white rounded-2xl border border-[#D8D5D0] p-5 md:p-6">
            <h3 className="font-heading text-base font-semibold text-[#201F1E] mb-5">
              Power Infrastructure
            </h3>

            {loading && !hasRunAnalysis ? (
              <div className="flex items-center justify-center py-12">
                <div className="flex flex-col items-center gap-3">
                  <div className="h-8 w-8 animate-spin rounded-full border-[3px] border-[#D8D5D0] border-t-[#ED202B]" />
                  <span className="text-sm text-[#7A756E]">Analyzing power infrastructure...</span>
                </div>
              </div>
            ) : (
              <InfrastructureResults
                data={data}
                loading={loading}
                hasRunAnalysis={hasRunAnalysis}
              />
            )}
          </div>
        )}
      </main>
    </Layout>
  );
}
