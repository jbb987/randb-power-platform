/**
 * Quick-score verdict — the coarse, public-facing read of a site's grid power
 * potential: GO / CONDITIONAL / NO_GO + an MW range.
 *
 * This is DELIBERATELY blunt. It powers the public "Is my land powerable?" form,
 * where a landowner gets an instant teaser, NOT an engineering study. The precise
 * figure is Bailey's job; this just sorts sites into "worth a callback" buckets.
 *
 * Distinct from suggestGradeFromAppraisal() (preConWorkflow.ts), which grades on
 * FINANCIAL return multiple. This grades on INFRASTRUCTURE: deliverable MW at the
 * strongest nearby in-service node, capped by the parcel's acreage, gated by how
 * far and how high-voltage that node is.
 *
 * Pure compute — no IO. Safe to run in the Cloudflare Worker.
 *
 * ⚠️ The constants below are screening heuristics, NOT calibrated truth. They must
 * be tuned with Bailey against known sites before the public answer is trusted.
 * Keep the on-page result labeled a beta estimate until then.
 */

import type { GridAnalysisResult } from './gridAnalysis';

// ── Tunable thresholds (TODO: calibrate with Bailey) ────────────────────────
/** Rough data-center land density. 1 MW/acre is a placeholder ceiling so tiny
 *  parcels can't return a giant MW number. TODO(tunable): set from real builds. */
const MW_PER_ACRE = 1.0;
/** A GO needs at least this much deliverable, acreage-capped MW. */
const GO_MIN_MW = 50;
/** A GO node must be within this distance (mi) of the site. */
const GO_MAX_DIST_MI = 5;
/** A GO node must be at least this voltage (kV) — sub-transmission won't scale. */
const GO_MIN_KV = 100;
/** Below this acreage-capped MW, it's a NO_GO regardless of distance. */
const NOGO_MAX_MW = 10;
/** Beyond this distance (mi) to any usable node, it's a NO_GO. */
const NOGO_MAX_DIST_MI = 15;

export type QuickVerdict = 'GO' | 'CONDITIONAL' | 'NO_GO';

export interface QuickScoreInput {
  acreage: number;
  hasPowerInfra: boolean;
  /** Result of analyzeGrid() for the site's coordinate (null when no in-service node). */
  grid: GridAnalysisResult | null;
}

export interface QuickScoreOutput {
  verdict: QuickVerdict;
  mwRange: { low: number; mid: number; high: number };
  nearestSubstation: string;
}

function round5(n: number): number {
  return Math.round(n / 5) * 5;
}

const NO_GO_EMPTY: QuickScoreOutput = {
  verdict: 'NO_GO',
  mwRange: { low: 0, mid: 0, high: 0 },
  nearestSubstation: '',
};

/**
 * Score a site's grid power potential into a coarse public verdict + MW range.
 */
export function scoreInfraVerdict(input: QuickScoreInput): QuickScoreOutput {
  const options = input.grid?.nearbyOptions ?? [];
  if (!input.grid || options.length === 0) return NO_GO_EMPTY;

  // The node providing the most deliverable MW — that's the headline capacity.
  const strongest = options.reduce((best, o) => (o.mw.mid > best.mw.mid ? o : best), options[0]);
  const deliverableMid = strongest.mw.mid;
  const distMi = strongest.basis.distanceMi;
  const kV = strongest.basis.voltageKV;

  // Cap the MW by what the parcel itself can physically host.
  const acreage = Number.isFinite(input.acreage) && input.acreage > 0 ? input.acreage : 0;
  const cappedMid = Math.min(acreage * MW_PER_ACRE, deliverableMid);
  const scale = deliverableMid > 0 ? cappedMid / deliverableMid : 0;
  const mwRange = {
    low: round5(strongest.mw.low * scale),
    mid: round5(cappedMid),
    high: round5(strongest.mw.high * scale),
  };

  const nearestSubstation = strongest.basis.substationName
    ? `${strongest.basis.substationName} · ${Math.round(kV)} kV · ${distMi.toFixed(1)} mi`
    : '';

  // ── Verdict ──
  let verdict: QuickVerdict;
  if (cappedMid < NOGO_MAX_MW || distMi > NOGO_MAX_DIST_MI) {
    verdict = 'NO_GO';
  } else if (cappedMid >= GO_MIN_MW && distMi <= GO_MAX_DIST_MI && kV >= GO_MIN_KV) {
    verdict = 'GO';
  } else {
    verdict = 'CONDITIONAL';
    // Existing on-site/adjacent power de-risks a borderline site — nudge up.
    if (input.hasPowerInfra && cappedMid >= GO_MIN_MW && kV >= GO_MIN_KV) {
      verdict = 'GO';
    }
  }

  return { verdict, mwRange, nearestSubstation };
}
