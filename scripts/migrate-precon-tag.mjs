#!/usr/bin/env node
/**
 * One-time migration for the Pre-Construction → Large Load Request rename.
 * Three independent passes, each idempotent:
 *
 *   1. `crm-companies.tags[]`:  'Pre Construction'      → 'Large Load Request'
 *   2. `folders.name` (where systemRole=='pre-con-root'):
 *                              'Pre-Construction Sites' → 'Large Load Request Sites'
 *   3. `users.allowedTools[]`: 'pre-construction'       → 'large-load-request'
 *
 * Internal identifiers (`cust_*_precon-root` and `precon_*_root` folder IDs,
 * the `preconstruction-sites` Firestore collection name, code identifiers like
 * `PreConSite` / `createPreConSite`) are deliberately preserved — not
 * user-visible and renaming them would be a heavyweight migration with no
 * user benefit.
 *
 * Backward-compat on read (so the app stays correct before/after this runs):
 *   - src/types/index.ts `normalizeCompanyTag` aliases the old tag value.
 *   - src/types/index.ts `normalizeToolId` aliases the old ToolId.
 *   - src/lib/crmCompanies.ts applies the tag alias in `subscribeCompanies` /
 *     `subscribeCompany`, so the UI sees 'Large Load Request' regardless of
 *     what's stored.
 *   - src/hooks/useAuth.ts and src/hooks/useUsers.ts apply `normalizeToolId`
 *     on `allowedTools` reads, so both permission gates and the admin
 *     checkbox UI render correctly.
 *   - src/hooks/useUserHistory.ts aliases both directions for history queries.
 *
 * Usage:
 *   GOOGLE_APPLICATION_CREDENTIALS=./service-account.json \
 *   node scripts/migrate-precon-tag.mjs              # dry-run (default)
 *   node scripts/migrate-precon-tag.mjs --confirm     # actually write
 *
 * The script is idempotent — re-running it on already-migrated docs is a no-op.
 */

import admin from 'firebase-admin';

const confirmed = process.argv.includes('--confirm');
const dryRun = !confirmed;

admin.initializeApp();

const db = admin.firestore();

const OLD_TAG = 'Pre Construction';
const NEW_TAG = 'Large Load Request';
const OLD_FOLDER_NAME = 'Pre-Construction Sites';
const NEW_FOLDER_NAME = 'Large Load Request Sites';
const OLD_TOOL_ID = 'pre-construction';
const NEW_TOOL_ID = 'large-load-request';

async function migrateCompanyTags() {
  console.log(`\n[tags] scanning crm-companies${dryRun ? ' (dry run)' : ''}`);
  const snap = await db.collection('crm-companies').get();
  console.log(`[tags] ${snap.size} companies total`);

  let migrated = 0;
  let skipped = 0;
  let errors = 0;

  for (const doc of snap.docs) {
    const data = doc.data();
    const tags = Array.isArray(data.tags) ? data.tags : [];
    if (!tags.includes(OLD_TAG)) {
      skipped++;
      continue;
    }

    // Replace OLD_TAG with NEW_TAG, dedupe (in case NEW_TAG was already present).
    const next = Array.from(
      new Set(tags.map((t) => (t === OLD_TAG ? NEW_TAG : t))),
    );

    if (dryRun) {
      console.log(`[dry-run] would update ${doc.id} (${data.name}): ${JSON.stringify(tags)} → ${JSON.stringify(next)}`);
      migrated++;
      continue;
    }

    try {
      await doc.ref.update({ tags: next, updatedAt: Date.now() });
      migrated++;
      console.log(`[tags] updated ${doc.id} (${data.name})`);
    } catch (err) {
      errors++;
      console.error(`[tags] failed ${doc.id}:`, err);
    }
  }

  console.log(`[tags] done. migrated=${migrated} skipped=${skipped} errors=${errors}`);
}

async function migrateFolderNames() {
  console.log(`\n[folders] scanning folders for name="${OLD_FOLDER_NAME}"${dryRun ? ' (dry run)' : ''}`);
  // Match by systemRole + name; safer than a global name match.
  const snap = await db
    .collection('folders')
    .where('systemRole', '==', 'pre-con-root')
    .get();
  console.log(`[folders] ${snap.size} pre-con-root folders total`);

  let migrated = 0;
  let skipped = 0;
  let errors = 0;

  for (const doc of snap.docs) {
    const data = doc.data();
    if (data.name !== OLD_FOLDER_NAME) {
      skipped++;
      continue;
    }

    if (dryRun) {
      console.log(`[dry-run] would rename folder ${doc.id} (customer ${data.companyId}): "${data.name}" → "${NEW_FOLDER_NAME}"`);
      migrated++;
      continue;
    }

    try {
      await doc.ref.update({ name: NEW_FOLDER_NAME, updatedAt: Date.now() });
      migrated++;
      console.log(`[folders] renamed ${doc.id}`);
    } catch (err) {
      errors++;
      console.error(`[folders] failed ${doc.id}:`, err);
    }
  }

  console.log(`[folders] done. migrated=${migrated} skipped=${skipped} errors=${errors}`);
}

async function migrateUserAllowedTools() {
  console.log(`\n[users] scanning users for allowedTools containing "${OLD_TOOL_ID}"${dryRun ? ' (dry run)' : ''}`);
  const snap = await db.collection('users').get();
  console.log(`[users] ${snap.size} users total`);

  let migrated = 0;
  let skipped = 0;
  let errors = 0;

  for (const doc of snap.docs) {
    const data = doc.data();
    const tools = Array.isArray(data.allowedTools) ? data.allowedTools : [];
    if (!tools.includes(OLD_TOOL_ID)) {
      skipped++;
      continue;
    }

    // Replace OLD_TOOL_ID with NEW_TOOL_ID, dedupe (NEW_TOOL_ID may already be present).
    const next = Array.from(
      new Set(tools.map((t) => (t === OLD_TOOL_ID ? NEW_TOOL_ID : t))),
    );

    if (dryRun) {
      console.log(`[dry-run] would update ${doc.id} (${data.email ?? '(no email)'}): ${JSON.stringify(tools)} → ${JSON.stringify(next)}`);
      migrated++;
      continue;
    }

    try {
      // Note: users docs have no updatedAt field today, so we don't add one —
      // avoids touching the schema and avoids firing extra activity entries.
      await doc.ref.update({ allowedTools: next });
      migrated++;
      console.log(`[users] updated ${doc.id} (${data.email ?? '(no email)'})`);
    } catch (err) {
      errors++;
      console.error(`[users] failed ${doc.id}:`, err);
    }
  }

  console.log(`[users] done. migrated=${migrated} skipped=${skipped} errors=${errors}`);
}

async function main() {
  if (dryRun) {
    console.log('\n>>> DRY RUN — no writes. Re-run with --confirm to apply.');
  }
  await migrateCompanyTags();
  await migrateFolderNames();
  await migrateUserAllowedTools();
  if (dryRun) {
    console.log('\n>>> Dry run complete. Re-run with --confirm to apply.');
  }
}

main().catch((err) => {
  console.error('[migrate-precon-tag] fatal:', err);
  process.exit(1);
});
