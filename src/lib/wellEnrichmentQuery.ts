/**
 * Firestore query for top reactivation candidates statewide.
 *
 * Server-side filters (indexed): scoreDisqualified, score (range), orphanListed.
 * Client-side filters (post-fetch): operator name substring, SB 1150 bucket.
 *
 * Required composite indexes:
 *   - scoreDisqualified ASC, score DESC
 *   - scoreDisqualified ASC, orphanListed ASC, score DESC
 */
import {
  collection,
  getFirestore,
  limit as fbLimit,
  orderBy,
  query,
  where,
  type Query,
} from 'firebase/firestore';
import { getDocs } from 'firebase/firestore';
import type { WellEnrichment } from '../types';
import { WELL_ENRICHMENT_COLLECTION } from '../types';

const DEFAULT_LIMIT = 2000;

export interface TopCandidatesParams {
  minScore?: number;
  orphanOnly?: boolean;
  limit?: number;
}

/** Query top-N candidates from Firestore (statewide). */
export async function queryTopCandidates(
  params: TopCandidatesParams = {},
): Promise<WellEnrichment[]> {
  const db = getFirestore();
  const ref = collection(db, WELL_ENRICHMENT_COLLECTION);

  const constraints = [];
  // Always exclude disqualified (already plugged) wells
  constraints.push(where('scoreDisqualified', '==', false));
  if (params.orphanOnly) {
    constraints.push(where('orphanListed', '==', true));
  }
  if (params.minScore && params.minScore > 0) {
    constraints.push(where('score', '>=', params.minScore));
  }
  constraints.push(orderBy('score', 'desc'));
  constraints.push(fbLimit(params.limit ?? DEFAULT_LIMIT));

  const q: Query = query(ref, ...constraints);
  const snap = await getDocs(q);
  const out: WellEnrichment[] = [];
  snap.forEach((doc) => {
    out.push({ ...(doc.data() as WellEnrichment), api: doc.id });
  });
  return out;
}
