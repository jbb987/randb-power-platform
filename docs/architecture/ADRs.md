# Architecture Decision Records

> **Status:** Draft (v0.1) — ratified alongside PRD & ERD sign-off.
> **Purpose:** Records the architectural decisions made during design of the unified CRM + Document platform, with rationale. Each ADR is numbered, dated, and immutable once ratified — superseded decisions get a new ADR that references the old one.

---

## ADR-001 — Leads stay separate from CRM Contacts

**Status:** Accepted · **Date:** 2026-04-24

**Context**
The REP side of the business uses a lead-prospecting workflow (call, email, follow up) and routinely ingests thousands of cold leads from bulk CSV uploads. The CRM is the system of record for established customers and the people we do real business with. There is a natural temptation to unify the two into a single "contacts" collection, but this creates a signal-to-noise problem at scale.

**Decision**
Leads and Contacts are modeled as **separate collections** with an explicit **convert** action. A lead lives in the `leads` collection until someone marks it **Won** and explicitly converts it. On conversion, the system creates a `Company` + `Contact` in the CRM and marks the lead `converted: true` with a pointer back to the created company/contact. The lead record is retained for historical analysis; it does not auto-populate the CRM.

**Rationale**
- 5,000+ cold leads would drown the CRM and make it unusable for finding real customers.
- Leads and Contacts have different workflows: prospecting cadence vs. relationship management.
- Leads have different data quality (bulk CSVs with wrong numbers, dead emails). Isolating that mess protects the CRM.
- The convert moment is a meaningful handoff from sales-chasing-prospects to ops-serving-customers. Making it explicit is a feature, not overhead.
- Pattern aligns with HubSpot, Salesforce, Pipedrive — this is the industry-standard split.

**Consequences**
- Users need clear UI messaging that leads are *not* in the CRM until converted.
- The convert flow must handle both "create new company" and "attach to existing company" paths.
- Lead search and CRM search are separate; there is no unified "find any person" search (could be added later as a read-only federated view if needed).

---

## ADR-002 — Sites are physical (coords = identity); ownership is a mutable relationship

**Status:** Accepted · **Date:** 2026-04-24

**Context**
A site is a real-world physical location identified by coordinates. Over time, ownership may change: a deal with Company A falls through, Company B picks up the same site months later; or the same site is re-engaged years after an initial PIDDR run. If we make `(coords, company)` a composite key, we end up with duplicate site records, broken PIDDR history, and split cached infrastructure data.

**Decision**
The `Site` entity's identity is its **coordinates** (with dedup rounding in the UI). A site has a **`currentCompanyId`** field that is mutable, plus an append-only **`companyHistory`** log tracking every ownership change with timestamp, actor, and reason. PIDDR cache, infrastructure results, and other data stay attached to the Site and survive company reassignment.

**Rationale**
- Deals fall through; re-engagements happen. This is a real business pattern.
- PIDDR and infrastructure data (substations, lines, plants) are properties of the location, not the customer. They should be preserved across ownership changes.
- Append-only history is trivial to implement and gives us audit trail for free.
- This matches how a land registry works in the real world.

**Consequences**
- UI must show current owner prominently but also expose prior owners when relevant (history view).
- Reassigning a site does not delete projects under the prior owner — those stay in the prior company's history.
- Projects store `companyId` *and* `siteId`; a project's company is the company who owned the site at the time the project was created, not necessarily the site's current owner.

---

## ADR-003 — One Project per dimension per site; linked via `parentProjectId`

**Status:** Accepted · **Date:** 2026-04-24

**Context**
A site may pass through pre-con → construction → REP over its lifetime. We considered a single `Project` entity with a `phase` field that advances as the work progresses. We considered separate projects per dimension with no link. We settled on separate projects per dimension with an explicit parent-child link.

**Decision**
Each dimension gets its own `Project` record. When a pre-con project graduates to construction, a **new** construction project is created under the same company (usually same site), with `parentProjectId` pointing to the pre-con project. Same for construction → REP.

**Rationale**
- Pre-con, construction, and REP have very different deliverables, teams, and access patterns. Collapsing them into a single entity with a phase field means every query has to branch on phase.
- Separate projects give each dimension its own folder skeleton, its own status lifecycle, and its own set of users.
- `parentProjectId` preserves the lineage so we can answer "how did this REP contract come to be?" by walking up.
- Each transition is a meaningful business event (approval, handoff, contract signing) that deserves a distinct record.

**Consequences**
- "Graduate to Construction" and "Graduate to REP" are explicit actions in the UI.
- Direct-entry construction projects (no pre-con) have `parentProjectId: null` — this is valid.
- Reporting ("all work on site X") requires walking the project chain, but site-scoped queries handle this naturally.
- Multiple projects per dimension per site are allowed (re-engagement, scope split).

---

## ADR-004 — Three independent axes of access control

**Status:** Accepted · **Date:** 2026-04-24

**Context**
The current auth model gates access by tool (`allowedTools`). This is insufficient for the new platform: a field photographer needs to access the Construction tool but only upload/view photos, not invoices or NDAs. An accountant needs access across all dimensions but only for invoices. A pre-con analyst needs full access to pre-con but no REP contracts.

**Decision**
User access is gated by **three independent axes**, composed per user:

1. **`allowedTools: ToolId[]`** — which tools appear on the dashboard (existing).
2. **`allowedDimensions: ('preCon' | 'construction' | 'rep')[]`** — which business dimensions appear and which project tabs show on a company.
3. **`documentCategories: DocumentCategory[]`** — which document types a user can view/upload.

All three are checked at query time (Firestore rules) and filter time (UI). Admin bypasses all three axes.

**Rationale**
- Tool-level access alone is too coarse — can't distinguish within a tool.
- Document-only permissions don't gate dimensions.
- Orthogonal axes compose naturally to cover every role we can think of.
- Simpler than a full RBAC with custom permission strings — each axis is a bounded enum, easy to reason about.

**Consequences**
- User Management screen needs three multi-select pickers instead of one.
- Firestore security rules get more complex (three conditions AND-ed).
- Need explicit test coverage per role profile and an admin "view as user" debug tool.
- Permission changes propagate at next page load (Firebase auth token refresh cycle, max 1 hour).

---

## ADR-005 — Site Pipeline (Kanban) is deprecated

**Status:** Accepted · **Date:** 2026-04-24

**Context**
The current Site Pipeline is a Kanban board that was intended to track site requests through stages (new → ongoing → done). Per the product owner, the pipeline is not actively used. The new Construction tool will provide a faster project-list view, and pre-con intake is handled by the Site Request form (which now auto-drafts companies in the CRM).

**Decision**
The Site Pipeline is deprecated. After the new Construction tool ships (M5) and the Site Request intake is re-wired (M6+), the Site Pipeline route, component, and associated collection state are removed in M8. The underlying Site Request submissions are preserved as an intake queue view in Pre-Con.

**Rationale**
- Unused features create maintenance overhead and user confusion.
- The Construction project list (flat, filterable) serves the "where are my active projects" question faster than a Kanban.
- Pre-con intake is better served by a simple triage queue than a multi-stage board.

**Consequences**
- `/site-pipeline` route removed in M8.
- `PipelineColumn.tsx` and `RequestCard.tsx` components removed.
- The tool card is removed from the dashboard at the start of M8.
- `ToolId: 'site-pipeline'` removed from `ALL_TOOL_IDS`.

---

## ADR-006 — Hybrid folder model: system skeleton + user-added folders

**Status:** Accepted · **Date:** 2026-04-24

**Context**
We considered two extremes for document organization: a fully flexible folder tree (users create anything anywhere) and a fully hard-coded structure (pre-defined categories, no custom folders). Fully flexible is chaos; fully hard-coded breaks down the moment a project has unusual requirements.

**Decision**
**Hybrid model.** Each project, on creation, gets a **skeleton of system folders** based on its dimension (e.g., pre-con gets `Legal · PIDDR · Deliverables · Invoices`). System folders cannot be renamed or deleted. Users can add their own nested subfolders and files anywhere.

**Rationale**
- Skeleton enforces consistency for the 80% of documents that fit standard categories — accountants always find invoices in `Invoices`.
- User-added folders absorb the 20% of project-specific oddities without forcing a schema change.
- Makes permission enforcement tractable — system folders carry a `systemCategory` that maps to document categories; user folders inherit from their parent's effective category.

**Consequences**
- Project creation wizard must seed folders atomically with the project.
- System folders have `kind: 'system'` and render differently in the UI (locked icon, no delete option).
- If dimension defaults change later, existing projects keep their old skeleton — migration is opt-in.
- Templates library (under Settings) is separate from project folders and lives in global `/templates/` Storage prefix.

---

## ADR-007 — Firebase Storage + Firestore metadata (not Google Drive, not Cloudflare R2)

**Status:** Accepted · **Date:** 2026-04-24

**Context**
For document storage, we evaluated three options:
1. Firebase Storage (blob) + Firestore (metadata)
2. Google Drive API integration (files live in Google Drive)
3. Cloudflare R2 (S3-compatible, pairs with Cloudflare Pages deploy)

**Decision**
**Firebase Storage for blobs, Firestore for metadata.**

**Rationale**
- We already use Firebase for auth and data. Adding Storage reuses the same SDK, same auth context, same billing.
- Firestore metadata means folder trees are virtual (just metadata) — trivial to attach one document to multiple folders if ever needed, trivial to move documents without moving blobs.
- Google Drive gives real-time editing but loses single-source-of-truth — files live in a user's personal Drive, auth is per-user OAuth, and it's awkward to enforce org-wide permissions. User confirmed documents are primarily PDFs and images (view-only), so live editing is not a requirement.
- Cloudflare R2 is cheaper on egress but adds another auth system and another vendor. Not justified at medium volume.
- Firebase Storage signed URLs handle inline PDF preview and image display natively.

**Consequences**
- Medium-volume limits are fine for Firebase Storage's free tier and paid plans.
- If editing becomes a requirement later, a "Open in Google Docs" action can upload temporary copies to a shared Drive without changing the storage backbone.
- Storage costs scale with blob count and size; no CDN caching by default (Cloudflare R2 would have been cheaper here, but this isn't a bottleneck at current scale).
- Full-text search inside documents is not provided. Search is metadata-only (filename, category, uploader) — see PRD non-goals.

---

## ADR-008 — Contacts belong to one current company (no multi-company)

**Status:** Accepted · **Date:** 2026-04-24

**Context**
A person may move between companies over time (Jimmy works at Acme, leaves for Widget Co.). Modeling contacts as `Contact ⟶ N Companies` via an employment join table captures this accurately but adds complexity to every contact-facing query and UI.

**Decision**
A contact has exactly one `companyId` at any time. If a contact moves, update `companyId` in place. No employment history.

**Rationale**
- Product owner confirmed this is rare and not currently tracked.
- Simpler data model, simpler UI, simpler queries.
- If the need arises, this can be extended later by adding an `employmentHistory` array or a separate `employments` collection without breaking existing records.

**Consequences**
- Historical information (who was the contact at Acme three years ago?) is lost when a contact moves. If this becomes important, revisit with a new ADR.
- Contacts duplicated across companies (same name/email at two companies) are two separate records. No dedup.

---

## ADR-009 — Companies must exist before Sites; Site Request form auto-drafts a Company

**Status:** Accepted · **Date:** 2026-04-24

**Context**
Today, sites exist in the registry without any company link. In the new model, every site must have a `currentCompanyId`. The question: do we require admins to create a company first, or should the system auto-create one in some flows?

**Decision**
A Site cannot exist without a `currentCompanyId`. Two paths create companies:
1. **Explicit** — admin creates a company in the CRM, then links sites.
2. **Implicit** — Site Request form auto-drafts a Company (`status: 'prospect'`, `source: 'site-request'`) when a request comes in without a matching existing company.
3. **PIDDR save** — when a user runs PIDDR, they must select an existing company or create one on the spot via a modal.

Legacy sites (pre-migration) are attached to a synthetic "Legacy — Unassigned" company and flagged for admin reassignment.

**Rationale**
- Prevents orphan sites, which are the root cause of "whose site is this?" confusion.
- Draft companies are an acceptable compromise — they represent genuine in-flight intake work, not noise, and admins can promote/merge them later.
- Every touchpoint that creates a site is already a UI flow where prompting for company is natural.

**Consequences**
- Legacy migration needs a clearly labeled "unassigned" company and a UI affordance to bulk-reassign sites.
- Site Request form gets a "Company name" field (prefills a draft).
- PIDDR gets a company-picker modal on save.
- Prospect-status companies should be filterable in the CRM and potentially auto-archived if inactive for N months (future policy).

---

## ADR-010 — No document version history; last-upload wins

**Status:** Accepted · **Date:** 2026-04-24

**Context**
Some document management systems retain prior versions when a file is re-uploaded. This is useful for audit and rollback but adds schema complexity (version arrays, revert actions, storage cost for dead blobs).

**Decision**
No version history. Each Document record is a single file. Re-uploading with the same name creates a **new** Document record; the old one is retained unless explicitly deleted by the user. `uploadedAt` and `uploadedBy` fields on the Document record are the only version-like signal.

**Rationale**
- Product owner confirmed versioning is not needed; "last upload" date is sufficient.
- Keeps schema and UI simple.
- If a user wants to keep prior versions, they can rename the old file (`nda-v1.pdf`) before re-uploading the new one.

**Consequences**
- Accidental overwrites are not automatically recoverable. A delete + upload of the same filename looks like a version replacement but is not atomic.
- If audit requirements arise later (e.g., regulatory compliance on financial docs), revisit with a new ADR.

---

## Template for future ADRs

```
## ADR-NNN — Short imperative title

**Status:** Proposed | Accepted | Superseded by ADR-XXX · **Date:** YYYY-MM-DD

**Context**
What's the situation forcing a decision?

**Decision**
What did we decide? Be specific.

**Rationale**
Why this decision over alternatives? What alternatives were considered?

**Consequences**
What does this decision make easier? Harder? What has to change downstream?
```

## Sign-off

- [ ] Product owner
- [ ] Engineering lead
- [ ] Date:

Once ADRs are ratified with the PRD and ERD, migration plan and milestone breakdown are produced next.
