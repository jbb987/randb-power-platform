import { doc, getDoc, setDoc, serverTimestamp, type Timestamp } from 'firebase/firestore';
import { db } from './firebase';

/**
 * Persisted substation field counts (Bailey's ring-bus verification).
 *
 * One doc per substation in `substation-field-counts`, keyed by HIFLD id
 * (fallback: rounded coordinates for the rare sub without one). Stores the
 * raw observation (breakers counted + context at save time); the estimate is
 * always recomputed from the inputs, never stored — same philosophy as the
 * One-Line Generator's regenerate-from-spec.
 */

export interface SubstationFieldCount {
  breakers: number;
  /** Context at save time, for auditing/model calibration later. */
  lines: number;
  maxVoltKV: number;
  substationName: string;
  hifldId: number | null;
  lat: number;
  lng: number;
  savedByUid: string;
  savedByEmail: string;
  savedAt: Timestamp | null; // serverTimestamp resolves after write
}

const COLLECTION = 'substation-field-counts';

/** Stable doc id: HIFLD id when present, else rounded coordinates. */
export function fieldCountDocId(
  hifldId: number | null | undefined,
  lat: number,
  lng: number,
): string {
  return hifldId != null ? `hifld_${hifldId}` : `coord_${lat.toFixed(5)}_${lng.toFixed(5)}`;
}

export async function getFieldCount(
  hifldId: number | null | undefined,
  lat: number,
  lng: number,
): Promise<SubstationFieldCount | null> {
  const snap = await getDoc(doc(db, COLLECTION, fieldCountDocId(hifldId, lat, lng)));
  return snap.exists() ? (snap.data() as SubstationFieldCount) : null;
}

export async function saveFieldCount(input: Omit<SubstationFieldCount, 'savedAt'>): Promise<void> {
  await setDoc(doc(db, COLLECTION, fieldCountDocId(input.hifldId, input.lat, input.lng)), {
    ...input,
    savedAt: serverTimestamp(),
  });
}
