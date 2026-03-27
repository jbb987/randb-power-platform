import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { Project, SavedSite } from '../../types';
import { useUsers, type UserRecord } from '../../hooks/useUsers';

interface Props {
  projects: Project[];
  sites: SavedSite[];
  activeProjectId: string;
  onSelectProject: (id: string) => void;
  onCreateProject: (name: string) => void;
  onDeleteProject: (id: string) => void;
  onRenameProject: (id: string, name: string) => void;
  onUpdateMembers: (projectId: string, memberIds: string[]) => void;
  collapsed: boolean;
  onToggleCollapse: () => void;
  isMobile?: boolean;
  isAdmin?: boolean;
}

/* ── Centered Project Settings Modal ──────────────────────────────────────── */

function ProjectSettingsModal({
  project,
  users,
  onRename,
  onDelete,
  onUpdateMembers,
  onClose,
}: {
  project: Project;
  users: UserRecord[];
  onRename: (id: string, name: string) => void;
  onDelete: (id: string) => void;
  onUpdateMembers: (projectId: string, memberIds: string[]) => void;
  onClose: () => void;
}) {
  const [name, setName] = useState(project.name);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [showUserDropdown, setShowUserDropdown] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);

  const members = users.filter((u) => project.memberIds?.includes(u.id));
  const nonMembers = users.filter((u) => !project.memberIds?.includes(u.id));

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowUserDropdown(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleRename = () => {
    const trimmed = name.trim();
    if (trimmed && trimmed !== project.name) {
      onRename(project.id, trimmed);
    }
  };

  const addMember = (uid: string) => {
    onUpdateMembers(project.id, [...(project.memberIds ?? []), uid]);
    setShowUserDropdown(false);
  };

  const removeMember = (uid: string) => {
    onUpdateMembers(project.id, (project.memberIds ?? []).filter((id) => id !== uid));
  };

  const handleDelete = () => {
    if (confirmDelete) {
      onDelete(project.id);
      onClose();
    } else {
      setConfirmDelete(true);
    }
  };

  return (
    <>
      {/* Backdrop */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 bg-black/30 z-[60]"
        onClick={onClose}
      />

      {/* Modal */}
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        transition={{ duration: 0.15 }}
        className="fixed inset-0 z-[61] flex items-center justify-center p-4"
      >
        <div
          className="bg-white rounded-2xl shadow-xl border border-[#D8D5D0] w-full max-w-md"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-[#D8D5D0]">
            <h3 className="font-heading text-lg font-semibold text-[#201F1E]">
              Project Settings
            </h3>
            <button
              onClick={onClose}
              className="p-1 rounded-lg hover:bg-[#D8D5D0]/50 transition text-[#7A756E]"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <div className="px-6 py-5 space-y-6">
            {/* Rename */}
            <div>
              <label className="block text-xs font-medium text-[#7A756E] uppercase tracking-wider mb-2">
                Project Name
              </label>
              <div className="flex gap-2">
                <input
                  ref={nameInputRef}
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleRename();
                  }}
                  className="flex-1 rounded-lg border border-[#D8D5D0] px-3 py-2 text-sm text-[#201F1E] focus:outline-none focus:ring-2 focus:ring-[#ED202B]/20 focus:border-[#ED202B]"
                />
                {name.trim() !== project.name && name.trim() !== '' && (
                  <button
                    onClick={handleRename}
                    className="rounded-lg bg-[#ED202B] text-white px-4 py-2 text-sm font-medium hover:bg-[#9B0E18] transition"
                  >
                    Save
                  </button>
                )}
              </div>
            </div>

            {/* Members */}
            <div>
              <label className="block text-xs font-medium text-[#7A756E] uppercase tracking-wider mb-2">
                Assigned Members
              </label>

              {/* Member chips */}
              <div className="flex flex-wrap gap-2 mb-3">
                {members.length === 0 && (
                  <span className="text-sm text-[#7A756E] italic">No members assigned</span>
                )}
                {members.map((m) => (
                  <span
                    key={m.id}
                    className="inline-flex items-center gap-1.5 bg-[#ED202B]/10 text-[#201F1E] text-sm font-medium rounded-full px-3 py-1"
                  >
                    {m.email.split('@')[0]}
                    <button
                      onClick={() => removeMember(m.id)}
                      className="text-[#7A756E] hover:text-[#ED202B] transition"
                      title={`Remove ${m.email}`}
                    >
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </span>
                ))}
              </div>

              {/* Add member dropdown */}
              <div className="relative" ref={dropdownRef}>
                <button
                  onClick={() => setShowUserDropdown(!showUserDropdown)}
                  className="inline-flex items-center gap-1.5 text-sm text-[#7A756E] hover:text-[#ED202B] transition"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                  </svg>
                  Add member
                </button>

                <AnimatePresence>
                  {showUserDropdown && (
                    <motion.div
                      initial={{ opacity: 0, y: -4 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -4 }}
                      transition={{ duration: 0.1 }}
                      className="absolute left-0 top-full mt-1 w-full bg-white rounded-lg shadow-lg border border-[#D8D5D0] z-50 max-h-40 overflow-y-auto"
                    >
                      {nonMembers.length === 0 ? (
                        <div className="px-3 py-3 text-sm text-[#7A756E]">All users are assigned</div>
                      ) : (
                        nonMembers.map((u) => (
                          <button
                            key={u.id}
                            onClick={() => addMember(u.id)}
                            className="w-full text-left px-3 py-2 text-sm text-[#201F1E] hover:bg-[#ED202B]/5 transition flex items-center justify-between"
                          >
                            <span className="truncate">{u.email}</span>
                            <span className="text-xs text-[#7A756E] ml-2 flex-shrink-0">{u.role}</span>
                          </button>
                        ))
                      )}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>

            {/* Delete */}
            <div className="border-t border-[#D8D5D0] pt-5">
              {confirmDelete ? (
                <div className="bg-red-50 rounded-lg p-4">
                  <p className="text-sm text-[#201F1E] mb-3">
                    Are you sure? This will permanently delete <strong>{project.name}</strong> and all its sites.
                  </p>
                  <div className="flex gap-2">
                    <button
                      onClick={handleDelete}
                      className="rounded-lg bg-[#ED202B] text-white px-4 py-2 text-sm font-medium hover:bg-[#9B0E18] transition"
                    >
                      Yes, Delete
                    </button>
                    <button
                      onClick={() => setConfirmDelete(false)}
                      className="rounded-lg bg-white text-[#201F1E] border border-[#D8D5D0] px-4 py-2 text-sm font-medium hover:bg-[#FAFAF9] transition"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={handleDelete}
                  className="text-sm text-[#ED202B] hover:text-[#9B0E18] transition font-medium"
                >
                  Delete Project
                </button>
              )}
            </div>
          </div>
        </div>
      </motion.div>
    </>
  );
}

/* ── Sidebar ──────────────────────────────────────────────────────────────── */

export default function ProjectSidebar({
  projects,
  sites,
  activeProjectId,
  onSelectProject,
  onCreateProject,
  onDeleteProject,
  onRenameProject,
  onUpdateMembers,
  collapsed,
  onToggleCollapse,
  isMobile,
  isAdmin,
}: Props) {
  const [newProjectName, setNewProjectName] = useState('');
  const [showNewProject, setShowNewProject] = useState(false);
  const [settingsProject, setSettingsProject] = useState<Project | null>(null);

  const { users } = useUsers();

  const sitesForProject = (projectId: string) =>
    sites.filter((s) => s.inputs.projectId === projectId);

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
      {/* Header — Projects + New + Collapse */}
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

      {/* Project list */}
      <div className="flex-1 overflow-y-auto pt-1 pb-4">
        {projects.map((project) => {
          const projectSites = sitesForProject(project.id);
          const isActiveProject = project.id === activeProjectId;
          const memberCount = project.memberIds?.length ?? 0;

          return (
            <div key={project.id} className="mb-0.5">
              <div
                className={`group flex items-center gap-1.5 px-3 py-2 cursor-pointer rounded-lg mx-2 transition-all ${
                  isActiveProject
                    ? 'bg-white/60 shadow-sm'
                    : 'hover:bg-white/40'
                }`}
              >
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

                {/* Site count + member indicator */}
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  {memberCount > 0 && (
                    <span className="text-[10px] text-[#7A756E] tabular-nums" title={`${memberCount} member${memberCount !== 1 ? 's' : ''}`}>
                      <svg className="w-3 h-3 inline -mt-0.5 mr-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                      </svg>
                      {memberCount}
                    </span>
                  )}
                  <span className="text-[10px] text-[#7A756E] tabular-nums">
                    {projectSites.length}
                  </span>
                </div>

                {/* Settings button (admin only) */}
                {isAdmin && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setSettingsProject(project);
                    }}
                    className="p-0.5 rounded hover:bg-[#D8D5D0]/60 transition opacity-0 group-hover:opacity-100"
                    title="Project settings"
                  >
                    <svg className="w-3.5 h-3.5 text-[#7A756E]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z" />
                    </svg>
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Project Settings Modal */}
      <AnimatePresence>
        {settingsProject && (
          <ProjectSettingsModal
            project={settingsProject}
            users={users}
            onRename={(id, name) => {
              onRenameProject(id, name);
              // Update the local reference so modal reflects the change
              setSettingsProject((prev) => prev ? { ...prev, name } : null);
            }}
            onDelete={onDeleteProject}
            onUpdateMembers={onUpdateMembers}
            onClose={() => setSettingsProject(null)}
          />
        )}
      </AnimatePresence>
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
