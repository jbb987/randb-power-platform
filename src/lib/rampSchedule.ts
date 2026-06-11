/**
 * Power ramp schedule.
 *
 * A site can only energize so much load per year (interconnection,
 * equipment, utility build-out). The base cap is 100 MW/year; the
 * remainder rolls into the next year until the full MW target is online.
 *
 * To keep gigawatt-scale sites sane, the effective per-year cap auto-scales
 * up so the ramp never exceeds {@link DEFAULT_MAX_YEARS} years — a 6.6 GW
 * site ramps in ~12 years, not 66. Sites under ~1.2 GW are unaffected and
 * still ramp at the 100 MW/year base.
 *
 * Pure — no IO. Used by the Site Analyzer One-Pager (screen + PDF).
 */

/** Base per-year energization cap, in MW. */
export const DEFAULT_ANNUAL_CAP_MW = 100;

/** Auto-scale the per-year cap so the ramp never runs longer than this many years. */
export const DEFAULT_MAX_YEARS = 12;

export interface RampPhase {
  /** 1-based phase number. */
  index: number;
  /** Calendar year when `startYear` is supplied, otherwise == `index`. */
  year: number;
  /** MW energized during this year. */
  addedMW: number;
  /** Running total online by the end of this year. */
  cumulativeMW: number;
}

export interface RampOptions {
  /** Per-year cap (MW). Falls back to {@link DEFAULT_ANNUAL_CAP_MW}. */
  annualCapMW?: number;
  /** Cap the ramp length; the per-year cap scales up to fit. Falls back to {@link DEFAULT_MAX_YEARS}. */
  maxYears?: number;
  /** First energization year (e.g. 2027). When omitted, phases are labelled Year 1, 2, 3… */
  startYear?: number;
}

/**
 * Build the year-by-year buildout to reach `targetMW`.
 *
 * `years = ceil(target / cap)`; each year adds up to `cap` MW until the
 * target is reached (the final year carries the remainder).
 *
 * Returns `[]` for a non-positive target.
 */
export function computeRampSchedule(targetMW: number, opts: RampOptions = {}): RampPhase[] {
  const baseCap = opts.annualCapMW && opts.annualCapMW > 0 ? opts.annualCapMW : DEFAULT_ANNUAL_CAP_MW;
  const maxYears = opts.maxYears && opts.maxYears > 0 ? opts.maxYears : DEFAULT_MAX_YEARS;
  const target = Number.isFinite(targetMW) && targetMW > 0 ? targetMW : 0;
  if (target <= 0) return [];

  // Scale the per-year cap up if the base pace would overrun maxYears.
  const cap = Math.max(baseCap, Math.ceil(target / maxYears));

  const years = Math.ceil(target / cap);
  const phases: RampPhase[] = [];
  let prev = 0;
  for (let i = 1; i <= years; i++) {
    const cumulativeMW = Math.min(i * cap, target);
    phases.push({
      index: i,
      year: opts.startYear ? opts.startYear + i - 1 : i,
      addedMW: cumulativeMW - prev,
      cumulativeMW,
    });
    prev = cumulativeMW;
  }
  return phases;
}

/**
 * Build a ramp from a manual list of per-year MW *additions* (e.g.
 * `[150, 100, 70]` → cumulative 150 / 250 / 320). Negative/invalid entries
 * count as 0. Returns `[]` for an empty list.
 */
export function rampFromIncrements(
  increments: number[],
  opts: { startYear?: number } = {},
): RampPhase[] {
  const phases: RampPhase[] = [];
  let cumulativeMW = 0;
  increments.forEach((raw, i) => {
    const addedMW = Number.isFinite(raw) && raw > 0 ? raw : 0;
    cumulativeMW += addedMW;
    phases.push({
      index: i + 1,
      year: opts.startYear ? opts.startYear + i : i + 1,
      addedMW,
      cumulativeMW,
    });
  });
  return phases;
}
