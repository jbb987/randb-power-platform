import { useState, useCallback, useRef, useEffect } from 'react';
import {
  fetchPowerPlants,
  fetchTransmissionLines,
  fetchSubstations,
  fetchStateBoundary,
  calculateAvailability,
  type MapBounds,
  type MapPowerPlant,
  type MapTransmissionLine,
  type MapSubstation,
} from '../lib/powerMapData';
import { fetchStateDemandMW, fetchStateCapacityFactors } from '../lib/eiaApi';
import { getStateConsumption } from '../lib/eiaConsumption';
import { getStateBounds } from '../lib/stateBounds';

export interface PowerMapState {
  plants: MapPowerPlant[];
  lines: MapTransmissionLine[];
  substations: MapSubstation[];
  stateBoundary: GeoJSON.FeatureCollection;
  totalCapacityMW: number;
  totalDemandMW: number;
  loading: boolean;
  error: string | null;
  selectedState: string | null;
  bounds: MapBounds | null;
}

interface CachedStateData {
  plants: MapPowerPlant[];
  lines: MapTransmissionLine[];
  substations: MapSubstation[];
  stateBoundary: GeoJSON.FeatureCollection;
  totalCapacityMW: number;
  totalDemandMW: number;
}

export function usePowerMap() {
  const [state, setState] = useState<PowerMapState>({
    plants: [],
    lines: [],
    substations: [],
    stateBoundary: { type: 'FeatureCollection', features: [] },
    totalCapacityMW: 0,
    totalDemandMW: 0,
    loading: false,
    error: null,
    selectedState: null,
    bounds: null,
  });

  const cacheRef = useRef<Map<string, CachedStateData>>(new Map());
  const abortRef = useRef<AbortController | null>(null);

  const loadState = useCallback(async (stateAbbr: string) => {
    const stateBounds = getStateBounds(stateAbbr);
    if (!stateBounds) return;

    const bounds: MapBounds = {
      west: stateBounds.lngMin,
      south: stateBounds.latMin,
      east: stateBounds.lngMax,
      north: stateBounds.latMax,
    };

    // Check cache first
    const cached = cacheRef.current.get(stateAbbr);
    if (cached) {
      setState({
        ...cached,
        loading: false,
        error: null,
        selectedState: stateAbbr,
        bounds,
      });
      return;
    }

    // Cancel any in-flight request
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setState((prev) => ({ ...prev, loading: true, error: null, selectedState: stateAbbr }));

    try {
      const { signal } = controller;

      // Fetch all infrastructure data + EIA live data in parallel
      const [plants, lines, substations, stateBoundary, eiaDemandMW, eiaCapFactors] =
        await Promise.all([
          fetchPowerPlants(bounds, signal),
          fetchTransmissionLines(bounds, signal),
          fetchSubstations(bounds, signal),
          fetchStateBoundary(stateAbbr, signal),
          fetchStateDemandMW(stateAbbr, signal),
          fetchStateCapacityFactors(stateAbbr, signal),
        ]);

      if (signal.aborted) return;

      if (plants.length === 0 && lines.length === 0) {
        setState((prev) => ({
          ...prev,
          loading: false,
          error: 'No power data returned. The data source may be temporarily unavailable.',
          selectedState: stateAbbr,
          bounds,
        }));
        return;
      }

      // Use live EIA demand if available, fall back to hardcoded
      const fallbackConsumption = getStateConsumption(stateAbbr);
      const stateDemandMW = eiaDemandMW ?? fallbackConsumption?.avgDemandMW ?? 0;

      const updatedSubstations = calculateAvailability(
        plants,
        substations,
        stateDemandMW,
        eiaCapFactors,
      );
      const totalCapacityMW = Math.round(plants.reduce((sum, p) => sum + p.capacityMW, 0));
      const totalDemandMW = stateDemandMW;

      const data: CachedStateData = {
        plants,
        lines,
        substations: updatedSubstations,
        stateBoundary,
        totalCapacityMW,
        totalDemandMW,
      };

      cacheRef.current.set(stateAbbr, data);

      setState({
        ...data,
        loading: false,
        error: null,
        selectedState: stateAbbr,
        bounds,
      });
    } catch (err) {
      if (controller.signal.aborted) return;
      setState((prev) => ({
        ...prev,
        loading: false,
        error: err instanceof Error ? err.message : 'Failed to load state data',
      }));
    }
  }, []);

  // Abort in-flight requests on unmount
  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  const clearState = useCallback(() => {
    setState({
      plants: [],
      lines: [],
      substations: [],
      stateBoundary: { type: 'FeatureCollection', features: [] },
      totalCapacityMW: 0,
      totalDemandMW: 0,
      loading: false,
      error: null,
      selectedState: null,
      bounds: null,
    });
  }, []);

  return { ...state, loadState, clearState };
}
