import { useEffect, useMemo, useState } from 'react';
import { useUsers } from '../../hooks/useUsers';
import Button from '../ui/Button';
import PreConGradePill from './PreConGradePill';
import {
  ALL_PRECON_GRADES,
  PRECON_GRADE_COLORS,
  PRECON_GRADE_LABELS,
  type PreConGrade,
  type PreConSite,
} from '../../types';

interface SaveInput {
  engineerReviewerId: string | undefined;
  verifiedMW: number | undefined;
  grade: PreConGrade | undefined;
}

interface Props {
  site: PreConSite;
  canEditStatus: boolean;
  onSave: (input: SaveInput) => Promise<void>;
}

function formatVerifiedDate(ts: number | undefined): string {
  if (!ts) return '';
  return new Date(ts).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export default function PreConStatusCard({ site, canEditStatus, onSave }: Props) {
  const { users } = useUsers();

  // "Verdict in" = the engineer has signed off (grade is set). Drives lock/edit.
  const verdictIn =
    site.engineerReviewStatus === 'approved' || site.engineerReviewStatus === 'rejected';

  // Always start collapsed — the engineer (or PM) clicks the Review / Re-review
  // button to open the form intentionally. Avoids the form appearing as a
  // half-filled blob on page load.
  const [editing, setEditing] = useState(false);
  const [engineerId, setEngineerId] = useState<string>(site.engineerReviewerId ?? '');
  const [mwInput, setMwInput] = useState<string>(
    site.engineerVerifiedMW !== undefined ? String(site.engineerVerifiedMW) : '',
  );
  const [grade, setGrade] = useState<PreConGrade | undefined>(site.grade);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Pull form fields from Firestore-backed `site` whenever it changes (e.g.
  // another user edited concurrently, or our own save just propagated).
  useEffect(() => {
    setEngineerId(site.engineerReviewerId ?? '');
    setMwInput(site.engineerVerifiedMW !== undefined ? String(site.engineerVerifiedMW) : '');
    setGrade(site.grade);
  }, [site.engineerReviewerId, site.engineerVerifiedMW, site.grade]);

  // Once a verdict is recorded, re-lock — keeps the card stable after a save
  // and across snapshot updates.
  useEffect(() => {
    if (verdictIn) setEditing(false);
  }, [verdictIn, site.engineerCompletedAt]);

  const engineerUser = useMemo(
    () => (site.engineerReviewerId ? users.find((u) => u.id === site.engineerReviewerId) : null),
    [users, site.engineerReviewerId],
  );

  const mwValue = mwInput.trim() ? Number(mwInput) : undefined;
  const mwInvalid = mwInput.trim() !== '' && !Number.isFinite(mwValue);

  const dirty =
    (engineerId || undefined) !== (site.engineerReviewerId ?? undefined) ||
    mwValue !== site.engineerVerifiedMW ||
    grade !== site.grade;

  async function handleSave() {
    if (mwInvalid) {
      setError('Verified MW must be a number.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onSave({
        engineerReviewerId: engineerId || undefined,
        verifiedMW: mwValue,
        grade,
      });
      // Close the form on successful save. The verdictIn-based effect below
      // only fires when engineerReviewStatus / engineerCompletedAt change —
      // on a re-review where only engineer or MW shifts but the grade stays
      // GO/CONDITIONAL, neither moves and the form would otherwise stay open.
      setEditing(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save.');
    } finally {
      setSaving(false);
    }
  }

  function handleCancel() {
    setEngineerId(site.engineerReviewerId ?? '');
    setMwInput(site.engineerVerifiedMW !== undefined ? String(site.engineerVerifiedMW) : '');
    setGrade(site.grade);
    setError(null);
    setEditing(false);
  }

  const suggestion =
    site.gradeSuggested && !site.grade
      ? { grade: site.gradeSuggested, color: PRECON_GRADE_COLORS[site.gradeSuggested] }
      : null;

  // ── Unreviewed (no verdict yet) — collapsed view with a prominent CTA ──
  if (!editing && !verdictIn) {
    return (
      <div className="bg-white rounded-xl border border-[#D8D5D0] shadow-sm p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-heading text-lg font-semibold text-[#201F1E]">Site evaluation</h2>
          {canEditStatus && <Button onClick={() => setEditing(true)}>Review</Button>}
        </div>
        <p className="text-sm text-[#7A756E] mt-2">
          {engineerUser ? `Awaiting review from ${engineerUser.email}` : 'Not yet reviewed'}
        </p>
      </div>
    );
  }

  // ── Locked view (verdict in) ───────────────────────────────────────────
  if (!editing) {
    return (
      <div className="bg-white rounded-xl border border-[#D8D5D0] shadow-sm p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-heading text-lg font-semibold text-[#201F1E]">Site evaluation</h2>
          {canEditStatus && <Button onClick={() => setEditing(true)}>Re-review</Button>}
        </div>

        <div className="mt-2">
          <PreConGradePill grade={site.grade} size="md" />
        </div>

        <div className="mt-2">
          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium bg-[#10B981]/10 text-[#10B981]">
            <svg
              className="h-3 w-3"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={3}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
            Verified by {engineerUser?.email ?? '…'}
            {site.engineerCompletedAt && (
              <> · {formatVerifiedDate(site.engineerCompletedAt)}</>
            )}
          </span>
        </div>

        <dl className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <dt className="text-xs uppercase tracking-wide text-[#7A756E] font-medium">Engineer</dt>
            <dd className="text-sm font-medium text-[#201F1E] mt-0.5">
              {engineerUser?.email ?? '—'}
            </dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-[#7A756E] font-medium">
              Verified MW
            </dt>
            <dd className="text-sm font-medium text-[#201F1E] mt-0.5">
              {site.engineerVerifiedMW !== undefined ? `${site.engineerVerifiedMW} MW` : '—'}
            </dd>
          </div>
        </dl>
      </div>
    );
  }

  // ── Edit view ──────────────────────────────────────────────────────────
  return (
    <div className="bg-white rounded-xl border border-[#D8D5D0] shadow-sm p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
        <h2 className="font-heading text-lg font-semibold text-[#201F1E]">Site evaluation</h2>
        <PreConGradePill grade={site.grade} size="md" />
      </div>

      {suggestion && (
        <div className="text-xs text-[#7A756E] mb-3">
          Suggested:{' '}
          <span style={{ color: suggestion.color }} className="font-semibold">
            {PRECON_GRADE_LABELS[suggestion.grade]}
          </span>
        </div>
      )}

      <div className="space-y-3">
        <div>
          <label className="block text-xs uppercase tracking-wide text-[#7A756E] font-medium mb-1">
            Engineer
          </label>
          <select
            value={engineerId}
            onChange={(e) => setEngineerId(e.target.value)}
            disabled={!canEditStatus || saving}
            className="w-full px-3 py-2 text-sm bg-white border border-[#D8D5D0] rounded-lg focus:outline-none focus:border-[#ED202B] focus:ring-2 focus:ring-[#ED202B]/20 transition disabled:bg-[#FAFAF9]"
          >
            <option value="">Select an engineer…</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.email}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-xs uppercase tracking-wide text-[#7A756E] font-medium mb-1">
            Verified MW
          </label>
          <input
            type="number"
            value={mwInput}
            onChange={(e) => setMwInput(e.target.value)}
            disabled={!canEditStatus || saving}
            step="0.1"
            placeholder="Max MW the site can support"
            className="w-full px-3 py-2 text-sm bg-white border border-[#D8D5D0] rounded-lg focus:outline-none focus:border-[#ED202B] focus:ring-2 focus:ring-[#ED202B]/20 transition disabled:bg-[#FAFAF9]"
          />
        </div>

        <div>
          <label className="block text-xs uppercase tracking-wide text-[#7A756E] font-medium mb-1">
            Status
          </label>
          <div className="flex flex-wrap gap-2">
            {ALL_PRECON_GRADES.map((g) => {
              const active = grade === g;
              const color = PRECON_GRADE_COLORS[g];
              return (
                <button
                  key={g}
                  type="button"
                  disabled={!canEditStatus || saving}
                  onClick={() => setGrade(g)}
                  className="px-3 py-1.5 rounded-lg text-sm font-semibold border transition disabled:opacity-60 disabled:cursor-not-allowed"
                  style={{
                    color: active ? '#FFFFFF' : color,
                    backgroundColor: active ? color : `${color}1A`,
                    borderColor: color,
                  }}
                >
                  {PRECON_GRADE_LABELS[g]}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {error && (
        <p className="mt-3 text-sm text-[#ED202B]" role="alert">
          {error}
        </p>
      )}

      <div className="mt-4 flex justify-end gap-2">
        <Button variant="ghost" onClick={handleCancel} disabled={saving}>
          Cancel
        </Button>
        <Button
          disabled={!canEditStatus || !dirty || mwInvalid || saving}
          onClick={handleSave}
        >
          {saving ? 'Saving…' : 'Save'}
        </Button>
      </div>
    </div>
  );
}
