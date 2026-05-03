/**
 * Walk tx-wells-enriched, compute reactivation score per well, write back.
 * Runs as part of the PDQ ingest's finalize step OR can be called directly
 * via the /backfill-scores endpoint to populate scores on existing docs.
 */
import { Firestore } from '@google-cloud/firestore';
import { computeReactivationScore } from './scoreCompute.js';

const COLLECTION = 'tx-wells-enriched';
const BATCH_SIZE = 500;

const db = new Firestore();

export async function backfillScores() {
  const startedAt = Date.now();
  console.log('[scoreBackfill] scanning collection…');

  const stream = db.collection(COLLECTION).stream();

  let scanned = 0;
  let queued = [];
  let totalWritten = 0;
  let totalBatches = 0;
  const histogram = { '0-19': 0, '20-39': 0, '40-59': 0, '60-79': 0, '80-100': 0, disqualified: 0 };

  async function flush() {
    if (queued.length === 0) return;
    const batch = db.batch();
    for (const item of queued) {
      batch.update(item.ref, item.payload);
    }
    await batch.commit();
    totalWritten += queued.length;
    totalBatches++;
    queued = [];
    if (totalBatches % 20 === 0) {
      console.log(`[scoreBackfill] wrote ${totalWritten.toLocaleString()} so far (${scanned.toLocaleString()} scanned)`);
    }
  }

  for await (const doc of stream) {
    scanned++;
    const data = doc.data();
    const score = computeReactivationScore(data);

    // Histogram for the summary log
    if (score.scoreDisqualified) histogram.disqualified++;
    else if (score.total < 20)   histogram['0-19']++;
    else if (score.total < 40)   histogram['20-39']++;
    else if (score.total < 60)   histogram['40-59']++;
    else if (score.total < 80)   histogram['60-79']++;
    else                          histogram['80-100']++;

    queued.push({
      ref: doc.ref,
      payload: {
        score: score.total,
        scoreDisqualified: score.scoreDisqualified,
        scoreProduction: score.production,
        scoreOperator: score.operatorOpportunity,
        scoreCost: score.costFeasibility,
        scoreTime: score.timePressure,
        scoreUpdatedAt: Date.now(),
      },
    });

    if (queued.length >= BATCH_SIZE) {
      await flush();
    }
  }
  await flush();

  const elapsedSec = Math.round((Date.now() - startedAt) / 1000);
  console.log(
    `[scoreBackfill] done in ${elapsedSec}s — scanned ${scanned.toLocaleString()}, wrote ${totalWritten.toLocaleString()} across ${totalBatches} batches`,
  );
  console.log('[scoreBackfill] histogram:', histogram);
  return { scanned, written: totalWritten, batches: totalBatches, elapsedSec, histogram };
}
