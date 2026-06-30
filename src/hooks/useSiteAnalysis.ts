import { useCallback, useState } from 'react';
import { useInfraLookup } from './useInfraLookup';
import { useBroadbandLookup } from './useBroadbandLookup';
import type { AppraisalResult, BroadbandResult } from '../types';
import { computeAppraisal } from '../lib/appraisal';
import type { InfrastructureData } from '../components/power-calculator/InfrastructureResults';
import { analyzeWater } from '../lib/waterAnalysis';
import { analyzeGasInfrastructure } from '../lib/gasAnalysis';
import { lookupTransport } from '../lib/transportLookup';
import { analyzeLabor } from '../lib/laborAnalysis';
import { analyzePoliticalRadar } from '../lib/politicalRadar';
import type { WaterAnalysisResult } from '../lib/waterAnalysis.types';
import type { GasAnalysisResult } from '../lib/gasAnalysis';
import type { LaborAnalysisResult } from '../lib/laborAnalysis';
import type { PoliticalRadarResult } from '../lib/politicalRadar';
import type { TransportResult } from '../types/infrastructure';
import { parseCoordinates } from '../utils/parseCoordinates';

export interface AnalysisInputs {
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
  owner?: string; // Legacy free-text owner (kept for backward compat)
  companyId?: string; // CRM linkage — supersedes owner going forward
  companyName?: string; // Resolved company name at generation time (for PDF + view)
}

export interface AnalysisSectionState<T> {
  loading: boolean;
  error: string | null;
  data: T | null;
}

/** Existing results from the registry to skip re-fetching. */
export interface ExistingResults {
  infra?: Record<string, unknown> | null;
  broadband?: BroadbandResult | null;
  transport?: Record<string, unknown> | null;
  water?: Record<string, unknown> | null;
  gas?: Record<string, unknown> | null;
  labor?: Record<string, unknown> | null;
  political?: Record<string, unknown> | null;
}

export function useSiteAnalysis() {
  const [inputs, setInputs] = useState<AnalysisInputs | null>(null);
  const [appraisal, setAppraisal] = useState<AnalysisSectionState<AppraisalResult>>({
    loading: false,
    error: null,
    data: null,
  });
  const [infra, setInfra] = useState<AnalysisSectionState<InfrastructureData>>({
    loading: false,
    error: null,
    data: null,
  });
  const [broadband, setBroadband] = useState<AnalysisSectionState<BroadbandResult>>({
    loading: false,
    error: null,
    data: null,
  });
  const [transport, setTransport] = useState<AnalysisSectionState<TransportResult>>({
    loading: false,
    error: null,
    data: null,
  });
  const [water, setWater] = useState<AnalysisSectionState<WaterAnalysisResult>>({
    loading: false,
    error: null,
    data: null,
  });
  const [gas, setGas] = useState<AnalysisSectionState<GasAnalysisResult>>({
    loading: false,
    error: null,
    data: null,
  });
  const [labor, setLabor] = useState<AnalysisSectionState<LaborAnalysisResult>>({
    loading: false,
    error: null,
    data: null,
  });
  const [political, setPolitical] = useState<AnalysisSectionState<PoliticalRadarResult>>({
    loading: false,
    error: null,
    data: null,
  });
  const [generatedAt, setGeneratedAt] = useState<number | null>(null);

  const { lookup: infraLookup } = useInfraLookup();
  const { lookup: broadbandLookup } = useBroadbandLookup();

  const generateReport = useCallback(
    async (reportInputs: AnalysisInputs, existing?: ExistingResults) => {
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

      // Section 2: Infrastructure — if the caller passed `existing.infra`,
      // trust it. Locks are explicit user intent ("don't re-roll this");
      // the orchestrator must not second-guess them.
      const hasExistingInfra = !!existing?.infra;
      if (hasExistingInfra) {
        // Cast back from Record<string, unknown> — the stored format is InfrastructureData
        setInfra({
          loading: false,
          error: null,
          data: existing!.infra as unknown as InfrastructureData,
        });
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
                  utilityTerritory:
                    res.utilityTerritory.length > 0
                      ? res.utilityTerritory.join(' / ')
                      : 'Not Available',
                  tsp: res.tsp.length > 0 ? res.tsp.join(' / ') : 'Not Available',
                  retailUtility: res.retailUtility,
                  nearestPoiName: res.nearestPoiName,
                  nearestPoiDistMi: res.nearestPoiDistMi,
                  nearbySubstations: res.nearbySubstations,
                  nearbyLines: res.nearbyLines,
                  ...(res.expandedSubstations?.length
                    ? { expandedSubstations: res.expandedSubstations }
                    : {}),
                  ...(res.expandedSubstationRadiusMi != null
                    ? { expandedSubstationRadiusMi: res.expandedSubstationRadiusMi }
                    : {}),
                  ...(res.expandedLines?.length ? { expandedLines: res.expandedLines } : {}),
                  ...(res.expandedLineRadiusMi != null
                    ? { expandedLineRadiusMi: res.expandedLineRadiusMi }
                    : {}),
                  nearbyPowerPlants: res.nearbyPowerPlants,
                  floodZone: res.floodZone,
                  solarWind: res.solarWind ?? null,
                  electricityPrice: res.electricityPrice ?? null,
                  stateGenerationByFuel: res.stateGenerationByFuel ?? null,
                  detectedState: res.detectedState ?? null,
                  lastAnalyzedAt: Date.now(),
                };
                setInfra({ loading: false, error: null, data });
              } else {
                setInfra({
                  loading: false,
                  error: 'Infrastructure lookup returned no results',
                  data: null,
                });
              }
            } catch (err) {
              setInfra({
                loading: false,
                error: err instanceof Error ? err.message : 'Infrastructure lookup failed',
                data: null,
              });
            }
          })();

      // Section 3: Broadband — skip if existing results provided
      const hasExistingBroadband = !!existing?.broadband;
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
                setBroadband({
                  loading: false,
                  error: 'Broadband lookup returned no results',
                  data: null,
                });
              }
            } catch (err) {
              setBroadband({
                loading: false,
                error: err instanceof Error ? err.message : 'Broadband lookup failed',
                data: null,
              });
            }
          })();

      // Section 4: Transport — skip if existing results provided
      const hasExistingTransport =
        existing?.transport && Object.keys(existing.transport).length > 0;
      if (hasExistingTransport) {
        setTransport({
          loading: false,
          error: null,
          data: existing!.transport as unknown as TransportResult,
        });
      } else {
        setTransport({ loading: true, error: null, data: null });
      }

      const transportPromise = hasExistingTransport
        ? Promise.resolve()
        : (async () => {
            try {
              const res = await lookupTransport({
                coordinates: reportInputs.coordinates || undefined,
                address: reportInputs.address || undefined,
              });
              setTransport({ loading: false, error: null, data: res });
            } catch (err) {
              setTransport({
                loading: false,
                error: err instanceof Error ? err.message : 'Transport lookup failed',
                data: null,
              });
            }
          })();

      // Section 5: Water — if `existing.water` is provided, trust it. The
      // older accretive-retry behavior (re-run any sub-section whose stored
      // error was truthy) silently overrode the lock signal — the user's
      // explicit "skip this" was being second-guessed by stored FEMA / NWI
      // errors from a previous run. Lock semantics win.
      const waterExisting = existing?.water as Partial<WaterAnalysisResult> | undefined;
      const hasExistingWater = !!waterExisting && Object.keys(waterExisting).length > 0;
      if (hasExistingWater) {
        setWater({ loading: false, error: null, data: waterExisting as WaterAnalysisResult });
      } else if (waterExisting) {
        setWater({ loading: true, error: null, data: waterExisting as WaterAnalysisResult });
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
                existing: waterExisting,
              });
              setWater({ loading: false, error: null, data: res });
            } catch (err) {
              setWater({
                loading: false,
                error: err instanceof Error ? err.message : 'Water analysis failed',
                data: null,
              });
            }
          })();

      // Section 6: Gas — skip if existing results provided
      const hasExistingGas = existing?.gas && Object.keys(existing.gas).length > 0;
      if (hasExistingGas) {
        setGas({
          loading: false,
          error: null,
          data: existing!.gas as unknown as GasAnalysisResult,
        });
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
              setGas({
                loading: false,
                error: err instanceof Error ? err.message : 'Gas analysis failed',
                data: null,
              });
            }
          })();

      // Section 7: Labor — skip if existing results provided
      const hasExistingLabor = existing?.labor && Object.keys(existing.labor).length > 0;
      if (hasExistingLabor) {
        setLabor({
          loading: false,
          error: null,
          data: existing!.labor as unknown as LaborAnalysisResult,
        });
      } else {
        setLabor({ loading: true, error: null, data: null });
      }

      const laborPromise = hasExistingLabor
        ? Promise.resolve()
        : (async () => {
            try {
              const res = await analyzeLabor({
                coordinates: coords ?? undefined,
                address: reportInputs.address || undefined,
              });
              setLabor({ loading: false, error: null, data: res });
            } catch (err) {
              setLabor({
                loading: false,
                error: err instanceof Error ? err.message : 'Labor analysis failed',
                data: null,
              });
            }
          })();

      // Section 8: Political Radar — federal layer + 4 stubs.
      // If `existing.political` is provided, trust it (lock semantics).
      // The Firestore-side cache in the federal orchestrator still makes
      // unlocked refetches cheap.
      const politicalExisting = existing?.political as Partial<PoliticalRadarResult> | undefined;
      const hasExistingPolitical = !!politicalExisting;
      if (hasExistingPolitical) {
        setPolitical({
          loading: false,
          error: null,
          data: politicalExisting as PoliticalRadarResult,
        });
      } else {
        setPolitical({ loading: true, error: null, data: null });
      }

      const politicalPromise = hasExistingPolitical
        ? Promise.resolve()
        : (async () => {
            try {
              const res = await analyzePoliticalRadar({
                coordinates: reportInputs.coordinates || undefined,
              });
              setPolitical({ loading: false, error: null, data: res });
            } catch (err) {
              setPolitical({
                loading: false,
                error: err instanceof Error ? err.message : 'Political radar failed',
                data: null,
              });
            }
          })();

      // Run all sections in parallel
      await Promise.allSettled([
        infraPromise,
        broadbandPromise,
        transportPromise,
        waterPromise,
        gasPromise,
        laborPromise,
        politicalPromise,
      ]);
    },
    [infraLookup, broadbandLookup],
  );

  /**
   * Populate report state from saved registry data WITHOUT running any
   * network fetches. Used when the user just wants to view a previously
   * generated report (e.g. clicking a site in the sidebar).
   */
  const loadReport = useCallback((reportInputs: AnalysisInputs, existing: ExistingResults) => {
    setInputs(reportInputs);
    setGeneratedAt(Date.now());

    try {
      setAppraisal({ loading: false, error: null, data: computeAppraisal(reportInputs) });
    } catch {
      setAppraisal({ loading: false, error: 'Failed to compute appraisal', data: null });
    }

    setInfra({
      loading: false,
      error: null,
      data: (existing.infra ?? null) as InfrastructureData | null,
    });
    setBroadband({ loading: false, error: null, data: existing.broadband ?? null });
    setTransport({
      loading: false,
      error: null,
      data: (existing.transport ?? null) as unknown as TransportResult | null,
    });
    setWater({
      loading: false,
      error: null,
      data: (existing.water ?? null) as unknown as WaterAnalysisResult | null,
    });
    setGas({
      loading: false,
      error: null,
      data: (existing.gas ?? null) as unknown as GasAnalysisResult | null,
    });
    setLabor({
      loading: false,
      error: null,
      data: (existing.labor ?? null) as unknown as LaborAnalysisResult | null,
    });
    setPolitical({
      loading: false,
      error: null,
      data: (existing.political ?? null) as unknown as PoliticalRadarResult | null,
    });
  }, []);

  const reset = useCallback(() => {
    setInputs(null);
    setAppraisal({ loading: false, error: null, data: null });
    setInfra({ loading: false, error: null, data: null });
    setBroadband({ loading: false, error: null, data: null });
    setTransport({ loading: false, error: null, data: null });
    setWater({ loading: false, error: null, data: null });
    setGas({ loading: false, error: null, data: null });
    setLabor({ loading: false, error: null, data: null });
    setPolitical({ loading: false, error: null, data: null });
    setGeneratedAt(null);
  }, []);

  const isGenerating =
    appraisal.loading ||
    infra.loading ||
    broadband.loading ||
    transport.loading ||
    water.loading ||
    gas.loading ||
    labor.loading ||
    political.loading;
  const hasReport = generatedAt !== null;

  return {
    inputs,
    appraisal,
    infra,
    broadband,
    transport,
    water,
    gas,
    labor,
    political,
    generatedAt,
    isGenerating,
    hasReport,
    generateReport,
    loadReport,
    reset,
  };
}
