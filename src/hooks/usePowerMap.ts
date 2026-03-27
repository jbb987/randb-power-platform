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
  totalGenerationMW: number;
  totalAvailableMW: number;
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
  totalGenerationMW: number;
  totalAvailableMW: number;
}

export function usePowerMap() {
  const [state, setState] = useState<PowerMapState>({
    plants: [],
    lines: [],
    substations: [],
    stateBoundary: { type: 'FeatureCollection', features: [] },
    totalGenerationMW: 0,
    totalAvailableMW: 0,
    loading: false,
    error: null,
    selectedState: null,
    bounds: null,
  });

  const cacheRef = useRef<Map<string, CachedStateData>>(new Map());
  const requestIdRef = useRef(0);

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

    const requestId = ++requestIdRef.current;
    setState((prev) => ({ ...prev, loading: true, error: null, selectedState: stateAbbr }));

    try {
      // Fetch all data with pagination
      const [plants, { lines, substations }, stateBoundary] = await Promise.all([
        fetchPowerPlants(bounds),
        fetchTransmissionLines(bounds),
        fetchStateBoundary(stateAbbr),
      ]);

      if (requestId !== requestIdRef.current) return;

      // Use real state consumption data for availability calc
      const stateConsumption = getStateConsumption(stateAbbr);
      const stateDemandMW = stateConsumption?.avgDemandMW ?? 0;

      calculateAvailability(plants, substations, stateDemandMW);
      const totalGenerationMW = Math.round(plants.reduce((sum, p) => sum + p.capacityMW, 0));
      const totalAvailableMW = Math.round(
        substations.reduce((sum, s) => sum + Math.max(0, s.availableMW), 0),
      );

      const data: CachedStateData = {
        plants,
        lines,
        substations,
        stateBoundary,
        totalGenerationMW,
        totalAvailableMW,
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
      if (requestId !== requestIdRef.current) return;
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
      totalGenerationMW: 0,
      totalAvailableMW: 0,
      loading: false,
      error: null,
      selectedState: null,
      bounds: null,
    });
  }, []);

  return { ...state, loadState, clearState };
}
