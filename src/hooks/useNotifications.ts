import { useEffect, useState, useMemo, useCallback } from 'react';
import {
  subscribeNotifications,
  markNotificationRead,
  markNotificationsRead,
} from '../lib/notifications';
import { useAuth } from './useAuth';
import type { AppNotification } from '../types/notification';

// Newest-N window the bell loads. The unread badge + "Mark all read" are
// derived from this window, so keep it comfortably above any realistic unread
// backlog of task assignments. (A truly unbounded count is deferred — see TODO.)
export const FEED_LIMIT = 50;

/**
 * Per-user notification feed for the navbar bell. Available to every role
 * (unlike useActivityBell, which is admin-only). Subscribes to the recipient's
 * latest notifications and derives the unread count from each doc's `read` flag.
 */
export function useNotifications() {
  const { user } = useAuth();
  const [entries, setEntries] = useState<AppNotification[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) {
      setEntries([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const unsub = subscribeNotifications(
      user.uid,
      FEED_LIMIT,
      (next) => {
        setEntries(next);
        setLoading(false);
      },
      () => setLoading(false),
    );
    return unsub;
  }, [user]);

  const unreadCount = useMemo(() => entries.filter((e) => !e.read).length, [entries]);

  const markRead = useCallback((id: string) => markNotificationRead(id), []);

  const markAllRead = useCallback(() => {
    const ids = entries.filter((e) => !e.read).map((e) => e.id);
    return markNotificationsRead(ids);
  }, [entries]);

  return { entries, unreadCount, loading, markRead, markAllRead };
}
