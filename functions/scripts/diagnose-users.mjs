#!/usr/bin/env node
/**
 * Step 1 diagnostic: who is who?
 *
 * Cross-references three sources of truth for every user on the platform:
 *   - Firebase Auth records (the canonical UID + email)
 *   - `users/{uid}` Firestore docs (what writeActivity reads to attribute)
 *   - distinct actor identities seen in the `activity` collection (last 1000)
 *
 * Flags:
 *   - users where Auth.email !== Firestore users/{uid}.email  (= mis-stored email)
 *   - users with an Auth record but no Firestore doc          (= can't sign in / no role)
 *   - users with a Firestore doc but no Auth record           (= ghost record)
 *   - actor UIDs in activity that have no matching user       (= phantom actor)
 *   - two activity entries with same UID but different emails (= attribution drift)
 *
 * Usage:
 *   node functions/scripts/diagnose-users.mjs
 *
 * Read-only.
 */

import admin from 'firebase-admin';

admin.initializeApp({ projectId: 'randb-site-valuator' });
const db = admin.firestore();
const auth = admin.auth();

console.log('Fetching Firebase Auth users…');
const authUsers = new Map(); // uid -> { email, disabled, lastSignIn, displayName }
{
  let pageToken;
  do {
    const page = await auth.listUsers(1000, pageToken);
    for (const u of page.users) {
      authUsers.set(u.uid, {
        email: u.email ?? null,
        disabled: u.disabled,
        lastSignIn: u.metadata?.lastSignInTime ?? null,
        displayName: u.displayName ?? null,
      });
    }
    pageToken = page.pageToken;
  } while (pageToken);
}
console.log(`  ${authUsers.size} Auth users.\n`);

console.log('Fetching Firestore users/* docs…');
const fsUsers = new Map(); // uid -> { email, role, allowedTools }
{
  const snap = await db.collection('users').get();
  for (const doc of snap.docs) {
    const d = doc.data();
    fsUsers.set(doc.id, {
      email: d?.email ?? null,
      role: d?.role ?? null,
      allowedTools: Array.isArray(d?.allowedTools) ? d.allowedTools : null,
    });
  }
}
console.log(`  ${fsUsers.size} Firestore user docs.\n`);

console.log('Scanning last 1000 activity entries for actor UIDs / emails…');
const actorsSeen = new Map(); // uid -> Map(email -> count)
{
  const snap = await db
    .collection('activity')
    .orderBy('timestamp', 'desc')
    .limit(1000)
    .get();
  for (const doc of snap.docs) {
    const d = doc.data();
    const uid = d?.actor?.uid ?? '(no uid)';
    const email = d?.actor?.email ?? '(no email)';
    if (!actorsSeen.has(uid)) actorsSeen.set(uid, new Map());
    const m = actorsSeen.get(uid);
    m.set(email, (m.get(email) ?? 0) + 1);
  }
}
console.log(`  ${actorsSeen.size} distinct actor UIDs in activity.\n`);

// ── Cross-reference ─────────────────────────────────────────────────────

const allUids = new Set([...authUsers.keys(), ...fsUsers.keys(), ...actorsSeen.keys()]);

console.log('━━━ Full user roster ━━━');
console.log('  UID                                       Auth.email                            Firestore.email                       role        actor.email(s) in activity');
console.log('  ' + '─'.repeat(180));
for (const uid of [...allUids].sort()) {
  const a = authUsers.get(uid);
  const f = fsUsers.get(uid);
  const seen = actorsSeen.get(uid);
  const authEmail = a?.email ?? '(no auth)';
  const fsEmail = f?.email ?? '(no fs doc)';
  const role = f?.role ?? '—';
  const seenStr = seen
    ? [...seen.entries()].map(([e, c]) => `${e}×${c}`).join(', ')
    : '(none)';
  console.log(
    `  ${uid.padEnd(40)}  ${authEmail.padEnd(36)}  ${fsEmail.padEnd(36)}  ${role.padEnd(10)}  ${seenStr}`,
  );
}
console.log();

// ── Mismatches ──────────────────────────────────────────────────────────

console.log('━━━ ⚠️  Auth.email vs Firestore.email mismatches ━━━');
let mismatchCount = 0;
for (const [uid, a] of authUsers.entries()) {
  const f = fsUsers.get(uid);
  if (!f) continue;
  if (a.email && f.email && a.email.toLowerCase() !== f.email.toLowerCase()) {
    console.log(`  ${uid}`);
    console.log(`      Auth:      ${a.email}`);
    console.log(`      Firestore: ${f.email}   ← writeActivity uses THIS`);
    mismatchCount++;
  }
}
if (mismatchCount === 0) console.log('  None — Auth and Firestore emails agree for every user.');
console.log();

console.log('━━━ ⚠️  Auth users with no Firestore doc (can\'t use the app) ━━━');
let noFsCount = 0;
for (const [uid, a] of authUsers.entries()) {
  if (!fsUsers.has(uid)) {
    console.log(`  ${uid}  ${a.email}  (last sign-in: ${a.lastSignIn ?? 'never'})`);
    noFsCount++;
  }
}
if (noFsCount === 0) console.log('  None.');
console.log();

console.log('━━━ ⚠️  Firestore docs with no Auth record (ghost users) ━━━');
let noAuthCount = 0;
for (const [uid, f] of fsUsers.entries()) {
  if (!authUsers.has(uid)) {
    console.log(`  ${uid}  ${f.email}  role=${f.role}`);
    noAuthCount++;
  }
}
if (noAuthCount === 0) console.log('  None.');
console.log();

console.log('━━━ ⚠️  Actor UIDs in activity that have no Auth record (phantom) ━━━');
let phantomCount = 0;
for (const uid of actorsSeen.keys()) {
  if (!authUsers.has(uid)) {
    const m = actorsSeen.get(uid);
    const emails = [...m.entries()].map(([e, c]) => `${e}×${c}`).join(', ');
    console.log(`  ${uid}  emails in activity: ${emails}`);
    phantomCount++;
  }
}
if (phantomCount === 0) console.log('  None.');
console.log();

console.log('━━━ ⚠️  UIDs in activity attributed to more than one email (drift) ━━━');
let driftCount = 0;
for (const [uid, m] of actorsSeen.entries()) {
  if (m.size > 1) {
    const emails = [...m.entries()].map(([e, c]) => `${e}×${c}`).join(', ');
    console.log(`  ${uid}  →  ${emails}`);
    driftCount++;
  }
}
if (driftCount === 0)
  console.log("  None — every UID's activity entries are attributed to a single email.");
console.log();

console.log('━━━ Auth users who have NEVER appeared in activity ━━━');
let silentCount = 0;
for (const [uid, a] of authUsers.entries()) {
  if (!actorsSeen.has(uid)) {
    const f = fsUsers.get(uid);
    const role = f?.role ?? '—';
    console.log(
      `  ${uid.padEnd(40)}  ${(a.email ?? '(no email)').padEnd(36)}  role=${role.padEnd(10)}  last sign-in: ${a.lastSignIn ?? 'never'}`,
    );
    silentCount++;
  }
}
if (silentCount === 0) console.log('  None.');
console.log(`\n  → ${silentCount} users exist in Auth but have generated zero activity entries.`);

process.exit(0);
