import { useMemo } from 'react';
import type { SiteInputs, ValuationResult } from '../types';

/**
 * Power cost curve fitted to real data points:
 *   10 MW  →  $700K
 *   100 MW →  $10M
 *
 * Model: cost = A × MW^B
 *   B = log(10M / 700K) / log(100 / 10) = log(14.286) / log(10) ≈ 1.155
 *   A = 700,000 / 10^1.155 ≈ 48,986
 *
 * This gives realistic scaling:
 *   10 MW  → $700K   ($70K/MW)
 *   50 MW  → $4.4M   ($87K/MW)
 *   100 MW → $10M    ($100K/MW)
 *   250 MW → $28.5M  ($114K/MW)
 *   500 MW → $64M    ($128K/MW)
 *   1000 MW → $143M  ($143K/MW)
 */
const CURVE_A = 48986;
const CURVE_B = 1.155;

export function calculateBuildCost(mw: number): number {
  if (mw <= 0) return 0;
  return CURVE_A * Math.pow(mw, CURVE_B);
}

export function useValuation(inputs: SiteInputs): ValuationResult {
  return useMemo(() => {
    const currentValue = inputs.totalAcres * inputs.currentPPA;
    const buildCost = calculateBuildCost(inputs.mw);
    const buildCostPerMW = inputs.mw > 0 ? buildCost / inputs.mw : 0;
    const replacementCost = buildCost * 1.5;
    const replacementCostPerMW = inputs.mw > 0 ? replacementCost / inputs.mw : 0;
    const energizedValue = currentValue + replacementCost;
    const energizedPPA = inputs.totalAcres > 0 ? energizedValue / inputs.totalAcres : 0;
    const valueCreated = energizedValue - currentValue;
    const returnMultiple = currentValue > 0 ? energizedValue / currentValue : 0;

    return {
      currentValue,
      buildCost,
      buildCostPerMW,
      replacementCost,
      replacementCostPerMW,
      energizedValue,
      energizedPPA,
      valueCreated,
      returnMultiple,
    };
  }, [inputs.totalAcres, inputs.currentPPA, inputs.mw]);
}
