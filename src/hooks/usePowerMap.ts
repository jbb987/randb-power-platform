import { useState, useCallback, useRef } from 'react';
import {
  fetchPowerPlants,
  fetchTransmissionLines,
  calculateAvailability,
  type MapBounds,
  type MapPowerPlant,
  type MapTransmissionLine,
  type MapSubstation,
  type AvailabilityPoint,
} from '../lib/powerMapData';
import { US_AVG_PER_CAPITA_KW } from '../lib/eiaConsumption';

export interface PowerMapState {
  plants: MapPowerPlant[];
  lines: MapTransmissionLine[];
  substations: MapSubstation[];
  availability: AvailabilityPoint[];
  totalGenerationMW: number;
  totalAvailableMW: number;
  loading: boolean;
  error: string | null;
}

export function usePowerMap() {
  const [state, setState] = useState<PowerMapState>({
    plants: [],
    lines: [],
    substations: [],
    availability: [],
    totalGenerationMW: 0,
    totalAvailableMW: 0,
    loading: false,
    error: null,
  });

  // Debounce timer ref
  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  // Track latest request to ignore stale responses
  const requestIdRef = useRef(0);

  const loadData = useCallback((bounds: MapBounds) => {
    // Debounce: wait 400ms after last call
    if (timerRef.current) clearTimeout(timerRef.current);

    timerRef.current = setTimeout(async () => {
      const requestId = ++requestIdRef.current;
      setState((prev) => ({ ...prev, loading: true, error: null }));

      try {
        const [plants, { lines, substations }] = await Promise.all([
          fetchPowerPlants(bounds),
          fetchTransmissionLines(bounds),
        ]);

        // Stale response check
        if (requestId !== requestIdRef.current) return;

        const availability = calculateAvailability(plants, substations, US_AVG_PER_CAPITA_KW);
        const totalGenerationMW = plants.reduce((sum, p) => sum + p.capacityMW, 0);
        const totalAvailableMW = availability.reduce((sum, a) => sum + a.availableMW, 0);

        setState({
          plants,
          lines,
          substations,
          availability,
          totalGenerationMW: Math.round(totalGenerationMW),
          totalAvailableMW: Math.round(totalAvailableMW),
          loading: false,
          error: null,
        });
      } catch (err) {
        if (requestId !== requestIdRef.current) return;
        setState((prev) => ({
          ...prev,
          loading: false,
          error: err instanceof Error ? err.message : 'Failed to load map data',
        }));
      }
    }, 400);
  }, []);

  return { ...state, loadData };
}
