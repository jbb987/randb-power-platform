# Activity log — Firestore setup

The repo does not manage Firestore rules/indexes via `firebase.json`. Paste the
snippets below into the Firebase Console (or merge with existing config there).

## Entry shape

Each `activity/{id}` doc has:

| Field           | Notes                                                                      |
| --------------- | -------------------------------------------------------------------------- |
| `timestamp`     | server timestamp                                                           |
| `actor`         | `{ uid, email }`                                                           |
| `action`        | `create \| update \| delete \| upload \| tool-run \| login \| view \| export` |
| `resource`      | `{ type, id, label, parentId?, parentLabel? }`                             |
| `changedFields` | optional, for `update`                                                     |
| `before/after`  | optional, only the changed fields                                          |
| `summary`       | pre-rendered human sentence                                                |
| `session`       | optional, `{ ip?, userAgent?, timezone? }` — set by client-driven events   |

`login` and `view` events come from the client via `user-history` writes and
carry the session fingerprint (IP fetched from `api.ipify.org` once per
browser tab, user-agent + timezone read from the browser). CRUD triggers
fire on Firestore document writes and do not carry session data.

## Composite indexes

Apply to collection: **`activity`**

| Fields                                | Order     |
| ------------------------------------- | --------- |
| `timestamp`                           | DESC      |
| `actor.uid` ASC, `timestamp` DESC     | composite |
| `resource.type` ASC, `timestamp` DESC | composite |
| `action` ASC, `timestamp` DESC        | composite |

The single-field `timestamp DESC` index is auto-created on first query;
the three composite indexes need to be added explicitly (Firestore will
also prompt you with a "Create index" link the first time the filtered
queries fire — that link works too).

## Security rules

Add inside `match /databases/{database}/documents`:

```
function isAdmin() {
  return request.auth != null
    && exists(/databases/$(database)/documents/users/$(request.auth.uid))
    && get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role == 'admin';
}

match /activity/{id} {
  allow read: if isAdmin();
  allow write: if false;        // Cloud Functions only (Admin SDK bypasses rules)
}
```

The Cloud Functions write via the Admin SDK, which bypasses rules — clients
are never allowed to write to `activity` directly.

## Storage rules

The activity log mirrors uploads via the `crm-documents` Firestore
trigger (each upload writes a metadata doc that fires the trigger).
No storage-rule changes are required for the activity log itself —
keep your existing rules.
