import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import Layout from '../components/Layout';
import DetailHeader from '../components/site-analyzer/DetailHeader';
import DetailSummary from '../components/site-analyzer/DetailSummary';
import DetailEditForm, { type EditFormValues } from '../components/site-analyzer/DetailEditForm';
import SectionTOC from '../components/site-analyzer/SectionTOC';
import SiteOverviewSection from '../components/site-analyzer/SiteOverviewSection';
import SiteExecutiveSummarySection from '../components/site-analyzer/SiteExecutiveSummarySection';
import LandValuationSection from '../components/site-analyzer/LandValuationSection';
import BroadbandSection from '../components/site-analyzer/BroadbandSection';
import TransportSection from '../components/site-analyzer/TransportSection';
import WaterSection from '../components/site-analyzer/WaterSection';
import GasSection from '../components/site-analyzer/GasSection';
import LaborSection from '../components/site-analyzer/LaborSection';
import PoliticalRadarSection from '../components/site-analyzer/PoliticalRadarSection';
import InfrastructureResults from '../components/power-calculator/InfrastructureResults';
import CountyQueueSection from '../components/site-analyzer/CountyQueueSection';
import GridAnalysisBlock from '../components/site-analyzer/GridAnalysisBlock';
import { useCountyQueueLoad } from '../hooks/useCountyQueueLoad';
import { useSiteAnalysis, type AnalysisInputs } from '../hooks/useSiteAnalysis';
import { usePdfExport } from '../hooks/usePdfExport';
import { useSiteRegistry } from '../hooks/useSiteRegistry';
import { useUserHistory } from '../hooks/useUserHistory';
import { logView } from '../lib/userHistory';
import { shouldLogView } from '../lib/routeToolMap';
import { useCompanies } from '../hooks/useCompanies';
import { useAuth } from '../hooks/useAuth';
import { useUserQuota } from '../hooks/useUserQuota';
import { incrementGeneration } from '../lib/userQuotas';
import { usePreConSiteByRegistryId } from '../hooks/usePreConSites';
import {
  createPreConSiteFromRegistry,
  PreConSiteAlreadyExistsError,
} from '../lib/preConSites';
import {
  saveAnalysisResults,
  saveLandCompsToSite,
  updateSiteEntry,
  deleteSiteEntry,
  setSectionLock,
  setAllSectionLocks,
  allSectionsLocked,
  type AnalysisResultsPayload,
} from '../lib/siteRegistry';
import { parseCoordinates } from '../utils/parseCoordinates';
import { getSectionHealth } from '../lib/siteAnalysis/sectionHealth';
import type { AnalysisSectionState, ExistingResults } from '../hooks/useSiteAnalysis';
import type {
  Company,
  FilteredCompResult,
  LandComp,
  LockableSectionKey,
  SectionLocks,
  SiteRegistryEntry,
} from '../types';
import { LOCKABLE_SECTION_KEYS } from '../types';


/**
 * Tab configuration. `lockKey` maps the tab to a lockable section key (when
 * applicable); Overview and Valuation don't participate in the lock model.
 */
const SECTIONS: ReadonlyArray<{
  id: string;
  label: string;
  lockKey?: LockableSectionKey;
}> = [
  { id: 'section-exec', label: 'Executive Summary' },
  { id: 'section-overview', label: 'Overview' },
  { id: 'section-valuation', label: 'Valuation' },
  { id: 'section-power', label: 'Power', lockKey: 'power' },
  { id: 'section-broadband', label: 'Broadband', lockKey: 'broadband' },
  { id: 'section-transport', label: 'Transport', lockKey: 'transport' },
  { id: 'section-water', label: 'Water', lockKey: 'water' },
  { id: 'section-gas', label: 'Gas', lockKey: 'gas' },
  { id: 'section-labor', label: 'Labor', lockKey: 'labor' },
  { id: 'section-political', label: 'Political', lockKey: 'political' },
];

/**
 * Build the `ExistingResults` payload passed into `report.generateReport`.
 * Locked sections forward their currently-saved data so the orchestrator
 * skips the refetch; unlocked sections omit the field, which makes the
 * orchestrator run them. This is the core of the per-section re-run model.
 */
function buildExistingResults(
  site: SiteRegistryEntry,
  locks: SectionLocks | undefined,
): ExistingResults {
  const existing: ExistingResults = {};
  if (locks?.power && site.infraResult) existing.infra = site.infraResult;
  if (locks?.broadband && site.broadbandResult) existing.broadband = site.broadbandResult;
  if (locks?.transport && site.transportResult) existing.transport = site.transportResult;
  if (locks?.water && site.waterResult) existing.water = site.waterResult;
  if (locks?.gas && site.gasResult) existing.gas = site.gasResult;
  if (locks?.labor && site.laborResult) existing.labor = site.laborResult;
  if (locks?.political && site.politicalResult) existing.political = site.politicalResult;
  return existing;
}

function buildAnalysisInputs(site: SiteRegistryEntry, companies: Company[]): AnalysisInputs {
  return {
    siteName: site.name || 'Untitled Site',
    address: site.address || '',
    coordinates: site.coordinates ? `${site.coordinates.lat}, ${site.coordinates.lng}` : '',
    acreage: site.acreage || 0,
    mw: site.mwCapacity || 0,
    ppaLow: site.dollarPerAcreLow || 0,
    ppaHigh: site.dollarPerAcreHigh || 0,
    priorUsage: site.priorUsage,
    legalDescription: site.legalDescription,
    county: site.county,
    parcelId: site.parcelId,
    companyId: site.companyId,
    companyName: site.companyId ? companies.find((c) => c.id === site.companyId)?.name : undefined,
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

  // Audit: log a `view` event once per (user, site) per 60s.
  useEffect(() => {
    if (!user || !site || !siteId) return;
    const path = `/site-analyzer/${siteId}`;
    if (!shouldLogView(user.uid, path)) return;
    void logView({
      userId: user.uid,
      toolId: 'site-analyzer',
      routePath: path,
      routeLabel: 'Site Analyzer — site',
      resourceType: 'site',
      resourceId: siteId,
      resourceLabel: site.name ?? '(unnamed site)',
    });
  }, [user, site, siteId]);

  const companyName = site?.companyId
    ? (companies.find((c) => c.id === site.companyId)?.name ?? null)
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

  const { site: existingPreConSite, loading: preConLookupLoading } =
    usePreConSiteByRegistryId(siteId);
  const [isTrackingInPreCon, setIsTrackingInPreCon] = useState(false);

  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<string>('section-exec');
  const [landComps, setLandComps] = useState<LandComp[]>([]);
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
        political: site.politicalResult,
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
    if (report.infra.data)
      payload.infraResult = report.infra.data as unknown as Record<string, unknown>;
    if (report.broadband.data) payload.broadbandResult = report.broadband.data;
    if (report.transport.data)
      payload.transportResult = report.transport.data as unknown as Record<string, unknown>;
    if (report.water.data)
      payload.waterResult = report.water.data as unknown as Record<string, unknown>;
    if (report.gas.data) payload.gasResult = report.gas.data as unknown as Record<string, unknown>;
    if (report.labor.data)
      payload.laborResult = report.labor.data as unknown as Record<string, unknown>;
    if (report.political.data)
      payload.politicalResult = report.political.data as unknown as Record<string, unknown>;

    // Auto-(un)lock based on per-section health. Only sections that ACTUALLY
    // RAN this pass (i.e. were unlocked at run start) are eligible to flip
    // lock state — locked sections were carried through with stored data
    // and shouldn't be touched. Within ran sections:
    //   clean   → lock (✓ green pill on next render)
    //   partial → unlock (red pill, easy click-to-rerun)
    //   failed  → unlock (same)
    //   loading/pending — shouldn't reach here (effect runs after !isGenerating)
    const startLocks = runStartLocksRef.current ?? {};
    const nextLocks: SectionLocks = { ...(site.sectionLocks ?? {}) };
    const applyLockUpdate = (
      key: LockableSectionKey,
      section: AnalysisSectionState<unknown>,
    ) => {
      if (startLocks[key]) return; // was locked at run start → carried through, don't touch
      const h = getSectionHealth(key, section);
      if (h === 'clean') nextLocks[key] = true;
      else if (h === 'partial' || h === 'failed') nextLocks[key] = false;
    };
    applyLockUpdate('power', report.infra);
    applyLockUpdate('broadband', report.broadband);
    applyLockUpdate('transport', report.transport);
    applyLockUpdate('water', report.water);
    applyLockUpdate('gas', report.gas);
    applyLockUpdate('labor', report.labor);
    applyLockUpdate('political', report.political);
    payload.sectionLocks = nextLocks;

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
    report.political.data,
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

  // (Removed: IntersectionObserver scroll-tracking. Tabs now drive the active
  // section explicitly via setActiveTab.)

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

  /**
   * Snapshot of which sections were locked at the moment Re-analyze was
   * pressed. The writeback effect uses it to decide which sections may have
   * their lock state mutated post-run: only sections that *actually ran*
   * (i.e. were unlocked at run start) are eligible to flip lock state. This
   * prevents a clean Water run from locking a section the user manually
   * unlocked mid-run, and avoids force-unlocking sections that were
   * carrying through their stored data.
   */
  const runStartLocksRef = useRef<SectionLocks | null>(null);

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
    // Locked sections forward their saved data so the orchestrator skips the
    // refetch. This is what protects e.g. a working Water result while the
    // user iterates on the Political layer.
    const existing = buildExistingResults(site, site.sectionLocks);
    runStartLocksRef.current = { ...(site.sectionLocks ?? {}) };
    shouldIncrementRef.current = isFirstAnalysis;
    writebackDoneRef.current = null;
    void report.generateReport(inputs, existing);
  }

  function handleToggleLock(sectionId: string) {
    if (!site) return;
    const tab = SECTIONS.find((s) => s.id === sectionId);
    if (!tab?.lockKey) return;
    const currentlyLocked = !!site.sectionLocks?.[tab.lockKey];
    void setSectionLock(site.id, tab.lockKey, !currentlyLocked, site.sectionLocks).catch((err) =>
      console.error('[SiteAnalyzer] Failed to toggle lock:', err),
    );
  }

  function handleUnlockAll() {
    if (!site) return;
    void setAllSectionLocks(site.id, false).catch((err) =>
      console.error('[SiteAnalyzer] Failed to unlock all:', err),
    );
  }

  async function handleSave(values: EditFormValues) {
    if (!site) return;
    const coords = values.coordinates.trim() ? parseCoordinates(values.coordinates) : null;
    // If the lat/lon actually moves, every section's saved data is geo-keyed
    // and now stale. Clear all locks so the next Re-analyze refetches them
    // — leaving them locked would silently carry old-coords data into the
    // new-coords result.
    const coordsChanged =
      (coords?.lat ?? null) !== (site.coordinates?.lat ?? null) ||
      (coords?.lng ?? null) !== (site.coordinates?.lng ?? null);
    setSaving(true);
    try {
      await updateSiteEntry(site.id, {
        name: values.name,
        address: values.address,
        coordinates: coords,
        acreage: values.acreage,
        mwCapacity: values.mwCapacity,
        customRamp: values.customRamp,
        dollarPerAcreLow: values.dollarPerAcreLow,
        dollarPerAcreHigh: values.dollarPerAcreHigh,
        priorUsage: values.priorUsage || undefined,
        legalDescription: values.legalDescription || undefined,
        county: values.county || undefined,
        parcelId: values.parcelId || undefined,
        companyId: values.companyId ?? undefined,
        ...(coordsChanged ? { sectionLocks: {} } : {}),
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

  async function handleExportPdf() {
    if (!report.hasReport || !report.inputs || !report.generatedAt) return;
    const ok = await pdfExport.generatePdf({
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
    if (ok && site) {
      logActivity('site-analyzer', site.name, site.address ?? '', 'PDF export', site.id);
    }
  }

  async function handlePreConAction() {
    if (!site) return;
    if (existingPreConSite) {
      navigate(`/llr/${existingPreConSite.id}`);
      return;
    }
    if (!user) return;
    if (!site.companyId) return;
    const ok = window.confirm(
      `Track "${site.name || 'this site'}" as a Large Load Request? This will reuse the existing Site Analyzer results — no re-run, no quota.`,
    );
    if (!ok) return;
    setIsTrackingInPreCon(true);
    try {
      const newId = await createPreConSiteFromRegistry({
        siteRegistryId: site.id,
        createdBy: user.uid,
      });
      navigate(`/llr/${newId}`);
    } catch (err) {
      if (err instanceof PreConSiteAlreadyExistsError) {
        navigate(`/llr/${err.existingPreConSiteId}`);
        return;
      }
      console.error('[SiteAnalyzer] Failed to track LLR:', err);
      window.alert(err instanceof Error ? err.message : 'Failed to track as Large Load Request.');
      setIsTrackingInPreCon(false);
    }
  }

  /** Status for non-lockable tabs (Overview, Valuation) — no sub-error model. */
  function plainState(s: { loading: boolean; error: string | null; data: unknown }) {
    if (s.loading) return 'loading' as const;
    if (s.error) return 'error' as const;
    if (s.data) return 'done' as const;
    return 'pending' as const;
  }
  /** Status for lockable tabs — sub-errors promote to red. */
  function healthState(
    key: LockableSectionKey,
    section: AnalysisSectionState<unknown>,
  ): 'pending' | 'loading' | 'done' | 'error' {
    const h = getSectionHealth(key, section);
    if (h === 'loading') return 'loading';
    if (h === 'failed' || h === 'partial') return 'error';
    if (h === 'clean') return 'done';
    return 'pending';
  }

  const tocSections = SECTIONS.map((s) => ({
    id: s.id,
    label: s.label,
    state:
      s.id === 'section-exec'
        ? ('done' as const)
        : s.id === 'section-overview'
        ? ('done' as const)
        : s.id === 'section-valuation'
          ? plainState(report.appraisal)
          : s.id === 'section-power'
            ? healthState('power', report.infra)
            : s.id === 'section-broadband'
              ? healthState('broadband', report.broadband)
              : s.id === 'section-transport'
                ? healthState('transport', report.transport)
                : s.id === 'section-water'
                  ? healthState('water', report.water)
                  : s.id === 'section-gas'
                    ? healthState('gas', report.gas)
                    : s.id === 'section-labor'
                      ? healthState('labor', report.labor)
                      : healthState('political', report.political),
    locked: s.lockKey ? !!site?.sectionLocks?.[s.lockKey] : undefined,
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
          <p className="text-sm text-[#7A756E] mb-4">Site not found. It may have been deleted.</p>
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
  const mw = site.mwCapacity ?? 0;
  // When every lockable section is locked, "Run Analysis" has nothing to do.
  // We surface that with a disabled button + Unlock-all CTA in the header.
  const everythingLocked = allSectionsLocked(site.sectionLocks);
  const hasAnyLock = LOCKABLE_SECTION_KEYS.some((k) => !!site.sectionLocks?.[k]);

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
          everythingLocked={everythingLocked}
          hasAnyLock={hasAnyLock}
          preConLookupLoading={preConLookupLoading}
          existingPreConSiteId={existingPreConSite?.id ?? null}
          canTrackInPreCon={!!site.companyId}
          isTrackingInPreCon={isTrackingInPreCon}
          onEdit={() => setEditing(true)}
          onReanalyze={handleReanalyze}
          onUnlockAll={handleUnlockAll}
          onExportPdf={handleExportPdf}
          onDelete={handleDelete}
          onPreConAction={handlePreConAction}
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
          <SectionTOC
            sections={tocSections}
            activeId={activeTab}
            onSelect={setActiveTab}
            onToggleLock={handleToggleLock}
          />
        )}

        {editing && (
          <DetailEditForm
            site={site}
            saving={saving}
            onSave={handleSave}
            onCancel={() => setEditing(false)}
          />
        )}
        {/* Site-details summary lives on the Overview tab once a report
            exists; before the first run there are no tabs yet, so we show it
            unconditionally so the user can review inputs before clicking Run. */}
        {!editing && (!report.hasReport || activeTab === 'section-overview') && (
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
                  <svg
                    className="h-4 w-4"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M13 10V3L4 14h7v7l9-11h-7z"
                    />
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
          <div className="mt-5">
            {activeTab === 'section-exec' && (
              <SiteExecutiveSummarySection site={site} companyName={companyName} />
            )}

            {activeTab === 'section-overview' && (
              <SiteOverviewSection coordinates={report.inputs.coordinates} />
            )}

            {activeTab === 'section-valuation' && (
              <LandValuationSection
                section={report.appraisal}
                inputs={report.inputs}
                mw={mw}
                landComps={landComps}
                onLandCompsChange={setLandComps}
                onFilteredCompsChange={handleFilteredCompsChange}
              />
            )}

            {activeTab === 'section-power' && (
              <div className="space-y-5">
                <div className="flex items-center gap-2.5">
                  <div className="h-8 w-8 rounded-lg bg-[#ED202B]/10 flex items-center justify-center">
                    <svg
                      className="h-4 w-4 text-[#ED202B]"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={2}
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M13 10V3L4 14h7v7l9-11h-7z"
                      />
                    </svg>
                  </div>
                  <h2 className="font-heading text-base font-semibold text-[#201F1E]">
                    Power Infrastructure
                  </h2>
                </div>
                {report.infra.data && (
                  <GridAnalysisBlock infra={report.infra.data} targetMW={site.mwCapacity} />
                )}
                {report.infra.loading && (
                  <div className="bg-white rounded-2xl border border-[#D8D5D0] p-5 md:p-6">
                    <div className="flex items-center justify-center py-12">
                      <div className="flex flex-col items-center gap-3">
                        <div className="h-8 w-8 animate-spin rounded-full border-[3px] border-[#D8D5D0] border-t-[#ED202B]" />
                        <span className="text-sm text-[#7A756E]">
                          Analyzing power infrastructure…
                        </span>
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
                  <InfrastructureResults
                    data={report.infra.data}
                    loading={false}
                    hasRunAnalysis={true}
                    collapsible={false}
                    cardWrap
                  />
                )}
                <CountyQueueSection state={queueState} county={queueCounty} />
              </div>
            )}

            {activeTab === 'section-broadband' && <BroadbandSection section={report.broadband} />}
            {activeTab === 'section-transport' && <TransportSection section={report.transport} />}
            {activeTab === 'section-water' && <WaterSection section={report.water} />}
            {activeTab === 'section-gas' && (
              <GasSection
                section={report.gas}
                pipelineSuppliers={site.pipelineMarketers}
                onSupplierChange={(operator, supplier) => {
                  const updated = { ...site.pipelineMarketers, [operator]: supplier };
                  void updateSiteEntry(site.id, { pipelineMarketers: updated });
                }}
              />
            )}
            {activeTab === 'section-labor' && <LaborSection section={report.labor} />}
            {activeTab === 'section-political' && (
              <PoliticalRadarSection section={report.political} />
            )}
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
              <svg
                className="h-3 w-3"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2.5}
              >
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
