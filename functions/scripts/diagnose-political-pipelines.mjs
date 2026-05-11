#!/usr/bin/env node
/**
 * Diagnostic: state of the Political Radar federal ingest pipelines.
 *
 * Checks both bills and officials. For each:
 *   - is the meta doc present?  (says "the Cloud Function has run at least once")
 *   - what's the data collection size?
 *   - sample doc?
 *
 * Usage:
 *   node functions/scripts/diagnose-political-pipelines.mjs
 *
 * Read-only.
 */

import admin from 'firebase-admin';

admin.initializeApp({ projectId: 'randb-site-valuator' });
const db = admin.firestore();

async function inspect(metaPath, collectionName) {
  const metaSnap = await db.doc(metaPath).get();
  const colSnap = await db.collection(collectionName).limit(3).get();
  const fullCol = await db.collection(collectionName).get();

  console.log(`  meta doc (${metaPath}):  ${metaSnap.exists ? 'EXISTS' : 'MISSING'}`);
  if (metaSnap.exists) console.log(`    fields:`, metaSnap.data());
  console.log(`  collection (${collectionName}):  ${fullCol.size} docs`);
  if (colSnap.size > 0) {
    console.log(`    sample first doc:`);
    const d = colSnap.docs[0].data();
    const keys = Object.keys(d).slice(0, 8);
    for (const k of keys) {
      const v = d[k];
      const repr =
        typeof v === 'string'
          ? `"${v.slice(0, 60)}"`
          : typeof v === 'object'
            ? JSON.stringify(v).slice(0, 60)
            : String(v);
      console.log(`      ${k}: ${repr}`);
    }
  }
  console.log();
}

console.log('━━━ refreshFederalBills pipeline ━━━');
await inspect('political-radar-meta/billsRefresh', 'political-radar-tracked-bills');

console.log('━━━ refreshFederalOfficials pipeline ━━━');
await inspect('political-radar-meta/officialsRefresh', 'political-radar-federal-officials');

process.exit(0);
