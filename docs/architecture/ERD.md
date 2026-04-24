# Entity-Relationship Model

> **Status:** Draft (v0.1) — depends on PRD sign-off.
> **Purpose:** Defines every Firestore collection, its fields, and how collections relate. No UI, no tools, just data.

---

## 1. Diagram (high-level)

```
 ┌─────────────┐  convert   ┌──────────────┐ ──< ┌──────────────┐
 │    Lead     │ ─────────▶ │   Company    │     │   Contact    │
 │ (REP funnel)│            │              │     │ (person @ co)│
 └─────────────┘            └──────────────┘     └──────────────┘
                                   │ 1
                                   │
                          ┌────────┴────────┐
                          │ *               │ *
                     ┌────────────┐    ┌────────────┐
                     │    Site    │    │  Document  │ ← (company-level)
                     │  (coords)  │    │            │
                     └────────────┘    └────────────┘
                          │ 1
                          │ *
                     ┌──────────────────────┐
                     │       Project        │
                     │ (preCon/con/rep)     │
                     │ parentProjectId?     │
                     └──────────────────────┘
                          │ 1              │ 1
                          │ *              │ *
                     ┌───────────┐    ┌──────────────┐
                     │  Folder   │ ──<│  Document    │
                     │ (tree)    │    │ (file meta)  │
                     └───────────┘    └──────────────┘
                                            │ 1
                                            │ 1
                                      ┌──────────────────┐
                                      │ Firebase Storage │
                                      │ documents/{id}/… │
                                      └──────────────────┘
```

## 2. Collections

### 2.1 `leads` (REP prospecting)

Already exists. Minor additions.

```ts
interface Lead {
  id: string;                      // doc ID
  name: string;
  companyName?: string;            // free-text, not a Company ref
  email?: string;
  phone?: string;
  stage: 'new' | 'call1' | 'email' | 'call2' | 'final' | 'won' | 'lost';
  assignedTo?: string;             // userId
  notes: LeadNote[];
  source?: string;                 // CSV batch, manual, etc.
  createdAt: Timestamp;
  updatedAt: Timestamp;

  // NEW fields for conversion:
  converted: boolean;              // default false
  convertedAt?: Timestamp;
  convertedCompanyId?: string;     // FK → companies.id
  convertedContactId?: string;     // FK → contacts.id
}
```

Kept separate from `contacts` by design — see ADR-001.

---

### 2.2 `companies` (NEW)

Root entity of the CRM.

```ts
interface Company {
  id: string;
  name: string;                    // display name, unique case-insensitive
  legalName?: string;              // official/legal entity name if different
  status: 'prospect' | 'active' | 'inactive' | 'archived';
  industry?: string;
  website?: string;
  phone?: string;
  email?: string;

  // Address (single primary address; branch offices are future scope)
  address?: {
    street?: string;
    city?: string;
    state?: string;                // 2-letter
    zip?: string;
    country?: string;              // default 'US'
  };

  // Engagement flags — which dimensions is this company active in?
  dimensions: {
    preCon: boolean;
    construction: boolean;
    rep: boolean;
  };

  // Provenance
  source: 'manual' | 'lead-convert' | 'site-request' | 'legacy-migration';
  sourceLeadId?: string;           // if source === 'lead-convert'

  notes?: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  createdBy: string;               // userId
}
```

**Constraints:**
- `name` must be unique (case-insensitive) within the collection.
- A `Company` cannot be deleted if it has non-archived `projects`. Soft-delete via `status: 'archived'`.

---

### 2.3 `contacts` (NEW)

Person at a company.

```ts
interface Contact {
  id: string;
  companyId: string;               // FK → companies.id, required
  firstName: string;
  lastName: string;
  title?: string;                  // "Head of Sales", etc.
  email?: string;
  phone?: string;
  isPrimary: boolean;              // default false; exactly one primary per company (enforced in UI, not DB)
  source: 'manual' | 'lead-convert' | 'legacy-migration';
  sourceLeadId?: string;
  notes?: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}
```

**Constraints:**
- A contact belongs to exactly one company at a time.
- Moving a contact to another company is an update to `companyId`, not a new record.
- Deleting a company cascades to its contacts (soft-archive).

---

### 2.4 `sites-registry` (EXISTING — extended)

Physical sites. Already exists. Gains company linkage.

```ts
interface SiteRegistryEntry {
  id: string;
  coordinates: { lat: number; lng: number };
  name?: string;                   // human-readable, optional
  address?: string;                // reverse-geocoded, optional
  acreage?: number;
  mw?: number;

  // NEW: company linkage
  currentCompanyId: string;        // FK → companies.id, required
  companyHistory?: Array<{         // append-only log of ownership changes
    companyId: string;
    assignedAt: Timestamp;
    assignedBy: string;
    reason?: string;               // 'deal-fallthrough', 'reassigned', etc.
  }>;

  // LEGACY: the existing project folder grouping (migrated to Project entity in M3)
  projectId?: string;              // DEPRECATED after M3 migration; keep for fallback
  
  // Cached results (unchanged from today)
  appraisal?: AppraisalResult;
  infrastructure?: InfrastructureResult;
  broadband?: BroadbandResult;
  transport?: TransportResult;
  water?: WaterResult;
  gas?: GasResult;
  lastPiddrRunAt?: Timestamp;

  createdAt: Timestamp;
  updatedAt: Timestamp;
  createdBy: string;
}
```

**Constraints:**
- `currentCompanyId` is required. During migration, unassigned sites point to a synthetic "Legacy — Unassigned" company.
- Coordinates are the logical identity. The UI deduplicates by rounded coords before creating new entries.
- Changing `currentCompanyId` appends to `companyHistory`. Never overwrite history.

---

### 2.5 `projects` (NEW)

A dimension-specific engagement around a site. Also home to checklists (v2) and folder trees.

```ts
interface Project {
  id: string;
  companyId: string;               // FK → companies.id, required
  siteId?: string;                 // FK → sites-registry.id, optional (REP projects may not have a site)
  dimension: 'preCon' | 'construction' | 'rep';
  parentProjectId?: string;        // FK → projects.id, for lineage (preCon → construction → rep)
  
  name: string;                    // display, defaults to "{dimension}: {company} — {site name/coords}"
  status: 'active' | 'paused' | 'completed' | 'cancelled' | 'archived';
  
  // Dimension-specific metadata (optional, grows over time)
  metadata?: {
    preCon?: {
      piddrReportId?: string;      // link to cached PIDDR output
    };
    construction?: {
      startDate?: Timestamp;
      targetEnergizationDate?: Timestamp;
    };
    rep?: {
      contractStartDate?: Timestamp;
      contractEndDate?: Timestamp;
    };
  };

  createdAt: Timestamp;
  updatedAt: Timestamp;
  createdBy: string;
}
```

**Constraints:**
- A Project must have a `companyId`.
- `parentProjectId` must reference a Project under the same `companyId`.
- Multiple projects per dimension per site are allowed (re-engagements, scope splits).
- Cascade: archiving a Company archives its Projects. Deleting a Project cascades to its Folders and Documents.

---

### 2.6 `folders` (NEW)

Folder tree under a Project or directly under a Company.

```ts
interface Folder {
  id: string;
  name: string;
  parentFolderId?: string;         // FK → folders.id; null = top-level under owner
  
  // Ownership: exactly one of these is set
  ownerType: 'company' | 'project';
  companyId?: string;              // if ownerType === 'company'
  projectId?: string;              // if ownerType === 'project'
  
  // Is this a system-created skeleton folder (cannot be deleted) or user-created?
  kind: 'system' | 'user';
  systemCategory?: DocumentCategory;  // for system folders, which category they represent
  
  createdAt: Timestamp;
  createdBy: string;
}
```

**Skeleton folders created automatically:**

| Dimension | Folders auto-created on project creation |
|---|---|
| preCon | Legal · PIDDR · Deliverables · Invoices |
| construction | Photos · Deliverables · Invoices · Legal |
| rep | Contract · Usage Reports · Invoices |
| (company-level) | Master Legal · Tax & Compliance |

System folders have `kind: 'system'` and cannot be renamed or deleted by users. User-created folders (`kind: 'user'`) can be nested, renamed, deleted freely.

---

### 2.7 `documents` (NEW)

File metadata. Blob lives in Firebase Storage.

```ts
type DocumentCategory =
  | 'photo'
  | 'invoice'
  | 'report'
  | 'legal'        // NDA, agreement, MSA
  | 'deliverable'  // allocation letter, one-line diagram
  | 'other';

interface Document {
  id: string;
  name: string;                    // user-visible filename
  folderId: string;                // FK → folders.id, required
  
  // Redundant ownership (indexed for fast filtering) — must match the folder's owner
  companyId: string;               // required; always set, regardless of folder owner type
  projectId?: string;              // set iff folder's project-owned
  
  category: DocumentCategory;
  contentType: string;             // MIME type
  sizeBytes: number;
  
  // Storage reference
  storagePath: string;             // e.g. "documents/{companyId}/{documentId}-{filename}"
  
  uploadedAt: Timestamp;
  uploadedBy: string;              // userId
}
```

**Constraints:**
- Every document has a `companyId` (denormalized) so queries for "all documents for Acme" are a single query.
- Storage path includes `documentId` so renames update metadata only — blob never moves.
- Deleting a Document deletes its Storage blob in the same transaction (or, realistically, via a cleanup function).
- No version history. Re-uploading the same filename creates a new Document record (old one stays unless user deletes).

---

### 2.8 `users` (EXISTING — extended)

```ts
interface User {
  id: string;                      // Firebase Auth UID
  email: string;
  displayName: string;
  role: 'admin' | 'employee';
  allowedTools: ToolId[];

  // NEW:
  allowedDimensions: ('preCon' | 'construction' | 'rep')[];
  documentCategories: DocumentCategory[];

  createdAt: Timestamp;
  updatedAt: Timestamp;
}
```

Admin bypasses `allowedDimensions` and `documentCategories` (treated as if all are set).

---

### 2.9 Deprecated / migrated

| Collection | Fate |
|---|---|
| `projects` (legacy — the old PIDDR folder grouping) | Migrated into new `projects` collection with `dimension: 'preCon'`. Old collection renamed `legacy-projects` during migration and deleted after verification. |
| `site-requests` | Kept. Gains `companyId` link after auto-draft. |
| `site-pipeline` state | Deprecated. Not carried forward. |

---

## 3. Firestore indexes (anticipated)

- `companies` by `name` (lowercase) for uniqueness check.
- `contacts` by `companyId`.
- `sites-registry` by `currentCompanyId`.
- `projects` by `companyId`, by `(companyId, dimension)`, by `siteId`.
- `folders` by `(ownerType, projectId)`, by `(ownerType, companyId)`, by `parentFolderId`.
- `documents` by `folderId`, by `companyId`, by `(companyId, category)`, by `(projectId, category)`.
- `leads` by `stage`, by `converted`.

## 4. Firebase Storage layout

```
/documents/{companyId}/{documentId}-{sanitized-filename}.{ext}
/templates/{templateId}-{sanitized-filename}.{ext}
```

- Company-scoped prefix makes per-company cleanup on company deletion simple.
- `documentId` embedded in the path means renames don't move blobs.
- Templates live outside the company tree (global library).

## 5. Security rules (sketch)

- `companies`, `contacts`, `projects`, `folders`, `documents` — read/write restricted by:
  - User's `allowedDimensions` must include the owning project's dimension (for project-owned resources).
  - User's `documentCategories` must include the document's `category` (for `documents` reads/writes).
  - Admin bypasses.
- `leads` — read/write for users with `allowedTools` including `'sales-crm'`.
- `users` — read own doc; admin writes all.
- `sites-registry` — read for users with pre-con or construction dimension access; write for pre-con dimension users.

(Detailed rules written during M1; this is the shape.)

## 6. Relationships — cardinality summary

| From | To | Cardinality | Field |
|---|---|---|---|
| Lead | Company | 0..1 | `convertedCompanyId` |
| Company | Contact | 1..N | `Contact.companyId` |
| Company | Site | 1..N | `Site.currentCompanyId` |
| Company | Project | 1..N | `Project.companyId` |
| Site | Project | 1..N | `Project.siteId` |
| Project | Project | 0..1 (parent) | `Project.parentProjectId` |
| Company | Folder | 1..N (company-owned) | `Folder.companyId` when `ownerType='company'` |
| Project | Folder | 1..N (project-owned) | `Folder.projectId` when `ownerType='project'` |
| Folder | Folder | 0..1 (parent) | `Folder.parentFolderId` |
| Folder | Document | 1..N | `Document.folderId` |

## 7. Things deliberately *not* in the model (yet)

- **ChecklistItem** / project stages — deferred to v2.
- **DocumentVersion** — not tracking prior versions.
- **ContactEmployment history** — contacts have one current company.
- **CompanyAddress (multiple)** — single primary address only.
- **AuditLog** — system-wide audit log is v2 (individual entities track `createdAt`/`updatedAt`/`createdBy` for now).
- **Tags** on documents or projects — use `category` for documents; no tags on projects.

## 8. Sign-off

- [ ] Product owner
- [ ] Engineering lead
- [ ] Date:

Once signed off, migration plan and milestone breakdown are produced next.
