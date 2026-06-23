import { useCallback, useEffect, useState } from 'react';
import { subscribeSiteLeads, setSiteLeadStatus, promoteSiteLeadToLead } from '../lib/siteLeads';
import type { SiteLead } from '../types';

/** Real-time subscription to inbound landowner site submissions.
 *
 *  A Firestore `onSnapshot` error is terminal — the listener is torn down and
 *  won't resume on its own — so we expose `retry()` to re-subscribe (it bumps a
 *  nonce the effect depends on). The success path clears any prior error. */
export function useSiteLeads() {
  const [items, setItems] = useState<SiteLead[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    setLoading(true);
    setError(null);
    const unsub = subscribeSiteLeads(
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

  return { items, loading, error, retry, setSiteLeadStatus, promoteSiteLeadToLead };
}
