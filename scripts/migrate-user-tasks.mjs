#!/usr/bin/env node
/**
 * One-time backfill for the collaborative To-Do List (v1.61.0, 2026-06-12).
 * Stamps the two fields the new code requires onto legacy `user-tasks` docs:
 *
 *   1. `visibility` (missing on pre-v1.61 docs):
 *        category == 'personal'  → 'private'
 *        anything else           → 'company'
 *      Without this, legacy tasks never appear in the Team or Week views
 *      (the client treats a missing field as private — the safe default,
 *      but it would make the meeting board start out empty).
 *
 *   2. `archived` (queryable boolean, missing on docs created before the
 *      bounded-subscription change): true when `archivedAt` is set, else
 *      false. The main client listener filters `archived == false`, so any
 *      doc without the field is INVISIBLE in the tool until this runs.
 *
 * Docs that already carry a field keep their value — re-running is a no-op.
 *
 * Usage:
 *   GOOGLE_APPLICATION_CREDENTIALS=./service-account.json \
 *   node scripts/migrate-user-tasks.mjs            # dry-run (default)
 *   node scripts/migrate-user-tasks.mjs --confirm  # actually write
 */

import admin from 'firebase-admin';

const confirmed = process.argv.includes('--confirm');
const dryRun = !confirmed;

admin.initializeApp();

const db = admin.firestore();

async function migrate() {
  console.log(`\n[user-tasks] scanning collection${dryRun ? ' (dry run)' : ''}`);
  const snap = await db.collection('user-tasks').get();
  console.log(`[user-tasks] ${snap.size} docs total`);

  let migrated = 0;
  let skipped = 0;

  for (const doc of snap.docs) {
    const data = doc.data();
    const update = {};

    if (data.visibility === undefined) {
      update.visibility = data.category === 'personal' ? 'private' : 'company';
    }
    if (data.archived === undefined) {
      update.archived = data.archivedAt !== undefined && data.archivedAt !== null;
    }

    if (Object.keys(update).length === 0) {
      skipped++;
      continue;
    }

    migrated++;
    console.log(
      `  ${dryRun ? 'would stamp' : 'stamping'} ${doc.id} "${String(data.title).slice(0, 40)}" → ${JSON.stringify(update)}`,
    );
    if (!dryRun) {
      await doc.ref.update(update);
    }
  }

  console.log(`\n[user-tasks] ${migrated} migrated, ${skipped} already current.`);
  if (dryRun && migrated > 0) {
    console.log('[user-tasks] dry run — re-run with --confirm to write.');
  }
}

migrate().then(
  () => process.exit(0),
  (err) => {
    console.error(err);
    process.exit(1);
  },
);
