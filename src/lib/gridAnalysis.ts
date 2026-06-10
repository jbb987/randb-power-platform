import type { NearbySubstation, NearbyLine } from '../types';
import { computeRampSchedule } from './rampSchedule';

/**
 * Grid Analysis — "how much power can we bring to this site, and at what cost?"
 *
 * A grid-based DELIVERABILITY estimate (a range) for new load, ranked by the
 * nearest in-service substations. A screening number that helps Bailey (who
 * engineers the exact figure) and gives a customer an instant read of a site.
 *
 * MW range is grounded in transmission physics — surge-impedance loading (SIL)
 * × the St Clair short-line thermal multiple × N-1 firm capacity × a new-load
 * headroom fraction calibrated so a 2-line 138 kV node ≈ 70 MW (Bailey's anchor).
 *
 * Cost reconciles Bailey's rule ($11M/100MW ≈ $110k/MW) with verified research
 * (NREL ATB $100k/MW incl. 1-mi spur; LBNL-active $106k/MW): a base $/MW plus a
 * distance premium (CAISO $/mile) plus the ERCOT SB6 $100k/MW fee. All $ = $M.
 * Pure compute, mirrors computeAppraisal.
 */

const SENTINEL = -999999;

// ── MW model: deliverable new-load capacity (physics-grounded) ──
/** Surge-impedance loading (MW) by voltage class — SIL = V²/Z (St Clair / SIL refs). */
function sil(kV: number): number {
  if (kV <= 69) return 12;
  if (kV <= 115) return 35;
  if (kV <= 138) return 50;
  if (kV <= 161) return 65;
  if (kV <= 230) return 140;
  if (kV <= 345) return 375;
  return 950; // 500 kV
}
/** Short lines (<50 mi — all ties here) load to ~3× SIL (St Clair thermal regime). */
const THERMAL_MULT = 3;
/** New-load headroom fraction of N-1 firm capacity (existing load + margin take the rest). */
const HEADROOM_LOW = 0.35;
const HEADROOM_HIGH = 0.6;
const HEADROOM_MID = 0.47; // calibrated: 138kV/2-line = 150×1×0.47 ≈ 70 (Bailey)

export interface DeliverableMW {
  low: number;
  high: number;
  mid: number;
}
function round5(n: number): number {
  return Math.round(n / 5) * 5;
}
/** Deliverable new-load MW range at a node: SIL × thermal × N-1 firm × headroom. */
function deliverableMW(maxVoltKV: number, lines: number): DeliverableMW {
  const perLineThermal = THERMAL_MULT * sil(maxVoltKV);
  const firmMult = clamp((lines || 0) - 1, 0.5, 3); // N-1: survive losing one line; cap (one tap ≠ all lines)
  const base = perLineThermal * firmMult;
  return {
    low: round5(base * HEADROOM_LOW),
    high: round5(base * HEADROOM_HIGH),
    mid: round5(base * HEADROOM_MID),
  };
}

// ── Cost model: reconciled Bailey ∩ research ──
const BASE_PER_MW = 0.105; // $M/MW — Bailey ($110k) ∩ NREL ($100k), incl. ~1 mi spur
const CONTINGENCY = 1.3;
const FAR_DISTANCE_MI = 5;
/** Overhead line build, $M/mile, single-circuit, flat/rural (CAISO PTO 2025). */
function lineCostPerMile(kV: number): number {
  if (kV <= 115) return 2.35;
  if (kV <= 138) return 2.4;
  if (kV <= 161) return 2.5;
  if (kV <= 230) return 2.84;
  if (kV <= 345) return 2.9;
  return 3.02;
}
/** Short ties cost MORE per mile (mobilization, no economy of scale). */
function shortLineFactor(mi: number): number {
  if (mi < 3) return 1.75;
  if (mi <= 10) return 1.45;
  return 1.0;
}

function cleanVolt(v: number | undefined | null): number {
  const n = Number(v);
  if (!Number.isFinite(n) || n === SENTINEL || n <= 0) return 0;
  return n;
}
function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}
function inService(status: string): boolean {
  return !!status && /in service/i.test(status);
}
function round1(n: number): number {
  return Math.round(n * 10) / 10;
}
function placeholderName(name: string): boolean {
  return /^UNKNOWN\d+$/i.test(name) || name.toUpperCase() === 'NOT AVAILABLE';
}
function subLabel(s: NearbySubstation): string {
  return placeholderName(s.name) ? `${Math.round(cleanVolt(s.maxVolt))} kV substation` : s.name;
}

export interface ScenarioCost {
  construction: number; // $M — base ($105k/MW, incl. ~1 mi spur) + distance premium beyond 1 mi
}
function costFor(voltageKV: number, distanceMi: number, mw: number): ScenarioCost {
  const premium = Math.max(0, distanceMi - 1) * lineCostPerMile(voltageKV) * shortLineFactor(distanceMi) * CONTINGENCY;
  const construction = mw * BASE_PER_MW + premium;
  return { construction: round1(construction) };
}
function timelineFor(mw: number, currentYear: number): { years: number; fullByYear: number } {
  const ramp = computeRampSchedule(mw, { startYear: currentYear + 1 });
  return { years: ramp.length, fullByYear: ramp.length ? ramp[ramp.length - 1].year : currentYear + 1 };
}

type ScenarioKind = 'nearby' | 'target';

export interface GridScenario {
  kind: ScenarioKind;
  label: string;
  mw: DeliverableMW; // for target: low=high=mid=targetMW
  basis: {
    substationName: string;
    voltageKV: number;
    lines: number;
    distanceMi: number;
    statusConfirmed: boolean;
  };
  cost: ScenarioCost; // computed at mw.mid (or the target MW)
  timeline: { years: number; fullByYear: number };
  justification: string;
  caveats: string[];
  fits?: boolean; // target only — is the project deliverable via a nearby node?
}

export interface GridAnalysisResult {
  /** Distinct nearby substations (deduped) — the supporting "what's around" evidence. */
  nearbyOptions: GridScenario[];
  /** The headline: deliver the target via the cheapest viable node (or "needs upgrades"). */
  target: GridScenario | null;
  targetMW: number | null;
  targetFits: boolean | null;
}

export interface AnalyzeOpts {
  targetMW?: number;
  currentYear: number;
}

function nodeScenario(
  sub: NearbySubstation,
  kind: ScenarioKind,
  label: string,
  mw: DeliverableMW,
  mwForCost: number,
  justification: string,
  currentYear: number,
  extra?: Partial<GridScenario>,
): GridScenario {
  const kV = cleanVolt(sub.maxVolt);
  const caveats: string[] = [];
  if (sub.distanceMi > FAR_DISTANCE_MI)
    caveats.push(`Far from the grid (${sub.distanceMi.toFixed(1)} mi) — a long tie dominates the cost.`);
  return {
    kind,
    label,
    mw,
    basis: { substationName: subLabel(sub), voltageKV: kV, lines: sub.lines || 0, distanceMi: sub.distanceMi, statusConfirmed: inService(sub.status) },
    cost: costFor(kV, sub.distanceMi, mwForCost),
    timeline: timelineFor(mwForCost, currentYear),
    justification,
    caveats,
    ...extra,
  };
}

/** A candidate substation with its voltage, line count, and deliverable capacity computed once. */
interface Cand {
  sub: NearbySubstation;
  kV: number;
  lines: number;
  cap: DeliverableMW;
}

/** Build the target-delivery scenario (shared by the fits and needs-upgrades paths). */
function buildTargetScenario(c: Cand, targetMW: number, fits: boolean, currentYear: number): GridScenario {
  const range = { low: targetMW, high: targetMW, mid: targetMW };
  const lineLabel = `${c.lines} line${c.lines === 1 ? '' : 's'}`;
  const justification = fits
    ? `Deliverable via ${subLabel(c.sub)} (${c.kV} kV, ${lineLabel}, ${c.sub.distanceMi.toFixed(1)} mi) — within its ~${c.cap.low}–${c.cap.high} MW capacity.`
    : `No in-service node within range delivers ${targetMW.toLocaleString()} MW — needs network upgrades or a higher-voltage tie. Strongest nearby ≈ ${c.cap.low}–${c.cap.high} MW (${c.kV} kV, ${c.sub.distanceMi.toFixed(1)} mi).`;
  return nodeScenario(
    c.sub,
    'target',
    'Your target',
    range,
    targetMW,
    justification,
    currentYear,
    fits ? { fits: true } : { fits: false, caveats: ['Target exceeds nearby grid deliverability — confirm upgrades with the utility.'] },
  );
}

/**
 * Demand-first grid analysis: deliver the target via the cheapest viable nearby node,
 * with deduped nearby substations as supporting evidence. Null when no in-service substation.
 */
export function analyzeGrid(
  infra: { nearbySubstations?: NearbySubstation[]; nearbyLines?: NearbyLine[] } | null | undefined,
  opts: AnalyzeOpts,
): GridAnalysisResult | null {
  // In-service candidates by distance, each with its deliverable capacity computed ONCE.
  const candidates: Cand[] = (infra?.nearbySubstations ?? [])
    .filter((s) => cleanVolt(s.maxVolt) > 0 && inService(s.status))
    .sort((a, b) => a.distanceMi - b.distanceMi)
    .map((s) => ({ sub: s, kV: cleanVolt(s.maxVolt), lines: s.lines || 0, cap: deliverableMW(cleanVolt(s.maxVolt), s.lines) }));
  if (candidates.length === 0) return null;

  // Dedupe by (voltage, lines) → keep the nearest of each kind (kills duplicate rows).
  const seen = new Set<string>();
  const distinct: Cand[] = [];
  for (const c of candidates) {
    const key = `${c.kV}|${c.lines}`;
    if (seen.has(key)) continue;
    seen.add(key);
    distinct.push(c);
  }

  // Target delivery (headline): cheapest viable node that can actually deliver the project,
  // else the strongest nearby node flagged as needing upgrades.
  const targetMW = opts.targetMW && opts.targetMW > 0 ? Math.round(opts.targetMW) : null;
  let target: GridScenario | null = null;
  let targetFits: boolean | null = null;
  let deliveryCand: Cand | null = null;
  if (targetMW != null) {
    const viable = candidates.filter((c) => c.cap.high >= targetMW); // already distance-sorted → viable[0] is cheapest
    targetFits = viable.length > 0;
    deliveryCand = targetFits
      ? viable[0]
      : [...candidates].sort((a, b) => b.cap.high - a.cap.high || a.sub.distanceMi - b.sub.distanceMi)[0];
    target = buildTargetScenario(deliveryCand, targetMW, targetFits, opts.currentYear);
  }

  // Nearby options (supporting evidence): up to 3 distinct nodes EXCLUDING the delivery node
  // (it's already named in the target row). Labeled as a clean alternatives sequence — NOT a
  // global distance rank, since the nearest is the excluded delivery node (would read as a gap).
  const nearbyOptions = distinct
    .filter((c) => c !== deliveryCand)
    .slice(0, 3)
    .map((c, i) =>
      nodeScenario(
        c.sub,
        'nearby',
        `Option ${i + 1}`,
        c.cap,
        c.cap.mid,
        `${c.sub.distanceMi.toFixed(1)} mi · ${c.kV} kV · ${c.lines} line${c.lines === 1 ? '' : 's'}.`,
        opts.currentYear,
      ),
    );

  return { nearbyOptions, target, targetMW, targetFits };
}
