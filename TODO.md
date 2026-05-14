# TODO — R&B Power Platform

**Folder/Document System (today's focus)**
- [x] Rename current Construction tool → Bailey Project, move from Construction section → Company section
- [x] Duplicate codebase as fresh Construction tool (new collection, empty) for construction team
- [x] Firebase Console: Firestore + Storage rules added for `construction-projects-jobs` and the new storage prefixes (2026-05-14)
- [ ] Get Mike's answers on Q1, Q2, Q6 (folder-system-plan.md §12)
- [x] Drop `restrictedToOwner`, use `viewerUserIds` only — baked into the plan; empty-array semantics replace the boolean (2026-05-14)
- [x] Lock the role model: 3 roles only — `admin` / `manager` / `labor`, all admins godmode (2026-05-14)
- [ ] Spec `effectiveViewerUserIds` denormalization
- [ ] Spec `cascadeArchiveId` for folder restore
- [ ] Document: only top-level move triggers audit entry
- [ ] Dry-run Phase 1 PR 1.2 migration on a second Firebase project

**Backups**
- [ ] Enable Firestore Scheduled Backups (daily 7d + weekly 5w)
- [ ] Replicate Storage bucket to a separate backup project
- [ ] Write restore runbook (PITR, Versioning, authorized users)
- [ ] Custom daily Firestore export to separate GCP project (optional)
- [ ] Annual restore drill

**Platform debt**
- [ ] Delete legacy collections `site-requests`, legacy `sites`, legacy `projects` (AUDIT M-1)
- [ ] Decide API data strategy: live vs Postgres+PostGIS for OK/TX/AZ/NM/TN

**Done**
- [x] Firestore PITR enabled
- [x] Storage Object Versioning enabled (90d noncurrent retention)
