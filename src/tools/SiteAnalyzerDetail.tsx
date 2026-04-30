import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import Layout from '../components/Layout';
import DetailHeader from '../components/site-analyzer/DetailHeader';
import DetailSummary from '../components/site-analyzer/DetailSummary';
import DetailEditForm, { type EditFormValues } from '../components/site-analyzer/DetailEditForm';
import SectionTOC from '../components/site-analyzer/SectionTOC';
import SiteOverviewSection from '../components/site-analyzer/SiteOverviewSection';
import LandValuationSection from '../components/site-analyzer/LandValuationSection';
import BroadbandSection from '../components/site-analyzer/BroadbandSection';
import TransportSection from '../components/site-analyzer/TransportSection';
import WaterSection from '../components/site-analyzer/WaterSection';
import GasSection from '../components/site-analyzer/GasSection';
import LaborSection from '../components/site-analyzer/LaborSection';
import InfrastructureResults from '../components/power-calculator/InfrastructureResults';
import CountyQueueSection from '../components/site-analyzer/CountyQueueSection';
import { useCountyQueueLoad } from '../hooks/useCountyQueueLoad';
import { useSiteAnalysis, type AnalysisInputs } from '../hooks/useSiteAnalysis';
import { usePdfExport } from '../hooks/usePdfExport';
import { useSiteRegistry } from '../hooks/useSiteRegistry';
import { useUserHistory } from '../hooks/useUserHistory';
import { useCompanies } from '../hooks/useCompanies';
import { useAuth } from '../hooks/useAuth';
import { useUserQuota } from '../hooks/useUserQuota';
import { incrementGeneration } from '../lib/userQuotas';
import {
  saveAnalysisResults,
  saveLandCompsToSite,
  updateSiteEntry,
  deleteSiteEntry,
  type AnalysisResultsPayload,
} from '../lib/siteRegistry';
import { parseCoordinates } from '../utils/parseCoordinates';
import type { Company, FilteredCompResult, LandComp, SiteRegistryEntry } from '../types';

const MW_MIN = 10;
const MW_MAX = 1000;

const SECTIONS = [
  { id: 'section-overview', label: 'Overview' },
  { id: 'section-valuation', label: 'Valuation' },
  { id: 'section-power', label: 'Power' },
  { id: 'section-broadband', label: 'Broadband' },
  { id: 'section-transport', label: 'Transport' },
  { id: 'section-water', label: 'Water' },
  { id: 'section-gas', label: 'Gas' },
  { id: 'section-labor', label: 'Labor' },
];

function buildAnalysisInputs(site: SiteRegistryEntry, companies: Company[]): AnalysisInputs {
  return {
    siteName: site.name || 'Untitled Site',
    address: site.address || '',
    coordinates: site.coordinates ? `${site.coordinates.lat}, ${site.coordinates.lng}` : '',
    acreage: site.acreage || 0,
    mw: site.mwCapacity || 50,
    ppaLow: site.dollarPerAcreLow || 0,
    ppaHigh: site.dollarPerAcreHigh || 0,
    priorUsage: site.priorUsage,
    legalDescription: site.legalDescription,
    county: site.county,
    parcelId: site.parcelId,
    companyId: site.companyId,
    companyName: site.companyId
      ? companies.find((c) => c.id === site.companyId)?.name
      : undefined,
  };
}

export default function SiteAnalyzerDetail() {
  const { siteId } = useParams<{ siteId: string }>();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const { sites, loading: registryLoading } = useSiteRegistry();
  const { companies } = useCompanies();
  const { logActivity } = useUserHistory();
  const { user } = useAuth();
  const { quota } = useUserQuota();
  const report = useSiteAnalysis();
  const pdfExport = usePdfExport();
  const [quotaError, setQuotaError] = useState<string | null>(null);

  const site = useMemo(() => sites.find((s) => s.id === siteId), [sites, siteId]);
  const companyName = site?.companyId
    ? companies.find((c) => c.id === site.companyId)?.name ?? null
    : null;
  // Prefer the freshly-detected state from the running analysis (covers sites
  // whose registry record predates the detectedState field). Fall back to
  // whatever's saved on the site, or null.
  const queueState =
    (report.infra.data as { detectedState?: string | null } | null)?.detectedState ??
    site?.detectedState ??
    null;
  const queueCounty = site?.county ?? null;
  const { data: countyQueue } = useCountyQueueLoad(queueState, queueCounty);

  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [activeSection, setActiveSection] = useState<string | null>(null);
  const [landComps, setLandComps] = useState<LandComp[]>([]);
  const [mwOverride, setMwOverride] = useState<number | null>(null);
  const [saveVisible, setSaveVisible] = useState(false);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flashSaveIndicator = useCallback(() => {
    setSaveVisible(true);
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => setSaveVisible(false), 2500);
  }, []);

  // Load saved analysis (or wait for ?run=1 trigger) when site becomes available.
  const loadedSiteIdRef = useRef<string | null>(null);
  // Tracks the last serialized landComps snapshot we persisted to Firestore so
  // the autosave effect can skip no-op writes triggered by registry snapshots.
  const lastSavedLandCompsRef = useRef<string>('[]');
  // Mirror guard for the filtered-comps median writeback.
  const lastSavedMedianRef = useRef<number | null>(null);
  const compsMedianTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!site || loadedSiteIdRef.current === site.id) return;
    loadedSiteIdRef.current = site.id;
    const initialComps = site.landComps ?? [];
    setLandComps(initialComps);
    lastSavedLandCompsRef.current = JSON.stringify(initialComps);
    lastSavedMedianRef.current = site.dollarPerAcreLow ?? null;
    if (site.piddrGeneratedAt) {
      const inputs = buildAnalysisInputs(site, companies);
      report.loadReport(inputs, {
        infra: site.infraResult,
        broadband: site.broadbandResult,
        transport: site.transportResult,
        water: site.waterResult,
        gas: site.gasResult,
        labor: site.laborResult,
      });
    }
  }, [site, companies, report]);

  // Auto-trigger initial generation when arriving via /new (?run=1).
  const runTriggeredRef = useRef(false);
  // Set true when the in-flight generation should consume one of the user's
  // monthly quota slots (only for never-before-analyzed sites). Cleared after
  // the increment succeeds, or on failure so a retry isn't free.
  const shouldIncrementRef = useRef(false);
  useEffect(() => {
    if (!site) return;
    if (searchParams.get('run') !== '1') return;
    if (runTriggeredRef.current) return;
    runTriggeredRef.current = true;
    const next = new URLSearchParams(searchParams);
    next.delete('run');
    setSearchParams(next, { replace: true });
    const inputs = buildAnalysisInputs(site, companies);
    shouldIncrementRef.current = !site.piddrGeneratedAt;
    void report.generateReport(inputs);
  }, [site, companies, searchParams, setSearchParams, report]);

  // Write back results to the registry as each section completes.
  const writebackDoneRef = useRef<number | null>(null);
  useEffect(() => {
    if (!site || report.isGenerating || !report.hasReport) return;
    if (writebackDoneRef.current === report.generatedAt) return;
    writebackDoneRef.current = report.generatedAt;

    const payload: AnalysisResultsPayload = {};
    if (report.appraisal.data) payload.appraisalResult = report.appraisal.data;
    if (report.infra.data) payload.infraResult = report.infra.data as unknown as Record<string, unknown>;
    if (report.broadband.data) payload.broadbandResult = report.broadband.data;
    if (report.transport.data) payload.transportResult = report.transport.data as unknown as Record<string, unknown>;
    if (report.water.data) payload.waterResult = report.water.data as unknown as Record<string, unknown>;
    if (report.gas.data) payload.gasResult = report.gas.data as unknown as Record<string, unknown>;
    if (report.labor.data) payload.laborResult = report.labor.data as unknown as Record<string, unknown>;

    const wasFirstAnalysis = shouldIncrementRef.current;
    shouldIncrementRef.current = false;
    void saveAnalysisResults(site.id, payload).then(
      () => {
        flashSaveIndicator();
        if (wasFirstAnalysis && user) {
          void incrementGeneration(user.uid).catch((err) =>
            console.error('[SiteAnalyzer] Failed to increment quota:', err),
          );
        }
      },
      (err) => console.error('[SiteAnalyzer] Failed to save results:', err),
    );

    logActivity(
      'site-analyzer',
      site.name || 'Untitled Site',
      site.address || '',
      'Ran site analysis',
      site.id,
      {
        siteName: site.name,
        coordinates: site.coordinates ? `${site.coordinates.lat}, ${site.coordinates.lng}` : '',
        acreage: site.acreage,
        mw: site.mwCapacity,
      },
    );
  }, [
    site,
    report.isGenerating,
    report.hasReport,
    report.generatedAt,
    report.appraisal.data,
    report.infra.data,
    report.broadband.data,
    report.transport.data,
    report.water.data,
    report.gas.data,
    report.labor.data,
    flashSaveIndicator,
    logActivity,
  ]);

  // Debounced save of land comps. The serialized compare guards against an
  // infinite write loop: every save echoes back via onSnapshot, replacing the
  // `site` reference and re-firing this effect — without the guard each loop
  // iteration would schedule another identical write.
  useEffect(() => {
    if (!site) return;
    const serialized = JSON.stringify(landComps);
    if (serialized === lastSavedLandCompsRef.current) return;
    const siteId = site.id;
    const timer = setTimeout(() => {
      saveLandCompsToSite(siteId, landComps)
        .then(() => {
          lastSavedLandCompsRef.current = serialized;
          flashSaveIndicator();
        })
        .catch((err) => console.error('[SiteAnalyzer] Failed to save land comps:', err));
    }, 1000);
    return () => clearTimeout(timer);
  }, [site?.id, landComps, flashSaveIndicator]);

  // Track which section is in view for the sticky TOC.
  useEffect(() => {
    if (!report.hasReport) return;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) setActiveSection(entry.target.id);
        }
      },
      { rootMargin: '-20% 0px -60% 0px', threshold: 0 },
    );
    const timer = setTimeout(() => {
      for (const s of SECTIONS) {
        const el = document.getElementById(s.id);
        if (el) observer.observe(el);
      }
    }, 100);
    return () => {
      clearTimeout(timer);
      observer.disconnect();
    };
  }, [report.hasReport]);

  // Debounced + dedup'd median writeback. Comp-table edits and CSV pastes
  // produce a flurry of intermediate medians; without the guards each one
  // wrote a new dollarPerAcre pair, and the snapshot echo on each write
  // re-rendered the table — burning Firestore writes for transient values.
  const handleFilteredCompsChange = useCallback(
    (result: FilteredCompResult) => {
      const siteId = site?.id;
      if (!siteId) return;
      const median = Math.round(result.medianPricePerAcre);
      if (median <= 0) return;
      if (lastSavedMedianRef.current === median) return;
      if (compsMedianTimerRef.current) clearTimeout(compsMedianTimerRef.current);
      compsMedianTimerRef.current = setTimeout(() => {
        void updateSiteEntry(siteId, {
          dollarPerAcreLow: median,
          dollarPerAcreHigh: median,
        }).then(
          () => {
            lastSavedMedianRef.current = median;
            flashSaveIndicator();
          },
          (err) => console.error('[SiteAnalyzer] Failed to save median:', err),
        );
      }, 1000);
    },
    [site?.id, flashSaveIndicator],
  );

  function handleReanalyze() {
    if (!site) return;
    const isFirstAnalysis = !site.piddrGeneratedAt;
    if (isFirstAnalysis && quota && !quota.isAdmin && quota.remaining <= 0) {
      setQuotaError(
        `You've reached your monthly limit of ${quota.limit} site analyses. Contact an admin to increase your limit.`,
      );
      return;
    }
    setQuotaError(null);
    const inputs = buildAnalysisInputs(site, companies);
    shouldIncrementRef.current = isFirstAnalysis;
    writebackDoneRef.current = null;
    void report.generateReport(inputs);
  }

  async function handleSave(values: EditFormValues) {
    if (!site) return;
    const coords = values.coordinates.trim() ? parseCoordinates(values.coordinates) : null;
    setSaving(true);
    try {
      await updateSiteEntry(site.id, {
        name: values.name,
        address: values.address,
        coordinates: coords,
        acreage: values.acreage,
        mwCapacity: values.mwCapacity,
        dollarPerAcreLow: values.dollarPerAcreLow,
        dollarPerAcreHigh: values.dollarPerAcreHigh,
        priorUsage: values.priorUsage || undefined,
        legalDescription: values.legalDescription || undefined,
        county: values.county || undefined,
        parcelId: values.parcelId || undefined,
        companyId: values.companyId ?? undefined,
      });
      flashSaveIndicator();
      setEditing(false);
    } catch (err) {
      console.error('[SiteAnalyzer] Failed to save site:', err);
    } finally {
      setSaving(false);
    }
  }

  function handleDelete() {
    if (!site) return;
    const ok = window.confirm(
      `Delete "${site.name || 'this site'}" and all its analysis results? This cannot be undone.`,
    );
    if (!ok) return;
    void deleteSiteEntry(site.id).then(
      () => navigate('/site-analyzer', { replace: true }),
      (err) => console.error('[SiteAnalyzer] Failed to delete site:', err),
    );
  }

  function handleExportPdf() {
    if (!report.hasReport || !report.inputs || !report.generatedAt) return;
    pdfExport.generatePdf({
      inputs: report.inputs,
      appraisal: report.appraisal.data,
      infra: report.infra.data,
      broadband: report.broadband.data,
      transport: report.transport.data,
      water: report.water.data,
      gas: report.gas.data,
      labor: report.labor.data,
      countyQueue: countyQueue,
      siteMapImage: null,
      generatedAt: report.generatedAt,
    });
  }

  function getSectionState(s: { loading: boolean; error: string | null; data: unknown }) {
    if (s.loading) return 'loading' as const;
    if (s.error) return 'error' as const;
    if (s.data) return 'done' as const;
    return 'pending' as const;
  }

  const tocSections = SECTIONS.map((s) => ({
    ...s,
    state:
      s.id === 'section-overview'
        ? ('done' as const)
        : s.id === 'section-valuation'
          ? getSectionState(report.appraisal)
          : s.id === 'section-power'
            ? getSectionState(report.infra)
            : s.id === 'section-broadband'
              ? getSectionState(report.broadband)
              : s.id === 'section-transport'
                ? getSectionState(report.transport)
                : s.id === 'section-water'
                  ? getSectionState(report.water)
                  : s.id === 'section-gas'
                    ? getSectionState(report.gas)
                    : getSectionState(report.labor),
  }));

  if (registryLoading) {
    return (
      <Layout>
        <main className="py-10 text-center text-sm text-[#7A756E]">Loading…</main>
      </Layout>
    );
  }

  if (!site) {
    return (
      <Layout>
        <main className="py-10 text-center">
          <p className="text-sm text-[#7A756E] mb-4">
            Site not found. It may have been deleted.
          </p>
          <button
            onClick={() => navigate('/site-analyzer')}
            className="text-sm font-medium text-[#ED202B] hover:underline"
          >
            ← Back to Site Analyzer
          </button>
        </main>
      </Layout>
    );
  }

  const canExportPdf = report.hasReport && !report.isGenerating;
  const mw = mwOverride ?? site.mwCapacity ?? 50;

  return (
    <Layout>
      <main className="py-2">
        <DetailHeader
          siteName={site.name || 'Untitled Site'}
          companyId={site.companyId ?? null}
          companyName={companyName}
          lastAnalyzedAt={site.piddrGeneratedAt ?? null}
          isAnalyzing={report.isGenerating}
          canExportPdf={canExportPdf}
          isExportingPdf={pdfExport.generating}
          onEdit={() => setEditing(true)}
          onReanalyze={handleReanalyze}
          onExportPdf={handleExportPdf}
          onDelete={handleDelete}
        />

        {pdfExport.error && (
          <div className="mb-4 rounded-lg bg-red-50 border border-red-200 px-4 py-2.5 text-sm text-red-700">
            {pdfExport.error}
          </div>
        )}

        {quotaError && (
          <div className="mb-4 rounded-lg bg-red-50 border border-red-200 px-4 py-2.5 text-sm text-red-700">
            {quotaError}
          </div>
        )}

        {report.hasReport && !editing && (
          <SectionTOC sections={tocSections} activeId={activeSection} />
        )}

        {editing ? (
          <DetailEditForm
            site={site}
            saving={saving}
            onSave={handleSave}
            onCancel={() => setEditing(false)}
          />
        ) : (
          <DetailSummary site={site} companyName={companyName} />
        )}

        {!editing && !report.hasReport && !report.isGenerating && (
          <div className="bg-white rounded-2xl border border-[#D8D5D0] p-8 text-center">
            {site.coordinates ? (
              <>
                <p className="text-sm text-[#7A756E] mb-4">
                  No analysis has been run for this site yet.
                </p>
                <button
                  onClick={handleReanalyze}
                  className="inline-flex items-center gap-2 rounded-lg bg-[#ED202B] px-4 py-2 text-sm font-semibold text-white hover:bg-[#9B0E18] transition"
                >
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                  Run Analysis
                </button>
              </>
            ) : (
              <p className="text-sm text-[#7A756E]">
                Add coordinates to this site to run the analysis.
              </p>
            )}
          </div>
        )}

        {!editing && (report.hasReport || report.isGenerating) && report.inputs && (
          <div className="space-y-5 mt-5">
            <div id="section-overview">
              <SiteOverviewSection
                coordinates={report.inputs.coordinates}
              />
            </div>

            <div id="section-valuation">
              <LandValuationSection
                section={report.appraisal}
                inputs={report.inputs}
                mw={mw}
                mwMin={MW_MIN}
                mwMax={MW_MAX}
                onMwChange={setMwOverride}
                landComps={landComps}
                onLandCompsChange={setLandComps}
                onFilteredCompsChange={handleFilteredCompsChange}
              />
            </div>

            <div id="section-power">
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
                <div className="bg-white rounded-2xl border border-[#D8D5D0] p-5 md:p-6">
                  <div className="flex items-center justify-center py-12">
                    <div className="flex flex-col items-center gap-3">
                      <div className="h-8 w-8 animate-spin rounded-full border-[3px] border-[#D8D5D0] border-t-[#ED202B]" />
                      <span className="text-sm text-[#7A756E]">Analyzing power infrastructure…</span>
                    </div>
                  </div>
                </div>
              )}
              {report.infra.error && (
                <div className="bg-white rounded-2xl border border-[#D8D5D0] p-5 md:p-6">
                  <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
                    {report.infra.error}
                  </div>
                </div>
              )}
              {report.infra.data && (
                <InfrastructureResults data={report.infra.data} loading={false} hasRunAnalysis={true} collapsible={false} cardWrap context="site-analyzer" />
              )}
              <CountyQueueSection state={queueState} county={queueCounty} />
            </div>

            <div id="section-broadband"><BroadbandSection section={report.broadband} /></div>
            <div id="section-transport"><TransportSection section={report.transport} /></div>
            <div id="section-water"><WaterSection section={report.water} /></div>
            <div id="section-gas">
              <GasSection
                section={report.gas}
                pipelineSuppliers={site.pipelineMarketers}
                onSupplierChange={(operator, supplier) => {
                  const updated = { ...site.pipelineMarketers, [operator]: supplier };
                  void updateSiteEntry(site.id, { pipelineMarketers: updated });
                }}
              />
            </div>
            <div id="section-labor"><LaborSection section={report.labor} /></div>
          </div>
        )}

        {/* Save indicator */}
        <AnimatePresence>
          {saveVisible && (
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.3 }}
              className="fixed top-20 right-4 z-50 flex items-center gap-1.5 rounded-full bg-[#ED202B]/90 px-3 py-1.5 text-[11px] font-medium text-white shadow-lg backdrop-blur-sm"
            >
              <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
              </svg>
              Saved
            </motion.div>
          )}
        </AnimatePresence>
      </main>
    </Layout>
  );
}
