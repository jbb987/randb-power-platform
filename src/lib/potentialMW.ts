import type { NearbySubstation, NearbyLine, GridMwEstimate } from '../types';

export type { GridMwEstimate };

/**
 * Grid Strength estimator.
 *
 * Estimates the GROSS interconnection capacity of the grid node nearest a site
 * — the substation's voltage class × a line-count factor. This is a *location
 * quality score* ("how strong is the grid here"), NOT a parcel's deliverable MW.
 *
 * Important scoping (validated with the Sherman stress-test): for a LOAD project
 * the deliverable is set by the utility's hosting-capacity study and ERCOT's
 * (confidential, per-site) large-LOAD interconnection process — NOT by public
 * data. The generation interconnection queue is the wrong competitor for load
 * (generation can even offset load via co-location), so it is intentionally NOT
 * subtracted here. This number is a screening signal that informs the engineer's
 * target; it does not try to reproduce it.
 *
 * Pure compute over already-fetched infra (`nearbySubstations` + `nearbyLines`),
 * mirroring `computeAppraisal` in appraisal.ts — no async, no fetch, no side
 * effects. Bands, the line factor, and the upside gap are the tunable knobs.
 */

/** Voltage-class → [low, high] MW capacity band. Tunable. */
export interface VoltageBand {
  /** Inclusive lower kV bound for this band. */
  minKV: number;
  low: number;
  high: number;
}

/** Ordered ascending by minKV. `bandFor()` picks the highest band whose minKV ≤ kV. */
export const VOLTAGE_BANDS: VoltageBand[] = [
  { minKV: 0, low: 25, high: 50 }, // < 69 kV (distribution-class)
  { minKV: 69, low: 50, high: 150 }, // 69–115 kV (sub-transmission)
  { minKV: 116, low: 150, high: 300 }, // 138 kV (workhorse transmission)
  { minKV: 200, low: 300, high: 600 }, // 230 kV (bulk)
  { minKV: 300, low: 600, high: 1500 }, // 345 kV+ (backbone)
];

/** Voltage tiers used to measure "how many tiers higher" a nearby line is. */
export const VOLTAGE_TIERS = [69, 138, 230, 345, 500] as const;

export const LINE_FACTOR_MIN = 0.5;
export const LINE_FACTOR_MAX = 1.5;

/** A line must be this many voltage tiers above the substation to flag upside. */
export const UPSIDE_TIER_GAP = 2;

/** Substations within this radius (mi) are candidates for the headroom driver. */
const DRIVER_RADIUS_MI = 5;

/** Tolerance (kV) for "a nearby line confirms the substation voltage". */
const VOLTAGE_CONFIRM_TOLERANCE_KV = 10;

const HIFLD_PLACEHOLDER = /^UNKNOWN\d+$/i;
const SENTINEL = -999999;

/** Finite-safe voltage; sentinel / non-positive → 0 (treated as missing). */
function cleanVolt(v: number | undefined | null): number {
  const n = Number(v);
  if (!Number.isFinite(n) || n === SENTINEL || n <= 0) return 0;
  return n;
}

function bandFor(kv: number): VoltageBand {
  let band = VOLTAGE_BANDS[0];
  for (const b of VOLTAGE_BANDS) if (kv >= b.minKV) band = b;
  return band;
}

/** Index of the voltage tier nearest at-or-below kv (for the "tiers higher" gap). */
function tierIndex(kv: number): number {
  let idx = 0;
  for (let i = 0; i < VOLTAGE_TIERS.length; i++) if (kv >= VOLTAGE_TIERS[i]) idx = i;
  return idx;
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

function isInService(status: string): boolean {
  return !status || /in service/i.test(status);
}

/**
 * Pick the capacity-driving substation: highest valid maxVolt within
 * DRIVER_RADIUS_MI (tie → most lines → nearest); else the nearest valid one.
 */
function pickDriver(subs: NearbySubstation[]): NearbySubstation | null {
  const valid = subs.filter((s) => cleanVolt(s.maxVolt) > 0 && isInService(s.status));
  if (valid.length === 0) return null;

  const near = valid.filter((s) => s.distanceMi <= DRIVER_RADIUS_MI);
  const pool = near.length > 0 ? near : valid;

  return [...pool].sort((a, b) => {
    const v = cleanVolt(b.maxVolt) - cleanVolt(a.maxVolt);
    if (v !== 0) return v;
    const l = (b.lines || 0) - (a.lines || 0);
    if (l !== 0) return l;
    return a.distanceMi - b.distanceMi;
  })[0];
}

/**
 * Estimate the gross Grid Strength (node capacity) for a site from already-
 * fetched power-infrastructure data. Returns null when there's no usable
 * substation. Pure — no async, no queue subtraction (see file header).
 */
export function estimatePotentialMW(
  infra: { nearbySubstations?: NearbySubstation[]; nearbyLines?: NearbyLine[] } | null | undefined,
): GridMwEstimate | null {
  const subs = infra?.nearbySubstations ?? [];
  const lines = infra?.nearbyLines ?? [];

  const driver = pickDriver(subs);
  if (!driver) return null;

  const maxVoltKV = cleanVolt(driver.maxVolt);
  const lineCount = driver.lines || 0;
  const lineFactor = clamp(lineCount / 2, LINE_FACTOR_MIN, LINE_FACTOR_MAX);

  const band = bandFor(maxVoltKV);
  const baseLow = Math.round(band.low * lineFactor);
  const baseHigh = Math.round(band.high * lineFactor);
  const expected = Math.round(((band.low + band.high) / 2) * lineFactor);

  const notes: string[] = [];
  const substationNamed =
    !HIFLD_PLACEHOLDER.test(driver.name) && driver.name.toUpperCase() !== 'NOT AVAILABLE';

  // Voltage confirmation: a nearby line within tolerance of the substation kV.
  const lineVolts = lines.map((l) => cleanVolt(l.voltage)).filter((v) => v > 0);
  const voltageConfirmedByLines = lineVolts.some(
    (v) => Math.abs(v - maxVoltKV) <= Math.max(VOLTAGE_CONFIRM_TOLERANCE_KV, 0.1 * maxVoltKV),
  );

  notes.push(
    `${maxVoltKV} kV substation${substationNamed ? ` (${driver.name})` : ''}, ${lineCount} line${lineCount === 1 ? '' : 's'}, ${driver.distanceMi.toFixed(1)} mi.`,
  );

  // ── Hybrid upside: a corridor ≥UPSIDE_TIER_GAP tiers above the substation ──
  let high = baseHigh;
  let upside: GridMwEstimate['basis']['upside'];
  const hiLine = lineVolts.length ? Math.max(...lineVolts) : 0;
  if (hiLine > 0 && tierIndex(hiLine) - tierIndex(maxVoltKV) >= UPSIDE_TIER_GAP) {
    const widened = bandFor(hiLine).low;
    high = Math.max(baseHigh, widened);
    upside = { lineVoltageKV: hiLine, appliedHighMW: high };
    notes.push(`${hiLine} kV corridor in area — tap/switchyard upside widens the high end.`);
  }

  // ── Confidence ── grid-strength alone caps at MEDIUM (no utility study).
  let confidence: GridMwEstimate['confidence'];
  if (maxVoltKV <= 0 || !voltageConfirmedByLines) {
    confidence = 'low';
    if (!voltageConfirmedByLines)
      notes.push('No nearby line confirms the substation voltage — low confidence.');
  } else {
    confidence = 'medium';
  }

  return {
    low: baseLow,
    expected,
    high,
    confidence,
    basis: {
      substationName: driver.name,
      substationNamed,
      maxVoltKV,
      lines: lineCount,
      lineFactor,
      voltageConfirmedByLines,
      distanceMi: driver.distanceMi,
      upside,
    },
    notes,
  };
}
