import { useState } from 'react';
import Layout from '../components/Layout';
import WaterReport from '../components/water/WaterReport';
import { useWaterAnalysis } from '../hooks/useWaterAnalysis';

export default function WaterAnalysisTool() {
  const [address, setAddress] = useState('');
  const [coordinates, setCoordinates] = useState('');
  const [inputMode, setInputMode] = useState<'coordinates' | 'address'>('coordinates');
  const { loading, error, result, analyze, clear } = useWaterAnalysis();

  const canAnalyze = inputMode === 'coordinates'
    ? coordinates.trim().length > 0
    : address.trim().length > 0;

  const handleAnalyze = () => {
    if (!canAnalyze) return;
    analyze(
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

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && canAnalyze && !loading) handleAnalyze();
  };

  return (
    <Layout>
      <main className="py-6">
        {/* Header */}
        <div className="mb-6">
          <h2 className="font-heading text-2xl font-semibold text-[#201F1E]">
            Water Analysis
          </h2>
          <p className="text-sm text-[#7A756E] mt-0.5">
            Enter site coordinates or address to analyze flood zones, stream networks, wetlands, groundwater, drought, discharge permits, and precipitation.
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
        {result && <WaterReport result={result} />}

        {/* Empty state */}
        {!result && !loading && (
          <div className="text-center py-16">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-[#ED202B]/10 mb-4">
              <svg className="h-8 w-8 text-[#ED202B]" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 3.75a6.75 6.75 0 100 13.5 6.75 6.75 0 000-13.5z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 3.75C10.5 6 9 8.25 9 10.5a3 3 0 006 0c0-2.25-1.5-4.5-3-6.75z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5c1.5-1 3-1 4.5 0s3 1 4.5 0 3-1 4.5 0 3-1 4.5 0" />
              </svg>
            </div>
            <p className="text-sm text-[#7A756E]">
              Enter coordinates or an address above and click <strong>Analyze</strong> to generate a water due diligence report.
            </p>
            <p className="text-xs text-[#7A756E] mt-2">
              Covers FEMA flood zones · USGS stream networks · USFWS wetlands · groundwater · drought · NPDES permits · precipitation
            </p>
          </div>
        )}
      </main>
    </Layout>
  );
}
