import { useMemo, useState } from 'react';
import Layout from '../components/Layout';
import ActivityFeed from '../components/activity/ActivityFeed';
import ActivityFilters, {
  EMPTY_FILTERS,
  type ActivityFilterState,
} from '../components/activity/ActivityFilters';
import { useActivityFeed } from '../hooks/useActivityFeed';
import type { ActivityEntry } from '../types/activity';

const DAY_MS = 24 * 60 * 60 * 1000;

function entryMillis(entry: ActivityEntry): number {
  return entry.timestamp?.toMillis ? entry.timestamp.toMillis() : 0;
}

function startOfRange(range: ActivityFilterState['range']): number {
  const now = Date.now();
  if (range === 'today') {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d.getTime();
  }
  if (range === 'week') return now - 7 * DAY_MS;
  if (range === 'month') return now - 30 * DAY_MS;
  return 0;
}

function applyFilters(entries: ActivityEntry[], filters: ActivityFilterState): ActivityEntry[] {
  const cutoff = startOfRange(filters.range);
  return entries.filter((entry) => {
    if (filters.email && entry.actor.email !== filters.email) return false;
    if (filters.action && entry.action !== filters.action) return false;
    if (filters.resourceType && entry.resource.type !== filters.resourceType) return false;
    if (cutoff > 0 && entryMillis(entry) < cutoff) return false;
    return true;
  });
}

export default function AdminActivity() {
  const { entries, loading, error, loadMore, hasMore } = useActivityFeed(100);
  const [filters, setFilters] = useState<ActivityFilterState>(EMPTY_FILTERS);

  const emailOptions = useMemo(() => {
    const set = new Set<string>();
    entries.forEach((e) => set.add(e.actor.email));
    return Array.from(set).sort();
  }, [entries]);

  const filtered = useMemo(() => applyFilters(entries, filters), [entries, filters]);

  return (
    <Layout>
      <main className="py-6 space-y-4">
        <header className="space-y-1">
          <h1 className="font-heading text-2xl font-semibold text-[#201F1E]">Activity Log</h1>
          <p className="text-sm text-[#7A756E]">
            Every create, edit, delete, upload, and tool run across the platform — newest first.
          </p>
        </header>

        <ActivityFilters filters={filters} onChange={setFilters} emailOptions={emailOptions} />

        <div className="text-xs text-[#7A756E] px-1">
          {filtered.length} of {entries.length} loaded
          {hasMore ? ' (more available)' : ''}
        </div>

        <ActivityFeed
          entries={filtered}
          loading={loading}
          error={error}
          onLoadMore={loadMore}
          hasMore={hasMore}
        />
      </main>
    </Layout>
  );
}
