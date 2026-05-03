/**
 * Firestore writer for the tx-wells-enriched collection.
 * Batches writes (500/batch) and merges so multiple sources can contribute
 * to the same well doc without clobbering each other.
 */
import { Firestore } from '@google-cloud/firestore';

const COLLECTION = 'tx-wells-enriched';
const BATCH_SIZE = 500;

const db = new Firestore();

/**
 * Upsert a Map<api, partial-enrichment> into Firestore. Merges with existing
 * fields so an IWAR ingest doesn't wipe Orphan-list fields.
 */
export async function upsertEnrichmentMap(records, sourceLabel) {
  const apis = Array.from(records.keys());
  let total = 0;
  let totalBatches = 0;

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
        // Add the source label to the sources array (de-duped via FieldValue)
        sources: Firestore.FieldValue.arrayUnion(sourceLabel),
      }, { merge: true });
    }
    await batch.commit();
    total += slice.length;
    totalBatches++;
    if (totalBatches % 10 === 0) {
      console.log(`[${sourceLabel}] wrote ${total.toLocaleString()} of ${apis.length.toLocaleString()}`);
    }
  }

  return { written: total, batches: totalBatches };
}
