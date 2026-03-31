/**
 * Admin-only panel for refreshing cached infrastructure data.
 *
 * Shows last refresh date, a refresh button, and progress during ingestion.
 * Designed to be embedded in the User Management page.
 */

import { useState } from 'react';
import { useRefreshLog } from '../../hooks/useInfraData';
import { refreshAllInfraData, type IngestionProgress } from '../../lib/infraIngestion';
import type { Timestamp } from 'firebase/firestore';

function formatTimestamp(ts: Timestamp | number | null | undefined): string {
  if (!ts) return 'Never';
  const date = typeof ts === 'number'
    ? new Date(ts)
    : ts.toDate?.()
      ? ts.toDate()
      : new Date();
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

const STAGE_LABELS: Record<string, string> = {
  plants: 'Power Plants',
  substations: 'Substations',
  eia: 'EIA State Data',
  solar: 'Solar Averages',
  done: 'Complete',
};

export default function InfraRefreshPanel() {
  const { log, loading: logLoading, refetch: refetchLog } = useRefreshLog();
  const [refreshing, setRefreshing] = useState(false);
  const [progress, setProgress] = useState<IngestionProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ powerPlants: number; substations: number; eiaStates: number; solarStates: number } | null>(null);

  const handleRefresh = async () => {
    setRefreshing(true);
    setError(null);
    setResult(null);
    setProgress(null);

    try {
      const res = await refreshAllInfraData((p) => setProgress(p));
      setResult(res);
      refetchLog();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Refresh failed');
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <div className="bg-white rounded-xl shadow-sm border border-[#D8D5D0] p-5">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="font-heading text-base font-semibold text-[#201F1E]">
            Infrastructure Data Cache
          </h3>
          <p className="text-sm text-[#7A756E] mt-0.5">
            Cached power plants, substations, EIA prices, and solar averages in Firestore.
          </p>
        </div>
        <button
          onClick={handleRefresh}
          disabled={refreshing}
          className="rounded-lg bg-[#ED202B] text-white border border-[#ED202B] hover:bg-[#9B0E18] hover:border-[#9B0E18] px-4 py-2 text-sm font-medium transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
        >
          {refreshing && (
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
          )}
          {refreshing ? 'Refreshing...' : 'Refresh Data'}
        </button>
      </div>

      {/* Last refresh info */}
      <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm mb-4">
        <div>
          <span className="text-[#7A756E]">Last refreshed: </span>
          <span className="text-[#201F1E] font-medium">
            {logLoading ? '...' : formatTimestamp(log?.lastRefreshedAt)}
          </span>
        </div>
        {log?.recordCounts && (
          <>
            <div>
              <span className="text-[#7A756E]">Plants: </span>
              <span className="text-[#201F1E]">{log.recordCounts.powerPlants.toLocaleString()}</span>
            </div>
            <div>
              <span className="text-[#7A756E]">Substations: </span>
              <span className="text-[#201F1E]">{log.recordCounts.substations.toLocaleString()}</span>
            </div>
            <div>
              <span className="text-[#7A756E]">EIA States: </span>
              <span className="text-[#201F1E]">{log.recordCounts.eiaStates}</span>
            </div>
            <div>
              <span className="text-[#7A756E]">Solar States: </span>
              <span className="text-[#201F1E]">{log.recordCounts.solarStates}</span>
            </div>
          </>
        )}
      </div>

      {/* Progress during refresh */}
      {refreshing && progress && (
        <div className="rounded-lg bg-[#FAFAF9] border border-[#D8D5D0] p-3">
          <div className="flex items-center gap-2 mb-1">
            <div className="h-2 w-2 rounded-full bg-[#ED202B] animate-pulse" />
            <span className="text-sm font-medium text-[#201F1E]">
              {STAGE_LABELS[progress.stage] ?? progress.stage}
            </span>
          </div>
          <p className="text-sm text-[#7A756E]">{progress.message}</p>
          {progress.count !== undefined && (
            <p className="text-xs text-[#7A756E] mt-1">
              Records processed: {progress.count.toLocaleString()}
            </p>
          )}
        </div>
      )}

      {/* Success result */}
      {result && !refreshing && (
        <div className="rounded-lg bg-green-50 border border-green-200 p-3">
          <p className="text-sm text-green-800 font-medium">Refresh complete</p>
          <p className="text-xs text-green-700 mt-1">
            {result.powerPlants.toLocaleString()} plants,{' '}
            {result.substations.toLocaleString()} substations,{' '}
            {result.eiaStates} EIA records,{' '}
            {result.solarStates} solar records
          </p>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="rounded-lg bg-red-50 border border-red-200 p-3">
          <p className="text-sm text-[#ED202B] font-medium">Refresh failed</p>
          <p className="text-xs text-red-700 mt-1">{error}</p>
        </div>
      )}
    </div>
  );
}
