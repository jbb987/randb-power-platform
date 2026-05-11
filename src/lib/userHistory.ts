import {
  collection,
  doc,
  setDoc,
  getDocs,
  deleteDoc,
  onSnapshot,
  query,
  where,
  orderBy,
  limit as firestoreLimit,
  type Unsubscribe,
} from 'firebase/firestore';
import { db } from './firebase';
import { getSessionFingerprint } from './sessionFingerprint';
import type { UserActivityEntry, ToolId } from '../types';

const COLLECTION = 'user-history';

function historyRef() {
  return collection(db, COLLECTION);
}

/** Log a new activity entry. */
export async function logActivity(entry: Omit<UserActivityEntry, 'id'>): Promise<void> {
  const id = doc(collection(db, COLLECTION)).id;
  // Strip undefined values — Firestore rejects them
  const clean = JSON.parse(JSON.stringify({ ...entry, id })) as UserActivityEntry;
  await setDoc(doc(db, COLLECTION, id), clean);
}

/**
 * Logs a `login` event. Fire from useAuth on null→user transition; idempotency
 * (don't re-log on every refresh) must be enforced by the caller via
 * sessionStorage.
 */
export async function logLogin(userId: string): Promise<void> {
  if (!userId) return;
  const session = await getSessionFingerprint();
  await logActivity({
    userId,
    toolId: 'site-analyzer' as ToolId, // arbitrary — trigger ignores toolId for login kind
    siteName: '',
    siteAddress: '',
    action: 'login',
    createdAt: Date.now(),
    kind: 'login',
    session,
  });
}

interface LogViewArgs {
  userId: string;
  toolId: ToolId;
  routePath: string;
  routeLabel: string;
  resourceType?: string;
  resourceId?: string;
  resourceLabel?: string;
}

/** Logs a `view` event (tool open or detail-page open). */
export async function logView(args: LogViewArgs): Promise<void> {
  if (!args.userId) return;
  const session = await getSessionFingerprint();
  await logActivity({
    userId: args.userId,
    toolId: args.toolId,
    siteName: '',
    siteAddress: '',
    action: 'view',
    createdAt: Date.now(),
    kind: 'view',
    routePath: args.routePath,
    routeLabel: args.routeLabel,
    ...(args.resourceType ? { viewResourceType: args.resourceType } : {}),
    ...(args.resourceId ? { viewResourceId: args.resourceId } : {}),
    ...(args.resourceLabel ? { viewResourceLabel: args.resourceLabel } : {}),
    session,
  });
}

/** Fetch history for a user, ordered by most recent first. */
export async function getUserHistory(userId: string, limit = 50): Promise<UserActivityEntry[]> {
  const q = query(
    historyRef(),
    where('userId', '==', userId),
    orderBy('createdAt', 'desc'),
    firestoreLimit(limit),
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => d.data() as UserActivityEntry);
}

/** Subscribe to real-time history updates for a user. */
export function subscribeUserHistory(
  userId: string,
  limit: number,
  callback: (entries: UserActivityEntry[]) => void,
  onError?: (err: Error) => void,
): Unsubscribe {
  const q = query(
    historyRef(),
    where('userId', '==', userId),
    orderBy('createdAt', 'desc'),
    firestoreLimit(limit),
  );
  return onSnapshot(
    q,
    (snap) => {
      const entries = snap.docs.map((d) => d.data() as UserActivityEntry);
      callback(entries);
    },
    (err) => {
      console.error('[UserHistory] Subscription error:', err);
      onError?.(err);
    },
  );
}

/** Clear all history for a user. */
export async function clearUserHistory(userId: string): Promise<void> {
  const q = query(historyRef(), where('userId', '==', userId));
  const snap = await getDocs(q);
  const deletes = snap.docs.map((d) => deleteDoc(doc(db, COLLECTION, d.id)));
  await Promise.all(deletes);
}
