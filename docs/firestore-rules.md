# Firestore Rules — required entries

Firestore + Storage rules live in the Firebase Console (not in this repo). Whenever a new top-level collection lands here, somebody has to remember to publish a matching rule block in the Console — otherwise every read/write throws `permissions denied` for everyone.

This doc is the **checklist** of what should be in there. When you add a collection in code, add it here in the same PR; when you spin up a new Firebase project (staging, sandbox, backup restore), copy these rules over.

> See also: `docs/activity-firestore-setup.md` for the activity-log specifics.

---

## To-Do List (v1.48, personal tasks)

### Collection: `user-tasks`

Per-user private tasks. Each doc carries an `ownerUid`; a user may only read/write their **own** rows. This is the first owner-scoped collection — the client query is `where('ownerUid','==',uid)`, which the rule below enforces.

```
match /user-tasks/{taskId} {
  allow read:   if request.auth != null && request.auth.uid == resource.data.ownerUid;
  allow create: if request.auth != null && request.auth.uid == request.resource.data.ownerUid;
  allow update, delete: if request.auth != null && request.auth.uid == resource.data.ownerUid;
}
```

⚠️ Until this block is published, the collection throws `permission denied`. No composite index needed (single `ownerUid` equality filter; sorting is client-side). When the tool gains cross-user sharing, widen the rule (e.g. allow read if uid is in a `sharedWithUids` array).

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
