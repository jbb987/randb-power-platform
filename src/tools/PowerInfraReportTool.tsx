import { useState, useEffect, useRef, useCallback } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import Layout from '../components/Layout';
import PowerSlider from '../components/PowerSlider';
import ReportHeader from '../components/piddr/ReportHeader';
import SiteOverviewSection from '../components/piddr/SiteOverviewSection';
import LandValuationSection from '../components/piddr/LandValuationSection';
import BroadbandSection from '../components/piddr/BroadbandSection';
import TransportSection from '../components/piddr/TransportSection';
import WaterSection from '../components/piddr/WaterSection';
import GasSection from '../components/piddr/GasSection';
import PiddrSidebar from '../components/piddr/PiddrSidebar';
import InfrastructureResults from '../components/power-calculator/InfrastructureResults';
import { usePiddrReport } from '../hooks/usePiddrReport';
import { usePdfExport } from '../hooks/usePdfExport';
import { useSiteRegistry } from '../hooks/useSiteRegistry';
import { useUserHistory } from '../hooks/useUserHistory';
import { useProjects } from '../hooks/useProjects';
import { useAuth } from '../hooks/useAuth';
import {
  saveAppraisalToSite,
  saveInfraToSite,
  saveBroadbandToSite,
  saveTransportToSite,
  saveWaterToSite,
  saveGasToSite,
  saveLandCompsToSite,
  savePiddrTimestamp,
  createSiteEntry,
  findSiteByCoordinates,
  updateSiteEntry,
  deleteSiteEntry,
} from '../lib/siteRegistry';
import { deleteProjectCascade } from '../lib/projects';
import { parseCoordinates } from '../utils/parseCoordinates';
import RecentHistory from '../components/RecentHistory';
import type { PiddrInputs, ExistingResults } from '../hooks/usePiddrReport';
import type { FilteredCompResult, LandComp, SiteRegistryEntry } from '../types';

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
  const [priorUsage, setPriorUsage] = useState('');
  const [legalDescription, setLegalDescription] = useState('');
  const [county, setCounty] = useState('');
  const [parcelId, setParcelId] = useState('');
  const [owner, setOwner] = useState('');
  const [selectedSiteId, setSelectedSiteId] = useState<string | null>(null);
  const [, setMatchedExisting] = useState(false);
  const [newSiteProjectId, setNewSiteProjectId] = useState<string | null>(null);
  const [landComps, setLandComps] = useState<LandComp[]>([]);
  const [activeCompCount, setActiveCompCount] = useState(0);

  // Sidebar state
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  // Save indicator & section nav state
  const [saveVisible, setSaveVisible] = useState(false);
  const [activeSection, setActiveSection] = useState<string | null>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mainRef = useRef<HTMLElement>(null);

  const REPORT_SECTIONS = [
    { id: 'section-overview', label: 'Overview' },
    { id: 'section-valuation', label: 'Valuation' },
    { id: 'section-power', label: 'Power' },
    { id: 'section-broadband', label: 'Broadband' },
    { id: 'section-transport', label: 'Transport' },
    { id: 'section-water', label: 'Water' },
    { id: 'section-gas', label: 'Gas' },
  ];

  const flashSaveIndicator = useCallback(() => {
    setSaveVisible(true);
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => setSaveVisible(false), 2500);
  }, []);

  const report = usePiddrReport();

  // Intersection Observer for active section tracking
  useEffect(() => {
    if (!report.hasReport) return;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setActiveSection(entry.target.id);
          }
        }
      },
      { rootMargin: '-20% 0px -60% 0px', threshold: 0 },
    );
    const ids = REPORT_SECTIONS.map((s) => s.id);
    const timer = setTimeout(() => {
      for (const id of ids) {
        const el = document.getElementById(id);
        if (el) observer.observe(el);
      }
    }, 100);
    return () => {
      clearTimeout(timer);
      observer.disconnect();
    };
  }, [report.hasReport]); // eslint-disable-line react-hooks/exhaustive-deps

  const writebackDoneRef = useRef<number | null>(null);
  const autoCreateDoneRef = useRef<number | null>(null);
  const siteCreatingRef = useRef(false);

  const pdfExport = usePdfExport();
  const { sites: registrySites } = useSiteRegistry();
  const { logActivity, getToolHistory, loading: historyLoading } = useUserHistory();
  const recentEntries = getToolHistory('piddr');
  const { user, role } = useAuth();
  const {
    projects,
    createProject,
    renameProject,
  } = useProjects(user?.uid, role);

  const isAdmin = role === 'admin';

  // Debounced save of land comps to Firestore
  useEffect(() => {
    if (!selectedSiteId || landComps.length === 0) return;
    const timer = setTimeout(() => {
      saveLandCompsToSite(selectedSiteId, landComps)
        .then(() => flashSaveIndicator())
        .catch((err) => console.error('[PIDDR] Failed to save land comps:', err));
    }, 1000);
    return () => clearTimeout(timer);
  }, [selectedSiteId, landComps]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleFilteredCompsChange = useCallback((result: FilteredCompResult) => {
    const median = Math.round(result.medianPricePerAcre);
    setActiveCompCount(result.activeCount);
    setPpaLow(median);
    setPpaHigh(median);
    if (selectedSiteId && median > 0) {
      void updateSiteEntry(selectedSiteId, { dollarPerAcreLow: median, dollarPerAcreHigh: median })
        .then(() => flashSaveIndicator());
    }
  }, [selectedSiteId, flashSaveIndicator]);

  function handleDeleteProject(projectId: string) {
    void deleteProjectCascade(projectId).then(
      () => {
        if (activeProjectId === projectId) setActiveProjectId(null);
        console.log('[PIDDR] Deleted project:', projectId);
      },
      (err) => console.error('[PIDDR] Failed to delete project:', err),
    );
  }

  function handleDeleteSite(siteId: string) {
    void deleteSiteEntry(siteId).then(
      () => {
        if (selectedSiteId === siteId) {
          setSelectedSiteId(null);
          report.reset();
        }
        console.log('[PIDDR] Deleted site:', siteId);
      },
      (err) => console.error('[PIDDR] Failed to delete site:', err),
    );
  }

  // Log to history when report generation completes
  const historyLoggedRef = useRef<number | null>(null);
  useEffect(() => {
    if (report.isGenerating || !report.hasReport) return;
    if (historyLoggedRef.current === report.generatedAt) return;
    historyLoggedRef.current = report.generatedAt;
    logActivity('piddr', siteName || 'Untitled Site', address, 'Generated PIDDR report', selectedSiteId ?? undefined, {
      siteName, coordinates: coordinates.trim(), acreage, mw, ppaLow, ppaHigh,
    });
  }, [report.isGenerating, report.hasReport, report.generatedAt]); // eslint-disable-line react-hooks/exhaustive-deps

  // Write back results to site registry when report generation completes (for existing sites)
  useEffect(() => {
    if (!selectedSiteId || report.isGenerating || !report.hasReport) return;
    if (writebackDoneRef.current === report.generatedAt) return;
    writebackDoneRef.current = report.generatedAt;

    const promises: Promise<void>[] = [];
    if (report.appraisal.data) {
      promises.push(saveAppraisalToSite(selectedSiteId, report.appraisal.data));
    }
    if (report.infra.data) {
      promises.push(saveInfraToSite(selectedSiteId, report.infra.data as unknown as Record<string, unknown>));
    }
    if (report.broadband.data) {
      promises.push(saveBroadbandToSite(selectedSiteId, report.broadband.data));
    }
    if (report.transport.data) {
      promises.push(saveTransportToSite(selectedSiteId, report.transport.data as unknown as Record<string, unknown>));
    }
    if (report.water.data) {
      promises.push(saveWaterToSite(selectedSiteId, report.water.data as unknown as Record<string, unknown>));
    }
    if (report.gas.data) {
      promises.push(saveGasToSite(selectedSiteId, report.gas.data as unknown as Record<string, unknown>));
    }
    promises.push(savePiddrTimestamp(selectedSiteId));

    void Promise.all(promises).then(
      () => { console.log('[PIDDR] Results saved to site registry'); flashSaveIndicator(); },
      (err) => console.error('[PIDDR] Failed to save results:', err),
    );
  }, [selectedSiteId, report.isGenerating, report.hasReport, report.generatedAt, report.appraisal.data, report.infra.data, report.broadband.data, report.transport.data, report.water.data, report.gas.data]);

  // Auto-create a new registry entry when report completes for a new site (no match found)
  useEffect(() => {
    if (!user || !report.inputs || report.isGenerating || !report.hasReport) return;
    if (selectedSiteId || siteCreatingRef.current) return; // Already linked or creation in progress
    if (autoCreateDoneRef.current === report.generatedAt) return;
    autoCreateDoneRef.current = report.generatedAt;

    const coords = parseCoordinates(report.inputs.coordinates);
    void createSiteEntry({
      name: report.inputs.siteName,
      address: report.inputs.address,
      coordinates: coords ?? { lat: 0, lng: 0 },
      acreage: report.inputs.acreage,
      mwCapacity: report.inputs.mw,
      dollarPerAcreLow: report.inputs.ppaLow,
      dollarPerAcreHigh: report.inputs.ppaHigh,
      priorUsage: report.inputs.priorUsage || undefined,
      legalDescription: report.inputs.legalDescription || undefined,
      county: report.inputs.county || undefined,
      parcelId: report.inputs.parcelId || undefined,
      owner: report.inputs.owner || undefined,
      projectId: newSiteProjectId || activeProjectId || undefined,
      createdBy: user.uid,
      memberIds: [user.uid],
      appraisalResult: report.appraisal.data ?? null,
      infraResult: report.infra.data ? (report.infra.data as unknown as Record<string, unknown>) : null,
      broadbandResult: report.broadband.data ?? null,
      transportResult: report.transport.data ? (report.transport.data as unknown as Record<string, unknown>) : null,
      waterResult: report.water.data ? (report.water.data as unknown as Record<string, unknown>) : null,
      gasResult: report.gas.data ? (report.gas.data as unknown as Record<string, unknown>) : null,
      ...(landComps.length > 0 ? { landComps } : {}),
      piddrGeneratedAt: report.generatedAt ?? Date.now(),
    }).then(
      (newId) => {
        setSelectedSiteId(newId);
        setNewSiteProjectId(null);
        console.log('[PIDDR] New site auto-saved to registry:', newId);
        flashSaveIndicator();
      },
      (err) => console.error('[PIDDR] Failed to auto-save site:', err),
    );
  }, [user, selectedSiteId, newSiteProjectId, activeProjectId, report.inputs, report.isGenerating, report.hasReport, report.generatedAt, report.appraisal.data, report.infra.data, report.broadband.data, report.transport.data, report.water.data, report.gas.data]);

  function handleAddSiteToProject(projectId: string) {
    if (!user) return;

    // Determine default name based on existing sites in the folder
    const existingSites = registrySites.filter((s) => s.projectId === projectId);
    const defaultName = `Site ${existingSites.length + 1}`;

    // Guard against race condition with auto-create effect
    siteCreatingRef.current = true;

    // Create the site entry immediately in Firestore
    void createSiteEntry({
      name: defaultName,
      address: '',
      coordinates: { lat: 0, lng: 0 },
      acreage: 0,
      mwCapacity: 50,
      dollarPerAcreLow: 0,
      dollarPerAcreHigh: 0,
      projectId,
      createdBy: user.uid,
      memberIds: [user.uid],
    }).then(
      (newId) => {
        siteCreatingRef.current = false;
        setSelectedSiteId(newId);
        setMatchedExisting(false);
        setNewSiteProjectId(null);
        setActiveProjectId(projectId);
        setSiteName(defaultName);
        setAddress('');
        setCoordinates('');
        setAcreage(0);
        setMw(50);
        setPpaLow(0);
        setPpaHigh(0);
        setPriorUsage('');
        setLegalDescription('');
        setCounty('');
        setParcelId('');
        setOwner('');
        report.reset();
        console.log('[PIDDR] Created new site in folder:', newId, defaultName);
      },
      (err) => {
        siteCreatingRef.current = false;
        console.error('[PIDDR] Failed to create site:', err);
      },
    );
  }

  function handleSidebarSiteSelect(site: SiteRegistryEntry) {
    setSelectedSiteId(site.id);
    setMatchedExisting(true);
    setNewSiteProjectId(null);
    setSiteName(site.name);
    if (site.address) setAddress(site.address);
    if (site.coordinates) {
      setCoordinates(`${site.coordinates.lat}, ${site.coordinates.lng}`);
    }
    if (site.acreage) setAcreage(site.acreage);
    if (site.mwCapacity) setMw(site.mwCapacity);
    if (site.dollarPerAcreLow) setPpaLow(site.dollarPerAcreLow);
    if (site.dollarPerAcreHigh) setPpaHigh(site.dollarPerAcreHigh);
    if (site.priorUsage) setPriorUsage(site.priorUsage);
    if (site.legalDescription) setLegalDescription(site.legalDescription);
    if (site.county) setCounty(site.county);
    if (site.parcelId) setParcelId(site.parcelId);
    if (site.owner) setOwner(site.owner);
    if (site.projectId) setActiveProjectId(site.projectId);
    setLandComps(site.landComps ?? []);

    // If the site already has a report, re-generate using cached results
    if (site.piddrGeneratedAt && site.coordinates) {
      // Resolve customer/folder name
      let folderName: string | undefined;
      if (site.projectId) {
        const proj = projects.find((p) => p.id === site.projectId);
        if (proj) folderName = proj.name;
      }

      const inputs: PiddrInputs = {
        siteName: site.name || 'Untitled Site',
        customerName: folderName,
        address: site.address || '',
        coordinates: `${site.coordinates.lat}, ${site.coordinates.lng}`,
        acreage: site.acreage || 0,
        mw: site.mwCapacity || 50,
        ppaLow: site.dollarPerAcreLow || 0,
        ppaHigh: site.dollarPerAcreHigh || 0,
        priorUsage: site.priorUsage,
        legalDescription: site.legalDescription,
        county: site.county,
        parcelId: site.parcelId,
        owner: site.owner,
      };
      report.generateReport(inputs, {
        infra: site.infraResult,
        broadband: site.broadbandResult,
        transport: site.transportResult,
        water: site.waterResult,
        gas: site.gasResult,
      });
    } else {
      report.reset();
    }
  }

  function handleReplay(inputs: Record<string, unknown>) {
    const name = (inputs.siteName as string) || '';
    const coords = (inputs.coordinates as string) || '';
    const ac = (inputs.acreage as number) || 0;
    const mwVal = (inputs.mw as number) || 50;
    const low = (inputs.ppaLow as number) || 0;
    const high = (inputs.ppaHigh as number) || 0;
    setSiteName(name);
    setCoordinates(coords);
    setAcreage(ac);
    setMw(mwVal);
    setPpaLow(low);
    setPpaHigh(high);
  }

  const canExportPdf = report.hasReport && !report.isGenerating && report.inputs && report.generatedAt;

  const generateLockRef = useRef(false);
  const canGenerate = !report.isGenerating && !generateLockRef.current && coordinates.trim() !== '';

  function handleGenerate() {
    if (!canGenerate) return;
    generateLockRef.current = true;
    // Unlock after a short delay to prevent double-clicks / rapid Enter key
    setTimeout(() => { generateLockRef.current = false; }, 1000);

    // Resolve customer/folder name from project
    let customerName: string | undefined;
    if (selectedSiteId) {
      const site = registrySites.find((rs) => rs.id === selectedSiteId);
      if (site?.projectId) {
        const project = projects.find((p) => p.id === site.projectId);
        if (project) customerName = project.name;
      }
    } else {
      const pid = newSiteProjectId || activeProjectId;
      if (pid) {
        const project = projects.find((p) => p.id === pid);
        if (project) customerName = project.name;
      }
    }

    const inputs: PiddrInputs = {
      siteName: siteName.trim() || 'Untitled Site',
      customerName,
      address: address.trim(),
      coordinates: coordinates.trim(),
      acreage,
      mw,
      ppaLow,
      ppaHigh,
      priorUsage: priorUsage.trim() || undefined,
      legalDescription: legalDescription.trim() || undefined,
      county: county.trim() || undefined,
      parcelId: parcelId.trim() || undefined,
      owner: owner.trim() || undefined,
    };

    // If a site was already selected from the sidebar, use it directly
    // Only do coordinate matching for manual entry (no selectedSiteId)
    let existing: ExistingResults | undefined;

    if (selectedSiteId) {
      // Already linked — use cached results from the selected site
      const site = registrySites.find((s) => s.id === selectedSiteId);
      if (site) {
        existing = {
          infra: site.infraResult,
          broadband: site.broadbandResult,
          water: site.waterResult,
          gas: site.gasResult,
        };
        // Update site details with any edits from the form
        const updates: Record<string, unknown> = {};
        if (inputs.siteName && inputs.siteName !== 'Untitled Site') updates.name = inputs.siteName;
        if (inputs.address) updates.address = inputs.address;
        const parsedCoords = parseCoordinates(inputs.coordinates);
        if (parsedCoords) updates.coordinates = parsedCoords;
        if (inputs.acreage > 0) updates.acreage = inputs.acreage;
        if (inputs.mw > 0) updates.mwCapacity = inputs.mw;
        if (inputs.ppaLow > 0) updates.dollarPerAcreLow = inputs.ppaLow;
        if (inputs.ppaHigh > 0) updates.dollarPerAcreHigh = inputs.ppaHigh;
        if (inputs.priorUsage) updates.priorUsage = inputs.priorUsage;
        if (inputs.legalDescription) updates.legalDescription = inputs.legalDescription;
        if (inputs.county) updates.county = inputs.county;
        if (inputs.parcelId) updates.parcelId = inputs.parcelId;
        if (inputs.owner) updates.owner = inputs.owner;
        if (Object.keys(updates).length > 0) {
          void updateSiteEntry(selectedSiteId, updates).then(() => flashSaveIndicator());
        }
        console.log('[PIDDR] Using selected site:', site.name, site.id);
      }
    } else if (!newSiteProjectId) {
      // Manual entry (not from "Add Site" in folder) — try to match by coordinates
      const coords = parseCoordinates(coordinates.trim());
      if (coords) {
        const match = findSiteByCoordinates(registrySites, coords.lat, coords.lng);
        if (match) {
          setSelectedSiteId(match.id);
          setMatchedExisting(true);
          existing = {
            infra: match.infraResult,
            broadband: match.broadbandResult,
            transport: match.transportResult,
            water: match.waterResult,
            gas: match.gasResult,
          };
          console.log('[PIDDR] Matched existing site:', match.name, match.id);
        }
        // If no match, selectedSiteId stays null → auto-create after generation
      }
    }

    report.generateReport(inputs, existing);
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
      <div className="flex" style={{ minHeight: 'calc(100vh - 120px)' }}>
        {/* Desktop sidebar */}
        <PiddrSidebar
          projects={projects}
          sites={registrySites}
          activeProjectId={activeProjectId}
          activeSiteId={selectedSiteId}
          onSelectSite={handleSidebarSiteSelect}
          onSelectProject={setActiveProjectId}
          collapsed={sidebarCollapsed}
          onToggleCollapse={() => setSidebarCollapsed(!sidebarCollapsed)}
          isAdmin={isAdmin}
          onCreateProject={createProject}
          onDeleteProject={handleDeleteProject}
          onDeleteSite={handleDeleteSite}
          onAddSite={handleAddSiteToProject}
          onRenameProject={renameProject}
        />

        {/* Mobile sidebar overlay */}
        <AnimatePresence>
          {mobileSidebarOpen && (
            <PiddrSidebar
              projects={projects}
              sites={registrySites}
              activeProjectId={activeProjectId}
              activeSiteId={selectedSiteId}
              onSelectSite={handleSidebarSiteSelect}
              onSelectProject={setActiveProjectId}
              collapsed={false}
              onToggleCollapse={() => setMobileSidebarOpen(false)}
              isAdmin={isAdmin}
              onCreateProject={createProject}
              onDeleteProject={handleDeleteProject}
              onDeleteSite={handleDeleteSite}
              onAddSite={handleAddSiteToProject}
              isMobile
            />
          )}
        </AnimatePresence>

        {/* Main content */}
        <main ref={mainRef} className="flex-1 overflow-y-auto py-6 max-w-5xl mx-auto px-4">
          {/* Floating section nav — left side */}
          <AnimatePresence>
            {report.hasReport && (
              <motion.div
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ duration: 0.3 }}
                className="hidden lg:flex fixed left-4 bottom-8 z-40 flex-col items-start gap-1"
              >
                {/* Save indicator */}
                <AnimatePresence>
                  {saveVisible && (
                    <motion.div
                      initial={{ opacity: 0, y: -8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -8 }}
                      transition={{ duration: 0.3 }}
                      className="mb-3 flex items-center gap-1.5 rounded-full bg-[#ED202B]/90 px-3 py-1.5 text-[11px] font-medium text-white shadow-lg backdrop-blur-sm"
                    >
                      <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                      </svg>
                      Saved
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* Section dots */}
                {REPORT_SECTIONS.map((s) => (
                  <button
                    key={s.id}
                    onClick={() => document.getElementById(s.id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
                    className="group flex items-center gap-2 py-1.5"
                  >
                    <span
                      className={`block h-2.5 w-2.5 rounded-full transition-all duration-200 ${
                        activeSection === s.id
                          ? 'bg-[#ED202B] scale-125 shadow-sm shadow-[#ED202B]/30'
                          : 'bg-[#ED202B]/25 group-hover:bg-[#ED202B]/50'
                      }`}
                    />
                    <span
                      className={`text-[11px] font-medium transition-all duration-200 whitespace-nowrap ${
                        activeSection === s.id
                          ? 'text-[#ED202B] opacity-100 translate-x-0'
                          : 'text-[#ED202B]/40 opacity-0 -translate-x-1 group-hover:opacity-100 group-hover:translate-x-0 group-hover:text-[#ED202B]/70'
                      }`}
                    >
                      {s.label}
                    </span>
                  </button>
                ))}
              </motion.div>
            )}
          </AnimatePresence>
          {/* Mobile toggle button */}
          <button
            onClick={() => setMobileSidebarOpen(true)}
            className="md:hidden flex items-center gap-2 mb-4 text-sm text-[#7A756E] hover:text-[#201F1E] transition"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25H12" />
            </svg>
            Projects
          </button>

          {/* Page Header */}
          <div className="mb-6">
            <h1 className="font-heading text-2xl font-semibold text-[#201F1E]">
              Power Infrastructure Due Diligence Report
            </h1>
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

              <Field label="Coordinates">
                <input
                  type="text"
                  className={inputClass}
                  value={coordinates}
                  onChange={(e) => setCoordinates(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder={'28\u00B039\'22.0"N 98\u00B050\'38.3"W'}
                />
              </Field>

              <Field label="Address">
                <input
                  type="text"
                  className={inputClass}
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="e.g. 13850 Cottage Grove Ave, Dolton, IL 60419"
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

              {landComps.length > 0 ? (
                <Field label="$/Acre (from comps)">
                  <input
                    type="number"
                    className={`${inputClass} bg-stone-100 cursor-not-allowed`}
                    value={ppaLow || ''}
                    readOnly
                    tabIndex={-1}
                  />
                </Field>
              ) : (
                <>
                  <Field label="$/Acre Low">
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

                  <Field label="$/Acre High">
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
                </>
              )}
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
            <div className="mt-6 flex items-center gap-4 flex-wrap">
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
                        transport: report.transport.data,
                        water: report.water.data,
                        gas: report.gas.data,
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

          {/* Property Details (Due Diligence) */}
          <div className="bg-white rounded-2xl border border-[#D8D5D0] p-5 md:p-6 mb-6">
            <h3 className="font-heading text-base font-semibold text-[#201F1E] mb-5">
              Property Details
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <Field label="Prior Usage / Property Type">
                <input
                  type="text"
                  className={inputClass}
                  value={priorUsage}
                  onChange={(e) => setPriorUsage(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="e.g. Agricultural, Vacant, Ranch"
                />
              </Field>

              <Field label="Legal Description">
                <input
                  type="text"
                  className={inputClass}
                  value={legalDescription}
                  onChange={(e) => setLegalDescription(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Lot 1, Block 2, Section 14"
                />
              </Field>

              <Field label="County">
                <input
                  type="text"
                  className={inputClass}
                  value={county}
                  onChange={(e) => setCounty(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Laramie County, WY"
                />
              </Field>

              <Field label="Parcel ID">
                <input
                  type="text"
                  className={inputClass}
                  value={parcelId}
                  onChange={(e) => setParcelId(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="00014006623014"
                />
              </Field>

              <Field label="Owner">
                <input
                  type="text"
                  className={inputClass}
                  value={owner}
                  onChange={(e) => setOwner(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="John Doe"
                />
              </Field>
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
                  { label: 'Transport', state: getSectionState(report.transport) },
                  { label: 'Water', state: getSectionState(report.water) },
                  { label: 'Gas', state: getSectionState(report.gas) },
                ]}
              />

              {/* Section 1: Site Overview */}
              <div id="section-overview">
              <SiteOverviewSection
                address={report.inputs.address}
                coordinates={report.inputs.coordinates}
                acreage={report.inputs.acreage}
                mw={report.inputs.mw}
                priorUsage={report.inputs.priorUsage}
                legalDescription={report.inputs.legalDescription}
                county={report.inputs.county}
                parcelId={report.inputs.parcelId}
                owner={report.inputs.owner}
              />
              </div>

              {/* Section 2: Land Valuation */}
              <div id="section-valuation">
              <LandValuationSection
                section={report.appraisal}
                inputs={report.inputs}
                mw={mw}
                mwMin={MW_MIN}
                mwMax={MW_MAX}
                onMwChange={setMw}
                landComps={landComps}
                onLandCompsChange={setLandComps}
                onFilteredCompsChange={handleFilteredCompsChange}
                activeCompCount={activeCompCount}
              />
              </div>

              {/* Section 3: Power Infrastructure */}
              <div id="section-power" className="bg-white rounded-2xl border border-[#D8D5D0] p-5 md:p-6">
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
              <div id="section-broadband">
                <BroadbandSection section={report.broadband} />
              </div>

              {/* Section 5: Transport Infrastructure */}
              <div id="section-transport">
                <TransportSection section={report.transport} />
              </div>

              {/* Section 6: Water Analysis */}
              <div id="section-water">
                <WaterSection section={report.water} />
              </div>

              {/* Section 7: Gas Infrastructure */}
              <div id="section-gas">
                <GasSection section={report.gas} />
              </div>
            </div>
          )}

          {/* Empty State with recent history */}
          {!report.hasReport && !report.isGenerating && (
            <RecentHistory
              entries={recentEntries}
              loading={historyLoading}
              icon={
                <svg className="h-8 w-8 text-[#ED202B]" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                </svg>
              }
              emptyMessage={
                <>
                  <h3 className="font-heading text-lg font-semibold text-[#201F1E] mb-1">
                    Power Infrastructure Due Diligence Report
                  </h3>
                  <p className="max-w-md mx-auto">
                    Enter site details above and click <strong>Generate Report</strong> to create a comprehensive due diligence report covering land valuation, power infrastructure, and broadband connectivity.
                  </p>
                </>
              }
              onReplay={handleReplay}
            />
          )}
        </main>
      </div>
    </Layout>
  );
}
