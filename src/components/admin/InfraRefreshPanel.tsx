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

function getRefreshedMs(ts: Timestamp | number | null | undefined): number | null {
  if (!ts) return null;
  if (typeof ts === 'number') return ts;
  if (typeof ts.toDate === 'function') return ts.toDate().getTime();
  return null;
}

const STAGE_LABELS: Record<string, string> = {
  plants: 'Power Plants',
  substations: 'Substations',
  eia: 'EIA State Data',
  solar: 'Solar Averages',
  done: 'Complete',
};

// A refresh writes ~90K Firestore docs (plants + substations + EIA + solar)
// and burns ~$0.20 in writes. Block button presses within this window unless
// the user explicitly overrides — protects the daily quota from accidental
// double-clicks.
const COOLDOWN_DAYS = 7;
const COOLDOWN_MS = COOLDOWN_DAYS * 24 * 60 * 60 * 1000;

export default function InfraRefreshPanel() {
  const { log, loading: logLoading, refetch: refetchLog } = useRefreshLog();
  const [refreshing, setRefreshing] = useState(false);
  const [progress, setProgress] = useState<IngestionProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ powerPlants: number; substations: number; eiaStates: number; solarStates: number } | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const lastRefreshedMs = getRefreshedMs(log?.lastRefreshedAt);
  const cooldownRemainingMs = lastRefreshedMs != null
    ? Math.max(0, COOLDOWN_MS - (Date.now() - lastRefreshedMs))
    : 0;
  const inCooldown = cooldownRemainingMs > 0;
  const daysRemaining = Math.ceil(cooldownRemainingMs / (24 * 60 * 60 * 1000));

  const runRefresh = async () => {
    setConfirmOpen(false);
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
          onClick={() => setConfirmOpen(true)}
          disabled={refreshing || inCooldown}
          title={inCooldown
            ? `Last refresh was within ${COOLDOWN_DAYS} days — try again in ${daysRemaining} day${daysRemaining === 1 ? '' : 's'}.`
            : undefined}
          className="rounded-lg bg-[#ED202B] text-white border border-[#ED202B] hover:bg-[#9B0E18] hover:border-[#9B0E18] px-4 py-2 text-sm font-medium transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
        >
          {refreshing && (
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
          )}
          {refreshing
            ? 'Refreshing...'
            : inCooldown
              ? `Cooldown (${daysRemaining}d)`
              : 'Refresh Data'}
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

      {/* Confirmation modal */}
      {confirmOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
          onClick={() => setConfirmOpen(false)}
        >
          <div
            className="bg-white rounded-xl shadow-xl border border-[#D8D5D0] max-w-md w-full p-5"
            onClick={(e) => e.stopPropagation()}
          >
            <h4 className="font-heading text-base font-semibold text-[#201F1E] mb-2">
              Refresh infrastructure cache?
            </h4>
            <p className="text-sm text-[#7A756E] mb-3">
              This rewrites every cached power plant, substation, and EIA/solar
              record in Firestore — about <span className="font-medium text-[#201F1E]">90,000 writes</span> in
              one run. The free Firestore tier is 20,000 writes/day, so this will
              push the project into paid usage (~$0.20).
            </p>
            <p className="text-sm text-[#7A756E] mb-4">
              Last refreshed:{' '}
              <span className="font-medium text-[#201F1E]">
                {logLoading ? '...' : formatTimestamp(log?.lastRefreshedAt)}
              </span>
            </p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setConfirmOpen(false)}
                className="rounded-lg bg-white text-[#201F1E] border border-[#D8D5D0] hover:border-[#7A756E] px-4 py-2 text-sm font-medium transition"
              >
                Cancel
              </button>
              <button
                onClick={runRefresh}
                className="rounded-lg bg-[#ED202B] text-white border border-[#ED202B] hover:bg-[#9B0E18] hover:border-[#9B0E18] px-4 py-2 text-sm font-medium transition"
              >
                Yes, refresh
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
