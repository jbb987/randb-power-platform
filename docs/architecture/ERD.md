# Entity-Relationship Model

> **Status:** Reflects shipped state as of **v1.14.3**.
> **Purpose:** Defines every Firestore collection, its fields, and how collections relate. No UI, no tools, just data.

---

## 1. Diagram — shipped state

```
 ┌─────────────┐  (manual convert    ┌──────────────┐ ──< ┌──────────────┐
 │    Lead     │   — not yet built)  │   Company    │     │   Contact    │
 │ (REP funnel)│ ─ ─ ─ ─ ─ ─ ─ ─ ─ ▶ │   (Directory)│     │ (person @ co)│
 └─────────────┘                     └──────────────┘     └──────────────┘
                                            │ 1                  ▲ *
                                            │                    │
                                  ┌─────────┼─────────┐          │ companyId
                                  │ *       │ *       │          │
                             ┌────────┐ ┌────────┐ ┌──────────┐  │
                             │ Site   │ │ Doc    │ │ Contact  │──┘
                             │(coords)│ │(typed) │ └──────────┘
                             └────────┘ └────────┘
                                  ▲
                                  │ companyId (optional, mutable)
                                  │
                            (keyed by coords — a site's
                             identity is physical, ownership
                             is a mutable relationship)
```

**Five collections**: `crm-companies`, `crm-contacts`, `crm-documents`, `sites-registry`, `leads`.

**No `projects` entity. No `folders` entity.** Those were in the original vision but dropped in favor of document category tags. See ADR-011 in `ADRs.md`.

---

## 2. Collections (shipped)

### 2.1 `leads` — REP prospecting funnel

Unchanged from pre-merge state. Separate from `crm-contacts` by design — see ADR-001.

```ts
interface Lead {
  id: string;
  assignedTo: string;           // Firebase UID
  assignedToName: string;
  businessName: string;
  phone: string;
  email: string;
  description: string;
  decisionMakerName: string;
  decisionMakerRole: string;
  status: 'new' | 'call_1' | 'email_sent' | 'call_2' | 'call_3' | 'won' | 'lost';
  notes: LeadNote[];
  createdAt: number;
  updatedAt: number;
}
```

**Not yet shipped:** the `converted` / `convertedCompanyId` linkage fields from the long-term vision. Conversion is still manual (no Convert button yet).

---

### 2.2 `crm-companies` — the Directory

Root entity. User-facing label is "Directory"; collection key stays `crm-*` for historical/backend stability.

```ts
type CompanyTag = 'REP' | 'Construction' | 'Pre Construction' | 'Utility';

interface Company {
  id: string;
  name: string;                  // unique (case-insensitive check on write)
  location: string;              // single free-text field: "Houston, TX"
  website?: string;
  ein?: string;
  tags: CompanyTag[];            // multi-select, fixed enum
  note?: string;
  createdAt: number;
  updatedAt: number;
  createdBy: string;             // userId
}
```

**Constraints:**
- Name uniqueness enforced by the hook (`useCompanies.createCompany` rejects duplicates case-insensitively).
- Hard delete cascades to contacts (see §2.3). Documents are **not** cascade-deleted in the current implementation — a hole to plug.

---

### 2.3 `crm-contacts` — People

```ts
interface Contact {
  id: string;
  companyId: string;             // FK → crm-companies.id, required
  firstName: string;
  lastName: string;
  title?: string;
  email?: string;
  phone?: string;
  note?: string;
  createdAt: number;
  updatedAt: number;
}
```

**Constraints:**
- Exactly one `companyId` per contact (no multi-company). See ADR-008.
- Deleting a company hard-deletes all its contacts via `deleteContactsByCompany`.

---

### 2.4 `crm-documents` — Files attached to companies

```ts
type DocumentCategory =
  | 'legal'        // NDA, agreements, PFAA, MSA
  | 'invoice'
  | 'deliverable'  // allocation letters, one-line diagrams
  | 'report'
  | 'photo'
  | 'other';

interface CrmDocument {
  id: string;
  companyId: string;             // FK → crm-companies.id, required
  category: DocumentCategory;
  name: string;                  // original filename for display
  contentType: string;           // MIME
  sizeBytes: number;
  storagePath: string;           // "crm-documents/{companyId}/{id}-{sanitized-name}"
  uploadedAt: number;
  uploadedBy: string;            // userId
  uploadedByName: string;        // cached at write time for fast rendering
}
```

**Firebase Storage** blob lives at `storagePath`. Deleting a doc removes both the metadata doc and the Storage blob.

**Limits** (enforced client-side in `useCompanyDocuments`):
- `MAX_DOCUMENT_BYTES = 10 * 1024 * 1024`
- `ACCEPTED_DOCUMENT_MIME = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp']`

**Not shipped:** site-scoped documents (no `siteId` field). Documents attach to companies only for v1.

---

### 2.5 `sites-registry` — Physical sites (existing, extended)

Existing collection; gained `companyId`.

```ts
interface SiteRegistryEntry {
  id: string;
  name: string;
  address: string;
  coordinates: { lat: number; lng: number };    // the logical identity
  acreage: number;
  mwCapacity: number;
  dollarPerAcreLow: number;
  dollarPerAcreHigh: number;

  // NEW: CRM linkage (set via the PIDDR CompanyPicker)
  companyId?: string;            // FK → crm-companies.id, optional, mutable

  // Legacy: still in the type for pre-link data. New writes set companyId, not owner.
  owner?: string;

  // Unchanged existing fields
  projectId?: string;            // legacy PIDDR folder grouping, separate from the dropped Project entity
  createdBy: string;
  memberIds: string[];
  priorUsage?: string;
  legalDescription?: string;
  county?: string;
  parcelId?: string;
  detectedState?: string;
  piddrGeneratedAt?: number | null;

  // Cached tool results
  appraisalResult?: AppraisalResult | null;
  infraResult?: Record<string, unknown> | null;
  broadbandResult?: BroadbandResult | null;
  waterResult?: Record<string, unknown> | null;
  gasResult?: Record<string, unknown> | null;
  transportResult?: Record<string, unknown> | null;
  landComps?: LandComp[];

  createdAt: number;
  updatedAt: number;
}
```

**Constraints:**
- Coordinates are the identity — dedup check in PIDDR when entering a new site (`findSiteByCoordinates`).
- `companyId` is optional and mutable. See ADR-002 for the "sites are physical, ownership is a relationship" rationale.
- Ownership history (the `companyHistory` append-only log from the original vision) is **not** shipped — `companyId` is overwritten in place.

---

### 2.6 `users` — unchanged

```ts
interface User {
  id: string;                    // Firebase Auth UID
  email: string;
  displayName: string;
  role: 'admin' | 'employee';
  allowedTools: ToolId[];        // the only access axis enforced today
  createdAt: number;
  updatedAt: number;
}
```

Admin bypasses `allowedTools`. Employees need `'crm'` in their `allowedTools` to reach the Directory.

**Not shipped:** `allowedDimensions`, `documentCategories` from the long-term vision.

---

## 3. Firebase Storage layout

```
/crm-documents/{companyId}/{documentId}-{sanitized-filename}.{ext}
```

- Company-scoped prefix makes per-company cleanup trivial.
- Document ID embedded in the path means renames don't move blobs.

---

## 4. Security rules (shipped)

Firestore rules in the console have:

```
match /crm-companies/{id} { allow read, write: if isAuthed(); }
match /crm-contacts/{id}  { allow read, write: if isAuthed(); }
match /crm-documents/{id} { allow read, write: if isAuthed(); }
```

Storage rules:

```
rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {
    match /crm-documents/{allPaths=**} {
      allow read, write: if request.auth != null;
    }
  }
}
```

CORS on the Storage bucket allows `origin: ["*"]` with GET + Content-Disposition response header so the SDK's `getBlob` download path works.

---

## 5. Relationships — cardinality (shipped)

| From | To | Cardinality | Field |
|---|---|---|---|
| Company | Contact | 1..N | `Contact.companyId` |
| Company | CrmDocument | 1..N | `CrmDocument.companyId` |
| Company | Site | 0..N (mutable) | `Site.companyId` |
| Lead | Company | 0..1 (manual convert) | `Lead.convertedCompanyId` (not shipped yet) |

---

## 6. Deferred from the long-term vision

These appeared in the original ERD draft but are **not** in production:

- **`projects` collection** — per-dimension engagement tracking with `parentProjectId` lineage. Dropped in favor of tags. If Construction workflow ever needs state beyond "it's happening at this site", revisit.
- **`folders` collection** — document tree. Dropped — documents are filtered by category tag instead.
- **`SiteRegistryEntry.companyHistory[]`** — append-only ownership log. Simple `companyId` overwrite is enough for now.
- **User `allowedDimensions` + `documentCategories`** — finer-grained access. `allowedTools` is the only axis today.
- **`Company.dimensions: { preCon, construction, rep }`** — replaced by the simpler `tags: CompanyTag[]`.

If any of these become necessary, add a new ADR documenting the decision and update this section.

---

## 7. Sign-off

- [x] Shipped to production on 2026-04-24 as part of PR #91.
