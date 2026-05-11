#!/usr/bin/env node
/**
 * Diagnostic: how often does each Political sub-error fire on real runs?
 *
 * Reads every site in `sites-registry` that has a `politicalResult`, looks
 * at the federal layer's sub-error fields, and reports:
 *   - count of sites by sub-error state (billsError, repsError, eosError, tribalError)
 *   - examples of each sub-error message
 *
 * Use this to decide whether sub-error checking is worth keeping.
 *
 * Usage:
 *   node functions/scripts/diagnose-political-errors.mjs
 *
 * Read-only.
 */

import admin from 'firebase-admin';

admin.initializeApp({ projectId: 'randb-site-valuator' });
const db = admin.firestore();

console.log('Fetching sites with politicalResult…');

const snap = await db.collection('sites-registry').get();
console.log(`  ${snap.size} sites total in registry.\n`);

const sitesWithPolitical = [];
for (const doc of snap.docs) {
  const d = doc.data();
  const pol = d.politicalResult;
  if (!pol) continue;
  const fed = pol?.layers?.federal;
  const fedData = fed?.data;
  if (!fedData) continue;

  sitesWithPolitical.push({
    id: doc.id,
    name: d.name ?? '(unnamed)',
    coords: d.coordinates ? `${d.coordinates.lat},${d.coordinates.lng}` : 'no-coords',
    analyzedAt: fedData.analyzedAt
      ? new Date(fedData.analyzedAt).toISOString().slice(0, 10)
      : '?',
    score: fedData.subScore,
    band: fedData.band,
    billsError: fedData.billsError ?? null,
    repsError: fedData.repsError ?? null,
    eosError: fedData.eosError ?? null,
    tribalError: fedData.tribalError ?? null,
    sectionLocks: d.sectionLocks ?? null,
  });
}

console.log(`  ${sitesWithPolitical.length} sites have a politicalResult.\n`);

if (sitesWithPolitical.length === 0) {
  console.log('No sites have Political results yet. Run analysis on a site first.');
  process.exit(0);
}

const fields = ['billsError', 'repsError', 'eosError', 'tribalError'];

console.log('━━━ Sub-error frequency ━━━');
for (const f of fields) {
  const failed = sitesWithPolitical.filter((s) => !!s[f]).length;
  const pct = ((failed / sitesWithPolitical.length) * 100).toFixed(0);
  console.log(
    `  ${f.padEnd(14)}  ${String(failed).padStart(3)} / ${sitesWithPolitical.length}  (${pct}%)`,
  );
}
console.log();

console.log('━━━ Sample messages by sub-error type ━━━');
for (const f of fields) {
  const msgs = new Set();
  for (const s of sitesWithPolitical) {
    if (s[f]) msgs.add(String(s[f]));
  }
  if (msgs.size === 0) {
    console.log(`  ${f}: (no failures seen)`);
  } else {
    console.log(`  ${f}: ${msgs.size} distinct messages`);
    for (const m of [...msgs].slice(0, 3)) console.log(`    "${m}"`);
  }
}
console.log();

console.log('━━━ Per-site detail ━━━');
console.log(
  '  analyzed     score  errors                                     locked political?  site',
);
console.log('  ' + '─'.repeat(110));
for (const s of sitesWithPolitical.sort((a, b) => a.analyzedAt.localeCompare(b.analyzedAt))) {
  const errs = [
    s.billsError ? 'BILLS' : '·',
    s.repsError ? 'REPS' : '·',
    s.eosError ? 'EOS' : '·',
    s.tribalError ? 'TRIBAL' : '·',
  ]
    .join(' ')
    .padEnd(35);
  const locked = s.sectionLocks?.political ? 'YES' : 'no ';
  console.log(`  ${s.analyzedAt}   ${s.score}      ${errs}  ${locked.padEnd(15)}  ${s.name}`);
}
console.log();

console.log('━━━ Interpretation guide ━━━');
console.log('  billsError firing  =  Firestore data missing → real Cloud-Function/data bug');
console.log('  repsError firing   =  TIGERweb district lookup OR Firestore officials issue');
console.log('  eosError firing    =  Federal Register API hiccup (not yet migrated)');
console.log('  tribalError firing =  TIGERweb AIANNHA hiccup (not yet migrated)');

process.exit(0);
