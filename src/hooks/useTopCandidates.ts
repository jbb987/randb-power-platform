/**
 * Statewide top-N reactivation candidates from Firestore. Re-queries on
 * filter change. Cached in-memory for the session keyed by filter signature.
 */
import { useEffect, useState } from 'react';
import type { WellEnrichment } from '../types';
import { queryTopCandidates, type TopCandidatesParams } from '../lib/wellEnrichmentQuery';

interface CacheEntry {
  data: WellEnrichment[];
  fetchedAt: number;
}
const cache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

function cacheKey(params: TopCandidatesParams): string {
  return JSON.stringify({
    s: params.minScore ?? 0,
    o: params.orphanOnly ? 1 : 0,
    n: params.limit ?? 2000,
  });
}

export interface UseTopCandidatesResult {
  candidates: WellEnrichment[];
  loading: boolean;
  error: string | null;
}

export function useTopCandidates(params: TopCandidatesParams): UseTopCandidatesResult {
  const [candidates, setCandidates] = useState<WellEnrichment[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const key = cacheKey(params);
    const cached = cache.get(key);
    if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
      setCandidates(cached.data);
      setLoading(false);
      setError(null);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    queryTopCandidates(params)
      .then((data) => {
        if (cancelled) return;
        cache.set(key, { data, fetchedAt: Date.now() });
        setCandidates(data);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const msg = err instanceof Error ? err.message : 'Failed to load candidates';
        console.error('[useTopCandidates]', err);
        setError(msg);
        setCandidates([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cacheKey(params)]);

  return { candidates, loading, error };
}
