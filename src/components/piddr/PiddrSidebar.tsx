import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { Project, SiteRegistryEntry } from '../../types';

interface Props {
  projects: Project[];
  sites: SiteRegistryEntry[];
  activeProjectId: string | null;
  activeSiteId: string | null;
  onSelectSite: (site: SiteRegistryEntry) => void;
  onSelectProject: (projectId: string) => void;
  collapsed: boolean;
  onToggleCollapse: () => void;
  isAdmin: boolean;
  onCreateProject: (name: string) => void;
  onDeleteProject?: (projectId: string) => void;
  onDeleteSite?: (siteId: string) => void;
  isMobile?: boolean;
}

export default function PiddrSidebar({
  projects,
  sites,
  activeProjectId,
  activeSiteId,
  onSelectSite,
  onSelectProject,
  collapsed,
  onToggleCollapse,
  isAdmin,
  onCreateProject,
  onDeleteProject,
  onDeleteSite,
  isMobile,
}: Props) {
  const [newProjectName, setNewProjectName] = useState('');
  const [showNewProject, setShowNewProject] = useState(false);
  const [expandedProjects, setExpandedProjects] = useState<Set<string>>(
    () => new Set(activeProjectId ? [activeProjectId] : []),
  );

  const sitesForProject = (projectId: string) =>
    sites.filter((s) => s.projectId === projectId);

  const unsortedSites = sites.filter(
    (s) => !s.projectId || !projects.some((p) => p.id === s.projectId),
  );

  const toggleExpanded = (projectId: string) => {
    setExpandedProjects((prev) => {
      const next = new Set(prev);
      if (next.has(projectId)) {
        next.delete(projectId);
      } else {
        next.add(projectId);
      }
      return next;
    });
  };

  const handleCreateProject = () => {
    const name = newProjectName.trim();
    if (!name) return;
    onCreateProject(name);
    setNewProjectName('');
    setShowNewProject(false);
  };

  // Desktop collapsed state — just a thin expand strip
  if (collapsed && !isMobile) {
    return (
      <button
        onClick={onToggleCollapse}
        className="hidden md:flex flex-shrink-0 w-8 items-start justify-center pt-4 opacity-40 hover:opacity-100 transition"
        title="Expand sidebar"
      >
        <svg className="w-4 h-4 text-[#7A756E]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
        </svg>
      </button>
    );
  }

  const sidebarContent = (
    <div className={`flex flex-col h-full ${isMobile ? 'w-72' : 'w-60'}`}>
      {/* Header */}
      <div className="flex items-center gap-2 px-4 pt-4 pb-3">
        <h3 className="text-[11px] font-semibold uppercase tracking-wider text-[#7A756E] flex-1">
          Projects
        </h3>

        {/* New project button (admin only) */}
        {isAdmin && !showNewProject && (
          <button
            onClick={() => setShowNewProject(true)}
            className="p-1 rounded-md hover:bg-[#D8D5D0]/50 transition"
            title="New project"
          >
            <svg className="w-3.5 h-3.5 text-[#7A756E]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
          </button>
        )}

        {!isMobile && (
          <button
            onClick={onToggleCollapse}
            className="p-1 rounded-md hover:bg-[#D8D5D0]/50 transition"
            title="Collapse sidebar"
          >
            <svg className="w-3.5 h-3.5 text-[#7A756E]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
          </button>
        )}

        {isMobile && (
          <button
            onClick={onToggleCollapse}
            className="p-1 rounded-md hover:bg-[#D8D5D0]/50 transition"
            title="Close"
          >
            <svg className="w-4 h-4 text-[#7A756E]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>

      {/* Inline new project form (admin only) */}
      <AnimatePresence>
        {isAdmin && showNewProject && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="overflow-hidden px-4 pb-2"
          >
            <div className="flex gap-1.5">
              <input
                type="text"
                value={newProjectName}
                onChange={(e) => setNewProjectName(e.target.value)}
                onBlur={() => {
                  if (!newProjectName.trim()) {
                    setShowNewProject(false);
                    setNewProjectName('');
                  }
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleCreateProject();
                  if (e.key === 'Escape') {
                    setShowNewProject(false);
                    setNewProjectName('');
                  }
                }}
                placeholder="Project name..."
                autoFocus
                className="flex-1 rounded-md border border-[#D8D5D0] bg-white px-2.5 py-1.5 text-sm text-[#201F1E] placeholder:text-[#7A756E] focus:outline-none focus:ring-2 focus:ring-[#ED202B]/20 focus:border-[#ED202B]"
              />
              <button
                onClick={handleCreateProject}
                disabled={!newProjectName.trim()}
                className="rounded-md bg-white text-[#ED202B] border border-[#ED202B] hover:bg-[#ED202B] hover:text-white px-3 py-1.5 text-xs font-medium transition disabled:opacity-40"
              >
                Add
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Project list with sites */}
      <div className="flex-1 overflow-y-auto pt-1 pb-4">
        {projects.map((project) => {
          const projectSites = sitesForProject(project.id);
          const isExpanded = expandedProjects.has(project.id);
          const isActiveProject = project.id === activeProjectId;

          return (
            <div key={project.id} className="mb-0.5">
              {/* Project header */}
              <div
                className={`group flex items-center gap-1.5 px-3 py-2 cursor-pointer rounded-lg mx-2 transition-all ${
                  isActiveProject
                    ? 'bg-white/60 shadow-sm'
                    : 'hover:bg-white/40'
                }`}
                onClick={() => {
                  toggleExpanded(project.id);
                  onSelectProject(project.id);
                }}
              >
                {/* Chevron */}
                <svg
                  className={`w-3 h-3 text-[#7A756E] flex-shrink-0 transition-transform ${
                    isExpanded ? 'rotate-90' : ''
                  }`}
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                </svg>

                <span className="flex-1 text-left text-[13px] font-medium text-[#201F1E] truncate" title={project.name}>
                  {project.name}
                </span>

                <span className="text-[10px] text-[#7A756E] flex-shrink-0 tabular-nums">
                  {projectSites.length}
                </span>

                {isAdmin && onDeleteProject && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      if (confirm(`Delete project "${project.name}" and unlink its sites?`)) {
                        onDeleteProject(project.id);
                      }
                    }}
                    className="p-0.5 rounded opacity-0 group-hover:opacity-60 hover:!opacity-100 hover:text-[#ED202B] transition"
                    title="Delete project"
                  >
                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                )}
              </div>

              {/* Expanded site list */}
              <AnimatePresence>
                {isExpanded && projectSites.length > 0 && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.15 }}
                    className="overflow-hidden"
                  >
                    {projectSites.map((site) => (
                      <div
                        key={site.id}
                        className={`group/site flex items-center pl-9 pr-3 py-1.5 mx-2 rounded-md text-[12px] transition-all ${
                          activeSiteId === site.id
                            ? 'bg-[#ED202B]/10 text-[#ED202B] font-medium'
                            : 'text-[#7A756E] hover:text-[#201F1E] hover:bg-white/40'
                        }`}
                        style={{ maxWidth: 'calc(100% - 16px)' }}
                      >
                        <button
                          onClick={() => {
                            onSelectSite(site);
                            if (isMobile) onToggleCollapse();
                          }}
                          className="flex-1 text-left truncate"
                          title={site.name}
                        >
                          {site.name}
                        </button>
                        {onDeleteSite && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              if (confirm(`Delete site "${site.name}"?`)) {
                                onDeleteSite(site.id);
                              }
                            }}
                            className="p-0.5 rounded opacity-0 group-hover/site:opacity-60 hover:!opacity-100 hover:text-[#ED202B] transition shrink-0"
                            title="Delete site"
                          >
                            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                          </button>
                        )}
                      </div>
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          );
        })}

        {/* Unsorted group */}
        {unsortedSites.length > 0 && (
          <div className="mb-0.5">
            <div
              className={`group flex items-center gap-1.5 px-3 py-2 cursor-pointer rounded-lg mx-2 transition-all ${
                activeProjectId === null
                  ? 'bg-white/60 shadow-sm'
                  : 'hover:bg-white/40'
              }`}
              onClick={() => {
                setExpandedProjects((prev) => {
                  const next = new Set(prev);
                  if (next.has('__unsorted__')) {
                    next.delete('__unsorted__');
                  } else {
                    next.add('__unsorted__');
                  }
                  return next;
                });
              }}
            >
              <svg
                className={`w-3 h-3 text-[#7A756E] flex-shrink-0 transition-transform ${
                  expandedProjects.has('__unsorted__') ? 'rotate-90' : ''
                }`}
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              </svg>

              <span className="flex-1 text-left text-[13px] font-medium text-[#7A756E] italic truncate">
                Unsorted
              </span>

              <span className="text-[10px] text-[#7A756E] flex-shrink-0 tabular-nums">
                {unsortedSites.length}
              </span>
            </div>

            <AnimatePresence>
              {expandedProjects.has('__unsorted__') && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.15 }}
                  className="overflow-hidden"
                >
                  {unsortedSites.map((site) => (
                    <div
                      key={site.id}
                      className={`group/site flex items-center pl-9 pr-3 py-1.5 mx-2 rounded-md text-[12px] transition-all ${
                        activeSiteId === site.id
                          ? 'bg-[#ED202B]/10 text-[#ED202B] font-medium'
                          : 'text-[#7A756E] hover:text-[#201F1E] hover:bg-white/40'
                      }`}
                      style={{ maxWidth: 'calc(100% - 16px)' }}
                    >
                      <button
                        onClick={() => {
                          onSelectSite(site);
                          if (isMobile) onToggleCollapse();
                        }}
                        className="flex-1 text-left truncate"
                        title={site.name}
                      >
                        {site.name}
                      </button>
                      {onDeleteSite && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            if (confirm(`Delete site "${site.name}"?`)) {
                              onDeleteSite(site.id);
                            }
                          }}
                          className="p-0.5 rounded opacity-0 group-hover/site:opacity-60 hover:!opacity-100 hover:text-[#ED202B] transition shrink-0"
                          title="Delete site"
                        >
                          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                      )}
                    </div>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}

        {/* Empty state */}
        {projects.length === 0 && unsortedSites.length === 0 && (
          <div className="px-4 py-8 text-center">
            <p className="text-xs text-[#7A756E]">No projects yet.</p>
          </div>
        )}
      </div>
    </div>
  );

  // Mobile: overlay
  if (isMobile) {
    return (
      <>
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 bg-black/20 z-40"
          onClick={onToggleCollapse}
        />
        <motion.div
          initial={{ x: '-100%' }}
          animate={{ x: 0 }}
          exit={{ x: '-100%' }}
          transition={{ type: 'spring', stiffness: 400, damping: 35 }}
          className="fixed inset-y-0 left-0 z-50 bg-[#FAFAF9] shadow-xl"
        >
          {sidebarContent}
        </motion.div>
      </>
    );
  }

  // Desktop: inline
  return (
    <div className="hidden md:flex flex-shrink-0">
      {sidebarContent}
    </div>
  );
}
