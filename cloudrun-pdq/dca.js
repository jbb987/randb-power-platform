/**
 * Arps decline-curve fit per lease. Three Arps families:
 *   - Exponential   (b = 0):     q(t) = qi * exp(-Di * t)
 *   - Hyperbolic    (0 < b < 1): q(t) = qi / (1 + b * Di * t)^(1/b)
 *   - Harmonic      (b = 1):     q(t) = qi / (1 + Di * t)
 *
 * We fit a hyperbolic with bounds [0, 2] on b. Levenberg-Marquardt seeded
 * from the first non-zero rate. Inputs are monthly aggregates *post*-peak
 * to avoid fitting against ramp-up.
 */
import { default as LM } from 'ml-levenberg-marquardt';

/**
 * Compute production rate (volume per month) array starting at the first
 * non-zero month. Returns { tMonths, rates, peakIdx }.
 */
export function preparePostPeak(monthlyVolumes) {
  // Find peak month
  let peakIdx = 0;
  let peakV = -Infinity;
  for (let i = 0; i < monthlyVolumes.length; i++) {
    if (monthlyVolumes[i] > peakV) {
      peakV = monthlyVolumes[i];
      peakIdx = i;
    }
  }
  const slice = monthlyVolumes.slice(peakIdx);
  const tMonths = slice.map((_, i) => i);
  const rates = slice;
  return { tMonths, rates, peakIdx, peakV };
}

/**
 * Fit Arps hyperbolic decline. Returns { qi, Di, b, eur } or null if
 * fitting fails or the well doesn't have enough data points.
 *
 * EUR (Estimated Ultimate Recovery, in same volume units) is computed from
 * the fit projected forward to economic limit (default: 1 unit/month).
 */
export function fitArpsDecline(monthlyVolumes, options = {}) {
  const minPoints = options.minPoints ?? 12;
  const econLimit = options.econLimit ?? 1; // bbl or mcf per month

  if (monthlyVolumes.length < minPoints) return null;

  const { tMonths, rates, peakV } = preparePostPeak(monthlyVolumes);
  if (rates.length < minPoints || peakV <= 0) return null;

  // Skip months with zero rate at the head/tail to keep the fit clean
  const filteredT = [];
  const filteredR = [];
  for (let i = 0; i < rates.length; i++) {
    if (rates[i] > 0) {
      filteredT.push(tMonths[i]);
      filteredR.push(rates[i]);
    }
  }
  if (filteredR.length < minPoints) return null;

  // ml-levenberg-marquardt expects { x: [], y: [] } and a model function
  // that takes params and returns a function of x.
  const model = ([qi, Di, b]) => (t) => {
    if (qi <= 0 || Di <= 0) return 0;
    if (b <= 1e-6) return qi * Math.exp(-Di * t);                 // exponential
    return qi / Math.pow(1 + b * Di * t, 1 / b);                  // hyperbolic / harmonic
  };

  const initial = [filteredR[0], 0.05, 0.5];

  try {
    const result = LM(
      { x: filteredT, y: filteredR },
      model,
      {
        damping: 1.5,
        initialValues: initial,
        maxIterations: 100,
        errorTolerance: 1e-3,
        minValues: [0, 1e-6, 0],
        maxValues: [Infinity, 5, 2],
      },
    );

    const [qi, Di, b] = result.parameterValues;
    if (!Number.isFinite(qi) || !Number.isFinite(Di) || !Number.isFinite(b)) return null;
    if (qi <= 0 || Di <= 0) return null;

    // EUR: integrate q(t) from peak forward until rate drops below econLimit.
    // For hyperbolic: cumulative = (qi^b / ((1-b)*Di)) * (qi^(1-b) - q^(1-b)) for b<1
    // For exponential (b≈0): cumulative = qi/Di
    // For harmonic (b≈1): cumulative = (qi/Di) * ln(qi/q_econ)
    let cumProjected;
    if (b < 1e-3) {
      cumProjected = qi / Di;
    } else if (Math.abs(b - 1) < 1e-3) {
      cumProjected = (qi / Di) * Math.log(qi / econLimit);
    } else {
      cumProjected =
        (Math.pow(qi, b) / ((1 - b) * Di)) *
        (Math.pow(qi, 1 - b) - Math.pow(econLimit, 1 - b));
    }

    // Add already-produced cumulative to get EUR
    const alreadyCum = monthlyVolumes.reduce((a, v) => a + v, 0);
    const eur = alreadyCum + Math.max(0, cumProjected);

    return {
      qi: Math.round(qi * 100) / 100,
      Di: Math.round(Di * 1000) / 1000,
      b: Math.round(b * 1000) / 1000,
      eur: Math.round(eur),
    };
  } catch {
    return null;
  }
}
