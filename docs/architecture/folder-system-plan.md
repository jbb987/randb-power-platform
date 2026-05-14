# Folder & Document System — Architecture & Execution Plan

> **Status:** Proposal · **Date:** 2026-05-13
> **Author:** JB (with Claude)
> **Supersedes:** Effectively reverses ADR-011 (which dropped projects/folders) and ADR-012 (single-axis access) based on real-world user feedback from Mike (May 2026). When ratified, this doc becomes ADRs 018–020 and accompanying PRD/ERD updates.

This doc captures the redesign of the document/folder system after Mike's feedback on May 13, 2026. It defines the data model, the no-loss guarantee, edge cases, the new role system, the fate of the existing Documents tool, cost projections, and a phased execution plan.

---

## 1. Why we're changing course

ADR-011 (April 2026) dropped the Project and Folder entities in favor of a flat 6-category tag system, on the rationale of "extremely simple, mobile-first." That decision was correct at the time given the scale (one customer, one site). It is no longer correct.

**The forcing function (Mike's May 13 feedback):**

- Mike's Asherton project has **21+ folders** of project-specific documents (LOI, MOU, NDA, PSA, Term Sheet, Bridge Loan, Data Room, Dynamic Model, Capital Waterfall, AEP Invoice, Battalion Title Company, Alliance Asherton Confidential, Giga Core Confidential File, etc.) — none of which map cleanly onto the current 6-category enum (`legal`, `invoice`, `contract`, `deliverable`, `photo`, `other`).
- Mike asks for **nested folders** ("folder of folder").
- Mike asks for **custom folders per project** because each deal has unique counterparties (AEP, Battalion, Alliance, Giga Core are Asherton-only — they don't recur on other deals).
- Bailey wants **per-folder access restriction** on financial docs against managers and labor (admins are trusted with everything).

The simple-tag model collapses under real workflow.

**What we're reinstating, and what we're refining:**

ADR-003 (Project per dimension) and ADR-006 (Hybrid folder skeleton) had the right shape but the wrong anchor. They tied projects to a site-then-company chain. Mike's workflow shows the correct anchor is **the customer**, not the site — because one customer can have many projects across pre-con, construction, and REP over time. This doc refines those ADRs around customer-centric hierarchy.

---

## 2. Core principles

The folder/document system is governed by five principles. Every design choice below traces back to one of these.

1. **No document is ever lost.** Deletion does not exist for documents; only archival. Even archived documents stay in Firebase Storage forever. Recovery is one click for an authorized user.
2. **Customer is the source of truth.** A customer profile is the central database of every document and folder associated with that customer. Projects are children of customers; project views are filtered slices of the customer's database.
3. **Folders are scoped, not free-floating.** Every folder belongs to a customer (and optionally to a project under that customer). Folders are nested via `parentFolderId`. There is no global folder namespace.
4. **Permissions inherit, but can be overridden.** A folder's access list applies to all descendants unless a descendant declares its own. Admins always pass — they cannot be locked out of any folder.
5. **Audit everything, surface what matters.** The existing `activity` collection already captures uploads/deletes via Cloud Functions triggers. We extend it to cover folder creation, rename, move, archive, restore, and access-list changes.

---

## 3. Data model

Three new collections, two modified, all anchored by `companyId` (the customer).

### 3.1 `folders` (new)

```ts
interface Folder {
  id: string;
  companyId: string;                  // always — the customer this folder lives under
  customerId: string;                 // alias of companyId for read clarity (same value)
  projectId?: string;                 // null = customer-root; set = belongs to a project
  parentFolderId: string | null;      // null = root of customer (or root of project)
  ancestorFolderIds: string[];        // denormalized path for efficient subtree queries
  name: string;
  position: number;                   // user-driven ordering within parent
  kind: 'system' | 'user';            // system folders auto-created by project provisioning
  systemRole?: SystemFolderRole;      // e.g., 'pre-con-root', 'construction-root', 'rep-root', 'project-root'
  templateOrigin?: string;            // future: ID of the folder template that seeded this
  createdAt: number;
  createdBy: string;
  updatedAt: number;
  updatedBy: string;
  archivedAt?: number;
  archivedBy?: string;
  archivedReason?: string;
  // Access control (see §7)
  viewerUserIds?: string[];           // explicit allowlist; null/empty = inherit. Admins always pass regardless.
  editorUserIds?: string[];
}
```

**Indexes required:**
- `(companyId, parentFolderId, position)` — list children of a folder
- `(companyId, projectId, archivedAt)` — list a project's folders, excluding archived
- `(ancestorFolderIds array-contains, archivedAt)` — find all descendants of a folder

### 3.2 `documents` (replaces `crm-documents` + `construction-jobs/{}/documents`)

```ts
interface Document {
  id: string;
  companyId: string;                  // the customer that owns this doc
  projectId?: string;                 // if this doc belongs to a specific project
  folderId: string | null;            // which folder it lives in; null = at customer root
  ancestorFolderIds: string[];        // denormalized for subtree filtering
  name: string;
  mimeType: string;
  byteSize: number;
  storagePath: string;                // immutable: documents/{companyId}/{documentId}-{sanitized}
  storageGeneration?: string;         // Firebase Storage generation hash for safety
  uploadedAt: number;
  uploadedBy: string;
  updatedAt: number;
  updatedBy: string;
  archivedAt?: number;
  archivedBy?: string;
  archivedReason?: string;
  legacyCategory?: DocumentCategory;  // backfill: pre-migration `category` field preserved here
  // Access control (see §7)
  viewerUserIds?: string[];
  editorUserIds?: string[];
}
```

**Indexes required:**
- `(companyId, folderId, archivedAt)` — list docs in a folder
- `(companyId, projectId, archivedAt)` — list all docs in a project
- `(ancestorFolderIds array-contains, archivedAt)` — search/filter under a folder
- `(companyId, archivedAt, uploadedAt desc)` — recent uploads view

### 3.3 `projects` (new — supersedes legacy `projectId` field on sites)

```ts
interface Project {
  id: string;
  companyId: string;                  // the customer owning this project (v1: singular; v2: multi-customer)
  type: 'pre-con' | 'construction' | 'rep';
  name: string;
  status: 'active' | 'paused' | 'completed' | 'cancelled';
  rootFolderId: string;               // the auto-created folder under customer that holds this project's docs
  startDate?: number;
  endDate?: number;
  parentProjectId?: string;           // pre-con → construction → REP lineage (per former ADR-003)
  siteId?: string;                    // optional link to Site Analyzer
  createdAt: number;
  createdBy: string;
  updatedAt: number;
  updatedBy: string;
  archivedAt?: number;
  archivedBy?: string;
}
```

**Provisioning rule:** When a Project is created with `type=X`, the system idempotently ensures:
- A customer-root folder named for the dimension (`Pre-Con Projects`, `Construction Projects`, `REP Projects`) exists with `kind='system'`, `systemRole={x}-root`.
- A child folder under that named after `Project.name` is created with `kind='system'`, `systemRole='project-root'`.
- `Project.rootFolderId` is set to that child.

Documents and subfolders Mike creates inside a project live under `rootFolderId`. The customer view shows the full tree; the project view filters `projectId = X`.

### 3.4 Modified: `users`

Renames the existing role values: `employee` → `manager`, `worker` → `labor`. `admin` stays. See §7 for the full role model.

### 3.5 Modified: `construction-jobs` (existing)

Becomes a special case of `projects` with `type='construction'`. Either:
- (a) Migrate every existing `construction-job` into a `project` record (recommended), keeping the `construction-jobs` collection for backwards compat reads during a transition window.
- (b) Or leave `construction-jobs` in place and treat it as the canonical store for type=construction; the `projects` collection only holds pre-con and REP.

Recommendation: (a). Single source of truth simplifies queries and tools. See §11 for migration.

---

## 4. The no-deletion guarantee

### 4.1 What "delete" means

In the UI, "Delete" is renamed to **"Archive"**. Effects:
- Folders and documents set `archivedAt`, `archivedBy`, `archivedReason?`.
- Storage blobs are **never** removed. Period. No admin action, no scheduled cleanup, no purge.
- Archived items disappear from default views but appear in **Trash** (per customer, per project).

### 4.2 Restore

Any user with edit access can restore an archived document.
- Document restore: `archivedAt = null`. The document reappears in its original folder. If the folder is also archived, the document is moved to a special folder **"Recovered (parent was archived)"** at the customer root.
- Folder restore: `archivedAt = null` on the folder. Children remain in their original archived state — restoring a folder does not unarchive its children. (Reasoning: avoid surprise un-archives if the user only meant to recover the folder itself.)

### 4.3 What about the customer or project being archived?

- Archiving a **customer** archives nothing else. The folders/docs keep their state. The customer just disappears from the directory. Restoring the customer brings them back with their tree intact.
- Archiving a **project** archives the project's root folder (recursive — sets `archivedAt` on every descendant). Restoring the project restores the root folder; descendants remain individually archived if previously so.

### 4.4 Audit trail

Every state change writes to the `activity` collection (already wired via Cloud Functions triggers). New action types to add:
- `folder.create`, `folder.rename`, `folder.move`, `folder.archive`, `folder.restore`, `folder.access-changed`
- `document.upload` (already exists), `document.move`, `document.archive`, `document.restore`, `document.access-changed`

Audit retention: same as current (forever). Admin Activity page (`/admin/activity`) already surfaces these.

### 4.5 The hard line

Even an admin cannot purge a document or folder from storage. The only way bytes leave Firebase Storage is a one-time scripted compliance purge (e.g., legal hold release), invoked manually outside the app, audited separately. This is policy, not code — but the absence of a UI/API delete path enforces it in practice.

---

## 5. Edge cases — testing the logic to its limits

| Case | Behavior |
|---|---|
| Two users upload the same filename to the same folder simultaneously | Both succeed. Each gets its own document ID; UI shows both, sorted by upload time. Names are not deduplicated. (Slack/Drive convention.) |
| User renames a file | Only the `name` field changes. `storagePath` is immutable to preserve download URLs and Firebase Storage references. |
| User moves a folder containing 1000 docs | Update folder's `parentFolderId` + `ancestorFolderIds`. A Cloud Function backfills `ancestorFolderIds` on descendants in batches. UI shows "Moving…" until complete. |
| User moves a doc between folders | Update `folderId` + `ancestorFolderIds` on the doc. Cheap (one write). |
| User uploads a 50GB file | Rejected at upload step. Hard cap 100MB per file in v1 (raised from current 10MB to handle CAD/large PDFs). Files >100MB direct users to external storage with a "Link external file" affordance (see §9). |
| User drag-drops a folder with subfolders | Browser DataTransfer API + `webkitGetAsEntry()` walks the tree. Tool creates folders to mirror, then uploads files in parallel batches. Progress bar shows N of M. |
| User tries to restore a doc whose folder was archived | Doc restored into a `Recovered` folder at customer root, with a note in `archivedReason` referencing the original parent. |
| Project archived while Mike is editing a doc inside it | The doc save still succeeds (Firestore allows writes to archived records). When Mike returns, he sees the archive banner. He can request the project be restored. |
| Customer archived while a project is active | Project keeps its `companyId`. From the directory, the customer is gone; from `/projects/:id`, the project is still visible. Mike can re-link the project to another customer if needed. |
| Folder permission set restrictively, then parent permission widened | Child permission wins. Inheritance is "default to parent unless child overrides." No automatic re-inheritance when parent changes. |
| An admin is removed from `viewerUserIds` by mistake | Admins always have access — the `admin` role bypasses all folder access lists (see §7). The list field can name an admin for documentation, but their access doesn't depend on it. |
| User has access to folder A but not folder B; B is a subfolder of A | They can navigate to A and see A's direct children except B (or B is shown grayed out, depending on UX preference — recommend hidden). |
| User reorders folders by dragging | Update `position` field. Positions are sparse (multiples of 1000) to allow inserts without renumbering. |
| Same document needed in two folders | v1: not supported (a document has one `folderId`). Mike re-uploads or uses a "Move" not a "Copy." v2: introduce optional `linkedFolderIds[]` to attach one doc to multiple folders. |
| Project unlinked from customer | v1: not supported. Project always has exactly one `companyId`. If Mike wants to "move" a project to another customer, that's a `companyId` rewrite + a fan-out update on all the project's docs/folders. Provide as an admin-only action. |
| Project with no customer (spec deal, lead-stage) | v1: not allowed. Workaround: create a `prospect`-status customer placeholder. v2: allow `projects.companyId = null` with a `status='lead'`. |
| Customer has 10,000 documents | Firestore handles fine. UI paginates folder contents at 100 per page with virtual scroll. Search by name uses a Firestore `name_lower` field with prefix matching. |
| Mike uses the same folder name twice in the same parent | Allowed in v1 (folder uniqueness is by ID, not name). UI surfaces a warning "Folder 'Permits' already exists here — create anyway?" |
| Network drops mid-upload of a 90MB file | Use Firebase Storage resumable uploads. Browser refresh resumes from last chunk. If user closes tab, half-uploaded blob is GC'd by Storage after 7 days. |
| User views `archivedAt = null` filter from a permissionless context | Firestore rule denies. UI shows empty state. Activity log records the access attempt. |
| Bulk delete (Mike multi-selects 50 docs and archives) | Each doc gets `archivedAt`. One activity entry per doc (not a single bulk entry — keeps audit granular). Confirmation modal warns "50 documents will be archived. They can be restored from Trash." |
| Folder name contains `/` or `\` | Allowed (folders are virtual — Firestore field, not storage path). Filenames are sanitized at the storage path level; folder names are not used in storage paths at all. |

This list is not exhaustive but covers every case I could think of that breaks the simple model.

---

## 6. UI architecture

### 6.1 Customer profile — "Documents" tab

Replace the current `DocumentsSection.tsx` (which shows category chips) with a folder-tree view.

```
┌── Customer: Acme Industries ───────────────────────────────┐
│ Info │ People │ Sites │ Projects │ [Documents] │ Activity   │
├────────────────────────────────────────────────────────────┤
│ Acme Industries › Documents                                │
│ [+ Upload]  [+ New Folder]  [↑ Drag folder here]   [🗑 Trash] │
│                                                            │
│ ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐              │
│ │ 📁    │ │ 📁    │ │ 📁    │ │ 📁    │ │ 📁    │              │
│ │ MSA  │ │ NDAs │ │ Pre- │ │ Con- │ │ REP  │              │
│ │      │ │      │ │ Con  │ │ str. │ │      │              │
│ └──────┘ └──────┘ └──────┘ └──────┘ └──────┘              │
│                                                            │
│ 📄 cover-letter.pdf       2.1 MB   Bailey · 2 days ago     │
│ 📄 contact-list.xlsx      18 KB    Bailey · 1 week ago     │
└────────────────────────────────────────────────────────────┘
```

- **Breadcrumb-first navigation** (per ADR-015 pattern, extended to folders).
- **Tiles, not sidebar tree.** Mike's 21 folders need a wrap-friendly tile grid, not a vertical sidebar.
- **Right-click / long-press on a tile**: Rename / Move / Archive / Manage Access. (No Duplicate — out of scope per 2026-05-14 decision; users move or re-upload instead.)
- **Drag-drop**: a file dragged from another folder is moved; a folder dragged from the desktop is uploaded recursively.

### 6.2 Project profile — same UI, filtered

Same component, mounted with `projectId={x}`. Queries filter to that project's subtree. Visually identical to customer view.

### 6.3 Trash view

A dedicated `/customers/:id/trash` (and `/projects/:id/trash`) view. Lists archived items with restore + permanent-archive-note actions. Sortable by `archivedAt`. Admin-only by default; can be widened.

### 6.4 Search

A global search bar on the Documents tab: searches by filename across the current customer's whole tree (or current project's subtree from project view). Returns hits with breadcrumb showing where each lives. Phase 4 work (see §10).

---

## 7. Role & permission redesign

### 7.1 Role tiers

Three roles, no more. Supersedes ADR-012 (single-axis `allowedTools`).

| Role | Who | Document access default |
|---|---|---|
| `admin` | Bailey, Mike, Babi. Operates the business. **God-mode.** Bypasses every folder/doc access list, every tool gate. Cannot be locked out of anything. | All folders, all docs. Always. |
| `manager` (renamed from `employee`) | Operational staff (e.g., Missy). Sees every customer and project by default. Can read and write most folders, but admins can exclude managers from specific folders via `viewerUserIds`/`editorUserIds`. | All non-restricted folders. Folders with explicit `viewerUserIds`/`editorUserIds` only if listed. |
| `labor` (renamed from `worker`) | Field crews. Sees only the projects they're assigned to. Can upload to designated folders (e.g., a project's Photos folder). Read-only on most docs. | Folders inside a project they're a member of, where `editorUserIds` includes them or the folder is marked labor-uploadable. |

No `owner` tier and no `external` tier in v1. If we ever need vendor/client guest access we'll add a fourth tier then.

Migration:
- Existing `admin` → `admin` (no change).
- Existing `employee` → `manager` (rename label only; userIds in `allowedTools` arrays carry over).
- Existing `worker` → `labor` (rename label only).

### 7.2 Per-folder access lists

Two arrays on every folder and document:
- `viewerUserIds: string[]` — explicit allowlist for read among managers and labor. Empty/null = inherit from parent. If set, only listed managers/labor (plus all admins) can read.
- `editorUserIds: string[]` — explicit allowlist for write (upload, rename, move, archive). Same inheritance rules.

That's it. No `restrictedToOwner` boolean — the admin-bypass is implicit in the role, and "lock everyone but admins out" is just an empty `viewerUserIds = []` (explicitly set to non-null).

### 7.3 Inheritance

- A document inherits from its folder if its own access lists are null.
- A folder inherits from its parent folder (walking up `ancestorFolderIds`) if its own access lists are null.
- A root folder with null lists is "open to all managers, no labor by default unless they're a project member."
- Setting `viewerUserIds = []` (explicit empty array, not null) means "no managers/labor at all — admin-only." This is the equivalent of the old `restrictedToOwner` shortcut, expressed in the same field as everything else.

### 7.4 Admin exemption

Any user whose `users/{uid}.role == 'admin'` is treated as always-present in every `viewerUserIds` and `editorUserIds`. The check is in code (and in Firestore rules), not in the stored lists — even if an admin's UID appears nowhere on a folder, they still pass.

Trade-off: this means no admin can lock another admin out of any folder. All three of Bailey/Mike/Babi see all financial docs. If that ever stops being acceptable we'll introduce a separate `owner` tier — but for v1, the three admins trust each other fully.

### 7.5 Firestore security rules

Currently absent from the repo (managed in console). This redesign mandates **committed rules** in `firestore.rules` and `storage.rules`. Outline:

```
match /folders/{folderId} {
  allow read: if isAdmin() || hasViewAccess(folderId);
  allow write: if isAdmin() || hasEditAccess(folderId);
}
match /documents/{docId} {
  // same pattern
}
```

Where `hasViewAccess(id)` walks the folder ancestor chain via cached lookups (using `ancestorFolderIds` to avoid recursion in rules — pre-computed at write time) and checks if the caller's UID is in the nearest non-null `viewerUserIds` on the chain. If every ancestor's list is null, the call falls through to the "open to all managers" default for managers, or to "must be project member with labor-upload right" for labor.

This is also a meaningful security improvement on its own: today, any authenticated user can read or write any `crm-documents` doc directly via the Firestore SDK (per ADR-012 consequences). The redesign closes that hole.

---

## 8. The fate of the existing Documents tool

### 8.1 What it is today

`/documents` route, `DocumentsTool.tsx`. Three hardcoded Google Drive shortcut cards:
- "My Documents" (user's personal Drive)
- "Templates" (shared Drive folder)
- "Company Drive" (shared Drive folder)

No API, no upload, no integration — just `window.open()` to Drive URLs. Useful for templates Mike pulls from when starting a new deal; useless for everything else.

### 8.2 Decision: repurpose, don't kill

Replace with a global cross-customer document tool:
- **"All Documents"** — search and browse documents across every customer the user has access to. Useful for "where did we put the AEP interconnect template?" type queries that span customers.
- **"Templates"** — keep the Drive shortcut to templates as a sub-card. Templates are blank forms (LOI, NDA, MSA) that get duplicated into a project on use. These can live in Drive for now; later, build template-to-folder duplication into the platform.
- **Drop** "My Documents" and "Company Drive" — they're not platform-integrated, they're just bookmarks.

### 8.3 Why not kill it entirely

The folder system gives Mike per-customer/per-project document access — but he loses the ability to search across customers. The standalone Documents tool fills that gap. It becomes the "find me a doc anywhere" entry point.

### 8.4 Implementation

Phase 4 (after folder system is shipped). Single page, search bar at top, results show breadcrumb of where each doc lives. Backed by a Firestore composite index on `(companyId, name_lower, archivedAt)` plus an in-memory fan-out across companies the user has access to.

If the user count or doc count makes fan-out too expensive (>20 companies, >100k docs), switch to Algolia or a single denormalized search collection.

---

## 9. Cost estimate

### 9.1 Pricing baseline (Firebase Spark + Blaze, US, 2026)

- **Cloud Storage Standard:** $0.026/GB/month stored, $0.12/GB egress, $0.0036/GB retrieval
- **Firestore:** $0.18 per 100k reads, $0.18 per 100k writes, $0.18/GB/month metadata
- **Cloud Functions:** $0.40/million invocations, $0.0000025/GB-s
- **Egress (outside Google Cloud):** $0.12/GB

### 9.2 Three scenarios

**Best case — internal R&B use only, low volume**
- 20 customers, 3 projects average, 30 docs per project = ~1,800 docs
- Avg 3MB per doc = 5.4 GB storage
- 5 active users, 100 reads/user/day = 15k reads/day = 450k reads/month
- 50 uploads/day = ~1500 writes/month for docs + ~1500 audit writes = 3k writes/month
- 10 GB egress/month (downloads, previews)

| Line | Monthly |
|---|---|
| Storage | $0.14 |
| Egress | $1.20 |
| Firestore reads | $0.81 |
| Firestore writes | $0.005 |
| Activity logging (Cloud Functions) | $0.04 |
| **Total** | **~$2.20/mo** |

**Realistic mid case — Mike + 10 active users, full adoption**
- 100 customers, 5 projects each, 100 docs per project = 50k docs
- Avg 4MB per doc = 200 GB storage
- 10 users, 500 reads/day = 150k reads/month
- 100 uploads/day = 3k uploads/mo + 3k audit writes = 6k writes/mo
- 50 GB egress/month

| Line | Monthly |
|---|---|
| Storage | $5.20 |
| Egress | $6.00 |
| Firestore reads | $0.27 |
| Firestore writes | $0.01 |
| Activity logging | $0.12 |
| **Total** | **~$11.60/mo** |

**Heavy case — multiple companies on the platform**
- 500 customers, 10 projects each, 500 docs per project = 2.5M docs
- Avg 5MB per doc = 12.5 TB storage
- 20 users, 1000 reads/day = 600k reads/month
- 500 uploads/day = 15k/mo + 15k audit = 30k writes/mo
- 500 GB egress/month

| Line | Monthly |
|---|---|
| Storage | $325 |
| Egress | $60 |
| Firestore reads | $1.08 |
| Firestore writes | $0.054 |
| Activity logging | $0.60 |
| **Total** | **~$387/mo** |

### 9.3 What kills costs

In order of risk:
1. **Storage size growth from never-deleting.** Every archived doc costs storage forever. At Mid case, archive accumulates ~50 GB/year extra = ~$1.50/mo added per year. At Heavy case, ~$10/mo added per year. Cumulative, not crippling.
2. **Egress on viewing.** Users opening a PDF triggers an egress charge. The dominant variable cost. Inline PDF previews use range requests (good — only download the visible bytes), but full opens download the whole file. Cache aggressively client-side.
3. **Big video files.** A single 500MB video uploaded daily costs $0.013/mo to store and $0.06 each time it's viewed. Hard-cap file size at 100MB, recommend offsite for larger.
4. **Activity log volume.** Every CRUD writes an `activity` entry. At Heavy case that's 30k writes/mo plus reads. Negligible at current scale, but if usage 10×s, audit could push past $5/mo on its own.

### 9.4 Recommended guardrails in code

- 100MB hard cap per file (configurable per company).
- Customer-level storage soft warning at 50 GB ("you've stored X / 50 GB — large customers may need a separate plan").
- Admin can see storage-per-customer breakdown to spot abuse.
- Archived docs accumulate forever; no auto-purge. If costs become a problem, add a "Compliance purge after 7 years" admin action — but that's an explicit policy decision, not automatic.

### 9.5 Best-case-to-worst-case spread

In one sentence: **somewhere between $2/mo and $400/mo, with the realistic mid-term landing around $10–30/mo.** Even worst case is well below the cost of one hour of developer time, so the decision should be made on UX value, not cost.

---

## 10. Execution plan (PR by PR)

Total estimated effort: **3–4 weeks** focused.

### Phase 1 — Foundation (Week 1)

**PR 1.1 — Data model + security rules**
- Add `folders`, `documents` (replaces `crm-documents`), `projects` collections.
- Add `archivedAt` field plumbing (queries default-filter, hooks expose `includeArchived` flag).
- Write `firestore.rules` and `storage.rules`, commit to repo, deploy via `firebase deploy --only firestore:rules,storage`.
- New helpers: `src/lib/folders.ts`, refactor `src/lib/crmDocuments.ts` → `src/lib/documents.ts` (replacing the existing Drive-shortcut `documents.ts`).
- No UI changes yet.

**PR 1.2 — Backfill migration**
- One-shot script: every existing `crm-documents` doc → new `documents` collection, with a folder created per legacy `category` at the customer root.
- Existing `construction-jobs/{}/documents` subcollection → migrate similarly into `documents` with project context.
- Idempotent and reversible.
- Activity logs the migration with actor = "system".

**PR 1.3 — Role rename + admin-bypass plumbing**
- Rename existing `UserRole` values: `employee` → `manager`, `worker` → `labor`. Single Firestore script flips every `users/{uid}.role` field; legacy values translated on read for one release as a safety net.
- Update `useAuth`, `ProtectedRoute`, `useJobPermissions`, `UserManagement` UI for the new labels.
- Add admin-bypass helpers in shared lib (`canReadFolder(uid, folder)`, `canWriteFolder(uid, folder)`) plus the equivalent Firestore-rules functions. No UI surface yet — wired up in Phase 4 when per-folder lists land.

### Phase 2 — Folder UI on Customer profile (Week 2)

**PR 2.1 — Customer Documents tab redesign**
- Replace `DocumentsSection.tsx` with `FolderBrowser.tsx`.
- Tile grid, breadcrumb, upload to current folder, new folder, rename, move, archive.
- Read-only first, then add mutations.
- Mobile-friendly (Mike uses iPad/phone).

**PR 2.2 — Drag-drop folder upload**
- `webkitGetAsEntry()` traversal, recursive folder mirror + parallel file uploads.
- Progress UI with N of M.
- Resumable upload via Firebase Storage SDK.

**PR 2.3 — Trash view**
- `/customers/:id/trash` page.
- List archived items, restore action.
- Same shape as folder browser, filtered to `archivedAt != null`.

### Phase 3 — Projects + project view (Week 3)

**PR 3.1 — Project entity + auto folder provisioning**
- New `projects` collection.
- Migrate `construction-jobs` to projects (type='construction'), keep collection for backward compat reads during 4-week transition.
- Project creation auto-provisions system folders at customer root.

**PR 3.2 — Pre-Con and REP project types**
- New project-creation flows for `pre-con` and `rep` types, mounted under each customer's relevant section.
- Pre-Con project links to a Site Analyzer site (if any).
- REP project gets a maintenance-flavored skeleton (work orders, invoices, photos).

**PR 3.3 — Project profile page**
- `/projects/:id` route (mounted from Construction Tracker for compat).
- Same FolderBrowser, filtered to `projectId = id`.
- Project tools (Construction Tracker tabs) attach to this page.

### Phase 4 — Permissions + global Documents tool (Week 4)

**PR 4.1 — Per-folder access lists**
- `viewerUserIds`, `editorUserIds` on folders and docs (no `restrictedToOwner` — empty-array semantics handle admin-only).
- Inheritance via `ancestorFolderIds` walk.
- "Manage access" modal on the folder/doc right-click menu.
- Firestore rules updated to enforce.

**PR 4.2 — Refactored DocumentsTool**
- Replace Drive shortcuts with cross-customer search + browse.
- Templates Drive shortcut preserved as a single card.
- Global search across all customers user has access to.

**PR 4.3 — Updated User Management**
- Surface the new role tiers in the admin UI.
- Show per-customer folder permission overview (optional, can defer).

### Phase 5 — Polish, ADR/PRD updates, retrospective (mid-Week 4 → Week 5)

- Write ADRs 018, 019, 020 to formalize the decisions in this doc.
- Update PRD.md "Shipped state" section.
- Update ERD.md with `folders`, `documents`, `projects`.
- Update CLAUDE.md to reflect the new tools, hooks, lib files.
- Bump version (likely MINOR `1.x.0`).
- User test with Mike: have him upload Asherton end-to-end. Watch for friction.

---

## 11. Migration risks & mitigations

| Risk | Mitigation |
|---|---|
| Existing docs lose their legacy category | Store `legacyCategory` field on each migrated doc; UI shows it as a chip in addition to folder location. |
| Construction jobs break during migration | Run migration in reverse-compat mode: new `documents` collection populated, but old `crm-documents` and `construction-jobs/{}/documents` kept readable for 30 days. App reads from new; rollback path exists. |
| Mike's existing folder layout gets stuck in "Other" | Migration script creates one folder per legacy category. After migration, Mike can rename/reorganize. |
| An admin accidentally locks themselves out | The admin role bypasses all access lists by design. Cannot happen. Mike and Babi are also admins, so any of them can recover for the others if needed. |
| User with broad access reorganizes Mike's folders | Audit log + UI confirm dialog "Move 200 docs?". Restore is one click. |
| Storage cost balloons | Per-customer storage dashboard for admins. Hard cap 100MB/file. Soft warning at 50 GB/customer. |
| Firestore rules break existing queries | Stage rules in a dedicated test project first. Run query audit. |

---

## 12. Open questions for Babi & Mike

1. **Folder template per project type.** What should the default folder skeleton be for a new pre-con project? A new construction project? A new REP project? Mike's Asherton list is data — I want him to circle the ones that should be defaults.
2. **The Asherton question.** Is "Asherton" the customer name or the project name? If it's the customer, the 21 folders are customer-root. If it's a project, who's the customer (Alliance? the landowner? Giga Core)? This decides where the migration places things.
3. ~~**Per-customer owners.**~~ **Resolved 2026-05-14:** dropped the `owner` tier entirely. All admins (Bailey, Mike, Babi) have god-mode; no per-customer owner concept in v1.
4. **Counterparty entity.** AEP, Battalion, Alliance, Giga Core are not customers but they're real entities Mike organizes around. Do we ever want them as first-class records (cross-project queries, contact lists)? Deferred to v2; flag now.
5. **External access.** Will any vendor or customer ever log into the platform to download docs? If yes, the `external` role becomes priority; if no, deferred indefinitely.
6. **File size cap.** Is 100MB enough? Mike's biggest file in Asherton — what's its size? CAD/site survey files can be 200–500MB.

---

## 13. Sign-off

- [x] Babi (Product owner) — agrees with the customer-centric model, the no-deletion guarantee, the three-role model (admin / manager / labor) — 2026-05-14
- [ ] Mike (User) — answers open questions 1, 2, 6
- [ ] Once signed: write ADRs 018–020, update PRD/ERD/CLAUDE.md, then execute Phase 1.
