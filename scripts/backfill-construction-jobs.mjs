#!/usr/bin/env node
/**
 * One-time backfill for construction-jobs documents.
 *
 * Earlier versions stored a single `generalContractorId` (string). The current
 * schema uses `generalContractorIds` (string[]). The runtime normalizer in
 * src/lib/constructionJobs.ts projects old → new on read, but never persists,
 * so legacy docs keep the old field forever — direct Firestore Console reads
 * and any future direct-query code see the stale shape.
 *
 * This script:
 *   1. Walks every doc in `construction-jobs`.
 *   2. If `generalContractorIds` is missing/empty AND `generalContractorId`
 *      is set → writes `generalContractorIds: [generalContractorId]`.
 *   3. Removes the legacy `generalContractorId` field via FieldValue.delete().
 *   4. Re-derives `linkedCompanyIds` so the array-contains mirror is up to date.
 *
 * Usage:
 *   GOOGLE_APPLICATION_CREDENTIALS=./service-account.json \
 *   node scripts/backfill-construction-jobs.mjs [--dry-run]
 *
 * The script is idempotent — re-running it on already-migrated docs is a no-op.
 */

import admin from 'firebase-admin';

const dryRun = process.argv.includes('--dry-run');

admin.initializeApp(); // picks up GOOGLE_APPLICATION_CREDENTIALS

const db = admin.firestore();
const FieldValue = admin.firestore.FieldValue;

function deriveLinkedCompanyIds(companyIds, generalContractorIds, subcontractorIds) {
  const set = new Set([
    ...(companyIds ?? []),
    ...(generalContractorIds ?? []),
    ...(subcontractorIds ?? []),
  ]);
  return Array.from(set);
}

async function main() {
  console.log(`[backfill] starting${dryRun ? ' (dry run)' : ''}`);

  const snap = await db.collection('construction-jobs').get();
  console.log(`[backfill] ${snap.size} jobs total`);

  let migrated = 0;
  let skipped = 0;
  let errors = 0;

  for (const doc of snap.docs) {
    const data = doc.data();
    const legacyGc = data.generalContractorId;
    const newGcs = Array.isArray(data.generalContractorIds) ? data.generalContractorIds : [];

    const needsMigration = legacyGc != null;
    if (!needsMigration) {
      skipped++;
      continue;
    }

    const gcArray = newGcs.length > 0 ? newGcs : [legacyGc];
    const linkedCompanyIds = deriveLinkedCompanyIds(
      data.companyIds,
      gcArray,
      data.subcontractorIds,
    );

    const patch = {
      generalContractorIds: gcArray,
      linkedCompanyIds,
      generalContractorId: FieldValue.delete(),
      updatedAt: Date.now(),
    };

    if (dryRun) {
      console.log(`[dry-run] would migrate ${doc.id} (legacy GC: ${legacyGc})`);
      migrated++;
      continue;
    }

    try {
      await doc.ref.update(patch);
      migrated++;
      console.log(`[backfill] migrated ${doc.id}`);
    } catch (err) {
      errors++;
      console.error(`[backfill] failed ${doc.id}:`, err);
    }
  }

  console.log(`[backfill] done. migrated=${migrated} skipped=${skipped} errors=${errors}`);
}

main().catch((err) => {
  console.error('[backfill] fatal:', err);
  process.exit(1);
});
