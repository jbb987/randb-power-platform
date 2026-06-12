# Firestore Rules — required entries

> **Since 2026-06-12 the full Firestore ruleset is versioned in this repo at `firestore.rules`** (wired into `firebase.json`). Edit that file and deploy with `firebase deploy --only firestore:rules` — no more Console copy-paste. Storage rules still live only in the Console.

This doc remains the **per-collection rationale**: why each rule block looks the way it does. When you add a collection in code, update `firestore.rules` AND add the reasoning here in the same PR.

> See also: `docs/activity-firestore-setup.md` for the activity-log specifics.

---

## To-Do List (v1.61, collaborative — supersedes the v1.48 owner-only rule)

### Collection: `user-tasks`

Collaborative company task list (collection name kept from its per-user era). Each doc carries `ownerUid` (creator), optional `assigneeUid`, optional `visibility` (`'company' | 'private'`; **absent ⇒ private** — legacy docs predate the field and stay safe), and a queryable `archived` boolean. Full-trust model decided 2026-06-12: any authenticated user may read **and edit** company-visible tasks; private tasks are creator + assignee only. No hard deletes — the client soft-archives (a normal update setting `archived`/`archivedAt`).

**`ownerUid` is immutable after create** (added 2026-06-12 after code review): the update rule pins it, so with the creator's read-disjunct always matching, no edit (visibility flip, reassignment) can ever lock a creator out of their own task — without this, anyone could rewrite `{ownerUid, assigneeUid, visibility}` on a company task and make it unreachable by everyone (an effective hard delete despite `delete: false`).

```
match /user-tasks/{taskId} {
  allow read: if request.auth != null && (
    resource.data.visibility == 'company'
    || request.auth.uid == resource.data.ownerUid
    || request.auth.uid == resource.data.assigneeUid
  );
  allow update: if request.auth != null && (
    resource.data.visibility == 'company'
    || request.auth.uid == resource.data.ownerUid
    || request.auth.uid == resource.data.assigneeUid
  ) && request.resource.data.ownerUid == resource.data.ownerUid;
  allow create: if request.auth != null && request.auth.uid == request.resource.data.ownerUid;
  allow delete: if false;
}
```

The client's main listener is `and(archived == false, or(visibility=='company', ownerUid==uid, assigneeUid==uid))` — the or() disjuncts map 1:1 onto the read rule (so the rules engine can prove every result readable) and the `archived` conjunct only narrows it, which rules always permit; archived tasks load via a separate on-demand query (`archived == true`). Equality-only filters use merged single-field indexes — no composite index needed; sorting stays client-side. `delete` is `false` by design: archive is an update, and the audit trail should never lose rows. The `onUserTaskWrite` activity trigger logs **company-visible tasks only** — private-task titles/notes must never reach the admin-readable `activity` collection. ⚠️ `scripts/migrate-user-tasks.mjs` must run once to backfill `visibility`/`archived` onto legacy docs — without it they are invisible to the bounded listener.

---

## Pre-Construction (v1.43, shipped 2026-05-19)

### Collection: `preconstruction-sites`

Every authenticated user with the `pre-construction` tool can read; admin / manager can write; the assigned engineer can update their own site's status fields.

```
match /preconstruction-sites/{siteId} {
  allow read, write: if request.auth != null;
}
```

(v1 rule — broad. Tighten later with field-level checks once the platform has a stable per-collection rule pattern.)

### Side-effect collections written by the Pre-Con tool

Pre-Con writes to several existing collections that already have rules — included here for awareness, no new rule needed:

- `sites-registry` — Site Analyzer's existing rule covers it.
- `customer-projects` — folder system's existing rule covers it.
- `folders` + `documents` — folder system's existing rules cover them.

### Storage prefix: (none yet)

Pre-Con doesn't write directly to Storage — documents go through `FolderBrowser` which writes under the existing `documents/{companyId}/…` prefix.

---

## One-Line Generator (v1.52, shipped 2026-06-08)

### Collection: `one-line-diagrams`

Saved one-line diagrams (`OneLineDocument` = input spec + metadata; the SVG/.drawio are regenerated from the spec, never stored). Every authenticated user with the `one-line-generator` tool can read; admin / manager create and edit.

```
match /one-line-diagrams/{docId} {
  allow read, write: if request.auth != null;
}
```

(v1 rule — broad, matching the other tool collections. Tighten with field-level / companyId checks once the platform adopts a stable per-collection rule pattern.)

---

## How to publish

1. Firebase Console → Firestore Database → Rules tab.
2. Paste the block above next to the existing collection rules.
3. Click **Publish**. Changes take effect immediately on the live project.
4. Repeat for staging / sandbox.

---

## When to update this doc

- **Adding a new top-level collection:** add a section here listing the rule block. Same PR as the code change.
- **Tightening an existing rule:** update the block here so the doc matches what's actually published.
- **Spinning up a new Firebase project:** walk this doc top-to-bottom, paste every block into the new project's Rules tab.
