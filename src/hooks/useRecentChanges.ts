/**
 * Recent status-change events from Firestore. Returns the last N events
 * (default 200) ordered by detectedAt desc, plus per-type counts for the
 * latest snapshot.
 */
import { useEffect, useState } from 'react';
import {
  collection,
  getDocs,
  getFirestore,
  limit as fbLimit,
  orderBy,
  query,
} from 'firebase/firestore';
import {
  WELL_CHANGES_COLLECTION,
  type WellChangeEvent,
  type WellChangeType,
} from '../types';

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 min
let cache: { fetchedAt: number; events: WellChangeEvent[] } | null = null;

export interface UseRecentChangesResult {
  events: WellChangeEvent[];
  countsLatestMonth: Record<WellChangeType, number>;
  latestSnapshotMonth: string | null;
  loading: boolean;
  error: string | null;
}

const ZERO_COUNTS: Record<WellChangeType, number> = {
  newly_shut_in: 0,
  newly_reactivated: 0,
  newly_plugged: 0,
};

export function useRecentChanges(maxEvents = 200): UseRecentChangesResult {
  const [events, setEvents] = useState<WellChangeEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (cache && Date.now() - cache.fetchedAt < CACHE_TTL_MS) {
      setEvents(cache.events);
      setLoading(false);
      setError(null);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);
    const db = getFirestore();
    const q = query(
      collection(db, WELL_CHANGES_COLLECTION),
      orderBy('detectedAt', 'desc'),
      fbLimit(maxEvents),
    );
    getDocs(q)
      .then((snap) => {
        if (cancelled) return;
        const arr: WellChangeEvent[] = [];
        snap.forEach((d) => {
          arr.push({ ...(d.data() as WellChangeEvent) });
        });
        cache = { fetchedAt: Date.now(), events: arr };
        setEvents(arr);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const msg = err instanceof Error ? err.message : 'Failed to load changes';
        console.error('[useRecentChanges]', err);
        setError(msg);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [maxEvents]);

  // Compute per-type counts for the latest snapshot only
  const latestSnapshotMonth = events.length > 0 ? events[0].snapshotMonth : null;
  const countsLatestMonth = { ...ZERO_COUNTS };
  if (latestSnapshotMonth) {
    for (const e of events) {
      if (e.snapshotMonth === latestSnapshotMonth) {
        countsLatestMonth[e.changeType] = (countsLatestMonth[e.changeType] ?? 0) + 1;
      }
    }
  }

  return { events, countsLatestMonth, latestSnapshotMonth, loading, error };
}
