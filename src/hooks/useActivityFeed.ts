import { useEffect, useState, useCallback } from 'react';
import { subscribeActivity } from '../lib/activity';
import type { ActivityEntry } from '../types/activity';

const PAGE_SIZE = 100;

export function useActivityFeed(initialLimit: number = PAGE_SIZE) {
  const [limit, setLimit] = useState(initialLimit);
  const [entries, setEntries] = useState<ActivityEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    setLoading(true);
    const unsub = subscribeActivity(
      limit,
      (next) => {
        setEntries(next);
        setLoading(false);
      },
      (err) => {
        setError(err);
        setLoading(false);
      },
    );
    return unsub;
  }, [limit]);

  const loadMore = useCallback(() => {
    setLimit((cur) => cur + PAGE_SIZE);
  }, []);

  // Approximation: if Firestore returned fewer than the requested limit, no more to load.
  const hasMore = entries.length >= limit;

  return { entries, loading, error, loadMore, hasMore };
}
