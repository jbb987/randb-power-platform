/**
 * Reactivation score computation — server-side port of
 * `src/lib/reactivationScore.ts` and the SB 1150 helpers from
 * `src/lib/sb1150.ts`. Used both during the PDQ ingest finalization
 * and the standalone backfill endpoint.
 *
 * Score formula:
 *   total (0-100) = 0.40 * production
 *                 + 0.30 * operatorOpportunity
 *                 + 0.20 * costFeasibility
 *                 + 0.10 * timePressure
 *
 * Disqualified wells (already plugged) get total = 0 with a flag so
 * Firestore queries can exclude them via `where('scoreDisqualified', '==', false)`.
 */

const SB1150_EFFECTIVE = new Date('2027-09-01T00:00:00Z');
const W_PRODUCTION = 0.40;
const W_OPERATOR = 0.30;
const W_COST = 0.20;
const W_PRESSURE = 0.10;

function addYears(d, years) {
  const out = new Date(d.getTime());
  out.setUTCFullYear(out.getUTCFullYear() + years);
  return out;
}

function monthsBetween(a, b) {
  return (b.getUTCFullYear() - a.getUTCFullYear()) * 12 + (b.getUTCMonth() - a.getUTCMonth());
}

function parseDate(s) {
  if (!s) return null;
  const t = Date.parse(s);
  return Number.isFinite(t) ? new Date(t) : null;
}

function computeSb1150(d, now = new Date()) {
  if (!d.iwarOriginalCompletionDate || !d.iwarShutInDate) return null;
  const completion = parseDate(d.iwarOriginalCompletionDate);
  const shutIn = parseDate(`${d.iwarShutInDate}-01`);
  if (!completion || !shutIn) return null;

  const age25 = addYears(completion, 25);
  const inactive15 = addYears(shutIn, 15);
  const triggerMs = Math.max(age25.getTime(), inactive15.getTime(), SB1150_EFFECTIVE.getTime());
  const triggerDate = new Date(triggerMs);
  const monthsToTrigger = monthsBetween(now, triggerDate);
  const pastTrigger = monthsToTrigger < 0;
  return { triggerDate, monthsToTrigger, pastTrigger };
}

function computeProductionScore(d) {
  let score = 0;
  const last12 = d.prodLast12moOilBblPerD ?? d.prodLast12moGasMcfPerD ?? 0;
  if (last12 > 0) {
    if (d.prodLast12moOilBblPerD) {
      score += Math.min(30, last12 * 6);
    } else {
      score += Math.min(30, last12);
    }
  }
  const ip = d.prodFirst6moOilBblPerD ?? d.prodFirst6moGasMcfPerD ?? 0;
  if (ip > 0) {
    score += Math.min(25, ip * 0.83);
  }
  const cum = d.prodLifetimeOilBbl ?? d.prodLifetimeGasMcf ?? 0;
  if (cum > 0) {
    if (d.prodLifetimeOilBbl) {
      score += Math.min(25, cum / 2000);
    } else {
      score += Math.min(25, cum / 20000);
    }
  }
  const months = d.prodMonthsActive ?? 0;
  if (months > 0) {
    score += Math.min(20, months / 3);
  }
  return Math.min(100, Math.round(score));
}

function computeOperatorScore(d) {
  let score = 0;
  if (d.orphanListed) {
    score += 50;
    const months = d.orphanMonthsP5Inactive ?? 0;
    if (months > 24) score += 15;
    else if (months > 12) score += 10;
  }
  if (d.iwarP5OriginatingStatus === 'D') score += 20;
  if (d.iwarExtensionStatus === 'D') score += 15;
  return Math.min(100, score);
}

function computeCostScore(d) {
  let score = 50;
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
  }
  return Math.min(100, score);
}

function computeTimePressureScore(d) {
  const sb = computeSb1150(d);
  if (!sb) return 0;
  if (sb.pastTrigger) return 100;
  if (sb.monthsToTrigger < 12) return 85;
  if (sb.monthsToTrigger < 24) return 65;
  if (sb.monthsToTrigger < 36) return 40;
  if (sb.monthsToTrigger < 60) return 20;
  return 5;
}

export function computeReactivationScore(data) {
  if (data.iwarWellPlugged) {
    return { total: 0, scoreDisqualified: true, production: 0, operatorOpportunity: 0, costFeasibility: 0, timePressure: 0 };
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
  return { total, scoreDisqualified: false, production, operatorOpportunity, costFeasibility, timePressure };
}
