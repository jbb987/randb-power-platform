import { useCallback, useEffect, useState } from 'react';
import { subscribeMarketFeed, setItemStatus } from '../lib/marketIntel';
import type { MarketFeedItem } from '../types';

/** Real-time subscription to the market-intelligence deal feed.
 *
 *  A Firestore `onSnapshot` error is terminal — the listener is torn down and
 *  won't resume on its own — so we expose `retry()` to re-subscribe (it bumps a
 *  nonce the effect depends on). The success path clears any prior error so a
 *  transient blip that later recovers doesn't leave the UI stuck on the error. */
export function useMarketFeed() {
  const [items, setItems] = useState<MarketFeedItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    setLoading(true);
    setError(null);
    const unsub = subscribeMarketFeed(
      (list) => {
        setItems(list);
        setLoading(false);
        setError(null);
      },
      (err) => {
        setError(err.message);
        setLoading(false);
      },
    );
    return unsub;
  }, [nonce]);

  const retry = useCallback(() => setNonce((n) => n + 1), []);

  return { items, loading, error, retry, setItemStatus };
}
