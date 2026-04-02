import { useCallback, useState } from 'react';
import { useInfraLookup } from './useInfraLookup';
import { useBroadbandLookup } from './useBroadbandLookup';
import type { AppraisalResult, BroadbandResult } from '../types';
import type { InfrastructureData } from '../components/power-calculator/InfrastructureResults';
import { analyzeWater } from '../lib/waterAnalysis';
import { analyzeGasInfrastructure } from '../lib/gasAnalysis';
import type { WaterAnalysisResult } from '../lib/waterAnalysis.types';
import type { GasAnalysisResult } from '../lib/gasAnalysis';
import { parseCoordinates } from '../utils/parseCoordinates';

export interface PiddrInputs {
  siteName: string;
  customerName?: string;
  address: string;
  coordinates: string;
  acreage: number;
  mw: number;
  ppaLow: number;
  ppaHigh: number;
  // Due diligence fields
  priorUsage?: string;
  legalDescription?: string;
  county?: string;
  parcelId?: string;
  owner?: string;
}

export interface PiddrSectionState<T> {
  loading: boolean;
  error: string | null;
  data: T | null;
}

/** Existing results from the registry to skip re-fetching. */
export interface ExistingResults {
  infra?: Record<string, unknown> | null;
  broadband?: BroadbandResult | null;
  water?: Record<string, unknown> | null;
  gas?: Record<string, unknown> | null;
}

const VALUE_PER_MW = 3_000_000;

function computeAppraisal(inputs: PiddrInputs): AppraisalResult {
  const currentValueLow = inputs.acreage * inputs.ppaLow;
  const currentValueHigh = inputs.acreage * inputs.ppaHigh;
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
}

export function usePiddrReport() {
  const [inputs, setInputs] = useState<PiddrInputs | null>(null);
  const [appraisal, setAppraisal] = useState<PiddrSectionState<AppraisalResult>>({
    loading: false, error: null, data: null,
  });
  const [infra, setInfra] = useState<PiddrSectionState<InfrastructureData>>({
    loading: false, error: null, data: null,
  });
  const [broadband, setBroadband] = useState<PiddrSectionState<BroadbandResult>>({
    loading: false, error: null, data: null,
  });
  const [water, setWater] = useState<PiddrSectionState<WaterAnalysisResult>>({
    loading: false, error: null, data: null,
  });
  const [gas, setGas] = useState<PiddrSectionState<GasAnalysisResult>>({
    loading: false, error: null, data: null,
  });
  const [generatedAt, setGeneratedAt] = useState<number | null>(null);

  const { lookup: infraLookup } = useInfraLookup();
  const { lookup: broadbandLookup } = useBroadbandLookup();

  const generateReport = useCallback(async (reportInputs: PiddrInputs, existing?: ExistingResults) => {
    setInputs(reportInputs);
    setGeneratedAt(Date.now());

    // Section 1: Appraisal (always recomputed — instant, depends on current inputs)
    setAppraisal({ loading: true, error: null, data: null });
    try {
      const result = computeAppraisal(reportInputs);
      setAppraisal({ loading: false, error: null, data: result });
    } catch {
      setAppraisal({ loading: false, error: 'Failed to compute appraisal', data: null });
    }

    // Section 2: Infrastructure — skip if existing results provided
    const hasExistingInfra = existing?.infra && Object.keys(existing.infra).length > 0;
    if (hasExistingInfra) {
      // Cast back from Record<string, unknown> — the stored format is InfrastructureData
      setInfra({ loading: false, error: null, data: existing!.infra as unknown as InfrastructureData });
    } else {
      setInfra({ loading: true, error: null, data: null });
    }

    const infraPromise = hasExistingInfra
      ? Promise.resolve()
      : (async () => {
          try {
            const res = await infraLookup({
              coordinates: reportInputs.coordinates || undefined,
              address: reportInputs.address || undefined,
            });
            if (res) {
              const data: InfrastructureData = {
                iso: res.iso.length > 0 ? res.iso.join(' / ') : 'Not Available',
                utilityTerritory: res.utilityTerritory.length > 0 ? res.utilityTerritory.join(' / ') : 'Not Available',
                tsp: res.tsp.length > 0 ? res.tsp.join(' / ') : 'Not Available',
                nearestPoiName: res.nearestPoiName,
                nearestPoiDistMi: res.nearestPoiDistMi,
                nearbySubstations: res.nearbySubstations,
                nearbyLines: res.nearbyLines,
                nearbyPowerPlants: res.nearbyPowerPlants,
                floodZone: res.floodZone,
                solarWind: res.solarWind ?? null,
                electricityPrice: res.electricityPrice ?? null,
                detectedState: res.detectedState ?? null,
                lastAnalyzedAt: Date.now(),
              };
              setInfra({ loading: false, error: null, data });
            } else {
              setInfra({ loading: false, error: 'Infrastructure lookup returned no results', data: null });
            }
          } catch (err) {
            setInfra({ loading: false, error: err instanceof Error ? err.message : 'Infrastructure lookup failed', data: null });
          }
        })();

    // Section 3: Broadband — always re-fetch to ensure nearby service blocks are current
    const hasExistingBroadband = false;
    if (hasExistingBroadband) {
      setBroadband({ loading: false, error: null, data: existing!.broadband! });
    } else {
      setBroadband({ loading: true, error: null, data: null });
    }

    const broadbandPromise = hasExistingBroadband
      ? Promise.resolve()
      : (async () => {
          try {
            const res = await broadbandLookup({
              coordinates: reportInputs.coordinates || undefined,
              address: reportInputs.address || undefined,
            });
            if (res) {
              setBroadband({ loading: false, error: null, data: res });
            } else {
              setBroadband({ loading: false, error: 'Broadband lookup returned no results', data: null });
            }
          } catch (err) {
            setBroadband({ loading: false, error: err instanceof Error ? err.message : 'Broadband lookup failed', data: null });
          }
        })();

    // Section 4: Water — skip if existing results provided
    const hasExistingWater = existing?.water && Object.keys(existing.water).length > 0;
    if (hasExistingWater) {
      setWater({ loading: false, error: null, data: existing!.water as unknown as WaterAnalysisResult });
    } else {
      setWater({ loading: true, error: null, data: null });
    }

    const coords = parseCoordinates(reportInputs.coordinates);

    const waterPromise = hasExistingWater
      ? Promise.resolve()
      : (async () => {
          try {
            const res = await analyzeWater({
              coordinates: coords ?? undefined,
              address: reportInputs.address || undefined,
            });
            setWater({ loading: false, error: null, data: res });
          } catch (err) {
            setWater({ loading: false, error: err instanceof Error ? err.message : 'Water analysis failed', data: null });
          }
        })();

    // Section 5: Gas — skip if existing results provided
    const hasExistingGas = existing?.gas && Object.keys(existing.gas).length > 0;
    if (hasExistingGas) {
      setGas({ loading: false, error: null, data: existing!.gas as unknown as GasAnalysisResult });
    } else {
      setGas({ loading: true, error: null, data: null });
    }

    const gasPromise = hasExistingGas
      ? Promise.resolve()
      : (async () => {
          try {
            const res = await analyzeGasInfrastructure({
              coordinates: coords ?? undefined,
              address: reportInputs.address || undefined,
              targetMW: reportInputs.mw,
            });
            setGas({ loading: false, error: null, data: res });
          } catch (err) {
            setGas({ loading: false, error: err instanceof Error ? err.message : 'Gas analysis failed', data: null });
          }
        })();

    // Run all sections in parallel
    await Promise.allSettled([infraPromise, broadbandPromise, waterPromise, gasPromise]);
  }, [infraLookup, broadbandLookup]);

  const reset = useCallback(() => {
    setInputs(null);
    setAppraisal({ loading: false, error: null, data: null });
    setInfra({ loading: false, error: null, data: null });
    setBroadband({ loading: false, error: null, data: null });
    setWater({ loading: false, error: null, data: null });
    setGas({ loading: false, error: null, data: null });
    setGeneratedAt(null);
  }, []);

  const isGenerating = appraisal.loading || infra.loading || broadband.loading || water.loading || gas.loading;
  const hasReport = generatedAt !== null;

  return {
    inputs,
    appraisal,
    infra,
    broadband,
    water,
    gas,
    generatedAt,
    isGenerating,
    hasReport,
    generateReport,
    reset,
  };
}
