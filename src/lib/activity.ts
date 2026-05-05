import {
  collection,
  query,
  orderBy,
  limit as firestoreLimit,
  onSnapshot,
  type Unsubscribe,
} from 'firebase/firestore';
import { db } from './firebase';
import type { ActivityEntry } from '../types/activity';

const COLLECTION = 'activity';

/** Subscribe to the most recent N activity entries, newest first. */
export function subscribeActivity(
  limit: number,
  callback: (entries: ActivityEntry[]) => void,
  onError?: (err: Error) => void,
): Unsubscribe {
  const q = query(
    collection(db, COLLECTION),
    orderBy('timestamp', 'desc'),
    firestoreLimit(limit),
  );
  return onSnapshot(
    q,
    (snap) => {
      const entries = snap.docs.map((d) => d.data() as ActivityEntry);
      callback(entries);
    },
    (err) => {
      console.error('[activity] subscription error:', err);
      onError?.(err);
    },
  );
}
