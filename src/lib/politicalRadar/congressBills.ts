/**
 * Federal-bills lookup for the Political Radar federal layer.
 *
 * Reads from the `political-radar-tracked-bills` Firestore collection,
 * populated daily by the `refreshFederalBills` Cloud Function. The function
 * paginates the entire current Congress (bills + joint resolutions) on its
 * first run and incrementally updates from there.
 *
 * The browser never calls Congress.gov directly. The API key lives only in
 * Functions secrets — it never ships in the client bundle.
 *
 * Empty-collection state: if no bills are present (e.g. the function has
 * never run), we return `{ bills: [], error: null }` — the federal layer
 * treats no-results as "confirmed_clean," which is honest: no curated
 * threats are tracked yet. The empty-vs-error distinction is handled by
 * the meta doc check (`political-radar-meta/billsRefresh`) — a missing
 * meta doc means the pipeline has never run, which we surface as unknown.
 */

import { collection, doc, getDoc, getDocs, query, orderBy, limit } from 'firebase/firestore';
import { db } from '../firebase';
import type { FederalBill } from './types';

const TRACKED_COLLECTION = 'political-radar-tracked-bills';
const META_DOC_PATH = ['political-radar-meta', 'billsRefresh'] as const;

interface TrackedBillDoc {
  congress: number;
  type: string;
  number: string;
  title: string;
  status: string;
  latestActionDate: string | null;
  latestActionText: string | null;
  url: string;
  matchReason?: string;
  updatedAt: number;
}

export interface CongressBillsResult {
  bills: FederalBill[];
  error: string | null;
}

export async function fetchFederalBills(): Promise<CongressBillsResult> {
  // Verify the ingest pipeline has run at least once. If it hasn't, the
  // collection might be empty for legitimate "no curated threats" reasons,
  // and we'd surface that as a misleading green. Better to flag unknown.
  try {
    const metaSnap = await getDoc(doc(db, ...META_DOC_PATH));
    if (!metaSnap.exists()) {
      return {
        bills: [],
        error:
          'Federal-bills ingest pipeline has not run yet. Deploy the refreshFederalBills Cloud Function and trigger a first run.',
      };
    }
  } catch (err) {
    return {
      bills: [],
      error:
        err instanceof Error ? `Bill meta read failed: ${err.message}` : 'Bill meta read failed.',
    };
  }

  try {
    // Order by latestActionDate desc so freshest signals lead. Cap at 20 —
    // the curated list rarely grows past a couple dozen.
    const q = query(
      collection(db, TRACKED_COLLECTION),
      orderBy('latestActionDate', 'desc'),
      limit(20),
    );
    const snap = await getDocs(q);
    const bills: FederalBill[] = snap.docs
      .map((d) => d.data() as TrackedBillDoc)
      .map((b) => ({
        congress: b.congress,
        type: b.type,
        number: b.number,
        title: b.title,
        status: b.status,
        latestActionDate: b.latestActionDate,
        url: b.url,
      }));
    return { bills, error: null };
  } catch (err) {
    return {
      bills: [],
      error: err instanceof Error ? err.message : 'Tracked bills read failed.',
    };
  }
}
