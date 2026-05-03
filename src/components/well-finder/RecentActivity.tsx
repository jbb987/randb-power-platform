import { useState } from 'react';
import { useRecentChanges } from '../../hooks/useRecentChanges';
import type { WellChangeEvent, WellChangeType } from '../../types';

const TYPE_LABEL: Record<WellChangeType, string> = {
  newly_shut_in: 'newly shut-in',
  newly_reactivated: 'newly reactivated',
  newly_plugged: 'newly plugged',
};

const TYPE_COLOR: Record<WellChangeType, string> = {
  newly_shut_in: '#F59E0B',     // amber — new candidate
  newly_reactivated: '#10B981', // green — someone got there first
  newly_plugged: '#1F2937',     // gray — lost candidate
};

interface RecentActivityProps {
  /** Click-to-fly handler — receives the API# of the well event clicked. */
  onSelect: (api: string) => void;
}

export default function RecentActivity({ onSelect }: RecentActivityProps) {
  const [open, setOpen] = useState(false);
  const { events, countsLatestMonth, latestSnapshotMonth, loading } = useRecentChanges();

  const total = countsLatestMonth.newly_shut_in
              + countsLatestMonth.newly_reactivated
              + countsLatestMonth.newly_plugged;

  return (
    <>
      <div className="p-3 border-b border-[#D8D5D0] bg-white">
        <div className="flex items-baseline justify-between mb-1.5">
          <span className="text-[10px] uppercase tracking-wide text-[#7A756E]">
            Recent activity
          </span>
          {latestSnapshotMonth && (
            <span className="text-[10px] text-[#7A756E]">{latestSnapshotMonth}</span>
          )}
        </div>
        {loading ? (
          <div className="text-xs text-[#7A756E] flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 border-2 border-[#ED202B]/30 border-t-[#ED202B] rounded-full animate-spin" />
            Loading
          </div>
        ) : total === 0 ? (
          <p className="text-xs text-[#7A756E] italic">No recent changes detected.</p>
        ) : (
          <button
            onClick={() => setOpen(true)}
            className="w-full text-left space-y-0.5 hover:bg-stone-50 rounded p-1 -m-1 transition"
          >
            {(Object.entries(countsLatestMonth) as [WellChangeType, number][]).map(
              ([type, count]) =>
                count > 0 && (
                  <div key={type} className="flex items-center gap-2 text-xs">
                    <span
                      className="inline-block w-2 h-2 rounded-full shrink-0"
                      style={{ backgroundColor: TYPE_COLOR[type] }}
                    />
                    <span className="text-[#201F1E] font-medium tabular-nums">
                      +{count}
                    </span>
                    <span className="text-[#7A756E]">{TYPE_LABEL[type]}</span>
                  </div>
                ),
            )}
            <div className="text-[10px] text-[#ED202B] pt-0.5">View all →</div>
          </button>
        )}
      </div>

      {open && (
        <ChangesModal
          events={events}
          onClose={() => setOpen(false)}
          onSelect={(api) => {
            setOpen(false);
            onSelect(api);
          }}
        />
      )}
    </>
  );
}

function ChangesModal({
  events,
  onClose,
  onSelect,
}: {
  events: WellChangeEvent[];
  onClose: () => void;
  onSelect: (api: string) => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div
        className="bg-white rounded-xl shadow-xl border border-[#D8D5D0] max-w-2xl w-full max-h-[80vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 py-3 border-b border-[#D8D5D0] flex items-center justify-between">
          <h3 className="font-heading text-lg font-semibold text-[#201F1E]">
            Recent status changes
          </h3>
          <button
            onClick={onClose}
            className="text-[#7A756E] hover:text-[#201F1E] text-xl"
          >
            ×
          </button>
        </div>
        <div className="flex-1 overflow-auto">
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-stone-50 border-b border-[#D8D5D0]">
              <tr className="text-left text-[10px] uppercase tracking-wide text-[#7A756E]">
                <th className="px-3 py-2">Type</th>
                <th className="px-3 py-2">API</th>
                <th className="px-3 py-2">Was</th>
                <th className="px-3 py-2">Now</th>
                <th className="px-3 py-2">Detected</th>
              </tr>
            </thead>
            <tbody>
              {events.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-3 py-8 text-center text-[#7A756E] italic">
                    No status-change events recorded yet.
                  </td>
                </tr>
              )}
              {events.map((e, i) => (
                <tr
                  key={`${e.api}_${e.changeType}_${e.snapshotMonth}_${i}`}
                  onClick={() => onSelect(e.api)}
                  className="border-b border-[#F0EDE9] hover:bg-stone-50 cursor-pointer"
                >
                  <td className="px-3 py-2">
                    <span className="flex items-center gap-1.5">
                      <span
                        className="inline-block w-2 h-2 rounded-full"
                        style={{ backgroundColor: TYPE_COLOR[e.changeType] }}
                      />
                      <span className="text-[#201F1E]">{TYPE_LABEL[e.changeType]}</span>
                    </span>
                  </td>
                  <td className="px-3 py-2 font-mono">{e.api}</td>
                  <td className="px-3 py-2 text-[#7A756E]">{e.oldStatus}</td>
                  <td className="px-3 py-2 text-[#201F1E]">{e.newStatus}</td>
                  <td className="px-3 py-2 text-[#7A756E] tabular-nums">
                    {new Date(e.detectedAt).toLocaleDateString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="px-5 py-2 border-t border-[#D8D5D0] text-[10px] text-[#7A756E] italic">
          Click any row to fly the map to the well and see its full profile.
        </div>
      </div>
    </div>
  );
}
