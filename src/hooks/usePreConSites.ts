import { useEffect, useState } from 'react';
import {
  subscribePreConSite,
  subscribePreConSiteByRegistryId,
  subscribePreConSites,
  subscribePreConSitesByCompany,
} from '../lib/preConSites';
import type { PreConSite } from '../types';

/** Real-time subscription to every pre-con site (non-archived by default). */
export function usePreConSitesList(options: { includeArchived?: boolean } = {}) {
  const [sites, setSites] = useState<PreConSite[]>([]);
  const [loading, setLoading] = useState(true);
  const includeArchived = options.includeArchived;

  useEffect(() => {
    setLoading(true);
    const unsub = subscribePreConSites(
      (s) => {
        setSites(s);
        setLoading(false);
      },
      { includeArchived },
      () => setLoading(false),
    );
    return unsub;
  }, [includeArchived]);

  return { sites, loading };
}

/** Pre-con sites scoped to a single customer. */
export function usePreConSitesByCompany(companyId: string | undefined) {
  const [sites, setSites] = useState<PreConSite[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!companyId) {
      setSites([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const unsub = subscribePreConSitesByCompany(
      companyId,
      (s) => {
        setSites(s);
        setLoading(false);
      },
      {},
      () => setLoading(false),
    );
    return unsub;
  }, [companyId]);

  return { sites, loading };
}

/** Live lookup: the PreConSite (if any) that references a given
 *  site-registry id. Used by the Site Analyzer detail header to toggle the
 *  action button between "Track in Pre-Con" and "Open in Pre-Con". */
export function usePreConSiteByRegistryId(siteRegistryId: string | undefined) {
  const [site, setSite] = useState<PreConSite | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!siteRegistryId) {
      setSite(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    const unsub = subscribePreConSiteByRegistryId(
      siteRegistryId,
      (s) => {
        setSite(s);
        setLoading(false);
      },
      () => setLoading(false),
    );
    return unsub;
  }, [siteRegistryId]);

  return { site, loading };
}

/** Single-site subscription used by the detail page. */
export function usePreConSite(id: string | undefined) {
  const [site, setSite] = useState<PreConSite | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) {
      setSite(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    const unsub = subscribePreConSite(
      id,
      (s) => {
        setSite(s);
        setLoading(false);
      },
      () => setLoading(false),
    );
    return unsub;
  }, [id]);

  return { site, loading };
}
