import { useState, useEffect, useCallback, useMemo } from 'react';
import { useAuth } from './useAuth';
import {
  subscribeSiteRegistry,
  createSiteEntry,
  updateSiteEntry,
  deleteSiteEntry,
  searchSitesLocal,
} from '../lib/siteRegistry';
import type { SiteRegistryEntry } from '../types';

export function useSiteRegistry() {
  const { user, role } = useAuth();
  const [sites, setSites] = useState<SiteRegistryEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user || !role) {
      setSites([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const unsub = subscribeSiteRegistry(
      (s) => {
        setSites(s);
        setLoading(false);
      },
      () => setLoading(false),
    );
    return unsub;
  }, [user, role]);

  const createSite = useCallback(
    async (data: Omit<SiteRegistryEntry, 'id' | 'createdAt' | 'updatedAt'>) => {
      return createSiteEntry(data);
    },
    [],
  );

  const updateSite = useCallback(async (id: string, updates: Partial<SiteRegistryEntry>) => {
    await updateSiteEntry(id, updates);
  }, []);

  const deleteSite = useCallback(async (id: string) => {
    await deleteSiteEntry(id);
  }, []);

  const searchSites = useCallback(
    (q: string) => {
      if (!q.trim()) return sites;
      return searchSitesLocal(sites, q);
    },
    [sites],
  );

  return useMemo(
    () => ({ sites, loading, createSite, updateSite, deleteSite, searchSites }),
    [sites, loading, createSite, updateSite, deleteSite, searchSites],
  );
}
