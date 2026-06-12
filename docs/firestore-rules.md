# Firestore Rules — required entries

> **Since 2026-06-12 the full Firestore ruleset is versioned in this repo at `firestore.rules`** (wired into `firebase.json`). Edit that file and deploy with `firebase deploy --only firestore:rules` — no more Console copy-paste. Storage rules still live only in the Console.

This doc remains the **per-collection rationale**: why each rule block looks the way it does. When you add a collection in code, update `firestore.rules` AND add the reasoning here in the same PR.

> See also: `docs/activity-firestore-setup.md` for the activity-log specifics.

---

## To-Do List (v1.61, collaborative — supersedes the v1.48 owner-only rule)

### Collection: `user-tasks`

Collaborative company task list (collection name kept from its per-user era). Each doc carries `ownerUid` (creator), optional `assigneeUid`, and optional `visibility` (`'company' | 'private'`; **absent ⇒ private** — legacy docs predate the field and stay safe). Full-trust model decided 2026-06-12: any authenticated user may read **and edit** company-visible tasks; private tasks are creator + assignee only. No hard deletes — the client soft-archives via an `archivedAt` field (a normal update).

```
match /user-tasks/{taskId} {
  allow read, update: if request.auth != null && (
    resource.data.visibility == 'company'
    || request.auth.uid == resource.data.ownerUid
    || request.auth.uid == resource.data.assigneeUid
  );
  allow create: if request.auth != null && request.auth.uid == request.resource.data.ownerUid;
  allow delete: if false;
}
```

⚠️ **The v1.48 owner-only block must be replaced with this one in the Console** — until then, Team view and assigned tasks throw `permission denied`. The client query is `or(visibility=='company', ownerUid==uid, assigneeUid==uid)`, whose disjuncts map 1:1 onto the read rule (so the rules engine can prove every result readable). No composite index needed (equality-only disjuncts use automatic single-field indexes; sorting stays client-side). `delete` is `false` by design: archive is an update, and the audit trail (`onUserTaskWrite` activity trigger) should never lose rows.

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
