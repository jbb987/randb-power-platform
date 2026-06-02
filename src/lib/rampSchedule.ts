/**
 * Power ramp schedule.
 *
 * A site can only energize so much load per year (interconnection,
 * equipment, utility build-out). The default cap is 100 MW/year; the
 * remainder rolls into the next year until the full MW target is online.
 *
 * Pure — no IO. Used by the Site Analyzer One-Pager (screen + PDF).
 */

/** Default per-year energization cap, in MW. */
export const DEFAULT_ANNUAL_CAP_MW = 100;

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
  const cap = opts.annualCapMW && opts.annualCapMW > 0 ? opts.annualCapMW : DEFAULT_ANNUAL_CAP_MW;
  const target = Number.isFinite(targetMW) && targetMW > 0 ? targetMW : 0;
  if (target <= 0) return [];

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
