/**
 * Purge the dormant legacy per-job `documents` sub-collections after the
 * JobDocumentsSection retirement (2026-06-19).
 *
 *   construction-jobs/{jobId}/documents/{docId}
 *   construction-projects-jobs/{jobId}/documents/{docId}
 *
 * These records were migrated into the folder-system top-level `documents`
 * collection (id convention jobDoc_{jobId}_{origId}) and the legacy UI +
 * client rules are gone. This deletes the now-unreferenced legacy Firestore
 * docs ONLY.
 *
 * SAFETY:
 *   - Default is DRY RUN. Pass --confirm to delete.
 *   - A legacy doc is deleted ONLY if its migrated copy
 *     `jobDoc_{jobId}_{origId}` exists in the `documents` collection. Anything
 *     not confirmed-migrated is SKIPPED and reported (never deleted).
 *   - Storage blobs are NEVER touched — migrated folder-system records still
 *     point at construction-documents/{jobId}/... and -projects- paths.
 *
 * Usage (from functions/, which has firebase-admin):
 *   GOOGLE_CLOUD_PROJECT=randb-site-valuator node ../scripts/purge-legacy-job-documents.mjs            # dry run
 *   GOOGLE_CLOUD_PROJECT=randb-site-valuator node ../scripts/purge-legacy-job-documents.mjs --confirm  # delete
 */
import admin from 'firebase-admin';

const confirm = process.argv.slice(2).includes('--confirm');
admin.initializeApp(); // ADC + GOOGLE_CLOUD_PROJECT
const db = admin.firestore();

console.log(`[purge] mode: ${confirm ? 'CONFIRMED — deletes enabled' : 'DRY RUN — no deletes'}`);

async function purge(jobsCollection) {
  const jobsSnap = await db.collection(jobsCollection).get();
  let deleted = 0;
  let skippedUnmigrated = 0;
  const skippedSamples = [];

  for (const job of jobsSnap.docs) {
    const docsSnap = await db
      .collection(jobsCollection)
      .doc(job.id)
      .collection('documents')
      .get();

    for (const d of docsSnap.docs) {
      const migratedId = `jobDoc_${job.id}_${d.id}`;
      const migrated = await db.collection('documents').doc(migratedId).get();
      if (!migrated.exists) {
        skippedUnmigrated++;
        if (skippedSamples.length < 10) {
          skippedSamples.push({ jobId: job.id, docId: d.id, name: d.data().name });
        }
        continue; // never delete something not safely migrated
      }
      if (confirm) await d.ref.delete();
      deleted++;
    }
  }

  console.log(`\n=== ${jobsCollection} ===`);
  console.log(`  jobs scanned:                 ${jobsSnap.size}`);
  console.log(`  legacy docs ${confirm ? 'DELETED' : 'would delete'}: ${deleted}`);
  console.log(`  SKIPPED (not yet migrated):   ${skippedUnmigrated}`);
  if (skippedSamples.length) {
    console.log(`  ^ these were NOT touched — run migrate-to-folder-system.mjs --confirm first:`);
    for (const s of skippedSamples) {
      console.log(`      - job=${s.jobId} doc=${s.docId} "${s.name}"`);
    }
  }
  return { deleted, skippedUnmigrated };
}

const a = await purge('construction-jobs');
const b = await purge('construction-projects-jobs');

console.log(`\n[purge] TOTAL ${confirm ? 'deleted' : 'would delete'}: ${a.deleted + b.deleted}`);
console.log(`[purge] TOTAL skipped (unmigrated, untouched): ${a.skippedUnmigrated + b.skippedUnmigrated}`);
if (!confirm) console.log(`\n[purge] DRY RUN — nothing deleted. Re-run with --confirm to apply.`);
process.exit(0);
