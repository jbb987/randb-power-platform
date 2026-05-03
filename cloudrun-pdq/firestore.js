/**
 * Batched Firestore writer for production rollups.
 * Merges into existing tx-wells-enriched docs (set with merge:true), so
 * IWAR + Orphan fields are preserved.
 */
import { Firestore } from '@google-cloud/firestore';

const COLLECTION = 'tx-wells-enriched';
const BATCH_SIZE = 500;
const SOURCE = 'pdq';

const db = new Firestore();

/**
 * Write { api -> productionRollupFields }. Adds 'pdq' to sources via arrayUnion.
 */
export async function writeProductionRollups(records) {
  const apis = Array.from(records.keys());
  let written = 0;
  let batchCount = 0;

  for (let i = 0; i < apis.length; i += BATCH_SIZE) {
    const slice = apis.slice(i, i + BATCH_SIZE);
    const batch = db.batch();
    for (const api of slice) {
      const fields = records.get(api);
      const ref = db.collection(COLLECTION).doc(api);
      batch.set(ref, {
        api,
        ...fields,
        ingestedAt: Date.now(),
        sources: Firestore.FieldValue.arrayUnion(SOURCE),
      }, { merge: true });
    }
    await batch.commit();
    written += slice.length;
    batchCount++;
    if (batchCount % 20 === 0) {
      console.log(`[firestore] wrote ${written.toLocaleString()} of ${apis.length.toLocaleString()}`);
    }
  }
  return { written, batches: batchCount };
}
