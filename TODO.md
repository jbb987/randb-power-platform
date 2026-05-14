# TODO — R&B Power Platform

**Folder/Document System (today's focus)**
- [x] Rename current Construction tool → Bailey Project, move from Construction section → Company section
- [x] Duplicate codebase as fresh Construction tool (new collection, empty) for construction team
- [ ] **Firebase Console:** add Firestore rules + indexes for new collection `construction-projects-jobs` (mirror existing `construction-jobs` rules) and Storage rules for prefixes `construction-projects-photos` + `construction-projects-documents`
- [ ] Get Mike's answers on Q1, Q2, Q6 (folder-system-plan.md §12)
- [ ] Drop `restrictedToOwner`, use `viewerUserIds` only
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
