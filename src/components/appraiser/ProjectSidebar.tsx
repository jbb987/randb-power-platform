import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { Project, SavedSite } from '../../types';

interface Props {
  projects: Project[];
  sites: SavedSite[];
  activeProjectId: string;
  activeSiteId: string;
  onSelectProject: (id: string) => void;
  onSelectSite: (id: string) => void;
  onCreateProject: (name: string) => void;
  onCreateSite: (projectId: string) => void;
  onDeleteProject: (id: string) => void;
  onDeleteSite: (id: string) => void;
  onRenameProject: (id: string, name: string) => void;
  onMoveSite: (siteId: string, targetProjectId: string) => void;
  collapsed: boolean;
  onToggleCollapse: () => void;
  isMobile?: boolean;
}

export default function ProjectSidebar({
  projects,
  sites,
  activeProjectId,
  activeSiteId,
  onSelectProject,
  onSelectSite,
  onCreateProject,
  onCreateSite,
  onDeleteProject,
  onDeleteSite,
  onRenameProject,
  onMoveSite,
  collapsed,
  onToggleCollapse,
  isMobile,
}: Props) {
  const [expandedProjects, setExpandedProjects] = useState<Set<string>>(
    () => new Set(projects.map((p) => p.id)),
  );
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [newProjectName, setNewProjectName] = useState('');
  const [showNewProject, setShowNewProject] = useState(false);
  const [renamingProjectId, setRenamingProjectId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [dragOverProjectId, setDragOverProjectId] = useState<string | null>(null);

  const toggleExpand = (id: string) => {
    setExpandedProjects((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const sitesForProject = (projectId: string) =>
    sites.filter((s) => s.inputs.projectId === projectId);

  const handleCreateProject = () => {
    const name = newProjectName.trim();
    if (!name) return;
    onCreateProject(name);
    setNewProjectName('');
    setShowNewProject(false);
  };

  const handleDelete = (type: 'project' | 'site', id: string) => {
    if (confirmDelete === id) {
      if (type === 'project') onDeleteProject(id);
      else onDeleteSite(id);
      setConfirmDelete(null);
    } else {
      setConfirmDelete(id);
      setTimeout(() => setConfirmDelete(null), 3000);
    }
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
      {/* Header — Projects + New + Collapse */}
      <div className="flex items-center gap-2 px-4 pt-4 pb-3">
        <h3 className="text-[11px] font-semibold uppercase tracking-wider text-[#B5B0A8] flex-1">
          Projects
        </h3>

        {/* New project inline form or + button */}
        {showNewProject ? null : (
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

      {/* Inline new project form */}
      <AnimatePresence>
        {showNewProject && (
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
                className="flex-1 rounded-md border border-[#D8D5D0] bg-white px-2.5 py-1.5 text-sm text-[#201F1E] placeholder:text-[#B5B0A8] focus:outline-none focus:ring-1 focus:ring-[#C1121F]/20 focus:border-[#C1121F]"
              />
              <button
                onClick={handleCreateProject}
                disabled={!newProjectName.trim()}
                className="rounded-md bg-[#C1121F] px-3 py-1.5 text-xs font-medium text-white hover:bg-[#A10E1A] transition disabled:opacity-40"
              >
                Add
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Project list */}
      <div className="flex-1 overflow-y-auto pt-1 pb-4">
        {projects.map((project) => {
          const projectSites = sitesForProject(project.id);
          const isExpanded = expandedProjects.has(project.id);
          const isActiveProject = project.id === activeProjectId && !activeSiteId;

          return (
            <div key={project.id} className="mb-0.5">
              {/* Project row — also a drop target for sites */}
              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  e.dataTransfer.dropEffect = 'move';
                  setDragOverProjectId(project.id);
                }}
                onDragLeave={() => setDragOverProjectId(null)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragOverProjectId(null);
                  const siteId = e.dataTransfer.getData('text/plain');
                  if (siteId) onMoveSite(siteId, project.id);
                }}
                className={`group flex items-center gap-1.5 px-3 py-2 cursor-pointer rounded-lg mx-2 transition-all ${
                  dragOverProjectId === project.id
                    ? 'bg-[#C1121F]/10 ring-1 ring-[#C1121F]/30'
                    : isActiveProject
                      ? 'bg-white/60 shadow-sm'
                      : 'hover:bg-white/40'
                }`}
              >
                <button
                  onClick={() => toggleExpand(project.id)}
                  className="p-0.5 flex-shrink-0"
                >
                  <motion.svg
                    animate={{ rotate: isExpanded ? 90 : 0 }}
                    transition={{ duration: 0.15 }}
                    className="w-3 h-3 text-[#B5B0A8]"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2.5}
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                  </motion.svg>
                </button>

                {renamingProjectId === project.id ? (
                  <input
                    type="text"
                    value={renameValue}
                    onChange={(e) => setRenameValue(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        const trimmed = renameValue.trim();
                        if (trimmed && trimmed !== project.name) onRenameProject(project.id, trimmed);
                        setRenamingProjectId(null);
                      }
                      if (e.key === 'Escape') setRenamingProjectId(null);
                    }}
                    onBlur={() => {
                      const trimmed = renameValue.trim();
                      if (trimmed && trimmed !== project.name) onRenameProject(project.id, trimmed);
                      setRenamingProjectId(null);
                    }}
                    autoFocus
                    className="flex-1 text-[13px] font-medium text-[#201F1E] bg-white rounded px-1.5 py-0.5 border border-[#D8D5D0] outline-none focus:border-[#C1121F]"
                  />
                ) : (
                  <button
                    onClick={() => {
                      onSelectProject(project.id);
                      if (isMobile) onToggleCollapse();
                    }}
                    className="flex-1 text-left text-[13px] font-medium text-[#201F1E] truncate"
                    title={project.name}
                  >
                    {project.name}
                  </button>
                )}

                <span className="text-[10px] text-[#B5B0A8] flex-shrink-0 tabular-nums">
                  {projectSites.length}
                </span>

                {/* Actions — always visible */}
                <div className="flex items-center gap-0.5">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onCreateSite(project.id);
                    }}
                    className="p-0.5 rounded hover:bg-[#D8D5D0]/60 transition"
                    title="Add site"
                  >
                    <svg className="w-3 h-3 text-[#7A756E]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                    </svg>
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setRenameValue(project.name);
                      setRenamingProjectId(project.id);
                    }}
                    className="p-0.5 rounded hover:bg-[#D8D5D0]/60 transition text-[#7A756E]"
                    title="Rename project"
                  >
                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                    </svg>
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDelete('project', project.id);
                    }}
                    className={`p-0.5 rounded transition ${
                      confirmDelete === project.id
                        ? 'text-[#C1121F]'
                        : 'hover:bg-[#D8D5D0]/60 text-[#7A756E]'
                    }`}
                    title={confirmDelete === project.id ? 'Click again to confirm' : 'Delete project'}
                  >
                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                </div>
              </div>

              {/* Sites under project */}
              <AnimatePresence initial={false}>
                {isExpanded && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.15 }}
                    className="overflow-hidden"
                  >
                    {projectSites.map((site) => {
                      const isActive = site.id === activeSiteId;
                      return (
                        <button
                          key={site.id}
                          draggable
                          onDragStart={(e) => {
                            e.dataTransfer.setData('text/plain', site.id);
                            e.dataTransfer.effectAllowed = 'move';
                          }}
                          onClick={() => {
                            onSelectSite(site.id);
                            if (isMobile) onToggleCollapse();
                          }}
                          className={`group w-full flex items-center gap-2 pl-9 pr-3 py-1.5 text-left rounded-lg mx-2 transition-all cursor-grab active:cursor-grabbing ${
                            isActive
                              ? 'bg-white/60 shadow-sm'
                              : 'hover:bg-white/40'
                          }`}
                        >
                          {/* Active indicator */}
                          <div
                            className={`w-1 h-1 rounded-full flex-shrink-0 transition-colors ${
                              isActive ? 'bg-[#C1121F]' : 'bg-[#D8D5D0]'
                            }`}
                          />

                          <span
                            className={`flex-1 text-[13px] truncate transition-colors ${
                              isActive ? 'text-[#C1121F] font-medium' : 'text-[#7A756E]'
                            }`}
                          >
                            {site.inputs.siteName || 'Untitled Site'}
                          </span>

                          {/* Site delete */}
                          <span
                            role="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDelete('site', site.id);
                            }}
                            className={`p-0.5 rounded transition ${
                              confirmDelete === site.id
                                ? 'text-[#C1121F]'
                                : 'hover:bg-[#D8D5D0]/60 text-[#B5B0A8]'
                            }`}
                            title={confirmDelete === site.id ? 'Click again to confirm' : 'Delete site'}
                          >
                            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                            </svg>
                          </span>
                        </button>
                      );
                    })}

                    {projectSites.length === 0 && (
                      <div className="pl-11 pr-3 py-1.5 text-xs text-[#B5B0A8] italic">
                        No sites yet
                      </div>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          );
        })}
      </div>
    </div>
  );

  // Mobile: overlay
  if (isMobile) {
    return (
      <>
        {/* Backdrop */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 bg-black/20 z-40"
          onClick={onToggleCollapse}
        />
        {/* Slide-in panel */}
        <motion.div
          initial={{ x: '-100%' }}
          animate={{ x: 0 }}
          exit={{ x: '-100%' }}
          transition={{ type: 'spring', stiffness: 400, damping: 35 }}
          className="fixed inset-y-0 left-0 z-50 bg-[#E8E6E3] shadow-xl"
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
