/**
 * Hooks for querying cached infrastructure data from Firestore.
 *
 * These provide the same data shapes as the current direct API calls,
 * making it easy for tools to swap in cached data in later branches.
 */

import { useState, useEffect, useCallback } from 'react';
import {
  fetchNearbyPlants,
  fetchNearbySubstations,
  fetchEiaStateData,
  fetchSolarAverage,
  getLastRefreshTime,
} from '../lib/firebaseInfra';
import type {
  CachedPowerPlant,
  CachedSubstation,
  EiaStateData,
  SolarStateAverage,
  InfraRefreshLog,
} from '../types/infrastructure';

// ── Cached Plants Hook ─────────────────────────────────────────────────────

interface UseCachedPlantsResult {
  plants: CachedPowerPlant[];
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

export function useCachedPlants(
  center: { lat: number; lng: number } | null,
  radiusMiles: number = 50,
): UseCachedPlantsResult {
  const [plants, setPlants] = useState<CachedPowerPlant[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [trigger, setTrigger] = useState(0);

  const refetch = useCallback(() => setTrigger((t) => t + 1), []);

  useEffect(() => {
    if (!center || (center.lat === 0 && center.lng === 0)) {
      setPlants([]);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    fetchNearbyPlants(center, radiusMiles)
      .then((data) => {
        if (!cancelled) setPlants(data);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load plants');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [center?.lat, center?.lng, radiusMiles, trigger]);

  return { plants, loading, error, refetch };
}

// ── Cached Substations Hook ────────────────────────────────────────────────

interface UseCachedSubstationsResult {
  substations: CachedSubstation[];
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

export function useCachedSubstations(
  center: { lat: number; lng: number } | null,
  radiusMiles: number = 50,
): UseCachedSubstationsResult {
  const [substations, setSubstations] = useState<CachedSubstation[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [trigger, setTrigger] = useState(0);

  const refetch = useCallback(() => setTrigger((t) => t + 1), []);

  useEffect(() => {
    if (!center || (center.lat === 0 && center.lng === 0)) {
      setSubstations([]);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    fetchNearbySubstations(center, radiusMiles)
      .then((data) => {
        if (!cancelled) setSubstations(data);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load substations');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [center?.lat, center?.lng, radiusMiles, trigger]);

  return { substations, loading, error, refetch };
}

// ── EIA State Data Hook ────────────────────────────────────────────────────

interface UseEiaStateDataResult {
  data: EiaStateData | null;
  loading: boolean;
  error: string | null;
}

export function useEiaStateData(state: string | null): UseEiaStateDataResult {
  const [data, setData] = useState<EiaStateData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!state) {
      setData(null);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    fetchEiaStateData(state)
      .then((result) => {
        if (!cancelled) setData(result);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load EIA data');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [state]);

  return { data, loading, error };
}

// ── Solar Average Hook ─────────────────────────────────────────────────────

interface UseSolarAverageResult {
  data: SolarStateAverage | null;
  loading: boolean;
  error: string | null;
}

export function useSolarAverage(state: string | null): UseSolarAverageResult {
  const [data, setData] = useState<SolarStateAverage | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!state) {
      setData(null);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    fetchSolarAverage(state)
      .then((result) => {
        if (!cancelled) setData(result);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load solar data');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [state]);

  return { data, loading, error };
}

// ── Refresh Log Hook ───────────────────────────────────────────────────────

interface UseRefreshLogResult {
  log: InfraRefreshLog | null;
  loading: boolean;
  refetch: () => void;
}

export function useRefreshLog(): UseRefreshLogResult {
  const [log, setLog] = useState<InfraRefreshLog | null>(null);
  const [loading, setLoading] = useState(true);
  const [trigger, setTrigger] = useState(0);

  const refetch = useCallback(() => setTrigger((t) => t + 1), []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    getLastRefreshTime()
      .then((result) => {
        if (!cancelled) setLog(result);
      })
      .catch(() => {
        // Silently fail — no refresh log just means never refreshed
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [trigger]);

  return { log, loading, refetch };
}
