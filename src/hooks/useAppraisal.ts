import { useMemo } from 'react';
import type { SiteInputs, AppraisalResult } from '../types';

/** Energized value: $1M per MW */
const VALUE_PER_MW = 1_000_000;

export function useAppraisal(inputs: SiteInputs): AppraisalResult {
  return useMemo(() => {
    const currentValueLow = inputs.totalAcres * inputs.ppaLow;
    const currentValueHigh = inputs.totalAcres * inputs.ppaHigh;
    const currentValueMid = (currentValueLow + currentValueHigh) / 2;
    const energizedValue = inputs.mw * VALUE_PER_MW;
    const valueCreated = energizedValue - currentValueMid;
    const returnMultiple = currentValueMid > 0 ? energizedValue / currentValueMid : 0;

    return {
      currentValueLow,
      currentValueHigh,
      energizedValue,
      valueCreated,
      returnMultiple,
    };
  }, [inputs.totalAcres, inputs.ppaLow, inputs.ppaHigh, inputs.mw]);
}
