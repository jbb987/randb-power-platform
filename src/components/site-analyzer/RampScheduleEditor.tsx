import { computeRampSchedule } from '../../lib/rampSchedule';

/** Cap manual ramp length so the fixed-width bar chart (screen + PDF) never overflows.
 *  Matches the auto ramp's DEFAULT_MAX_YEARS so both paths fit the same layout. */
const MAX_RAMP_YEARS = 12;

interface Props {
  /** MW added per year, or null/empty to use the automatic ramp. */
  value: number[] | null;
  /** Target MW (the site's capacity) — used to seed and to sanity-check the total. */
  targetMW: number;
  /** First energization year label (e.g. 2027). */
  startYear: number;
  onChange: (next: number[] | null) => void;
}

/**
 * Edits the Executive Summary power-ramp as a list of per-year MW additions.
 * Empty/null ⇒ the auto ramp is used. "Customize" seeds from the auto schedule
 * so the user starts from a sensible baseline they can tweak.
 */
export default function RampScheduleEditor({ value, targetMW, startYear, onChange }: Props) {
  const isCustom = !!value && value.length > 0;

  const seedFromAuto = () => {
    if (targetMW <= 0) return; // nothing to seed until a capacity is set
    const auto = computeRampSchedule(targetMW, { startYear }).map((p) => p.addedMW);
    onChange(auto.length > 0 ? auto : [targetMW]);
  };

  const rows = value ?? [];
  const atMax = rows.length >= MAX_RAMP_YEARS;

  const setYear = (i: number, mw: number) => {
    const next = [...rows];
    next[i] = Number.isFinite(mw) && mw > 0 ? mw : 0;
    onChange(next);
  };

  const addYear = () => {
    if (!atMax) onChange([...rows, 0]);
  };
  const removeYear = (i: number) => {
    const next = rows.filter((_, idx) => idx !== i);
    onChange(next.length > 0 ? next : null);
  };

  // Single O(n) pass: running cumulative per row + grand total.
  const cumulatives: number[] = [];
  let total = 0;
  for (const n of rows) {
    total += n > 0 ? n : 0;
    cumulatives.push(total);
  }
  const mismatch = isCustom && targetMW > 0 && Math.round(total) !== Math.round(targetMW);

  return (
    <div className="border-t border-[#D8D5D0]/60 pt-4 max-w-md">
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-medium text-[#7A756E]">Ramp schedule</span>
        {isCustom ? (
          <button
            type="button"
            onClick={() => onChange(null)}
            className="text-xs text-[#7A756E] hover:text-[#ED202B] transition"
          >
            Reset to auto
          </button>
        ) : (
          <button
            type="button"
            onClick={seedFromAuto}
            disabled={targetMW <= 0}
            className="text-xs font-medium transition text-[#ED202B] hover:text-[#9B0E18] disabled:text-[#B8B3AD] disabled:cursor-not-allowed"
          >
            Customize
          </button>
        )}
      </div>

      {!isCustom ? (
        <p className="text-xs text-[#7A756E] leading-relaxed">
          {targetMW > 0 ? (
            <>
              Using the <span className="font-medium text-[#201F1E]">automatic</span> ramp — fills
              to {targetMW.toLocaleString()} MW over the shortest sensible schedule. Customize to set
              MW added each year by hand.
            </>
          ) : (
            <>Set a MW capacity above to enable the ramp schedule.</>
          )}
        </p>
      ) : (
        <div>
          <div className="space-y-1.5">
            {rows.map((mw, i) => {
              const cumulative = cumulatives[i];
              return (
                <div key={i} className="flex items-center gap-2">
                  <span className="w-14 text-xs text-[#7A756E] tabular-nums">
                    {startYear + i}
                  </span>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={mw === 0 ? '' : String(mw)}
                    placeholder="0"
                    onChange={(e) => {
                      const n = Math.round(parseFloat(e.target.value.replace(/[^0-9.]/g, '')));
                      setYear(i, Number.isFinite(n) ? n : 0);
                    }}
                    aria-label={`MW added in ${startYear + i}`}
                    className="w-24 rounded-lg border border-[#D8D5D0] bg-white/80 px-2.5 py-1.5 text-right text-sm text-[#201F1E] outline-none transition focus:border-[#ED202B] focus:ring-2 focus:ring-[#ED202B]/20"
                  />
                  <span className="text-xs text-[#7A756E]">MW</span>
                  <span className="flex-1 text-right text-[11px] text-[#7A756E] tabular-nums">
                    {cumulative.toLocaleString()} MW online
                  </span>
                  <button
                    type="button"
                    onClick={() => removeYear(i)}
                    aria-label={`Remove ${startYear + i}`}
                    className="text-[#7A756E] hover:text-[#ED202B] text-lg leading-none px-1 transition"
                  >
                    ×
                  </button>
                </div>
              );
            })}
          </div>

          <div className="flex items-center justify-between mt-2.5">
            <button
              type="button"
              onClick={addYear}
              disabled={atMax}
              className="text-xs font-medium transition text-[#ED202B] hover:text-[#9B0E18] disabled:text-[#B8B3AD] disabled:cursor-not-allowed"
            >
              {atMax ? `Max ${MAX_RAMP_YEARS} years` : '+ Add year'}
            </button>
            <span
              className={`text-[11px] tabular-nums ${mismatch ? 'text-[#9B0E18]' : 'text-[#7A756E]'}`}
            >
              Total {total.toLocaleString()} MW
              {mismatch ? ` (capacity is ${targetMW.toLocaleString()} MW)` : ''}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
