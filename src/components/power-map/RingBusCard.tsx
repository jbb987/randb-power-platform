import { useEffect, useState } from 'react';
import { estimateRingBus, screeningGrab, type GrabVerdict } from '../../lib/ringBus';
import { getFieldCount, saveFieldCount, type SubstationFieldCount } from '../../lib/fieldCounts';
import { useAuth } from '../../hooks/useAuth';

interface RingBusCardProps {
  /** Connected-line count from HIFLD. */
  lineCount: number;
  /** High-side voltage (kV) — sizes the typical transformer for the class. */
  maxVolt: number;
  /** "Available today" MW from the map's energy-balance model (active subs only). */
  availableMW?: number;
  /** Identity for persisting the count. */
  hifldId?: number;
  substationName: string;
  lat: number;
  lng: number;
}

const VERDICT_COPY: Record<GrabVerdict, string> = {
  'station-limited': 'Station is the cap — building unlocks the rest of the area surplus.',
  'system-limited': "Area supply is the cap — more station equipment won't help here.",
  aligned: 'Both methods agree — higher confidence in this range.',
};

const fmtRange = (low: number, high: number) =>
  low === high ? low.toLocaleString() : `${low.toLocaleString()}–${high.toLocaleString()}`;

const fmtSavedDate = (saved: SubstationFieldCount): string => {
  const d = saved.savedAt?.toDate?.();
  return d
    ? d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    : '';
};

/**
 * Ring-bus estimator (Bailey's field rule): count the breakers on the aerial
 * view, and since a ring bus holds one breaker per circuit element,
 * transformers ≈ breakers − lines. Each inferred transformer is sized by the
 * typical MVA range for the voltage class — a screening read of how much the
 * station can hand over. When the map's availability model has a number for
 * the same substation, the card shows both and the grabbable minimum.
 *
 * Counts persist per substation (`substation-field-counts`): a saved count
 * prefills the card for the whole team, stamped with who counted and when.
 */
export default function RingBusCard({
  lineCount,
  maxVolt,
  availableMW,
  hifldId,
  substationName,
  lat,
  lng,
}: RingBusCardProps) {
  const { user } = useAuth();
  const [breakersRaw, setBreakersRaw] = useState('');
  const [saved, setSaved] = useState<SubstationFieldCount | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);

  // Load a previously saved count for this substation (session-cached).
  // Waits for auth (rules require it); a late-resolving load never clobbers a
  // fresh save (functional setSaved keeps whichever arrived first).
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    getFieldCount(hifldId, lat, lng)
      .then((fc) => {
        if (cancelled || !fc) return;
        setSaved((prev) => prev ?? fc);
        setBreakersRaw((prev) => (prev === '' ? String(fc.breakers) : prev));
      })
      .catch(() => {
        if (!cancelled) setLoadFailed(true); // offline/permissions — warn before overwrite
      });
    return () => {
      cancelled = true;
    };
  }, [user, hifldId, lat, lng]);

  const breakersNum = Number(breakersRaw);
  const breakers = Number.isInteger(breakersNum) ? breakersNum : NaN;
  const estimate = estimateRingBus(breakers, lineCount, maxVolt);
  const grab = estimate && availableMW != null ? screeningGrab(estimate, availableMW) : null;
  const isSavedValue = saved != null && saved.breakers === breakers;
  const savedDate = saved ? fmtSavedDate(saved) : '';

  const handleSave = async () => {
    if (!estimate || !user) return;
    setSaving(true);
    setSaveError(false);
    const record: Omit<SubstationFieldCount, 'savedAt'> = {
      breakers,
      lines: lineCount,
      maxVoltKV: maxVolt,
      substationName,
      hifldId: hifldId ?? null,
      lat,
      lng,
      savedByUid: user.uid,
      savedByEmail: user.email ?? '',
    };
    try {
      await saveFieldCount(record);
      setSaved({ ...record, savedAt: null });
    } catch {
      setSaveError(true);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="pt-2 mt-1 border-t border-[#D8D5D0]">
      <div className="text-[10px] uppercase tracking-wide text-[#7A756E] mb-1">
        Ring bus estimate
      </div>
      <div className="flex items-center justify-between gap-2 text-xs">
        <label htmlFor="ring-bus-breakers" className="text-[#7A756E]">
          Breakers counted on aerial
        </label>
        <input
          id="ring-bus-breakers"
          type="number"
          min={1}
          max={40}
          inputMode="numeric"
          value={breakersRaw}
          onChange={(e) => setBreakersRaw(e.target.value)}
          placeholder="—"
          className="w-14 rounded-md border border-[#D8D5D0] px-1.5 py-0.5 text-right text-xs text-[#201F1E] focus:border-[#ED202B] focus:ring-2 focus:ring-[#ED202B]/20 focus:outline-none"
        />
      </div>
      {estimate ? (
        <div className="mt-1.5 space-y-1">
          <div className="flex justify-between text-xs">
            <span className="text-[#7A756E]">Est. transformers</span>
            <span className="font-medium text-[#201F1E]">
              {estimate.transformers}
              {estimate.transformers > 0 && estimate.mvaPerXfmr && (
                <span className="text-[#7A756E] font-normal">
                  {' '}
                  × {estimate.mvaPerXfmr.low}–{estimate.mvaPerXfmr.high} MVA
                </span>
              )}
            </span>
          </div>
          {estimate.transformers > 0 && estimate.capacityMVA && (
            <div className="flex justify-between text-xs">
              <span className="text-[#7A756E]">Station max</span>
              <span className="font-medium text-[#201F1E]">
                {fmtRange(estimate.capacityMVA.low, estimate.capacityMVA.high)} MVA
              </span>
            </div>
          )}
          {grab && (
            <>
              <div className="flex justify-between text-xs">
                <span className="text-[#7A756E]">Available in the area</span>
                <span className="font-medium text-[#201F1E]">
                  {Math.max(0, availableMW ?? 0).toLocaleString()} MW
                </span>
              </div>
              <div className="flex justify-between text-xs pt-1 mt-0.5 border-t border-dashed border-[#D8D5D0]">
                <span className="text-[#7A756E]">You can grab (screening)</span>
                <span className="font-semibold text-[#ED202B]">
                  ~{fmtRange(grab.grabMW.low, grab.grabMW.high)} MW
                </span>
              </div>
              <p className="text-[10px] leading-snug text-[#7A756E]">
                {VERDICT_COPY[grab.verdict]}
              </p>
            </>
          )}
          {estimate.caveats.map((c) => (
            <p key={c} className="text-[10px] leading-snug text-[#7A756E]">
              {c}
            </p>
          ))}
          <div className="flex items-center justify-between gap-2 pt-0.5">
            {isSavedValue ? (
              <p className="text-[10px] leading-snug text-[#7A756E]">
                Saved{saved.savedByEmail ? ` by ${saved.savedByEmail}` : ''}
                {savedDate ? ` · ${savedDate}` : ' · just now'}
              </p>
            ) : (
              <>
                <p className="text-[10px] leading-snug text-[#7A756E]">
                  {saved
                    ? `Overwrites the saved count (${saved.breakers}).`
                    : 'Save so the team never recounts this yard.'}
                </p>
                <button
                  onClick={handleSave}
                  disabled={saving || !user}
                  className="shrink-0 rounded-md bg-[#ED202B] px-2 py-0.5 text-[11px] font-medium text-white hover:bg-[#9B0E18] disabled:opacity-50"
                >
                  {saving ? 'Saving…' : 'Save count'}
                </button>
              </>
            )}
          </div>
          {loadFailed && !saved && (
            <p className="text-[10px] leading-snug text-[#F97316]">
              Couldn't check for an existing saved count — saving may overwrite a teammate's.
            </p>
          )}
          {saveError && (
            <p className="text-[10px] leading-snug text-[#ED202B]">
              Could not save — check your connection and try again.
            </p>
          )}
        </div>
      ) : (
        <p className="mt-1 text-[10px] leading-snug text-[#7A756E]">
          On a ring bus, breakers = lines + transformers — so transformers ≈ breakers − {lineCount}{' '}
          known line{lineCount === 1 ? '' : 's'}.
        </p>
      )}
    </div>
  );
}
