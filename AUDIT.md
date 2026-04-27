# R&B Power Platform — Audit

Living record of known issues across the codebase. Severity levels: **Critical**, **High**, **Medium**, **Low**. Status values: `open`, `fixed`, `wontfix`.

When fixing or discovering issues, update this document per the rules in `CLAUDE.md`.

## Critical

_None recorded._

## High

### H-1 — User removal does not delete the Firebase Auth account
- **Status:** open
- **Reported:** 2026-04-27
- **Files:** `src/hooks/useUsers.ts:40-42`, `src/pages/UserManagement.tsx`
- **Description:** `removeUser()` deletes only the Firestore `users/{uid}` doc. The Firebase Auth account is left intact. Re-inviting the same email then fails with `auth/email-already-in-use` because the client SDK cannot delete other users' Auth accounts.
- **Impact:** Admins cannot cleanly off-board and re-add a user without manually deleting them in the Firebase Console first. Increases risk of stale Auth entries (security: ex-employees retain a usable Auth account even after removal from the app, though `useAuth` signs them out if the Firestore doc is missing).
- **Fix path:** Add a Firebase Cloud Function (Admin SDK) that deletes both the Auth user and the Firestore doc transactionally. Update `removeUser()` in `useUsers.ts` to call the function via `httpsCallable`.
- **Workaround:** Delete the Auth user manually in Firebase Console → Authentication → Users before re-inviting.

## Medium

_None recorded._

## Low

_None recorded._

## Changelog

| Date       | Author | Notes                                                                 |
|------------|--------|-----------------------------------------------------------------------|
| 2026-04-27 | Claude | Initial audit file. Logged H-1 (incomplete user removal).             |
