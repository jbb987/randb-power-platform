# Product Requirements — Unified CRM + Document Platform

> **Status:** Draft (v0.1) — awaiting sign-off before ERD & migration plan are finalized.
> **Scope:** Architectural overhaul to unify customer, project, and document management across all business lines of the R&B Power Platform.

---

## 1. Problem statement

Today the platform is a collection of standalone tools (PIDDR, Water, Gas, Broadband, Power Calculator, Sales CRM, etc.) that share the Sites Registry but nothing else. Customer information lives nowhere. Documents (NDAs, agreements, allocation letters, one-line diagrams, invoices, photos) live nowhere. When a site moves from consulting to construction to electricity supply, the institutional knowledge is scattered across emails, local drives, and the heads of whoever was on the deal.

We need a single spine — a **CRM** — that every customer, site, project, and document attaches to, with three distinct business dimensions operating on top of it.

## 2. Business dimensions

The company operates in three verticals, each with its own workflow but sharing customers:

| Dimension | What it does | Primary deliverables |
|---|---|---|
| **Pre-Construction** (consulting) | Customer gives coordinates → we produce due diligence (PIDDR, water, gas, broadband) → customer decides whether to proceed | PIDDR report, letter of allocation, one-line diagram, NDA, agreement, invoices |
| **Construction** | Customer has an approved site → we build it → site is energized | Photos, checklists, invoices, deliverables, signed contracts |
| **REP** (retail electricity) | Customer needs to buy electricity → we sell to them → we supply | Contracts, usage reports, invoices |

A single customer may engage with one, two, or all three dimensions over time. The same physical site may pass through all three over years.

## 3. Goals

- **One source of truth for customers.** Every company and contact lives in the CRM and is referenced everywhere else.
- **One source of truth for documents.** Every file is findable by going to the customer, then the project.
- **Preserved lineage across dimensions.** When a pre-con site graduates to construction, the relationship is visible.
- **Role-appropriate access.** A field photographer sees a photo upload form; an accountant sees invoices; neither sees NDAs.
- **Incremental migration.** Existing tools keep working during the rebuild. No flag day.

## 4. Non-goals (explicitly out of scope)

- Version history on documents (last-upload wins; `uploadedAt` is tracked but prior versions are not retained).
- In-browser editing of documents (upload/view/download only; use Google Docs or desktop apps for editing).
- Multi-company contacts (a contact belongs to one current company; update in place when they move).
- Automated workflow engines, BPMN, or complex approval chains.
- External client portal (the platform is internal-only).
- Full-text search inside documents (search is metadata-only: filename, category, uploader).
- Integrations with accounting/email/e-signature systems (v2 concern).

## 5. The mental model (in one sentence)

> **CRM is the spine. Companies have Sites. Sites have Projects (one per dimension). Projects have Folders. Folders have Documents. Leads are a separate prospecting funnel that feeds the CRM on conversion.**

## 6. Dashboard organization

Top-level categories on the logged-in dashboard:

1. **CRM** — Companies & Contacts (cross-cutting hub)
2. **Pre-Construction** — PIDDR, Site Pipeline (deprecated), Water, Gas, Broadband, Power Calculator, Grid Power Analyzer, Site Appraiser, Submit Site Request
3. **Construction** — Construction Projects (new tool)
4. **REP** — Leads, Sales Dashboard, REP Contracts (new)
5. **Settings** — User Management, Templates library

## 7. User roles and access model

Three independent axes of access, composed per user:

| Axis | Field | What it gates |
|---|---|---|
| Tools | `allowedTools: ToolId[]` | Which tool cards appear on the dashboard |
| Dimensions | `allowedDimensions: ('preCon' \| 'construction' \| 'rep')[]` | Which dimension categories appear and which project tabs show on a company |
| Document categories | `documentCategories: DocumentCategory[]` | Which document types a user can view/upload |

Document categories: `photo`, `invoice`, `report`, `legal` (NDA/agreement), `deliverable` (allocation letter/one-line), `other`.

Admin bypasses all three axes.

### Example role profiles

- **Admin** — all tools, all dimensions, all categories.
- **Pre-con analyst** — CRM + pre-con tools; pre-con + CRM dimensions; all categories.
- **Construction manager** — CRM + Construction; construction + CRM dimensions; all categories.
- **Field photographer** — Construction only; construction dimension; `photo` only.
- **Accountant** — CRM + Construction + REP; all dimensions; `invoice` only.
- **REP salesperson** — Leads + Sales Dashboard + CRM; REP + CRM dimensions; `legal` + `deliverable`.

## 8. Success criteria

The system is working if:

1. An admin can create a company, add a contact, link a site, upload an NDA, and find all of it two weeks later without asking anyone.
2. A field photographer can log in, see one project, upload ten photos, and log out — with no access to anything else.
3. A cold lead can be converted to a customer with one click, preserving the lead's call/email history as a trace.
4. A site that went pre-con → construction → REP shows all three projects under the same company, linked in lineage.
5. Deleting a company is either blocked (has active projects) or cascades cleanly (all projects, folders, documents, storage objects).
6. Existing PIDDR reports generated before the migration still open correctly.
7. No duplicate company records exist after migration (every pre-migration site has exactly one company).

## 9. Key user stories (walkthroughs)

These exist to verify the design. If a story is awkward to walk through, the model is wrong.

### Story 1 — Cold lead → customer → built site
1. Sales uploads 500 leads via CSV into Leads (REP).
2. Over weeks, one says yes. Salesperson marks it **Won**.
3. Clicks **Convert to Customer** → modal prefilled → confirms → Company "Acme Corp" + Contact "Jimmy, Head of Energy" created in CRM. Lead record stays in Leads marked `converted`.
4. Weeks later, Acme sends coordinates for a site.
5. Pre-con analyst opens PIDDR → picks Acme as company → runs report. Site is auto-linked to Acme; pre-con project auto-created.
6. Deal approved → analyst clicks **Graduate to Construction** on the pre-con project → construction project created, linked via `parentProjectId`, key docs auto-referenced.
7. Field team uploads photos under construction project → Photos folder; accountant uploads invoices → Invoices folder; legal uploads signed agreement → Legal folder.
8. Site energized → user clicks **Graduate to REP** → REP project created for ongoing electricity supply contract.

### Story 2 — Walk-in direct to construction
1. Customer calls; site is ready to build. No pre-con history.
2. User opens CRM → **Add Company** → **Add Contact**.
3. Opens Construction → **New Project** wizard → selects company, enters coordinates → skeleton folders created.
4. Team works the project with no pre-con lineage. `parentProjectId = null`.

### Story 3 — Field photographer
1. Admin creates user: `allowedTools = ['construction', 'crm']`, `allowedDimensions = ['construction']`, `documentCategories = ['photo']`.
2. Photographer logs in — dashboard shows Construction and CRM only.
3. Opens Construction → sees project list (read-only).
4. Opens project → only **Photos** folder is visible; upload button works. All other folders hidden.

### Story 4 — Reassigning a site after a deal falls through
1. Site X was linked to Acme during pre-con. Deal falls through.
2. Widget Co. picks up the same site.
3. Admin opens Site X → **Reassign** → picks Widget Co.
4. Site's `currentCompanyId` changes; pre-con project for Acme closes (status `cancelled`); new pre-con project under Widget Co. can start.
5. Acme's archived pre-con project remains visible in Acme's history; PIDDR history on the site itself is preserved.

### Story 5 — Accountant finding unpaid invoices
1. Accountant has `documentCategories = ['invoice']` only.
2. Opens CRM → filters companies by "has open invoices."
3. Opens a company → Documents tab shows only invoices across all that company's projects.
4. Downloads/marks invoices without seeing any other document type.

### Story 6 — Site request intake
1. Prospect submits a site request via the public form with coordinates and company name.
2. System searches CRM for a matching company. If found, attaches request; if not, creates a **draft Company** (`status: prospect`) and attaches.
3. Request appears in Pre-Con intake queue for triage (replaces the deprecated Site Pipeline).

## 10. What exists today, what changes

| Current | Becomes |
|---|---|
| Sales CRM (Leads) | Renamed **Leads** under REP. Keeps pipeline. Gains **Convert** action. |
| Sales Dashboard | Unchanged, moves under REP. |
| PIDDR | Unchanged UX. Save flow now requires picking/creating a company. |
| Sites Registry | Unchanged shape. Gains `companyId` field. |
| Projects (folder groupings in PIDDR sidebar) | Migrated to **Pre-Con Projects** under a migrated Company per folder. |
| Site Pipeline (Kanban) | **Deprecated.** Removed in M8. |
| Site Request Form | Unchanged form. Auto-drafts a Company on submission. |
| User Management | Gains `allowedDimensions` and `documentCategories` fields. |

New tools built:
- **CRM** (Companies + Contacts)
- **Documents** (Firebase Storage + Firestore metadata, folder tree, previews)
- **Construction Projects** (list + wizard + folder access)
- **Templates library** (Settings → blank form downloads)

## 11. Open questions (to resolve before ERD is finalized)

1. **Checklists / stages per project** — are they in scope for v1, or deferred to v2? *Recommendation: deferred. Folders first, then checklists.*
2. **Can a contact belong to multiple companies?** *Recommendation: no, one current company, update in place.*
3. **Can a site exist without a company?** *Recommendation: no — prevents orphans. Site-request form drafts a Company if none matches.*
4. **Company-level vs. project-level documents — strict separation or guideline?** *Recommendation: guideline enforced by UI placement, not hard validation.*
5. **Does deleting a company cascade, or block if projects exist?** *Recommendation: block if any non-archived projects exist; soft-delete with archive otherwise.*
6. **Does PIDDR-generated PDF auto-save to the pre-con project's Deliverables folder?** *Recommendation: yes — it closes the loop between tools and documents.*

## 12. Risks

- **Migration risk.** Existing PIDDR "projects" (folder groupings) don't cleanly map to customers — many were created before customer identity was a concept. Requires manual reassignment by an admin after automated migration into a "Legacy" company.
- **Lead/Contact confusion.** Users may expect leads to appear in CRM. Needs clear UI messaging on the Convert action.
- **Permission complexity.** Three axes of access is powerful but error-prone. Needs explicit test coverage per role profile and a "view as user" admin tool.
- **Scope creep.** Construction and REP dimensions have large unknowns (checklists, contract lifecycle). Must stay firmly out of scope for v1.

## 13. Sign-off

- [ ] Product owner (user)
- [ ] Engineering lead
- [ ] Date:

Once signed off, the ERD (`ERD.md`) is finalized and the milestone breakdown begins.
