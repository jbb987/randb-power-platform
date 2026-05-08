import { useEffect, useState } from 'react';
import { getQueueLoad } from '../lib/queueLoad';
import type { SubstationQueueLoad } from '../types';

// Module-level cache: persists for the lifetime of the page load. Each substation
// is fetched at most once per session — repeat popup opens reuse the cached
// result. Entries are kept indefinitely; a hard refresh clears the cache.
const cache = new Map<number, SubstationQueueLoad | null>();
const inflight = new Map<number, Promise<SubstationQueueLoad | null>>();

function fetchOnce(hifldId: number): Promise<SubstationQueueLoad | null> {
  if (cache.has(hifldId)) return Promise.resolve(cache.get(hifldId) ?? null);
  let p = inflight.get(hifldId);
  if (p) return p;
  p = getQueueLoad(hifldId)
    .then((res) => {
      cache.set(hifldId, res);
      return res;
    })
    .catch((err: unknown) => {
      console.error('[useQueueLoad] failed for', hifldId, err);
      throw err;
    })
    .finally(() => inflight.delete(hifldId));
  inflight.set(hifldId, p);
  return p;
}

export interface UseQueueLoadResult {
  data: SubstationQueueLoad | null;
  loading: boolean;
  error: string | null;
}

/**
 * Fetch a substation's queue summary, with in-memory cache. Pass null/undefined
 * to skip the fetch (e.g. when the popup is closed).
 */
export function useQueueLoad(hifldId: number | null | undefined): UseQueueLoadResult {
  const [data, setData] = useState<SubstationQueueLoad | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (hifldId == null) {
      setData(null);
      setLoading(false);
      setError(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetchOnce(hifldId).then(
      (res) => {
        if (cancelled) return;
        setData(res);
        setLoading(false);
      },
      (err: unknown) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : 'Failed to load queue data');
        setLoading(false);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [hifldId]);

  return { data, loading, error };
}
