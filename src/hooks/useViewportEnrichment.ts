/**
 * Batch-load WellEnrichment docs for an array of API#s. Used by the sidebar
 * table to show enrichment for the wells currently in the map viewport.
 *
 * Caches results in-memory across renders (same cache as useWellEnrichment).
 * Caps at MAX_FETCH wells per call to avoid blowing through Firestore reads.
 */
import { useEffect, useState } from 'react';
import { doc, getDoc, getFirestore } from 'firebase/firestore';
import type { WellEnrichment } from '../types';
import { WELL_ENRICHMENT_COLLECTION } from '../types';

const MAX_FETCH = 100;
const cache = new Map<string, WellEnrichment | null>();

export interface UseViewportEnrichmentResult {
  /** Map of api -> enrichment (or null if not in Firestore). */
  data: Map<string, WellEnrichment | null>;
  loading: boolean;
  /** Number of unique APIs requested in the latest batch. */
  requested: number;
  /** Number capped due to MAX_FETCH limit. */
  truncated: number;
}

export function useViewportEnrichment(apis: string[]): UseViewportEnrichmentResult {
  const [data, setData] = useState<Map<string, WellEnrichment | null>>(new Map());
  const [loading, setLoading] = useState(false);
  const [meta, setMeta] = useState({ requested: 0, truncated: 0 });

  useEffect(() => {
    if (apis.length === 0) {
      setData(new Map());
      setLoading(false);
      setMeta({ requested: 0, truncated: 0 });
      return;
    }

    const dedup = Array.from(new Set(apis.filter((a) => a && a.length > 0)));
    const truncated = Math.max(0, dedup.length - MAX_FETCH);
    const target = dedup.slice(0, MAX_FETCH);
    setMeta({ requested: target.length, truncated });

    // Build initial map from cache
    const result = new Map<string, WellEnrichment | null>();
    const missing: string[] = [];
    for (const api of target) {
      if (cache.has(api)) result.set(api, cache.get(api) ?? null);
      else missing.push(api);
    }
    setData(new Map(result));

    if (missing.length === 0) {
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);

    const db = getFirestore();
    Promise.allSettled(
      missing.map((api) =>
        getDoc(doc(db, WELL_ENRICHMENT_COLLECTION, api)).then((snap) => ({
          api,
          value: snap.exists() ? (snap.data() as WellEnrichment) : null,
        })),
      ),
    ).then((settled) => {
      if (cancelled) return;
      for (const r of settled) {
        if (r.status === 'fulfilled') {
          cache.set(r.value.api, r.value.value);
          result.set(r.value.api, r.value.value);
        }
      }
      setData(new Map(result));
      setLoading(false);
    });

    return () => {
      cancelled = true;
    };
    // We deliberately depend on the joined apis string to avoid re-running on
    // identical sets that happen to be different array instances.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apis.slice(0, MAX_FETCH).join(',')]);

  return { data, loading, requested: meta.requested, truncated: meta.truncated };
}
