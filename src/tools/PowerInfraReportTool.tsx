import { useState } from 'react';
import Layout from '../components/Layout';
import SiteSelector from '../components/SiteSelector';
import type { SiteSelectorSite } from '../components/SiteSelector';
import PowerSlider from '../components/PowerSlider';
import ReportHeader from '../components/piddr/ReportHeader';
import SiteOverviewSection from '../components/piddr/SiteOverviewSection';
import LandValuationSection from '../components/piddr/LandValuationSection';
import BroadbandSection from '../components/piddr/BroadbandSection';
import InfrastructureResults from '../components/power-calculator/InfrastructureResults';
import { usePiddrReport } from '../hooks/usePiddrReport';
import { usePdfExport } from '../hooks/usePdfExport';
import { useSiteRegistry } from '../hooks/useSiteRegistry';
import type { PiddrInputs } from '../hooks/usePiddrReport';

const inputClass =
  'w-full rounded-lg border border-[#D8D5D0] bg-white/80 px-3 py-2.5 text-sm text-[#201F1E] outline-none transition focus:border-[#ED202B] focus:ring-2 focus:ring-[#ED202B]/20 placeholder:text-[#7A756E]';

const MW_MIN = 10;
const MW_MAX = 1000;

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-xs font-medium text-[#7A756E]">{label}</span>
      {children}
      {hint && <span className="text-[10px] text-[#7A756E]">{hint}</span>}
    </label>
  );
}

export default function PowerInfraReportTool() {
  const [siteName, setSiteName] = useState('');
  const [address, setAddress] = useState('');
  const [coordinates, setCoordinates] = useState('');
  const [acreage, setAcreage] = useState(0);
  const [mw, setMw] = useState(50);
  const [ppaLow, setPpaLow] = useState(0);
  const [ppaHigh, setPpaHigh] = useState(0);
  const [selectedSiteId, setSelectedSiteId] = useState<string | null>(null);

  const report = usePiddrReport();
  const pdfExport = usePdfExport();
  const { sites: registrySites, loading: sitesLoading } = useSiteRegistry();

  function handleSiteSelect(site: SiteSelectorSite) {
    setSelectedSiteId(site.id);
    setSiteName(site.name);
    if (site.address) setAddress(site.address);
    if (site.coordinates) {
      setCoordinates(`${site.coordinates.lat}, ${site.coordinates.lng}`);
    }
    if (site.acreage) setAcreage(site.acreage);
    if (site.mwCapacity) setMw(site.mwCapacity);
  }

  function handleSiteClear() {
    setSelectedSiteId(null);
  }

  const canExportPdf = report.hasReport && !report.isGenerating && report.inputs && report.generatedAt;

  const canGenerate = !report.isGenerating && (address.trim() !== '' || coordinates.trim() !== '');

  function handleGenerate() {
    if (!canGenerate) return;
    const inputs: PiddrInputs = {
      siteName: siteName.trim() || 'Untitled Site',
      address: address.trim(),
      coordinates: coordinates.trim(),
      acreage,
      mw,
      ppaLow,
      ppaHigh,
    };
    report.generateReport(inputs);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && canGenerate) handleGenerate();
  }

  function getSectionState(section: { loading: boolean; error: string | null; data: unknown }) {
    if (section.loading) return 'loading' as const;
    if (section.error) return 'error' as const;
    if (section.data) return 'done' as const;
    return 'pending' as const;
  }

  return (
    <Layout fullWidth>
      <main className="py-6 max-w-5xl mx-auto px-4">
        {/* Site Selector */}
        <SiteSelector
          sites={registrySites}
          loading={sitesLoading}
          selectedSiteId={selectedSiteId}
          onSelect={handleSiteSelect}
          onClear={handleSiteClear}
        />

        {/* Page Header */}
        <div className="mb-6">
          <h1 className="font-heading text-2xl font-semibold text-[#201F1E]">
            Power Infrastructure Due Diligence Report
          </h1>
          <p className="text-sm text-[#7A756E] mt-1">
            Generate a comprehensive site report combining land valuation, power infrastructure, and broadband connectivity analysis.
          </p>
        </div>

        {/* Input Section */}
        <div className="bg-white rounded-2xl border border-[#D8D5D0] p-5 md:p-6 mb-6">
          <h3 className="font-heading text-base font-semibold text-[#201F1E] mb-5">
            Site Information
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <Field label="Site / Project Name">
              <input
                type="text"
                className={inputClass}
                value={siteName}
                onChange={(e) => setSiteName(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="e.g. Sunrise Solar Farm"
              />
            </Field>

            <Field label="Address">
              <input
                type="text"
                className={inputClass}
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="123 Main St, Cheyenne, WY"
              />
            </Field>

            <Field label="Coordinates" hint="Decimal or DMS format (alternative to address)">
              <input
                type="text"
                className={inputClass}
                value={coordinates}
                onChange={(e) => setCoordinates(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={'28\u00B039\'22.0"N 98\u00B050\'38.3"W'}
              />
            </Field>

            <Field label="Acreage">
              <input
                type="number"
                className={inputClass}
                value={acreage || ''}
                onChange={(e) => {
                  const v = parseFloat(e.target.value);
                  setAcreage(isNaN(v) ? 0 : v);
                }}
                onKeyDown={handleKeyDown}
                placeholder="414"
              />
            </Field>

            <Field label="$/Acre Low" hint="From land comps">
              <input
                type="number"
                className={inputClass}
                value={ppaLow || ''}
                onChange={(e) => {
                  const v = parseFloat(e.target.value);
                  setPpaLow(isNaN(v) ? 0 : v);
                }}
                onKeyDown={handleKeyDown}
                placeholder="5000"
              />
            </Field>

            <Field label="$/Acre High" hint="From land comps">
              <input
                type="number"
                className={inputClass}
                value={ppaHigh || ''}
                onChange={(e) => {
                  const v = parseFloat(e.target.value);
                  setPpaHigh(isNaN(v) ? 0 : v);
                }}
                onKeyDown={handleKeyDown}
                placeholder="8000"
              />
            </Field>
          </div>

          {/* MW Slider */}
          <div className="mt-6 max-w-md">
            <PowerSlider
              value={mw}
              min={MW_MIN}
              max={MW_MAX}
              step={5}
              label="MW Capacity"
              onChange={setMw}
            />
            <div className="flex justify-between mt-1">
              <span className="text-[10px] text-[#7A756E]">{MW_MIN} MW</span>
              <span className="text-sm font-heading font-semibold text-[#ED202B]">{mw} MW</span>
              <span className="text-[10px] text-[#7A756E]">{MW_MAX} MW</span>
            </div>
          </div>

          {/* Generate button */}
          <div className="mt-6 flex items-center gap-4">
            <button
              type="button"
              onClick={handleGenerate}
              disabled={!canGenerate}
              className="inline-flex items-center gap-2 rounded-lg bg-[#ED202B] px-6 py-3 text-sm font-semibold text-white transition hover:bg-[#9B0E18] disabled:opacity-40 disabled:cursor-not-allowed shadow-sm"
            >
              {report.isGenerating ? (
                <>
                  <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Generating Report...
                </>
              ) : (
                <>
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  Generate Report
                </>
              )}
            </button>

            {report.hasReport && !report.isGenerating && (
              <>
                <button
                  type="button"
                  disabled={!canExportPdf || pdfExport.generating}
                  onClick={() => {
                    if (!canExportPdf) return;
                    pdfExport.generatePdf({
                      inputs: report.inputs!,
                      appraisal: report.appraisal.data,
                      infra: report.infra.data,
                      broadband: report.broadband.data,
                      generatedAt: report.generatedAt!,
                    });
                  }}
                  className="inline-flex items-center gap-2 rounded-lg bg-[#ED202B] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#9B0E18] disabled:opacity-40 disabled:cursor-not-allowed shadow-sm"
                >
                  {pdfExport.generating ? (
                    <>
                      <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                      </svg>
                      Generating PDF...
                    </>
                  ) : (
                    <>
                      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                      Download Report
                    </>
                  )}
                </button>
                <button
                  type="button"
                  onClick={report.reset}
                  className="rounded-lg border border-[#D8D5D0] bg-white px-4 py-3 text-sm text-[#7A756E] hover:bg-[#F5F4F2] transition"
                >
                  Clear Report
                </button>
              </>
            )}
            {pdfExport.error && (
              <span className="text-xs text-red-600">{pdfExport.error}</span>
            )}

            {!canGenerate && !report.isGenerating && (
              <span className="text-xs text-[#7A756E]">
                Enter an address or coordinates to generate a report.
              </span>
            )}
          </div>
        </div>

        {/* Report Results */}
        {report.hasReport && report.inputs && (
          <div className="space-y-5">
            {/* Report Header with status indicators */}
            <ReportHeader
              siteName={report.inputs.siteName}
              generatedAt={report.generatedAt}
              sections={[
                { label: 'Valuation', state: getSectionState(report.appraisal) },
                { label: 'Infrastructure', state: getSectionState(report.infra) },
                { label: 'Broadband', state: getSectionState(report.broadband) },
              ]}
            />

            {/* Section 1: Site Overview */}
            <SiteOverviewSection
              address={report.inputs.address}
              coordinates={report.inputs.coordinates}
              acreage={report.inputs.acreage}
              mw={report.inputs.mw}
            />

            {/* Section 2: Land Valuation */}
            <LandValuationSection
              section={report.appraisal}
              inputs={report.inputs}
            />

            {/* Section 3: Power Infrastructure */}
            <div className="bg-white rounded-2xl border border-[#D8D5D0] p-5 md:p-6">
              <div className="flex items-center gap-2.5 mb-5">
                <div className="h-8 w-8 rounded-lg bg-[#ED202B]/10 flex items-center justify-center">
                  <svg className="h-4 w-4 text-[#ED202B]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                </div>
                <h2 className="font-heading text-base font-semibold text-[#201F1E]">
                  Power Infrastructure
                </h2>
              </div>

              {report.infra.loading && (
                <div className="flex items-center justify-center py-12">
                  <div className="flex flex-col items-center gap-3">
                    <div className="h-8 w-8 animate-spin rounded-full border-[3px] border-[#D8D5D0] border-t-[#ED202B]" />
                    <span className="text-sm text-[#7A756E]">Analyzing power infrastructure...</span>
                  </div>
                </div>
              )}

              {report.infra.error && (
                <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
                  {report.infra.error}
                </div>
              )}

              {report.infra.data && (
                <InfrastructureResults
                  data={report.infra.data}
                  loading={false}
                  hasRunAnalysis={true}
                />
              )}
            </div>

            {/* Section 4: Broadband */}
            <BroadbandSection section={report.broadband} />
          </div>
        )}

        {/* Empty State */}
        {!report.hasReport && !report.isGenerating && (
          <div className="text-center py-16">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-[#ED202B]/10 mb-4">
              <svg className="h-8 w-8 text-[#ED202B]" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
              </svg>
            </div>
            <h3 className="font-heading text-lg font-semibold text-[#201F1E] mb-1">
              Power Infrastructure Due Diligence Report
            </h3>
            <p className="text-sm text-[#7A756E] max-w-md mx-auto">
              Enter site details above and click <strong>Generate Report</strong> to create a comprehensive due diligence report covering land valuation, power infrastructure, and broadband connectivity.
            </p>
          </div>
        )}
      </main>
    </Layout>
  );
}
