# TODO — R&B Power Platform

**Document rename + archive (shipped v1.47.0, feat/doc-rename-archive — verify)**
- [x] Added Rename + soft Archive (recoverable, with "Archived" trash toggle + Restore) to the construction **Documents** section (`JobDocumentsSection`, shared by Bailey Project + Construction Projects). Storage blobs retained; gated on `canDeleteDocuments`. (source: conversation 2026-06-01)
- [x] Made the `FolderBrowser` "⋮" action menu (Rename/Archive/Manage access) discoverable — bordered button + tooltip (LLR docs, CRM Folders, Project folders). (source: conversation 2026-06-01)
- [ ] **Verify Babi's `users/{uid}.role` is `admin` (or `manager`).** On the LLR docs panel the Rename/Archive ⋮ menu only shows to admin/manager (labor needs an explicit `editorUserIds` grant — `src/lib/folderAccess.ts`). If the role is `labor`, that — not code — is why rename/archive looked unavailable. (source: conversation 2026-06-01)
- [x] ~~Verify deployed Firestore rules allow `update` on the job-docs subcollections.~~ Confirmed: both `construction-jobs/{jobId}/documents/{docId}` and the `construction-projects-jobs` equivalent already have `allow update, delete: if isAuthed() && isAdminOrPm()` (no field restriction) — rename/archive/restore work for admin/PM in prod. (source: code-review 2026-06-01)
- [ ] **Deploy functions** (`firebase deploy --only functions`) — two new audit triggers (`onJobDocumentWrite`, `onConstructionProjectsDocumentWrite`) log job-doc upload/rename/archive/restore to the Activity Log. They don't exist in prod until deployed. (source: code-review 2026-06-01)
- [ ] **Altitude / debt:** `JobDocumentsSection` now duplicates the folder system's archive UX. The folder system (`FolderBrowser`, "Project folders") already does rename/archive/restore with per-folder access. Decide whether to retire `JobDocumentsSection` in favor of the folder system rather than maintaining two parallel doc UIs. (source: code-review 2026-06-01)

**Doc-drift cleanup (deferred from chore/retire-legacy-documentssection PR review 2026-05-27)**
- [ ] `docs/activity-firestore-setup.md:64` — note the `crm-documents` trigger is dormant now (no app code writes to it post-2026-05-27)
- [ ] `docs/architecture/ERD.md` — drop `crm-documents` from the "Five collections" canonical list; reflect that `DocumentsSection.tsx` is retired
- [ ] `docs/architecture/PRD.md:19` + `docs/architecture/folder-system-plan.md` — update legacy references to match the new state
- [ ] On or after 2026-06-13: export + delete the `crm-documents` Firestore collection, retire `onDocumentWrite` Cloud Function at `functions/src/activity/triggers.ts:139` (see AUDIT.md `crm-documents` rollback note)

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

**Large Load Request tool (v1 shipped 2026-05-19 as "Pre-Construction"; renamed to "Large Load Request" 2026-05-27 — follow-ups)**
- [x] "Track in LLR" button on Site Analyzer detail + "From existing analyzed site" mode in `/llr/new` — reuses an already-analyzed `SiteRegistryEntry` instead of provisioning an empty one, so the analyses (power/broadband/water/gas/transport/labor/political/appraisal) carry over with no re-run and no quota burn. Button switches to "Open in LLR" when an LLR site already exists for the registry id. Shipped v1.43.26 on feat/convert-site-to-precon (source: conversation 2026-05-27)
- [x] Rename Pre-Construction → Large Load Request (LLR) — tool label, routes (`/precon` → `/llr` with legacy redirect), ToolId `'pre-construction'` → `'large-load-request'` (via read-time alias normalization in `normalizeToolId` + `scripts/migrate-precon-to-llr.mjs`). **CompanyTag `'Pre Construction'` kept** — tag describes activity/phase, not tool. Internal code identifiers (`PreCon*`, `preconstruction-sites` collection, `*_precon-root` folder ids) kept as-is. Shipped v1.44.0 → v1.44.2 (source: conversation 2026-05-27)
- [ ] **Run `scripts/migrate-precon-to-llr.mjs --confirm` against production** to update `users.allowedTools` entries (`'pre-construction'` → `'large-load-request'`) and pre-con-root folder display names. App stays correct in the meantime via read-time normalization. (source: conversation 2026-05-27)
- [ ] Per-utility LOA templates (Oncor / AEP / each major coop) — drop into `LOA_TIMELINES` in `src/lib/preConWorkflow.ts` (source: conversation 2026-05-19)
- [ ] Notifications/email when engineer review is requested for an assigned user (source: conversation 2026-05-19)
- [ ] "Promote to Construction Job" handoff button on PreCon detail page (source: conversation 2026-05-19)
- [ ] Bulk grading / bulk LOA actions on PreCon index (source: conversation 2026-05-19)
- [ ] Tighten engineer assignment: filter the assignment dropdown to users tagged as engineers (today: any platform user) (source: conversation 2026-05-19)
- [ ] Pre-Con: when site company changes via edit mode, migrate the linked folder skeleton (`cust_{oldCompanyId}_precon-root` → `cust_{newCompanyId}_precon-root`) and update the `customer-projects` Project record (source: conversation 2026-05-19)

**Email / domain migration → randbpowerinc.us (core done 2026-05-20)**
- [ ] **Notify the 12 employees of the new login** — now `name@randbpowerinc.us`, same password; Google Chat flaky ~3 days. Source: conversation 2026-05-20
- [ ] **Fix Google Workspace billing contact** — payments primary contact is ex-employee Preston Mills (prestoncm@randbpowersolutions.com); switch to owner Bailey West (bwest@randbpowerinc.us). Source: conversation 2026-05-20
- [ ] **Update payments account nickname + verify Organization Name** off the old brand. Source: conversation 2026-05-20
- [ ] **Rename Google Groups** (sales@, info@, support@…) to @randbpowerinc.us. Source: conversation 2026-05-20
- [ ] **Upload Google Workspace custom logo** — 320×132 px PNG/GIF, ≤30 KB. Source: conversation 2026-05-20
- [ ] **Rename Workspace org name + OU** — still "R&B Power Solutions". Source: conversation 2026-05-20
- [ ] **Everyone updates email signatures + Google-SSO app emails** (Apollo etc.). Source: conversation 2026-05-20
- [ ] **Tighten DMARC** — after ~2–4 weeks of p=none, move randbpowerinc.us to quarantine → reject. Source: conversation 2026-05-20
- [ ] **Keep randbpowersolutions.com registered indefinitely** — carries all alias mail. Source: conversation 2026-05-20

**Platform debt**
- [ ] Delete legacy collections `site-requests`, legacy `sites`, legacy `projects` (AUDIT M-1)
- [ ] Decide API data strategy: live vs Postgres+PostGIS for OK/TX/AZ/NM/TN
- [ ] Restore `FIREBASE_ADMIN_KEY` GitHub secret on `jbb987/randb-power-platform` — ISO Queue Ingestion workflow failing every Monday since 2026-05-04 (3 missed runs); fix = generate new Firebase service account key at console.firebase.google.com/project/randb-site-valuator/settings/serviceaccounts/adminsdk, `gh secret set FIREBASE_ADMIN_KEY < key.json`, then `gh workflow run "ISO Queue Ingestion" -f force=true` to backfill. Stale data hits Grid Power Analyzer queue popups + Site Analyzer Power section's County Queue card. (source: conversation 2026-05-19, run 26026522759)

**Renewable developer prospecting (50-site outreach)**
- [ ] Verify landowner page URLs for the remaining ~120 companies in `research/renewable-developer-prospects.csv` (5 verified 2026-05-19: Silicon Ranch, Pine Gate, EDF-RE, Apex, Cypress Creek). Method: Google `site:{domain} landowner OR "partner with us" OR "lease your land"` (source: conversation 2026-05-19)
- [ ] Extract per-company site criteria (min acres / substation distance / slope / wetlands) into structured fields — feed from each verified landowner page (source: conversation 2026-05-19)
- [ ] Pull key contacts via Apollo.io MCP for Tier-A companies — title contains "land acquisition" / "site acquisition" / "real estate" / "development manager" / "greenfield" / "origination"; level Manager/Director/VP (source: conversation 2026-05-19)
- [ ] Cross-reference top 30 developers vs FERC interconnection queue (LBNL `emp.lbl.gov/queues`) to confirm active in R&B's site states (source: conversation 2026-05-19)
- [ ] Decide ingestion path: import `research/renewable-developer-prospects.csv` into `crm-companies` with tag `renewable_developer`, OR build a separate prospect collection. Today CRM tags are fixed-enum (`REP`/`Construction`/`Pre Construction`/`Utility`) — adding `renewable_developer` requires extending `crmCompanies.ts` (source: conversation 2026-05-19)
- [ ] Build site-sheet template (coords, acres, substation distance + voltage, slope, wetlands %, road access, owner status) — what each developer's land acquisition team needs to evaluate (source: conversation 2026-05-19)
- [ ] Score-match each of R&B's 50 sites against verified developer criteria → ranked target list per site (source: conversation 2026-05-19)

**Done**
- [x] Firestore PITR enabled
- [x] Storage Object Versioning enabled (90d noncurrent retention)
- [x] Renewable-developer prospect list drafted: 127 US companies across solar utility-scale, community solar, wind, BESS, utility renewable arms, hyperscalers — saved to `research/renewable-developer-prospects.csv` and plan at `~/.claude/plans/please-refine-the-plan-iridescent-sifakis.md` (2026-05-19)
