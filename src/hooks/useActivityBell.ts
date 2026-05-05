import { useEffect, useState, useMemo, useCallback } from 'react';
import { doc, onSnapshot, setDoc, serverTimestamp, type Timestamp } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { subscribeActivity } from '../lib/activity';
import { useAuth } from './useAuth';
import type { ActivityEntry } from '../types/activity';

const BELL_PREVIEW_LIMIT = 50;

function entryMillis(entry: ActivityEntry): number {
  return entry.timestamp?.toMillis ? entry.timestamp.toMillis() : 0;
}

/**
 * Bell state for admins: subscribes to the latest activity entries plus the
 * user's `activityLastSeenAt` timestamp on the users doc, derives unread count,
 * and exposes a `markSeen()` to clear the badge.
 */
export function useActivityBell() {
  const { user, role } = useAuth();
  const isAdmin = role === 'admin';

  const [entries, setEntries] = useState<ActivityEntry[]>([]);
  const [lastSeenMs, setLastSeenMs] = useState<number>(0);
  const [loading, setLoading] = useState(true);

  // Subscribe to the latest activity entries (admins only)
  useEffect(() => {
    if (!isAdmin) {
      setEntries([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const unsub = subscribeActivity(
      BELL_PREVIEW_LIMIT,
      (next) => {
        setEntries(next);
        setLoading(false);
      },
      () => setLoading(false),
    );
    return unsub;
  }, [isAdmin]);

  // Subscribe to the admin's `activityLastSeenAt` field on their users doc
  useEffect(() => {
    if (!isAdmin || !user) {
      setLastSeenMs(0);
      return;
    }
    const ref = doc(db, 'users', user.uid);
    const unsub = onSnapshot(ref, (snap) => {
      const data = snap.data();
      const ts = data?.activityLastSeenAt as Timestamp | undefined;
      setLastSeenMs(ts?.toMillis?.() ?? 0);
    });
    return unsub;
  }, [isAdmin, user]);

  const markSeen = useCallback(async () => {
    if (!user) return;
    try {
      await setDoc(
        doc(db, 'users', user.uid),
        { activityLastSeenAt: serverTimestamp() },
        { merge: true },
      );
    } catch (err) {
      console.error('[activity] markSeen failed', err);
    }
  }, [user]);

  const unreadCount = useMemo(() => {
    if (!isAdmin || lastSeenMs === 0) {
      // First-ever visit: don't show full count of every historical event.
      // Wait for markSeen to bootstrap a baseline; in the meantime show 0.
      return 0;
    }
    return entries.filter((e) => {
      if (e.actor.uid === user?.uid) return false; // hide own activity
      return entryMillis(e) > lastSeenMs;
    }).length;
  }, [entries, lastSeenMs, isAdmin, user]);

  return {
    enabled: isAdmin,
    entries,
    unreadCount,
    loading,
    markSeen,
  };
}
