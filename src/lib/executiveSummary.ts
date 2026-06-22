/**
 * Customer Executive Summary synthesis layer.
 *
 * Collapses a fully-analyzed `SiteRegistryEntry` into a single display-ready
 * model consumed by BOTH the on-screen Executive Summary tab and the
 * downloadable PDF — so the two never drift. Pure, no IO.
 *
 * Each analysis section becomes a small "mini executive summary": a titled
 * block of label/value rows that mirror exactly what the full section reports
 * already display (same labels/formatting the user recognizes).
 *
 * Stored section results (`infraResult`, `gasResult`, …) are persisted as
 * `Record<string, unknown>`; we read them defensively and cast to the lib
 * result types (type-only imports, no runtime cost).
 */

import type { SiteRegistryEntry, PreConGrade } from '../types';
import { PRECON_GRADE_LABELS } from '../types';
import type { InfraResult } from './infraLookup';
import type { GasAnalysisResult } from './gasAnalysis';
import type { WaterAnalysisResult } from './waterAnalysis.types';
import type { TransportResult } from '../types/infrastructure';
import { formatDistanceMi, interstateLabel } from '../utils/format';
import { cleanGridName } from './exhibitA';
import { suggestGradeFromAppraisal } from './preConWorkflow';
import {
  computeRampSchedule,
  rampFromIncrements,
  DEFAULT_ANNUAL_CAP_MW,
  type RampPhase,
} from './rampSchedule';

/** A benefit-led "Why this site wins" tile (FAB: headline = benefit, detail = proof). */
export interface BenefitTile {
  key: string;
  headline: string; // the benefit the buyer feels
  detail: string; // the spec that proves it
  /** Optional second proof line, rendered under `detail` (e.g. zoning under acreage). */
  subDetail?: string;
}

/** GO / CONDITIONAL GO / NO-GO verdict, reviewed = backed by an engineer LLR. */
export interface Verdict {
  grade: PreConGrade;
  label: string;
  reviewed: boolean;
}

export interface ExecutiveSummaryModel {
  /** Deliverable MW shown in the hero — engineer-verified when available, else target. */
  heroMW: number;
  /** True when heroMW is the engineer-verified figure (not the aspirational target). */
  mwReviewed: boolean;
  targetMW: number;
  /** Serving retail/distribution utility (confirmed name preferred). */
  utility: string | null;
  /** RTO / ISO (grid operator). */
  rto: string | null;
  /** GO/CONDITIONAL/NO-GO badge for "The Verdict" layout (null when no appraisal/grade). */
  verdict: Verdict | null;
  /** "Why this site wins" benefit tiles. */
  benefits: BenefitTile[];
  ramp: RampPhase[];
  /** Final cumulative MW the ramp reaches (≥1 for bar scaling). */
  rampPeak: number;
  /** Whether the ramp's peak equals the MW target (false ⇒ show a "reaches X of Y" note). */
  rampReachesTarget: boolean;
  fullByLabel: string; // calendar year of the last ramp phase
  /** Nearest substation, formatted ("345 kV · 1.2 mi · TESLA"). Captions the grid map. */
  nearestSubstation: string | null;
}

/**
 * Normalize a territory field to a display string. Current pipeline stores
 * iso/tsp/utilityTerritory as `string[]`, but legacy records may hold a plain
 * joined string — handle both so the summary never crashes on older data.
 */
function firstNonEmpty(value: string[] | string | undefined | null): string | null {
  if (value == null) return null;
  if (typeof value === 'string') return value.trim() || null;
  if (!Array.isArray(value)) return null;
  const joined = value.filter(Boolean).join(' / ');
  return joined || null;
}

// ── Display helpers ─────────────────────────────────────────────────────────

/** "138 kV · 1.5 mi · TESLA" — but drop a HIFLD placeholder name (UNKNOWN…/TAP…)
 *  rather than print it on an investor sheet. */
function formatSubstation(sub: NonNullable<InfraResult['nearbySubstations']>[number]): string {
  const head = `${Math.round(sub.maxVolt)} kV · ${formatDistanceMi(sub.distanceMi)}`;
  const name = cleanGridName(sub.name);
  const isPlaceholder = /^(Unnamed|Line Tap|—)/.test(name);
  return isPlaceholder ? head : `${head} · ${name}`;
}

/** Best download in Mbps — falls back to the fastest provider in a nearby
 *  fiber/served block when nothing is wired on-site (answers "how fast is it
 *  ~2 mi away?"). */
function bestDownloadMbps(bb: NonNullable<SiteRegistryEntry['broadbandResult']>): number | null {
  if (bb.maxDownload && bb.maxDownload > 0) return bb.maxDownload;
  let best = 0;
  for (const blk of bb.nearbyServiceBlocks ?? []) {
    for (const p of blk.providers ?? []) if (p.maxDown > best) best = p.maxDown;
  }
  return best > 0 ? best : null;
}

/** "Why this site wins" tiles — every spec reframed as a de-risked benefit (FAB). */
function buildBenefits(
  site: SiteRegistryEntry,
  infra: InfraResult | null,
  bb: SiteRegistryEntry['broadbandResult'],
  gas: GasAnalysisResult | null,
  water: WaterAnalysisResult | null,
  transport: TransportResult | null,
): BenefitTile[] {
  const sub = infra?.nearbySubstations?.[0];
  const dl = bb ? bestDownloadMbps(bb) : null;
  const pipe = gas?.pipelines?.[0] ?? null;
  const fz = water?.floodZone;
  const i0 = transport?.interstates?.[0];

  const floodDetail = fz
    ? fz.zone === 'UNMAPPED'
      ? 'Outside mapped floodplain'
      : fz.zone === 'X'
        ? 'Minimal flood risk'
        : `FEMA Zone ${fz.zone}`
    : 'Low environmental risk';
  // Acreage is the headline proof; zoning (from LandID) drops onto its own line
  // beneath it so the buyer reads "how big" then "what's allowed" separately.
  const landDetail = site.acreage > 0 ? `${site.acreage.toLocaleString()} acres` : 'Developable parcel';
  const landZoning = site.zoning?.trim() || null;

  return [
    {
      key: 'power',
      headline: 'Grid at the door',
      detail: sub ? formatSubstation(sub) : 'Transmission in the vicinity',
    },
    {
      key: 'connectivity',
      headline: 'Build-ready fiber',
      detail: dl
        ? `${dl.toLocaleString()} Mbps available`
        : bb?.fiberAvailable
          ? 'Fiber on site'
          : 'Fiber in the area',
    },
    {
      key: 'gas',
      headline: 'On-site generation option',
      detail: pipe ? `Gas pipeline ${formatDistanceMi(pipe.distanceMiles)}` : 'Gas supply in the area',
    },
    { key: 'water', headline: 'Low site risk', detail: floodDetail },
    { key: 'land', headline: 'Clear to build', detail: landDetail, subDetail: landZoning ?? undefined },
    {
      key: 'transport',
      headline: 'Accessible',
      detail: i0 ? `${interstateLabel(i0)} · ${formatDistanceMi(i0.distanceMi)}` : 'Highway access',
    },
  ];
}

export function buildExecutiveSummaryModel(
  site: SiteRegistryEntry,
  opts: {
    currentYear: number;
    /** Engineer-reviewed grade from the linked LLR (overrides the appraisal suggestion). */
    grade?: PreConGrade;
    /** True when `grade` comes from an approved engineer review (not auto-suggested). */
    gradeReviewed?: boolean;
    /** Engineer-verified MW from the linked LLR — becomes the deliverable hero number. */
    verifiedMW?: number;
  },
): ExecutiveSummaryModel {
  const targetMW = site.mwCapacity || 0;
  const startYear = opts.currentYear + 1;
  const hasCustomRamp = !!site.customRamp && site.customRamp.some((n) => n > 0);
  // Custom increments only redistribute the per-year pace — the schedule is
  // normalized to land exactly on the decided MW target (targetMW option).
  const ramp = hasCustomRamp
    ? rampFromIncrements(site.customRamp as number[], { startYear, targetMW })
    : computeRampSchedule(targetMW, { annualCapMW: DEFAULT_ANNUAL_CAP_MW, startYear });
  const lastPhase = ramp[ramp.length - 1];
  // Bars scale to the ramp's own peak so a partial custom ramp shows its shape;
  // the note (rampReachesTarget=false) carries the "reaches X of Y" signal.
  const rampPeak = lastPhase ? lastPhase.cumulativeMW || 1 : 1;
  const rampReachesTarget = targetMW <= 0 || Math.round(rampPeak) === Math.round(targetMW);

  const infra = site.infraResult as unknown as InfraResult | null;
  const gas = site.gasResult as unknown as GasAnalysisResult | null;
  const water = site.waterResult as unknown as WaterAnalysisResult | null;
  const transport = site.transportResult as unknown as TransportResult | null;
  const bb = site.broadbandResult ?? null;

  // Prefer the human-confirmed retail utility; fall back to the analyzed
  // territory. This is the name an investor will recognize ("Oncor").
  const utility =
    site.retailUtilityConfirmedName?.trim() || firstNonEmpty(infra?.utilityTerritory);
  const sub = infra?.nearbySubstations?.[0];

  // Deliverable MW = engineer-verified figure when present (the defensible
  // number a buyer underwrites), else the decided target capacity.
  const heroMW = opts.verifiedMW && opts.verifiedMW > 0 ? opts.verifiedMW : targetMW;
  const mwReviewed = !!(opts.verifiedMW && opts.verifiedMW > 0);

  // Verdict: prefer the engineer-reviewed LLR grade; fall back to the
  // appraisal-suggested grade (flagged not-reviewed so we never overclaim).
  const grade = opts.grade ?? suggestGradeFromAppraisal(site.appraisalResult);
  const verdict: Verdict | null = grade
    ? { grade, label: PRECON_GRADE_LABELS[grade], reviewed: !!opts.gradeReviewed }
    : null;

  return {
    heroMW,
    mwReviewed,
    targetMW,
    utility,
    rto: firstNonEmpty(infra?.iso),
    verdict,
    benefits: buildBenefits(site, infra, bb, gas, water, transport),
    ramp,
    rampPeak,
    rampReachesTarget,
    fullByLabel: lastPhase ? String(lastPhase.year) : '—',
    nearestSubstation: sub ? formatSubstation(sub) : null,
  };
}
