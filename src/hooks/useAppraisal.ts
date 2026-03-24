import { useMemo } from 'react';
import type { SiteInputs, AppraisalResult } from '../types';

/**
 * Power cost curve fitted to real data points:
 *   10 MW  →  $700K
 *   100 MW →  $10M
 *
 * Model: cost = A × MW^B
 *   B = log(10M / 700K) / log(100 / 10) = log(14.286) / log(10) ≈ 1.155
 *   A = 700,000 / 10^1.155 ≈ 48,986
 */
const CURVE_A = 48986;
const CURVE_B = 1.155;

export function calculateBuildCost(mw: number): number {
  if (mw <= 0) return 0;
  return CURVE_A * Math.pow(mw, CURVE_B);
}

export function useAppraisal(inputs: SiteInputs): AppraisalResult {
  return useMemo(() => {
    const currentValueLow = inputs.totalAcres * inputs.ppaLow;
    const currentValueHigh = inputs.totalAcres * inputs.ppaHigh;
    const currentValueMid = (currentValueLow + currentValueHigh) / 2;
    const buildCost = calculateBuildCost(inputs.mw);
    const buildCostPerMW = inputs.mw > 0 ? buildCost / inputs.mw : 0;
    const replacementCost = buildCost * 1.5;
    const replacementCostPerMW = inputs.mw > 0 ? replacementCost / inputs.mw : 0;
    const energizedValue = currentValueMid + replacementCost;
    const valueCreated = energizedValue - currentValueMid;
    const returnMultiple = currentValueMid > 0 ? energizedValue / currentValueMid : 0;

    return {
      currentValueLow,
      currentValueHigh,
      buildCost,
      buildCostPerMW,
      replacementCost,
      replacementCostPerMW,
      energizedValue,
      valueCreated,
      returnMultiple,
    };
  }, [inputs.totalAcres, inputs.ppaLow, inputs.ppaHigh, inputs.mw]);
}
