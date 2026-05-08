import { useEffect, useState } from 'react';
import { getCountyQueueLoad } from '../lib/queueLoad';
import type { CountyQueueLoad } from '../types';

// Module-level cache: keyed by "{state}_{county-slug}". Persists for the
// lifetime of the page load. No `onSnapshot` — the underlying data refreshes
// weekly via the queue-ingestion pipeline.
const cache = new Map<string, CountyQueueLoad | null>();
const inflight = new Map<string, Promise<CountyQueueLoad | null>>();

function makeKey(state: string, county: string): string {
  return `${state.toUpperCase()}_${county
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')}`;
}

function fetchOnce(state: string, county: string): Promise<CountyQueueLoad | null> {
  const key = makeKey(state, county);
  if (cache.has(key)) return Promise.resolve(cache.get(key) ?? null);
  let p = inflight.get(key);
  if (p) return p;
  p = getCountyQueueLoad(state, county)
    .then((res) => {
      cache.set(key, res);
      return res;
    })
    .catch((err: unknown) => {
      console.error('[useCountyQueueLoad] failed for', key, err);
      throw err;
    })
    .finally(() => inflight.delete(key));
  inflight.set(key, p);
  return p;
}

export interface UseCountyQueueLoadResult {
  data: CountyQueueLoad | null;
  loading: boolean;
  error: string | null;
}

export function useCountyQueueLoad(
  state: string | null | undefined,
  county: string | null | undefined,
): UseCountyQueueLoadResult {
  const [data, setData] = useState<CountyQueueLoad | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!state || !county) {
      setData(null);
      setLoading(false);
      setError(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetchOnce(state, county).then(
      (res) => {
        if (cancelled) return;
        setData(res);
        setLoading(false);
      },
      (err: unknown) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : 'Failed to load county queue data');
        setLoading(false);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [state, county]);

  return { data, loading, error };
}
