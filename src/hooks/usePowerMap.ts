import { useState, useCallback, useRef } from 'react';
import {
  fetchPowerPlants,
  fetchTransmissionLines,
  fetchStateBoundary,
  calculateAvailability,
  type MapBounds,
  type MapPowerPlant,
  type MapTransmissionLine,
  type MapSubstation,
} from '../lib/powerMapData';
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

      // Fetch all data with pagination
      const [plants, { lines, substations }, stateBoundary] = await Promise.all([
        fetchPowerPlants(bounds, signal),
        fetchTransmissionLines(bounds, signal),
        fetchStateBoundary(stateAbbr, signal),
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

      // Use real state consumption data for availability calc
      const stateConsumption = getStateConsumption(stateAbbr);
      const stateDemandMW = stateConsumption?.avgDemandMW ?? 0;

      calculateAvailability(plants, substations, stateDemandMW);
      const totalCapacityMW = Math.round(plants.reduce((sum, p) => sum + p.capacityMW, 0));
      const totalDemandMW = stateDemandMW;

      const data: CachedStateData = {
        plants,
        lines,
        substations,
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
