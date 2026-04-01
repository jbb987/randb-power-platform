import type { ReactNode } from 'react';
import type { UserActivityEntry } from '../types';
import { formatRelativeTime } from '../utils/format';

interface RecentHistoryProps {
  entries: UserActivityEntry[];
  loading: boolean;
  icon: ReactNode;
  emptyMessage: ReactNode;
  emptyHint?: string;
  onReplay: (inputs: Record<string, unknown>) => void;
}

function entryLabel(entry: UserActivityEntry): string {
  if (entry.siteName) return entry.siteName;
  const coords = entry.inputs?.coordinates as string | undefined;
  if (coords) return coords;
  return entry.siteAddress || 'Unknown';
}

export default function RecentHistory({
  entries,
  loading,
  icon,
  emptyMessage,
  emptyHint,
  onReplay,
}: RecentHistoryProps) {
  return (
    <div className="text-center py-12">
      {/* Original empty state icon + message */}
      <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-[#ED202B]/10 mb-4">
        {icon}
      </div>
      <div className="text-sm text-[#7A756E]">{emptyMessage}</div>
      {emptyHint && (
        <p className="text-xs text-[#7A756E] mt-2">{emptyHint}</p>
      )}

      {/* Recent searches */}
      {!loading && entries.length > 0 && (
        <div className="mt-8 max-w-sm mx-auto">
          <div className="flex items-center gap-2 mb-3">
            <div className="h-px flex-1 bg-[#D8D5D0]" />
            <span className="text-[10px] font-semibold uppercase tracking-wider text-[#7A756E]">
              Recent
            </span>
            <div className="h-px flex-1 bg-[#D8D5D0]" />
          </div>

          <div className="space-y-1">
            {entries.map((entry) => (
              <button
                key={entry.id}
                type="button"
                onClick={() => entry.inputs && onReplay(entry.inputs)}
                className="w-full flex items-center gap-2.5 rounded-lg px-3 py-2.5 hover:bg-[#F5F4F2] transition text-left group"
              >
                {/* Clock icon */}
                <svg
                  className="h-3.5 w-3.5 text-[#7A756E] shrink-0"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth={1.5}
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>

                {/* Label */}
                <div className="flex-1 min-w-0">
                  <span className="text-sm font-medium text-[#201F1E] truncate block">
                    {entryLabel(entry)}
                  </span>
                </div>

                {/* Time */}
                <span className="text-[10px] text-[#7A756E] shrink-0">
                  {formatRelativeTime(entry.createdAt)}
                </span>

                {/* Replay arrow */}
                <svg
                  className="h-3.5 w-3.5 text-[#7A756E] group-hover:text-[#ED202B] shrink-0 transition"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth={2}
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3"
                  />
                </svg>
              </button>
            ))}
          </div>
        </div>
      )}

      {loading && entries.length === 0 && (
        <div className="mt-6">
          <div className="h-3 w-3 animate-spin rounded-full border-2 border-[#D8D5D0] border-t-[#ED202B] mx-auto" />
        </div>
      )}
    </div>
  );
}
