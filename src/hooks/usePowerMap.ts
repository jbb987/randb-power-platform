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
  type FetchOptions,
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
  zoomLevel: number;
  dataTruncated: boolean;
  bounds: MapBounds | null;
}

/** Determine fetch options based on zoom level for progressive loading. */
function getFetchOptions(zoom: number): {
  plants: FetchOptions;
  lines: FetchOptions;
  skipLines: boolean;
} {
  if (zoom < 7) {
    // Wide view: large plants only, no transmission lines
    return {
      plants: { minCapacityMW: 100, maxResults: 500 },
      lines: {},
      skipLines: true,
    };
  }
  if (zoom < 9) {
    // Medium view: medium plants, high-voltage lines only
    return {
      plants: { minCapacityMW: 10, maxResults: 1000 },
      lines: { minVoltageKV: 230, maxResults: 1000 },
      skipLines: false,
    };
  }
  // Close view: everything
  return {
    plants: { maxResults: 2000 },
    lines: { maxResults: 2000 },
    skipLines: false,
  };
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
    zoomLevel: 5,
    dataTruncated: false,
    bounds: null,
  });

  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const requestIdRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);

  const loadData = useCallback((bounds: MapBounds, zoom: number) => {
    if (timerRef.current) clearTimeout(timerRef.current);

    timerRef.current = setTimeout(async () => {
      // Abort any in-flight request
      abortRef.current?.abort();
      abortRef.current = new AbortController();

      const requestId = ++requestIdRef.current;

      // Too zoomed out — clear data and show message
      if (zoom < 5) {
        setState({
          plants: [],
          lines: [],
          substations: [],
          availability: [],
          totalGenerationMW: 0,
          totalAvailableMW: 0,
          loading: false,
          error: null,
          zoomLevel: zoom,
          dataTruncated: false,
          bounds,
        });
        return;
      }

      setState((prev) => ({ ...prev, loading: true, error: null, zoomLevel: zoom }));

      try {
        const opts = getFetchOptions(zoom);

        // Expand plant query bounds by the availability radius (0.3 deg / ~20 mi)
        // so we capture generators feeding substations near viewport edges
        const plantBounds: MapBounds = {
          west: bounds.west - 0.35,
          south: bounds.south - 0.35,
          east: bounds.east + 0.35,
          north: bounds.north + 0.35,
        };

        const [plantsResult, linesResult] = await Promise.all([
          fetchPowerPlants(plantBounds, opts.plants),
          opts.skipLines
            ? Promise.resolve({ data: { lines: [] as MapTransmissionLine[], substations: [] as MapSubstation[] }, truncated: false })
            : fetchTransmissionLines(bounds, opts.lines),
        ]);

        if (requestId !== requestIdRef.current) return;

        const plants = plantsResult.data;
        const { lines, substations } = linesResult.data;
        const truncated = plantsResult.truncated || linesResult.truncated;

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
          zoomLevel: zoom,
          dataTruncated: truncated,
          bounds,
        });
      } catch (err) {
        if (requestId !== requestIdRef.current) return;
        setState((prev) => ({
          ...prev,
          loading: false,
          error: err instanceof Error ? err.message : 'Failed to load map data',
        }));
      }
    }, 600);
  }, []);

  return { ...state, loadData };
}
