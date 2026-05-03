/**
 * One-shot fetch of a well's enriched data from Firestore. Cached in-memory
 * across renders; re-fetches only when the api# changes.
 */
import { useEffect, useState } from 'react';
import { doc, getDoc, getFirestore } from 'firebase/firestore';
import type { WellEnrichment } from '../types';
import { WELL_ENRICHMENT_COLLECTION } from '../types';

const cache = new Map<string, WellEnrichment | null>();

export interface UseWellEnrichmentResult {
  data: WellEnrichment | null;
  loading: boolean;
  error: string | null;
}

export function useWellEnrichment(api: string | null): UseWellEnrichmentResult {
  const [data, setData] = useState<WellEnrichment | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!api) {
      setData(null);
      setLoading(false);
      setError(null);
      return;
    }

    // Cache hit
    if (cache.has(api)) {
      setData(cache.get(api) ?? null);
      setLoading(false);
      setError(null);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    const db = getFirestore();
    getDoc(doc(db, WELL_ENRICHMENT_COLLECTION, api))
      .then((snap) => {
        if (cancelled) return;
        const value = snap.exists() ? (snap.data() as WellEnrichment) : null;
        cache.set(api, value);
        setData(value);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const msg = err instanceof Error ? err.message : 'Failed to load enrichment';
        setError(msg);
        setData(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [api]);

  return { data, loading, error };
}
