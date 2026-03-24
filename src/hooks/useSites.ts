import { useState, useCallback, useEffect, useRef } from 'react';
import type { SiteInputs, SavedSite } from '../types';
import { saveSite, deleteSiteFromDB, subscribeSites } from '../lib/firebase';

const ACTIVE_KEY = 'rbpower-active-site';

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

function loadActiveId(sites: SavedSite[]): string {
  try {
    const id = localStorage.getItem(ACTIVE_KEY);
    if (id && sites.some((s) => s.id === id)) return id;
  } catch { /* ignore */ }
  return sites[0]?.id ?? '';
}

export function useSites() {
  const [sites, setSites] = useState<SavedSite[]>([]);
  const [activeId, setActiveId] = useState<string>('');
  const [loading, setLoading] = useState(true);
  // Debounce saves to Firestore to keep slider snappy
  const saveTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  // Track whether we're the source of the change (to avoid re-saving on snapshot)
  const localChangeRef = useRef<Set<string>>(new Set());

  // Subscribe to real-time Firestore updates
  useEffect(() => {
    const unsub = subscribeSites(
      (remoteSites) => {
        setSites((prev) => {
          // Merge: keep local changes that haven't been confirmed yet
          const merged = remoteSites.map((remote) => {
            if (localChangeRef.current.has(remote.id)) {
              // We have a pending local change — keep our version
              const local = prev.find((s) => s.id === remote.id);
              if (local && local.updatedAt >= remote.updatedAt) {
                return local;
              }
            }
            localChangeRef.current.delete(remote.id);
            return remote;
          });
          return merged;
        });

        setLoading(false);

        // Set active site if none selected
        setActiveId((prevId) => {
          if (prevId && remoteSites.some((s) => s.id === prevId)) return prevId;
          const stored = loadActiveId(remoteSites);
          if (stored) return stored;
          return remoteSites[0]?.id ?? '';
        });
      },
      () => {
        // Firebase subscription failed — stop loading so the app doesn't hang
        setLoading(false);
      },
    );

    return () => unsub();
  }, []);

  // Persist active site ID to localStorage (just the ID, not data)
  useEffect(() => {
    if (activeId) {
      localStorage.setItem(ACTIVE_KEY, activeId);
    }
  }, [activeId]);

  const activeSite = sites.find((s) => s.id === activeId) ?? sites[0];

  // Debounced save to Firestore
  const debouncedSave = useCallback((site: SavedSite) => {
    localChangeRef.current.add(site.id);
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      saveSite(site).then(() => {
        localChangeRef.current.delete(site.id);
      }).catch(() => {
        localChangeRef.current.delete(site.id);
      });
    }, 500); // 500ms debounce — saves after slider stops
  }, []);

  const updateInputs = useCallback((inputs: SiteInputs) => {
    setSites((prev) => {
      const updated = prev.map((s) => {
        if (s.id === inputs.id) {
          const newSite = { ...s, inputs, updatedAt: Date.now() };
          debouncedSave(newSite);
          return newSite;
        }
        return s;
      });
      return updated;
    });
  }, [debouncedSave]);

  const updateMW = useCallback((mw: number) => {
    setSites((prev) => {
      const updated = prev.map((s) => {
        if (s.id === activeId) {
          const newSite = { ...s, inputs: { ...s.inputs, mw }, updatedAt: Date.now() };
          debouncedSave(newSite);
          return newSite;
        }
        return s;
      });
      return updated;
    });
  }, [activeId, debouncedSave]);

  const createSite = useCallback((name?: string, projectId?: string) => {
    const id = generateId();
    const newSite: SavedSite = {
      id,
      inputs: {
        id,
        projectId: projectId ?? '',
        siteName: name ?? 'New Site',
        totalAcres: 0,
        currentPPA: 0,
        mw: 50,
        address: '',
        legalDescription: '',
        county: '',
        parcelId: '',
        owner: '',
        rawLandValue: 0,
        taxEstValue: 0,
        iso: '',
        utilityTerritory: '',
        tsp: '',
      },
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    setSites((prev) => [...prev, newSite]);
    setActiveId(id);
    saveSite(newSite); // Save immediately (not debounced)
    return id;
  }, []);

  const moveSite = useCallback((siteId: string, targetProjectId: string) => {
    localChangeRef.current.add(siteId);
    setSites((prev) => {
      const updated = prev.map((s) => {
        if (s.id === siteId) {
          const newSite = {
            ...s,
            inputs: { ...s.inputs, projectId: targetProjectId },
            updatedAt: Date.now(),
          };
          saveSite(newSite).then(() => {
            localChangeRef.current.delete(siteId);
          }).catch(() => {
            localChangeRef.current.delete(siteId);
          });
          return newSite;
        }
        return s;
      });
      return updated;
    });
  }, []);

  const deleteSite = useCallback((id: string) => {
    setSites((prev) => {
      const next = prev.filter((s) => s.id !== id);
      if (next.length === 0) return prev; // don't delete last site
      if (id === activeId && next.length > 0) {
        setActiveId(next[0].id);
      }
      deleteSiteFromDB(id);
      return next;
    });
  }, [activeId]);

  const switchSite = useCallback((id: string) => {
    setActiveId(id);
  }, []);

  return {
    sites,
    activeSite,
    activeId,
    loading,
    updateInputs,
    updateMW,
    createSite,
    deleteSite,
    switchSite,
    moveSite,
  };
}
