import { useCallback, useState } from 'react';
import { analyzeWater } from '../lib/waterAnalysis';
import type { WaterAnalysisResult } from '../lib/waterAnalysis.types';
import { parseCoordinates } from '../utils/parseCoordinates';

interface UseWaterAnalysisReturn {
  loading: boolean;
  error: string | null;
  result: WaterAnalysisResult | null;
  analyze: (opts: { address?: string; coordinates?: string }) => Promise<WaterAnalysisResult | null>;
  clear: () => void;
}

export function useWaterAnalysis(): UseWaterAnalysisReturn {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<WaterAnalysisResult | null>(null);

  const analyze = useCallback(
    async (opts: { address?: string; coordinates?: string }): Promise<WaterAnalysisResult | null> => {
      setLoading(true);
      setError(null);

      try {
        const coords = opts.coordinates ? parseCoordinates(opts.coordinates) : null;
        const res = await analyzeWater({
          coordinates: coords ?? undefined,
          address: opts.address || undefined,
        });
        setResult(res);
        return res;
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Water analysis failed';
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
