#!/usr/bin/env node
/**
 * Diagnostic: who actually appears in the `activity` collection?
 *
 * Pulls the last N activity entries and reports:
 *   1. Distinct actor.email values + counts (the dropdown is built from this)
 *   2. How many entries fall back to SYSTEM_ACTOR or actor.email === 'unknown'
 *      (= triggers fired but couldn't resolve who did it)
 *   3. Distribution by action + resource.type
 *   4. Per-actor sample of the most recent entry
 *
 * Usage:
 *   gcloud auth application-default login        # one-time
 *   node scripts/diagnose-activity.mjs [--limit 1000]
 *
 * Read-only. Does not write or modify anything.
 */

import admin from 'firebase-admin';

const limitArgIdx = process.argv.indexOf('--limit');
const LIMIT = limitArgIdx > -1 ? Number(process.argv[limitArgIdx + 1]) || 1000 : 1000;

admin.initializeApp({ projectId: 'randb-site-valuator' });

const db = admin.firestore();

console.log(`Fetching last ${LIMIT} activity entries…\n`);

const snap = await db
  .collection('activity')
  .orderBy('timestamp', 'desc')
  .limit(LIMIT)
  .get();

console.log(`Total fetched: ${snap.size}\n`);

if (snap.empty) {
  console.log('No activity entries at all — feature may not be deployed or fired yet.');
  process.exit(0);
}

const byEmail = new Map();
const byUid = new Map();
const byAction = new Map();
const byResource = new Map();
const byActionByEmail = new Map(); // email -> { action -> count }
let systemCount = 0;
let unknownEmailCount = 0;
const firstSeenPerEmail = new Map(); // email -> sample entry
const oldest = { ts: Infinity, doc: null };
const newest = { ts: -Infinity, doc: null };

for (const doc of snap.docs) {
  const d = doc.data();
  const email = d?.actor?.email ?? '(no actor)';
  const uid = d?.actor?.uid ?? '(no uid)';
  const action = d?.action ?? '(no action)';
  const resType = d?.resource?.type ?? '(no resource)';
  const tsMs = d?.timestamp?.toMillis?.() ?? 0;

  byEmail.set(email, (byEmail.get(email) ?? 0) + 1);
  byUid.set(uid, (byUid.get(uid) ?? 0) + 1);
  byAction.set(action, (byAction.get(action) ?? 0) + 1);
  byResource.set(resType, (byResource.get(resType) ?? 0) + 1);

  if (!byActionByEmail.has(email)) byActionByEmail.set(email, new Map());
  const m = byActionByEmail.get(email);
  m.set(action, (m.get(action) ?? 0) + 1);

  if (email === 'system' || uid === 'system') systemCount++;
  if (email === 'unknown') unknownEmailCount++;

  if (!firstSeenPerEmail.has(email)) firstSeenPerEmail.set(email, { doc, data: d });

  if (tsMs && tsMs < oldest.ts) {
    oldest.ts = tsMs;
    oldest.doc = d;
  }
  if (tsMs && tsMs > newest.ts) {
    newest.ts = tsMs;
    newest.doc = d;
  }
}

function fmtTs(ms) {
  return ms && Number.isFinite(ms) ? new Date(ms).toISOString() : '(no ts)';
}

console.log('━━━ Time window ━━━');
console.log(`  Oldest: ${fmtTs(oldest.ts)}`);
console.log(`  Newest: ${fmtTs(newest.ts)}`);
console.log();

console.log('━━━ Distinct actor.email values (← this is what the User filter shows) ━━━');
const emailsSorted = [...byEmail.entries()].sort((a, b) => b[1] - a[1]);
for (const [email, count] of emailsSorted) {
  console.log(`  ${String(count).padStart(5)}  ${email}`);
}
console.log(`\n  → ${byEmail.size} distinct actors total`);
console.log();

console.log('━━━ Misattribution flags ━━━');
console.log(`  SYSTEM_ACTOR entries (no authId on trigger):  ${systemCount}`);
console.log(`  actor.email === 'unknown' entries:            ${unknownEmailCount}`);
console.log();

console.log('━━━ By action ━━━');
for (const [a, c] of [...byAction.entries()].sort((a, b) => b[1] - a[1])) {
  console.log(`  ${String(c).padStart(5)}  ${a}`);
}
console.log();

console.log('━━━ By resource.type ━━━');
for (const [t, c] of [...byResource.entries()].sort((a, b) => b[1] - a[1])) {
  console.log(`  ${String(c).padStart(5)}  ${t}`);
}
console.log();

console.log('━━━ Per-actor breakdown ━━━');
for (const [email, count] of emailsSorted) {
  const m = byActionByEmail.get(email);
  const actions = [...m.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([a, c]) => `${a}:${c}`)
    .join('  ');
  const sample = firstSeenPerEmail.get(email).data;
  const sampleSummary = sample?.summary ?? '(no summary)';
  console.log(`  ${email}  (${count} entries)`);
  console.log(`      actions:  ${actions}`);
  console.log(`      most-recent summary:  ${sampleSummary}`);
  console.log();
}

process.exit(0);
