import { useState } from 'react';
import Layout from '../components/Layout';
import BroadbandReport from '../components/broadband/BroadbandReport';
import SiteSelector from '../components/SiteSelector';
import type { SiteSelectorSite } from '../components/SiteSelector';
import { useBroadbandLookup } from '../hooks/useBroadbandLookup';
import { useSiteRegistry } from '../hooks/useSiteRegistry';

export default function BroadbandLookupTool() {
  const [address, setAddress] = useState('');
  const [coordinates, setCoordinates] = useState('');
  const [inputMode, setInputMode] = useState<'coordinates' | 'address'>('coordinates');
  const [selectedSiteId, setSelectedSiteId] = useState<string | null>(null);
  const { loading, error, result, lookup, clear } = useBroadbandLookup();
  const { sites: registrySites, loading: sitesLoading } = useSiteRegistry();

  const canAnalyze = inputMode === 'coordinates'
    ? coordinates.trim().length > 0
    : address.trim().length > 0;

  const handleAnalyze = () => {
    if (!canAnalyze) return;
    lookup(
      inputMode === 'coordinates'
        ? { coordinates: coordinates.trim() }
        : { address: address.trim() },
    );
  };

  const handleClear = () => {
    setAddress('');
    setCoordinates('');
    clear();
  };

  const handleSiteSelect = (site: SiteSelectorSite) => {
    setSelectedSiteId(site.id);
    if (site.coordinates) {
      setCoordinates(`${site.coordinates.lat}, ${site.coordinates.lng}`);
      setInputMode('coordinates');
    }
  };

  const handleSiteClear = () => {
    setSelectedSiteId(null);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && canAnalyze && !loading) handleAnalyze();
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
            Broadband Data Lookup
          </h2>
          <p className="text-sm text-[#7A756E] mt-0.5">
            Enter site coordinates or address to generate a broadband due diligence report.
          </p>
        </div>

        {/* Input Card */}
        <div className="bg-white rounded-2xl border border-[#D8D5D0] p-5 md:p-6 mb-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-heading text-base font-semibold text-[#201F1E]">
              Site Location
            </h3>

            {/* Toggle */}
            <div className="flex rounded-lg border border-[#D8D5D0] overflow-hidden text-xs">
              <button
                type="button"
                onClick={() => setInputMode('coordinates')}
                className={`px-3 py-1.5 transition ${
                  inputMode === 'coordinates'
                    ? 'bg-[#ED202B] text-white'
                    : 'bg-white text-[#7A756E] hover:bg-[#F5F4F2]'
                }`}
              >
                Coordinates
              </button>
              <button
                type="button"
                onClick={() => setInputMode('address')}
                className={`px-3 py-1.5 transition ${
                  inputMode === 'address'
                    ? 'bg-[#ED202B] text-white'
                    : 'bg-white text-[#7A756E] hover:bg-[#F5F4F2]'
                }`}
              >
                Address
              </button>
            </div>
          </div>

          <div className="flex gap-3">
            {inputMode === 'coordinates' ? (
              <input
                type="text"
                value={coordinates}
                onChange={(e) => setCoordinates(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="e.g. 28.444667, -99.750833"
                className="flex-1 rounded-lg border border-[#D8D5D0] bg-white px-3 py-2.5 text-sm text-[#201F1E] placeholder:text-[#7A756E]/50 focus:border-[#ED202B] focus:ring-2 focus:ring-[#ED202B]/20 focus:outline-none transition"
              />
            ) : (
              <input
                type="text"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="e.g. 123 Main St, Laredo, TX 78040"
                className="flex-1 rounded-lg border border-[#D8D5D0] bg-white px-3 py-2.5 text-sm text-[#201F1E] placeholder:text-[#7A756E]/50 focus:border-[#ED202B] focus:ring-2 focus:ring-[#ED202B]/20 focus:outline-none transition"
              />
            )}

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
                  Analyzing...
                </>
              ) : (
                'Analyze'
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
        {result && <BroadbandReport result={result} />}

        {/* Empty state */}
        {!result && !loading && (
          <div className="text-center py-16">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-[#ED202B]/10 mb-4">
              <svg className="h-8 w-8 text-[#ED202B]" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M8.288 15.038a5.25 5.25 0 017.424 0M5.106 11.856c3.807-3.808 9.98-3.808 13.788 0M1.924 8.674c5.565-5.565 14.587-5.565 20.152 0M12.53 18.22l-.53.53-.53-.53a.75.75 0 011.06 0z" />
              </svg>
            </div>
            <p className="text-sm text-[#7A756E]">
              Enter coordinates or an address above and click <strong>Analyze</strong> to generate a broadband due diligence report.
            </p>
          </div>
        )}
      </main>
    </Layout>
  );
}
