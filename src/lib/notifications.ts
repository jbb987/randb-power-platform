import {
  collection,
  query,
  where,
  orderBy,
  limit as firestoreLimit,
  onSnapshot,
  doc,
  updateDoc,
  serverTimestamp,
  writeBatch,
  type Unsubscribe,
} from 'firebase/firestore';
import { db } from './firebase';
import type { AppNotification } from '../types/notification';

const COLLECTION = 'notifications';

/**
 * Subscribe to the most recent notifications for a recipient, newest first.
 * Requires the composite index recipientUid ASC + createdAt DESC (firestore.indexes.json).
 */
export function subscribeNotifications(
  recipientUid: string,
  limit: number,
  callback: (entries: AppNotification[]) => void,
  onError?: (err: Error) => void,
): Unsubscribe {
  const q = query(
    collection(db, COLLECTION),
    where('recipientUid', '==', recipientUid),
    orderBy('createdAt', 'desc'),
    firestoreLimit(limit),
  );
  return onSnapshot(
    q,
    // Always trust the Firestore doc id over any denormalized `id` field, so
    // markRead/markAllRead can never target a wrong/undefined path.
    (snap) => callback(snap.docs.map((d) => ({ ...(d.data() as AppNotification), id: d.id }))),
    (err) => {
      console.error('[notifications] subscription error:', err);
      onError?.(err);
    },
  );
}

/** Mark a single notification read. Rules permit the recipient to flip read/readAt only. */
export async function markNotificationRead(id: string): Promise<void> {
  try {
    await updateDoc(doc(db, COLLECTION, id), { read: true, readAt: serverTimestamp() });
  } catch (err) {
    console.error('[notifications] markRead failed', err);
  }
}

/** Mark several notifications read in one batch (used by "mark all read"). */
export async function markNotificationsRead(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  try {
    const batch = writeBatch(db);
    for (const id of ids) {
      batch.update(doc(db, COLLECTION, id), { read: true, readAt: serverTimestamp() });
    }
    await batch.commit();
  } catch (err) {
    console.error('[notifications] markAllRead failed', err);
  }
}
