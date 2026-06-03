import {
  collection,
  doc,
  onSnapshot,
  query,
  orderBy,
  limit,
  updateDoc,
  type Unsubscribe,
} from 'firebase/firestore';
import { db } from './firebase';
import type { MarketFeedItem } from '../types';

const FEED_COLLECTION = 'market-intel-feed';

/** Live subscription to the deal feed, newest first. Single-field orderBy needs
 *  no composite index. Capped at 500 — the feed is a rolling recent view. */
export function subscribeMarketFeed(
  callback: (items: MarketFeedItem[]) => void,
  onError?: (err: Error) => void,
): Unsubscribe {
  const q = query(
    collection(db, FEED_COLLECTION),
    orderBy('publishedAt', 'desc'),
    limit(500),
  );
  return onSnapshot(
    q,
    (snapshot) => {
      callback(snapshot.docs.map((d) => ({ ...(d.data() as MarketFeedItem), id: d.id })));
    },
    (err) => {
      console.error('[Firebase] Market feed subscription error:', err);
      onError?.(err);
    },
  );
}

/** Set the read/archived status on a feed item (the only client-mutable field). */
export async function setItemStatus(
  id: string,
  status: MarketFeedItem['status'],
): Promise<void> {
  try {
    await updateDoc(doc(db, FEED_COLLECTION, id), { status, updatedAt: Date.now() });
  } catch (err) {
    console.error('[Firebase] Failed to set market item status:', err);
    throw err;
  }
}
