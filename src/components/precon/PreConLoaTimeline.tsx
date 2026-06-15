import { useMemo, useState } from 'react';
import { PRECON_LOA_STATUS_LABELS, type PreConLoaStatus, type PreConSite } from '../../types';
import { displayStepDate, timelineForUtility } from '../../lib/preConWorkflow';

interface Props {
  site: PreConSite;
  canManageLoa: boolean;
  loaUnlocked: boolean; // engineer approved (grade is GO or CONDITIONAL GO)
  onAdvance: (next: PreConLoaStatus) => Promise<void>;
  onSetStepDate: (status: PreConLoaStatus, dateMs: number | null) => Promise<void>;
}

/** Format a Unix-ms date as MM/DD (current year) or MM/DD/YY (other years).
 *  Matches Babi's preferred compact display ("02/06"). */
function formatStepDate(ts: number): string {
  const d = new Date(ts);
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const thisYear = new Date().getFullYear();
  if (d.getFullYear() === thisYear) return `${mm}/${dd}`;
  return `${mm}/${dd}/${String(d.getFullYear()).slice(-2)}`;
}

/** Convert a Unix-ms timestamp to the `YYYY-MM-DD` string format expected by
 *  the native HTML date input. Uses the local timezone so a date the user
 *  reads as Feb 6 round-trips as Feb 6 (not Feb 5 from a UTC-midnight shift). */
function toDateInputValue(ts: number): string {
  const d = new Date(ts);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Parse a `YYYY-MM-DD` value from the date input back to a Unix-ms
 *  timestamp anchored at local midnight. Returns null when the field is
 *  empty. */
function fromDateInputValue(v: string): number | null {
  if (!v) return null;
  const [y, m, d] = v.split('-').map((s) => Number(s));
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d).getTime();
}

export default function PreConLoaTimeline({
  site,
  canManageLoa,
  loaUnlocked,
  onAdvance,
  onSetStepDate,
}: Props) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editingDateFor, setEditingDateFor] = useState<PreConLoaStatus | null>(null);
  const [dateDraft, setDateDraft] = useState<string>('');
  const [savingDate, setSavingDate] = useState(false);

  // Skip the 'not-started' placeholder — it's an initial state, not a real step.
  // No utility argument: every site uses the generic timeline today; per-utility
  // templates land later as a future enhancement.
  const timeline: PreConLoaStatus[] = useMemo(
    () => timelineForUtility(undefined).filter((s) => s !== 'not-started'),
    [],
  );

  // 'loa-executed' is the terminal "complete" state — not a rendered step. It
  // sits one past the final "Letter of Allocation" milestone, so that milestone
  // flips from red (awaiting) to a green check (received).
  const isExecuted = site.loaStatus === 'loa-executed';
  const currentIdx = isExecuted ? timeline.length : timeline.indexOf(site.loaStatus);
  const interactive = canManageLoa && loaUnlocked && !saving;

  // Click target for a given step. Non-terminal steps simply advance to
  // themselves. The terminal step cycles: reach it → red (awaiting LOA) →
  // green (LOA executed) → red again, so the milestone can be set either way.
  function clickTarget(status: PreConLoaStatus): PreConLoaStatus {
    if (status !== 'letter-of-allocation') return status;
    if (site.loaStatus === 'letter-of-allocation') return 'loa-executed';
    if (site.loaStatus === 'loa-executed') return 'letter-of-allocation';
    return 'letter-of-allocation';
  }

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

  function startEditDate(status: PreConLoaStatus, currentMs: number | undefined) {
    setEditingDateFor(status);
    setDateDraft(currentMs ? toDateInputValue(currentMs) : '');
    setError(null);
  }

  function cancelEditDate() {
    setEditingDateFor(null);
    setDateDraft('');
  }

  async function saveEditDate(status: PreConLoaStatus) {
    setSavingDate(true);
    setError(null);
    try {
      await onSetStepDate(status, fromDateInputValue(dateDraft));
      setEditingDateFor(null);
      setDateDraft('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update date.');
    } finally {
      setSavingDate(false);
    }
  }

  if (site.loaStatus === 'rejected') {
    return <div className="text-sm font-medium text-[#ED202B]">Marked as rejected</div>;
  }

  // Stale status from an older timeline schema (pre-v1.43.8 keys like 'draft',
  // 'owner-sign', etc.) — `indexOf` returns -1. Warn the user clearly instead
  // of silently rendering an empty timeline.
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
          // The terminal milestone stays clickable even when it's the current
          // (red) step, so a second click marks the LOA executed (green check);
          // every other current step is a no-op when clicked.
          const clickable = interactive && (isLast || !isCurrent);

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

          const stepDate = displayStepDate(site, status);
          const isEditingThisDate = editingDateFor === status;
          const dateLabel = stepDate ? formatStepDate(stepDate) : 'TBD';

          return (
            <li key={status}>
              <div className="group w-full flex items-stretch gap-3 text-left">
                <div className="flex flex-col items-center w-5 shrink-0">
                  <button
                    type="button"
                    onClick={() => handleClick(clickTarget(status))}
                    disabled={!clickable}
                    aria-label={
                      isLast && isPast
                        ? 'LOA executed — click to mark awaiting'
                        : isLast && isCurrent
                          ? 'Mark LOA executed'
                          : isCurrent
                            ? 'Current step'
                            : clickable
                              ? 'Advance to this step'
                              : undefined
                    }
                    className={`h-5 w-5 shrink-0 rounded-full border-2 flex items-center justify-center transition ${indicatorClass} ${
                      clickable ? 'hover:scale-110 cursor-pointer' : 'cursor-default'
                    } disabled:cursor-default`}
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
                  </button>
                  {!isLast && (
                    <span
                      className="w-0.5 flex-1 mt-1"
                      style={{ backgroundColor: connectorColor, minHeight: '1.25rem' }}
                    />
                  )}
                </div>
                <div className="flex-1 min-w-0 pb-4 pt-0.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => handleClick(clickTarget(status))}
                      disabled={!clickable}
                      className={`text-sm ${labelClass} disabled:cursor-default text-left`}
                    >
                      {PRECON_LOA_STATUS_LABELS[status]}
                    </button>
                    {isEditingThisDate ? (
                      <span className="inline-flex items-center gap-1.5">
                        <input
                          type="date"
                          value={dateDraft}
                          onChange={(e) => setDateDraft(e.target.value)}
                          disabled={savingDate}
                          className="text-xs px-2 py-0.5 border border-[#D8D5D0] rounded focus:outline-none focus:border-[#ED202B] focus:ring-1 focus:ring-[#ED202B]/20"
                        />
                        <button
                          type="button"
                          onClick={() => saveEditDate(status)}
                          disabled={savingDate}
                          className="text-xs font-semibold text-[#ED202B] hover:underline disabled:opacity-50"
                        >
                          {savingDate ? 'Saving…' : 'Save'}
                        </button>
                        <button
                          type="button"
                          onClick={cancelEditDate}
                          disabled={savingDate}
                          className="text-xs text-[#7A756E] hover:text-[#ED202B] disabled:opacity-50"
                        >
                          Cancel
                        </button>
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => canManageLoa && startEditDate(status, stepDate)}
                        disabled={!canManageLoa}
                        title={canManageLoa ? 'Click to edit' : undefined}
                        className={`text-xs font-mono tabular-nums px-1.5 py-0.5 rounded transition ${
                          stepDate
                            ? 'text-[#7A756E] hover:bg-[#ED202B]/5 hover:text-[#ED202B]'
                            : 'text-[#7A756E]/60 italic hover:bg-[#ED202B]/5 hover:text-[#ED202B]'
                        } disabled:cursor-default disabled:hover:bg-transparent disabled:hover:text-[#7A756E]`}
                      >
                        {dateLabel}
                      </button>
                    )}
                  </div>
                </div>
              </div>
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
