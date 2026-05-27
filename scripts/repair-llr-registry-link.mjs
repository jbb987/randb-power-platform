#!/usr/bin/env node
/**
 * Repair tool: re-point an LLR (Large Load Request) site at the *correct*
 * SiteRegistryEntry, and optionally delete the orphan empty entry.
 *
 * Why this exists
 * ----------------
 * Before the v1.43.26 "Track in LLR" convert button shipped, a user with an
 * already-analyzed Site Analyzer site for customer X would end up with TWO
 * registry entries for X if they then created an LLR site from /precon/new:
 *
 *   1. The original analyzed `SiteRegistryEntry` (from Site Analyzer), with
 *      all the section results — power, broadband, water, gas, transport,
 *      labor, political, appraisal.
 *   2. A fresh EMPTY `SiteRegistryEntry` auto-created by `createPreConSite`
 *      when the LLR site was made — mwCapacity=0, no appraisal, no section
 *      results.
 *
 * The LLR site points at #2 (the empty one). The analyses live on #1. So
 * the LLR shows up as a blank site even though the analysis exists in Site
 * Analyzer. This script repairs the link: re-points the LLR site at the
 * analyzed registry, syncs its cached `name` + `coordinates`, and (with
 * `--delete-old-registry`) deletes the orphan empty entry so the directory
 * doesn't show two sites.
 *
 * Modes
 * -----
 *
 *   1. Inspect (default): print a customer's registry + LLR records so you
 *      can identify the right pairing.
 *
 *      node scripts/repair-llr-registry-link.mjs --company "Crowell"
 *
 *   2. Merge (writes only with --confirm): perform the repair.
 *
 *      node scripts/repair-llr-registry-link.mjs \
 *        --llr-site-id <llrId> \
 *        --new-registry-id <analyzedRegistryId> \
 *        --delete-old-registry \
 *        --confirm
 *
 *      Drop `--confirm` to dry-run (recommended on first run).
 *      Drop `--delete-old-registry` to leave the empty registry in place.
 *
 * Safety checks before any write
 * ------------------------------
 *   - LLR site and target registry exist.
 *   - Both belong to the same `companyId`.
 *   - No OTHER LLR site already points at the target registry.
 *
 * Idempotent: re-running the same command after success is a no-op.
 *
 * Usage:
 *   GOOGLE_APPLICATION_CREDENTIALS=./service-account.json \
 *   node scripts/repair-llr-registry-link.mjs [args]
 */

import admin from 'firebase-admin';

const args = parseArgs(process.argv.slice(2));
const confirmed = args.has('confirm');
const dryRun = !confirmed;

admin.initializeApp();
const db = admin.firestore();

function parseArgs(argv) {
  const map = new Map();
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) continue;
    const key = a.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith('--')) {
      map.set(key, true);
    } else {
      map.set(key, next);
      i++;
    }
  }
  return map;
}

function analysisSummary(data) {
  const has = {
    appraisal: !!data.appraisalResult,
    power: !!data.infraResult,
    broadband: !!data.broadbandResult,
    transport: !!data.transportResult,
    water: !!data.waterResult,
    gas: !!data.gasResult,
    labor: !!data.laborResult,
    political: !!data.politicalResult,
  };
  const present = Object.entries(has)
    .filter(([, v]) => v)
    .map(([k]) => k);
  return present.length > 0 ? present.join(', ') : '(none)';
}

async function inspect(companyQuery) {
  console.log(`\n[inspect] searching crm-companies for name matching "${companyQuery}"\n`);
  const allCompanies = await db.collection('crm-companies').get();
  const matches = allCompanies.docs.filter((d) => {
    const name = (d.data().name ?? '').toLowerCase();
    return name.includes(companyQuery.toLowerCase());
  });

  if (matches.length === 0) {
    console.log(`[inspect] no matching customers`);
    return;
  }

  for (const c of matches) {
    const cdata = c.data();
    console.log(`=== Customer: ${cdata.name}   (companyId: ${c.id}) ===`);

    const regSnap = await db.collection('sites-registry').where('companyId', '==', c.id).get();
    console.log(`\n  sites-registry entries (${regSnap.size}):`);
    regSnap.docs.forEach((d) => {
      const r = d.data();
      console.log(`    • ${d.id}`);
      console.log(`        name="${r.name ?? ''}"  coords=${JSON.stringify(r.coordinates)}`);
      console.log(`        mw=${r.mwCapacity ?? 0}  $/acre=${r.dollarPerAcreLow ?? 0}–${r.dollarPerAcreHigh ?? 0}`);
      console.log(`        analyses=[${analysisSummary(r)}]`);
      console.log(`        piddrGeneratedAt=${r.piddrGeneratedAt ?? 'never'}`);
    });

    const llrSnap = await db.collection('preconstruction-sites').where('companyId', '==', c.id).get();
    console.log(`\n  preconstruction-sites (LLR) entries (${llrSnap.size}):`);
    llrSnap.docs.forEach((d) => {
      const l = d.data();
      const archived = l.archivedAt ? '  ARCHIVED' : '';
      console.log(`    • ${d.id}${archived}`);
      console.log(`        name="${l.name ?? ''}"  siteRegistryId="${l.siteRegistryId}"`);
      console.log(`        grade=${l.grade ?? '(ungraded)'}  loa=${l.loaStatus}  engineer=${l.engineerReviewStatus}`);
    });

    const llrLinkedRegistryIds = new Set(llrSnap.docs.map((d) => d.data().siteRegistryId));
    const orphanRegistries = regSnap.docs.filter((d) => !llrLinkedRegistryIds.has(d.id));
    if (orphanRegistries.length > 0) {
      console.log(
        `\n  >>> Registries with no LLR pointing at them (candidates for "the analyzed one"):`,
      );
      orphanRegistries.forEach((d) => {
        const r = d.data();
        console.log(`        ${d.id}  analyses=[${analysisSummary(r)}]`);
      });
    }

    if (llrSnap.size > 0 && regSnap.size > 1) {
      console.log(
        `\n  Suggested repair command:`,
      );
      console.log(
        `    node scripts/repair-llr-registry-link.mjs \\`,
      );
      console.log(
        `      --llr-site-id <pick from LLR list above> \\`,
      );
      console.log(
        `      --new-registry-id <pick the analyzed entry from registry list above> \\`,
      );
      console.log(`      --delete-old-registry   # optional, removes the empty one`);
      console.log(`      # add --confirm to actually write`);
    }
    console.log('');
  }
}

async function merge() {
  const llrId = args.get('llr-site-id');
  const newRegistryId = args.get('new-registry-id');
  const deleteOldRegistry = args.has('delete-old-registry');

  if (typeof llrId !== 'string' || typeof newRegistryId !== 'string') {
    console.error('Usage: --llr-site-id <id> --new-registry-id <id> [--delete-old-registry] [--confirm]');
    process.exit(2);
  }

  console.log(`\n[merge]${dryRun ? ' (dry run)' : ''}`);
  console.log(`  llrSiteId         = ${llrId}`);
  console.log(`  newRegistryId     = ${newRegistryId}`);
  console.log(`  deleteOldRegistry = ${deleteOldRegistry}`);

  const llrSnap = await db.collection('preconstruction-sites').doc(llrId).get();
  if (!llrSnap.exists) {
    console.error(`\n[merge] ABORT: LLR site ${llrId} not found.`);
    process.exit(1);
  }
  const llrData = llrSnap.data();
  const oldRegistryId = llrData.siteRegistryId;

  const newRegistrySnap = await db.collection('sites-registry').doc(newRegistryId).get();
  if (!newRegistrySnap.exists) {
    console.error(`\n[merge] ABORT: target registry ${newRegistryId} not found.`);
    process.exit(1);
  }
  const newRegistry = newRegistrySnap.data();

  if (llrData.companyId !== newRegistry.companyId) {
    console.error(
      `\n[merge] ABORT: LLR companyId=${llrData.companyId} but target registry companyId=${newRegistry.companyId}. ` +
        `Refusing to cross customers — re-check the IDs.`,
    );
    process.exit(1);
  }

  const existingTargetLlrSnap = await db
    .collection('preconstruction-sites')
    .where('siteRegistryId', '==', newRegistryId)
    .get();
  for (const d of existingTargetLlrSnap.docs) {
    if (d.id !== llrId) {
      console.error(
        `\n[merge] ABORT: another LLR site ${d.id} already points at registry ${newRegistryId}. ` +
          `Resolve that first (you'd be creating two LLRs for one analyzed site).`,
      );
      process.exit(1);
    }
  }

  const noop = oldRegistryId === newRegistryId;

  console.log(`\n  current LLR.siteRegistryId: ${oldRegistryId}`);
  if (noop) {
    console.log(`  → already pointing at the target. No LLR write needed.`);
  } else {
    console.log(`  will update LLR site ${llrId}:`);
    console.log(`    siteRegistryId: ${oldRegistryId} → ${newRegistryId}`);
    console.log(`    name:           "${llrData.name ?? ''}" → "${newRegistry.name ?? llrData.name ?? ''}"`);
    console.log(
      `    coordinates:    ${JSON.stringify(llrData.coordinates)} → ${JSON.stringify(newRegistry.coordinates ?? llrData.coordinates)}`,
    );
  }

  if (deleteOldRegistry && oldRegistryId && !noop) {
    console.log(`\n  will DELETE old registry ${oldRegistryId}`);
    console.log(`    analyses on old: [${analysisSummary((await db.collection('sites-registry').doc(oldRegistryId).get()).data() ?? {})}]`);
    console.log(`    (deletion is permanent — only do this if the old entry is genuinely empty/orphan)`);
  }

  if (dryRun) {
    console.log('\n>>> dry run — re-run with --confirm to apply.');
    return;
  }

  if (!noop) {
    await db
      .collection('preconstruction-sites')
      .doc(llrId)
      .update({
        siteRegistryId: newRegistryId,
        name: newRegistry.name || llrData.name,
        coordinates: newRegistry.coordinates || llrData.coordinates,
        updatedAt: Date.now(),
      });
    console.log(`\n  [merge] updated LLR site ${llrId}.`);
  }

  if (deleteOldRegistry && oldRegistryId && !noop) {
    await db.collection('sites-registry').doc(oldRegistryId).delete();
    console.log(`  [merge] deleted old registry ${oldRegistryId}.`);
  }
}

async function main() {
  const company = args.get('company');
  if (typeof company === 'string') {
    await inspect(company);
    return;
  }

  if (args.get('llr-site-id') && args.get('new-registry-id')) {
    await merge();
    return;
  }

  console.error('Usage:');
  console.error('  Inspect:  node scripts/repair-llr-registry-link.mjs --company "Crowell"');
  console.error(
    '  Merge:    node scripts/repair-llr-registry-link.mjs --llr-site-id <id> --new-registry-id <id> [--delete-old-registry] [--confirm]',
  );
  process.exit(2);
}

main().catch((err) => {
  console.error('[repair-llr-registry-link] fatal:', err);
  process.exit(1);
});
