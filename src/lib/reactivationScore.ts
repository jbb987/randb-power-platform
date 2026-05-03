/**
 * Reactivation Score — the "best wells to reactivate" ranking signal.
 *
 * Adapted from the Weatherford rubric, with substitutions for signals we
 * can compute from free public data only:
 *
 *   Score (0-100) = 0.40 * production
 *                 + 0.30 * operatorOpportunity
 *                 + 0.20 * costFeasibility
 *                 + 0.10 * timePressure
 *
 * All four components are 0-100. Final score is rounded to whole numbers.
 *
 *   production         — was this a real producer? (last rate, cum, IP)
 *   operatorOpportunity — is the operator distressed / on the orphan list?
 *   costFeasibility    — cheap to plug ≈ cheap to reactivate
 *   timePressure       — SB 1150 deadline proximity → motivated seller
 *
 * Wells with no production history get production = 0 but can still
 * score on the other three components (e.g., a shut-in orphan well with
 * a plug deadline next month is still highly actionable).
 */
import type { WellEnrichment } from '../types';
import { computeSb1150 } from './sb1150';

export interface ScoreBreakdown {
  total: number;             // 0-100
  production: number;        // 0-100, weight 0.40
  operatorOpportunity: number; // 0-100, weight 0.30
  costFeasibility: number;   // 0-100, weight 0.20
  timePressure: number;      // 0-100, weight 0.10
  /** Reasons disqualifying this well, if any. */
  disqualified: string | null;
}

const W_PRODUCTION = 0.40;
const W_OPERATOR = 0.30;
const W_COST = 0.20;
const W_PRESSURE = 0.10;

export function computeReactivationScore(data: WellEnrichment): ScoreBreakdown {
  // Disqualifiers — return zero with a reason.
  if (data.iwarWellPlugged) {
    return {
      total: 0,
      production: 0, operatorOpportunity: 0, costFeasibility: 0, timePressure: 0,
      disqualified: 'Already plugged',
    };
  }

  const production = computeProductionScore(data);
  const operatorOpportunity = computeOperatorScore(data);
  const costFeasibility = computeCostScore(data);
  const timePressure = computeTimePressureScore(data);

  const total = Math.round(
    production * W_PRODUCTION +
    operatorOpportunity * W_OPERATOR +
    costFeasibility * W_COST +
    timePressure * W_PRESSURE,
  );

  return { total, production, operatorOpportunity, costFeasibility, timePressure, disqualified: null };
}

/** Production score (0-100): rewards strong historical productivity. */
function computeProductionScore(d: WellEnrichment): number {
  let score = 0;

  // Last 12-mo rate before shut-in (or current for active wells)
  // 0 bbl/d → 0 pts, 5+ bbl/d → 30 pts
  const last12 = d.prodLast12moOilBblPerD ?? d.prodLast12moGasMcfPerD ?? 0;
  if (last12 > 0) {
    if (d.prodLast12moOilBblPerD) {
      // Oil scale: 0 → 0, 1 bbl/d → 10, 5+ bbl/d → 30
      score += Math.min(30, last12 * 6);
    } else {
      // Gas scale: mcf is per-1000-cubic-feet; treat 30+ mcf/d as max
      score += Math.min(30, last12);
    }
  }

  // Initial production rate (well-quality proxy)
  // 0 → 0, 30+ bbl/d → 25 pts
  const ip = d.prodFirst6moOilBblPerD ?? d.prodFirst6moGasMcfPerD ?? 0;
  if (ip > 0) {
    score += Math.min(25, ip * 0.83);
  }

  // Lifetime cumulative (proven producer)
  // 0 bbl → 0, 50K+ bbl → 25 pts
  const cum = d.prodLifetimeOilBbl ?? d.prodLifetimeGasMcf ?? 0;
  if (cum > 0) {
    if (d.prodLifetimeOilBbl) {
      score += Math.min(25, cum / 2000);
    } else {
      score += Math.min(25, cum / 20000);
    }
  }

  // Months active (sustained production = real well)
  // 0 → 0, 60+ months → 20 pts
  const months = d.prodMonthsActive ?? 0;
  if (months > 0) {
    score += Math.min(20, months / 3);
  }

  return Math.min(100, Math.round(score));
}

/** Operator opportunity score (0-100): rewards distressed operators. */
function computeOperatorScore(d: WellEnrichment): number {
  let score = 0;

  if (d.orphanListed) {
    score += 50; // primary signal
    const months = d.orphanMonthsP5Inactive ?? 0;
    if (months > 24) score += 15;
    else if (months > 12) score += 10;
  }

  if (d.iwarP5OriginatingStatus === 'D') score += 20;
  if (d.iwarExtensionStatus === 'D') score += 15;

  return Math.min(100, score);
}

/** Cost feasibility score (0-100): cheap-to-plug ≈ cheap-to-reactivate. */
function computeCostScore(d: WellEnrichment): number {
  let score = 50; // baseline if no data

  const plugCost = d.iwarPluggingCostEstimate;
  if (plugCost != null) {
    if (plugCost < 25_000)        score = 60;
    else if (plugCost < 50_000)   score = 50;
    else if (plugCost < 100_000)  score = 35;
    else if (plugCost < 200_000)  score = 20;
    else                           score = 10;
  }

  const depth = d.iwarDepthFt;
  if (depth != null) {
    if (depth < 3_000)        score += 30;
    else if (depth < 6_000)   score += 20;
    else if (depth < 10_000)  score += 10;
    else                       score += 0;
  }

  return Math.min(100, score);
}

/** Time pressure score (0-100): SB 1150 deadline urgency. */
function computeTimePressureScore(d: WellEnrichment): number {
  const sb = computeSb1150(d);
  if (!sb) return 0;
  if (sb.pastTrigger) return 100;
  if (sb.monthsToTrigger < 12) return 85;
  if (sb.monthsToTrigger < 24) return 65;
  if (sb.monthsToTrigger < 36) return 40;
  if (sb.monthsToTrigger < 60) return 20;
  return 5;
}

/** Color code by score band — red high, amber medium, gray low. */
export function scoreColor(score: number): string {
  if (score >= 70) return '#ED202B';
  if (score >= 50) return '#C2410C'; // amber-700
  if (score >= 30) return '#7A756E';
  return '#9CA3AF';
}

export function scoreLabel(score: number): string {
  if (score >= 70) return 'High';
  if (score >= 50) return 'Medium';
  if (score >= 30) return 'Low';
  return 'Marginal';
}
