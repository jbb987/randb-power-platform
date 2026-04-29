import { useCallback, useState } from 'react';
import { analyzeLabor } from '../lib/laborAnalysis';
import type { LaborAnalysisResult } from '../lib/laborAnalysis';
import { parseCoordinates } from '../utils/parseCoordinates';

interface UseLaborAnalysisReturn {
  loading: boolean;
  error: string | null;
  result: LaborAnalysisResult | null;
  analyze: (opts: {
    address?: string;
    coordinates?: string;
  }) => Promise<LaborAnalysisResult | null>;
  clear: () => void;
}

export function useLaborAnalysis(): UseLaborAnalysisReturn {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<LaborAnalysisResult | null>(null);

  const analyze = useCallback(
    async (opts: {
      address?: string;
      coordinates?: string;
    }): Promise<LaborAnalysisResult | null> => {
      setLoading(true);
      setError(null);

      try {
        const coords = opts.coordinates ? parseCoordinates(opts.coordinates) : null;
        const res = await analyzeLabor({
          coordinates: coords ?? undefined,
          address: opts.address || undefined,
        });
        setResult(res);
        return res;
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Labor analysis failed';
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
