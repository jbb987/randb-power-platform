import { useMemo, useState } from 'react';
import { PRECON_LOA_STATUS_LABELS, type PreConLoaStatus, type PreConSite } from '../../types';
import { timelineForUtility } from '../../lib/preConWorkflow';

interface Props {
  site: PreConSite;
  canManageLoa: boolean;
  loaUnlocked: boolean; // engineer approved (grade is GO or CONDITIONAL GO)
  onAdvance: (next: PreConLoaStatus) => Promise<void>;
}

export default function PreConLoaTimeline({ site, canManageLoa, loaUnlocked, onAdvance }: Props) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Skip the 'not-started' placeholder — it's an initial state, not a real step.
  // No utility argument: every site uses the generic timeline today; per-utility
  // templates land later as a future enhancement.
  const timeline: PreConLoaStatus[] = useMemo(
    () => timelineForUtility(undefined).filter((s) => s !== 'not-started'),
    [],
  );

  const currentIdx = timeline.indexOf(site.loaStatus);
  const interactive = canManageLoa && loaUnlocked && !saving;

  async function handleClick(next: PreConLoaStatus) {
    if (next === site.loaStatus) return;
    setSaving(true);
    setError(null);
    try {
      await onAdvance(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update status.');
    } finally {
      setSaving(false);
    }
  }

  if (site.loaStatus === 'rejected') {
    return <div className="text-sm font-medium text-[#ED202B]">Marked as rejected</div>;
  }

  // Stale status from an older timeline schema (pre-v1.43.8 keys like 'draft',
  // 'owner-sign', etc.) — `indexOf` returns -1. Warn the user clearly instead
  // of silently rendering an empty timeline.
  // (`rejected` is handled by the early return above, so we only need to
  // exclude `not-started` from the stale-status check.)
  const isStaleStatus = currentIdx === -1 && site.loaStatus !== 'not-started';

  return (
    <div className="space-y-3">
      {isStaleStatus && (
        <div className="rounded-lg border border-[#F59E0B]/40 bg-[#F59E0B]/5 px-3 py-2 text-xs text-[#7A756E]">
          This site's status (<span className="font-medium">{site.loaStatus}</span>) is from an
          older version of the timeline. Pick the current step that matches to continue.
        </div>
      )}
      <ol>
        {timeline.map((status, idx) => {
          const isPast = currentIdx >= 0 && idx < currentIdx;
          const isCurrent = idx === currentIdx;
          const isLast = idx === timeline.length - 1;
          const clickable = interactive && !isCurrent;

          const indicatorClass = isPast
            ? 'border-[#10B981] bg-[#10B981]'
            : isCurrent
              ? 'border-[#ED202B] bg-[#ED202B]'
              : 'border-[#D8D5D0] bg-white';

          // Connector below the indicator: red on segments the user has
          // already traversed (past → current), gray on segments still ahead.
          const connectorColor = isPast ? '#ED202B' : '#D8D5D0';

          const labelClass = isCurrent
            ? 'font-semibold text-[#201F1E]'
            : isPast
              ? 'font-medium text-[#201F1E]'
              : 'font-medium text-[#7A756E]';

          return (
            <li key={status}>
              <button
                type="button"
                onClick={() => handleClick(status)}
                disabled={!clickable}
                className="group w-full flex items-stretch gap-3 text-left disabled:cursor-not-allowed"
              >
                <div className="flex flex-col items-center w-5 shrink-0">
                  <span
                    className={`h-5 w-5 shrink-0 rounded-full border-2 flex items-center justify-center transition ${indicatorClass} ${
                      clickable ? 'group-hover:scale-110' : ''
                    }`}
                  >
                    {isPast && (
                      <svg
                        className="h-3 w-3 text-white"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        strokeWidth={3}
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                  </span>
                  {!isLast && (
                    <span
                      className="w-0.5 flex-1 mt-1"
                      style={{ backgroundColor: connectorColor, minHeight: '1.25rem' }}
                    />
                  )}
                </div>
                <div className="flex-1 min-w-0 pb-4 pt-0.5">
                  <span className={`text-sm ${labelClass}`}>
                    {PRECON_LOA_STATUS_LABELS[status]}
                  </span>
                </div>
              </button>
            </li>
          );
        })}
      </ol>

      {error && (
        <p className="text-sm text-[#ED202B]" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
