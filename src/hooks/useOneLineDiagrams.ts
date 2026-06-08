import { useEffect, useState } from 'react';
import {
  subscribeOneLineDocument,
  subscribeOneLineDocuments,
} from '../lib/oneLineDiagrams';
import type { OneLineDocument } from '../types';

/** Real-time list of saved one-line diagrams (non-archived). */
export function useOneLineDocuments() {
  const [docs, setDocs] = useState<OneLineDocument[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    const unsub = subscribeOneLineDocuments(
      (d) => {
        setDocs(d);
        setLoading(false);
      },
      {},
      () => setLoading(false),
    );
    return unsub;
  }, []);

  return { docs, loading };
}

/** Single saved diagram, for the detail page. */
export function useOneLineDocument(id: string | undefined) {
  const [doc, setDoc] = useState<OneLineDocument | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) {
      setDoc(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    const unsub = subscribeOneLineDocument(
      id,
      (d) => {
        setDoc(d);
        setLoading(false);
      },
      () => setLoading(false),
    );
    return unsub;
  }, [id]);

  return { doc, loading };
}
