import { useState, useCallback, useEffect, useRef } from 'react';
import type { Project } from '../types';
import {
  saveProject,
  deleteProjectFromDB,
  renameProjectInDB,
  subscribeProjects,
  migrateOrphanedSites,
} from '../lib/projects';

const ACTIVE_KEY = 'rbpower-active-project';

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

export function useProjects() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [activeProjectId, setActiveProjectId] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const migrated = useRef(false);

  // Run migration once, then subscribe
  useEffect(() => {
    let unsub: (() => void) | undefined;

    async function init() {
      if (!migrated.current) {
        migrated.current = true;
        await migrateOrphanedSites();
      }

      unsub = subscribeProjects(
        (remoteProjects) => {
          setProjects(remoteProjects);
          setLoading(false);

          setActiveProjectId((prev) => {
            if (prev && remoteProjects.some((p) => p.id === prev)) return prev;
            try {
              const stored = localStorage.getItem(ACTIVE_KEY);
              if (stored && remoteProjects.some((p) => p.id === stored)) return stored;
            } catch { /* ignore */ }
            return remoteProjects[0]?.id ?? '';
          });
        },
        () => setLoading(false),
      );
    }

    init();
    return () => unsub?.();
  }, []);

  useEffect(() => {
    if (activeProjectId) {
      localStorage.setItem(ACTIVE_KEY, activeProjectId);
    }
  }, [activeProjectId]);

  const createProject = useCallback((name: string) => {
    const id = generateId();
    const project: Project = {
      id,
      name,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    saveProject(project);
    setActiveProjectId(id);
    return id;
  }, []);

  const deleteProject = useCallback((id: string) => {
    deleteProjectFromDB(id);
    setActiveProjectId((prev) => {
      if (prev === id) return projects[0]?.id !== id ? projects[0]?.id ?? '' : projects[1]?.id ?? '';
      return prev;
    });
  }, [projects]);

  const renameProject = useCallback((id: string, name: string) => {
    renameProjectInDB(id, name);
  }, []);

  const selectProject = useCallback((id: string) => {
    setActiveProjectId(id);
  }, []);

  return {
    projects,
    activeProjectId,
    loading,
    createProject,
    deleteProject,
    renameProject,
    selectProject,
  };
}
