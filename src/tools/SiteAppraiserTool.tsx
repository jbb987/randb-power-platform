import { AnimatePresence } from 'framer-motion';
import { useAppraisal } from '../hooks/useAppraisal';
import { useSites } from '../hooks/useSites';
import { useProjects } from '../hooks/useProjects';
import Layout from '../components/Layout';
import ProjectSidebar from '../components/appraiser/ProjectSidebar';
import SiteDetailPanel from '../components/appraiser/SiteDetailPanel';
import ProjectOverview from '../components/appraiser/ProjectOverview';
import { useState, useEffect, useCallback } from 'react';
import type { SiteInputs } from '../types';

const emptyInputs: SiteInputs = {
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

type View = 'project-overview' | 'site-detail';

export default function SiteAppraiserTool() {
  const {
    sites,
    activeSite,
    loading: sitesLoading,
    updateInputs,
    updateMW,
    createSite,
    switchSite,
    moveSite,
  } = useSites();

  const {
    projects,
    activeProjectId,
    loading: projectsLoading,
    createProject,
    deleteProject,
    renameProject,
    selectProject,
  } = useProjects();

  const [view, setView] = useState<View>('project-overview');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  const loading = sitesLoading || projectsLoading;
  const inputs = activeSite?.inputs ?? emptyInputs;
  const result = useAppraisal(inputs);

  const activeProject = projects.find((p) => p.id === activeProjectId);
  const projectSites = sites.filter((s) => s.inputs.projectId === activeProjectId);

  const handleSelectProject = useCallback((id: string) => {
    selectProject(id);
    setView('project-overview');
  }, [selectProject]);

  const handleSelectSite = useCallback((id: string) => {
    const site = sites.find((s) => s.id === id);
    if (site) {
      selectProject(site.inputs.projectId);
      switchSite(id);
      setView('site-detail');
    }
  }, [sites, selectProject, switchSite]);

  const handleDeleteProject = useCallback((id: string) => {
    // Move orphaned sites to another project before deleting
    const otherProject = projects.find((p) => p.id !== id);
    if (otherProject) {
      const orphanedSites = sites.filter((s) => s.inputs.projectId === id);
      for (const site of orphanedSites) {
        moveSite(site.id, otherProject.id);
      }
    }
    deleteProject(id);
  }, [projects, sites, moveSite, deleteProject]);

  const handleCreateSite = useCallback((projectId: string) => {
    const id = createSite('New Site', projectId);
    selectProject(projectId);
    setView('site-detail');
    return id;
  }, [createSite, selectProject]);

  // Auto-create first site if database is empty
  useEffect(() => {
    if (!loading && sites.length === 0 && projects.length > 0) {
      createSite('New Site', projects[0].id);
    }
  }, [loading, sites.length, projects.length, createSite, projects]);

  if (loading) {
    return (
      <Layout>
        <div className="flex items-center justify-center h-[60vh]">
          <div className="flex flex-col items-center gap-3">
            <div className="h-8 w-8 animate-spin rounded-full border-[3px] border-[#D8D5D0] border-t-[#ED202B]" />
            <span className="text-sm text-[#7A756E]">Loading...</span>
          </div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout fullWidth>
      <div className="flex" style={{ minHeight: 'calc(100vh - 120px)' }}>
        {/* Desktop sidebar */}
        <ProjectSidebar
          projects={projects}
          sites={sites}
          activeProjectId={activeProjectId}
          onSelectProject={handleSelectProject}
          onCreateProject={createProject}
          onCreateSite={handleCreateSite}
          onDeleteProject={handleDeleteProject}
          onRenameProject={renameProject}
          collapsed={sidebarCollapsed}
          onToggleCollapse={() => setSidebarCollapsed(!sidebarCollapsed)}
        />

        {/* Mobile sidebar overlay */}
        <AnimatePresence>
          {mobileSidebarOpen && (
            <ProjectSidebar
              projects={projects}
              sites={sites}
              activeProjectId={activeProjectId}
              onSelectProject={handleSelectProject}
              onCreateProject={createProject}
              onCreateSite={handleCreateSite}
              onDeleteProject={handleDeleteProject}
              onRenameProject={renameProject}
              collapsed={false}
              onToggleCollapse={() => setMobileSidebarOpen(false)}
              isMobile
            />
          )}
        </AnimatePresence>

        {/* Main content */}
        <main className="flex-1 overflow-y-auto p-4 md:p-6">
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

          {view === 'project-overview' && activeProject ? (
            <ProjectOverview
              project={activeProject}
              sites={projectSites}
              onSelectSite={handleSelectSite}
              onCreateSite={() => handleCreateSite(activeProjectId)}
            />
          ) : view === 'site-detail' && activeSite ? (
            <SiteDetailPanel
              inputs={inputs}
              result={result}
              onMWChange={updateMW}
              onInputsChange={updateInputs}
            />
          ) : (
            <div className="flex items-center justify-center h-full text-sm text-[#7A756E]">
              Select a project or site from the sidebar
            </div>
          )}
        </main>
      </div>
    </Layout>
  );
}
