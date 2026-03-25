import { useCallback, useState } from 'react';
import { lookupInfrastructure, type InfraResult } from '../lib/infraLookup';

interface UseInfraLookupReturn {
  loading: boolean;
  error: string | null;
  lookup: (opts: { address?: string; coordinates?: string }) => Promise<InfraResult | null>;
}

/** Parse a "lat, lng" string into numbers. Returns null if invalid. */
function parseCoords(raw: string): { lat: number; lng: number } | null {
  const parts = raw.split(',').map((s) => s.trim());
  if (parts.length !== 2) return null;
  const lat = parseFloat(parts[0]);
  const lng = parseFloat(parts[1]);
  if (isNaN(lat) || isNaN(lng)) return null;
  return { lat, lng };
}

export function useInfraLookup(): UseInfraLookupReturn {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const lookup = useCallback(
    async (opts: { address?: string; coordinates?: string }): Promise<InfraResult | null> => {
      setLoading(true);
      setError(null);

      try {
        const coords = opts.coordinates ? parseCoords(opts.coordinates) : null;
        const result = await lookupInfrastructure({
          coordinates: coords ?? undefined,
          address: opts.address || undefined,
        });
        return result;
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Lookup failed');
        return null;
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  return { loading, error, lookup };
}
