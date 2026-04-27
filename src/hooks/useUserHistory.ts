import { useState, useEffect, useCallback, useMemo } from 'react';
import { useAuth } from './useAuth';
import {
  subscribeUserHistory,
  logActivity as logActivityLib,
  clearUserHistory as clearHistoryLib,
} from '../lib/userHistory';
import type { UserActivityEntry, ToolId } from '../types';

export function useUserHistory(limit = 50) {
  const { user } = useAuth();
  const [history, setHistory] = useState<UserActivityEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) {
      setHistory([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const unsub = subscribeUserHistory(
      user.uid,
      limit,
      (entries) => {
        setHistory(entries);
        setLoading(false);
      },
      () => setLoading(false),
    );
    return unsub;
  }, [user, limit]);

  const logActivity = useCallback(
    (
      toolId: ToolId,
      siteName: string,
      siteAddress: string,
      action: string,
      siteRegistryId?: string,
      inputs?: Record<string, unknown>,
    ) => {
      if (!user) return;
      // Dedup: skip if identical to most recent entry for this tool within 60s
      const recent = history.find((e) => e.toolId === toolId);
      if (
        recent &&
        inputs &&
        recent.inputs &&
        JSON.stringify(recent.inputs) === JSON.stringify(inputs) &&
        Date.now() - recent.createdAt < 60_000
      ) {
        return;
      }
      logActivityLib({
        userId: user.uid,
        toolId,
        siteName,
        siteAddress,
        action,
        createdAt: Date.now(),
        ...(siteRegistryId ? { siteRegistryId } : {}),
        ...(inputs ? { inputs } : {}),
      });
    },
    [user, history],
  );

  const getToolHistory = useCallback(
    (toolId: ToolId, max = 5): UserActivityEntry[] => {
      // Backward-compat: 'piddr' was renamed to 'site-analyzer'; treat both as same tool on read.
      const aliases: ToolId[] =
        toolId === 'site-analyzer' ? ['site-analyzer', 'piddr' as ToolId] : [toolId];
      return history.filter((e) => aliases.includes(e.toolId) && e.inputs).slice(0, max);
    },
    [history],
  );

  const clearHistory = useCallback(() => {
    if (!user) return;
    clearHistoryLib(user.uid);
  }, [user]);

  return useMemo(
    () => ({ history, loading, logActivity, clearHistory, getToolHistory }),
    [history, loading, logActivity, clearHistory, getToolHistory],
  );
}
