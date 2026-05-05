import type { ActivityEntry } from '../../types/activity';
import ActivityRow from './ActivityRow';

interface ActivityFeedProps {
  entries: ActivityEntry[];
  loading: boolean;
  error: Error | null;
  onLoadMore?: () => void;
  hasMore?: boolean;
  loadingMore?: boolean;
}

interface DayGroup {
  key: string;
  label: string;
  entries: ActivityEntry[];
}

function entryDayKey(ts: number): string {
  const d = new Date(ts);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

function entryDayLabel(ts: number): string {
  const d = new Date(ts);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  if (entryDayKey(ts) === entryDayKey(today.getTime())) return 'Today';
  if (entryDayKey(ts) === entryDayKey(yesterday.getTime())) return 'Yesterday';
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

function groupByDay(entries: ActivityEntry[]): DayGroup[] {
  const groups: DayGroup[] = [];
  let current: DayGroup | null = null;
  for (const entry of entries) {
    const ts = entry.timestamp?.toMillis ? entry.timestamp.toMillis() : Date.now();
    const key = entryDayKey(ts);
    if (!current || current.key !== key) {
      current = { key, label: entryDayLabel(ts), entries: [] };
      groups.push(current);
    }
    current.entries.push(entry);
  }
  return groups;
}

export default function ActivityFeed({
  entries,
  loading,
  error,
  onLoadMore,
  hasMore,
  loadingMore,
}: ActivityFeedProps) {
  if (error) {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-[#D8D5D0] p-8 text-center">
        <p className="text-sm text-red-600">Failed to load activity: {error.message}</p>
        <p className="text-xs text-[#7A756E] mt-2">
          Confirm Firestore rules and indexes for the <code>activity</code> collection are deployed.
          See <code>docs/activity-firestore-setup.md</code>.
        </p>
      </div>
    );
  }

  if (loading && entries.length === 0) {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-[#D8D5D0] p-12 text-center">
        <div className="h-4 w-4 animate-spin rounded-full border-2 border-[#D8D5D0] border-t-[#ED202B] mx-auto" />
      </div>
    );
  }

  if (entries.length === 0) {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-[#D8D5D0] p-12 text-center">
        <p className="text-sm text-[#7A756E]">No activity matches your filters.</p>
        <p className="text-xs text-[#7A756E] mt-1">Adjust filters or clear them to see more.</p>
      </div>
    );
  }

  const groups = groupByDay(entries);

  return (
    <div className="space-y-4">
      {groups.map((group) => (
        <section key={group.key}>
          <h3 className="text-[11px] font-semibold uppercase tracking-wider text-[#7A756E] mb-2 px-1">
            {group.label}
          </h3>
          <div className="bg-white rounded-xl shadow-sm border border-[#D8D5D0] overflow-hidden">
            {group.entries.map((entry) => (
              <ActivityRow key={entry.id} entry={entry} />
            ))}
          </div>
        </section>
      ))}

      {onLoadMore && hasMore && (
        <div className="text-center pt-2">
          <button
            type="button"
            onClick={onLoadMore}
            disabled={loadingMore}
            className="px-4 py-2 rounded-lg border border-[#D8D5D0] bg-white text-sm font-medium text-[#201F1E] hover:border-[#ED202B] hover:text-[#ED202B] transition disabled:opacity-50"
          >
            {loadingMore ? 'Loading…' : 'Load more'}
          </button>
        </div>
      )}
    </div>
  );
}
