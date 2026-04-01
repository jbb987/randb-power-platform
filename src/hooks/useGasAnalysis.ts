import { useCallback, useState } from 'react';
import { analyzeGasInfrastructure } from '../lib/gasAnalysis';
import type { GasAnalysisResult } from '../lib/gasAnalysis';
import { parseCoordinates } from '../utils/parseCoordinates';

interface UseGasAnalysisReturn {
  loading: boolean;
  error: string | null;
  result: GasAnalysisResult | null;
  analyze: (opts: {
    address?: string;
    coordinates?: string;
    targetMW: number;
    capacityFactor?: number;
  }) => Promise<GasAnalysisResult | null>;
  clear: () => void;
}

export function useGasAnalysis(): UseGasAnalysisReturn {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<GasAnalysisResult | null>(null);

  const analyze = useCallback(
    async (opts: {
      address?: string;
      coordinates?: string;
      targetMW: number;
      capacityFactor?: number;
    }): Promise<GasAnalysisResult | null> => {
      setLoading(true);
      setError(null);

      try {
        const coords = opts.coordinates ? parseCoordinates(opts.coordinates) : null;
        const res = await analyzeGasInfrastructure({
          coordinates: coords ?? undefined,
          address: opts.address || undefined,
          targetMW: opts.targetMW,
          capacityFactor: opts.capacityFactor,
        });
        setResult(res);
        return res;
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Gas analysis failed';
        setError(msg);
        setResult(null);
        return null;
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  const clear = useCallback(() => {
    setResult(null);
    setError(null);
  }, []);

  return { loading, error, result, analyze, clear };
}
