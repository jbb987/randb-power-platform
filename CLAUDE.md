# CLAUDE.md — R&B Power Platform

> **Keep this file up to date.** Whenever you add, rename, or remove routes, tools, components, hooks, or lib files, update this document to reflect the change.
>
> **At session start, read `HANDOFF.md` (in repo root) if it exists.** It contains an SBAR-style summary of the most recent meaningful work session — situation, what's shipped, open risks, what to do next. It supersedes anything stale in this file or in auto-memory.
>
> **Whitepaper sync (standing rule, set 2026-06-12):** every shipped modification — new tool, route, schema, pipeline, report change, decision — must also update the Whitepaper content in `src/content/whitepaper/` in the same branch/PR, so the whitepaper tracks every decision and addition. It is the platform's living source of truth for humans.
>
> **`TODO.md` (in repo root) is the live task list** and is auto-loaded by the `SessionStart` hook in `.claude/settings.json`. If the hook is ever disabled, read it manually. **Default behavior: when the user mentions something they need to do, add it to `TODO.md` with a source reference (conversation date, ADR, audit ID). Don't ask — just log it and confirm in one line.**

## Project Overview

Internal tool suite for R&B Power. The **CRM** is the central database (companies, contacts, documents). The **Site Analyzer** (formerly PIDDR / Infrastructure Report) is the analysis tool — input coordinates, run a multi-source analysis (power, broadband, water, gas, transport, valuation), export a PDF, and link the result to a CRM company.

### Tools

- **CRM (Directory)** — Cross-cutting directory of Customers (companies) and People (contacts), shared across Pre-Construction, Construction, and REP dimensions. Toggle between Customers and People, search, add/edit/delete. Fixed-enum tags (`REP` / `Construction` / `Pre Construction` / `Utility`) classify each customer. Each customer has a Documents section (PDFs + images) categorized as Legal / Invoices / Deliverables / Reports / Photos / Other, and a collapsible License Numbers section with free-text fields for the 5 tracked states (OK, TX, AZ, NM, TN). One person can be linked to multiple customers via `Contact.affiliations[]`, each carrying its own title; the Person detail page lets you add/remove/set-primary, and a merge UI on that page combines duplicate people. Mobile-first UI.
- **Large Load Request** (LLR; tool formerly named "Pre-Construction" — renamed 2026-05-27 because "pre-construction" names the _phase_, not this tool's specific workflow) — End-to-end workflow for evaluating a coordinate from "raw site" to "LOA executed", i.e. the utility-facing Large Load Request process. Pick or create a customer, drop coordinates + acreage/MW/$/acre, and the tool runs the financial appraisal, auto-suggests a GO / CONDITIONAL GO / NO GO grade (overridable), opens a request-for-engineer-review with assignment, and drives a utility-aware LOA timeline (Oncor / AEP / Coop / Other — single shared template in v1, per-utility variants drop into `LOA_TIMELINES` in `src/lib/preConWorkflow.ts`). Documents live in the existing folder system via auto-provisioned `cust_{companyId}_precon-root` + `precon_{siteId}_root` system folders + a `Project` record (type='pre-con'). Sites stored in `preconstruction-sites`; the linked appraisal lives on the existing `sites-registry` entry — opening "View site report" deep-links into Site Analyzer for the full multi-source analysis. **Convert from Site Analyzer:** a "Track in LLR" button on `SiteAnalyzerDetail` (and a "From existing analyzed site" mode in `/llr/new`) calls `createPreConSiteFromRegistry` (see `src/lib/preConSites.ts`) to spin up an LLR site that **reuses** an already-analyzed `SiteRegistryEntry` — no re-run, no quota burn. The new PreConSite's id is deterministic (`precon_${siteRegistryId}`), so duplicate-create races collapse onto the same Firestore doc and `provisionPreConFolders` retries collapse onto the same folder ids. The button switches to "Open in LLR" once an LLR site exists for that registry id (`subscribePreConSiteByRegistryId`/`usePreConSiteByRegistryId`), and is disabled with a tooltip when the analyzed site has no `companyId`. **What stayed Pre-Construction (deliberately):** (1) the Dashboard section header — "Pre-Construction" describes the *phase* that groups Site Analyzer + Grid Power Analyzer + LLR; (2) the **CompanyTag** `'Pre Construction'`— customer tags describe the *activity/phase* the customer is in (alongside REP, Construction, Utility), NOT the software tool. Only the tool was renamed, not the phase. **Legacy code naming:** file names`PreCon*.tsx`, types `PreConSite`/`PreConLoaStep`/`PreConEngineerStatus`, hooks `usePreCon*`, functions `createPreConSite`/`provisionPreConFolders`, Firestore collection `preconstruction-sites`, folder ID prefixes `_*precon-root`/`precon*_\_root`all keep the original`PreCon`/`precon`naming for migration-safety — purely cosmetic, no user impact. Read-time normalization in`normalizeToolId`(ToolId`'pre-construction'`→`'large-load-request'`) keeps existing `users/{uid}.allowedTools`correct without a hard migration; the script`scripts/migrate-precon-to-llr.mjs`updates`users.allowedTools`and the pre-con-root folder display name in place. Legacy`/precon*`URLs redirect to`/llr*`via`LegacyPreConRedirect`in`src/App.tsx`.
- **Site Analyzer** — Site analysis tool. Enter coordinates → runs land valuation, power, broadband, transport, water, gas, labor, and political radar analyses in parallel. Saves results to the site registry, optionally linked to a CRM company. PDF export. Three routes: index (`/site-analyzer`) lists all sites with search; new (`/site-analyzer/new`) is the entry form; detail (`/site-analyzer/:siteId`) is a tabbed view with one section visible at a time. **Executive Summary tab (customer pitch sheet):** the first/default tab on the detail page is a pure-visual, customer-facing **Executive Summary** — the inverse audience of the 12-page report (which targets the land owner). It's both demoed on screen and exported as a single-page PDF. It leads with a hero **MW target** (read-only, follows the decided `mwCapacity`) + a compact left-aligned **Ramp Schedule** (year-by-year buildout, auto-starting next calendar year; `src/lib/rampSchedule.ts`). The auto ramp uses a 100 MW/year base cap that **auto-scales up so the ramp never exceeds ~12 years** (a 6.6 GW site ramps in ~12 yrs, not 66; sub-1.2 GW sites are unaffected). The ramp can also be **hand-edited** per year via `RampScheduleEditor` (edit-mode form) — MW _added_ each year, stored as `customRamp: number[]` on `SiteRegistryEntry` (empty ⇒ auto); `rampFromIncrements()` builds the schedule and both screen + PDF read it through `buildExecutiveSummaryModel`. MW capacity input goes up to **10,000 MW (10 GW)** via a log-scaled `PowerSlider` + typed number box. Below that, each analysis section renders as a **mini executive summary** — a titled block of label/value rows mirroring the full section reports: **Power** (RTO/ISO, Utility Territory, Transmission Provider, nearest substation), **Connectivity** (county-aware fiber cascade + best download), **Water** (Flood Risk / Wetlands / Drought / Precipitation), **Gas** (combined-cycle demand + nearest pipeline), **Transport** (interstate/airport/rail/port). A "Download PDF" button renders the sheet (`SiteExecutiveSummaryPdfDocument` via `useExecutiveSummaryPdfExport`). Both screen and PDF are fed by one synthesis layer (`src/lib/executiveSummary.ts` → `buildExecutiveSummaryModel`). **Per-section locks:** each lockable tab (Power, Broadband, Transport, Water, Gas, Labor, Political) has a lock icon. After a successful run a section auto-locks; "Re-analyze" then skips locked sections and only re-runs the unlocked ones. "Unlock all" clears every lock; the Re-analyze button is disabled when every section is locked. Stored as `sectionLocks` on `SiteRegistryEntry`. Political Radar ingest pipeline (federal layer): `refreshFederalBills` (daily, Congress.gov bills + joint resolutions filtered by threat keywords) and `refreshFederalOfficials` (weekly, all 535 current Congress members) Cloud Functions write to `political-radar-tracked-bills` and `political-radar-federal-officials` Firestore collections; the client reads from those collections — no Congress.gov API key in the browser bundle. **Exhibit A (Phase A deliverables) report alignment (v1.60.0):** the report PDF satisfies the contract content while **never mentioning Exhibit A or using contract phrasing in the document itself** (user decision 2026-06-12 — it must read as a report, not a checklist; a dedicated "General Project Information" page was removed as repetition, and LSE was dropped entirely). Coordinates live on the cover + Key Metrics; county on Key Metrics. The single contract-derived page is **Capacity & Load Viability**: Status row (GO / CONDITIONAL GO / NO-GO from the linked LLR grade, else auto-suggested from the appraisal), Target Capacity, a deliberately static "Initial Load (20–50 MW): Supported" row, Feed Redundancy (dual/single feed from independent 100 kV+ substations within 5 mi; row omitted when none), Interconnection Cost (ROM) + a ROM Cost Basis row (cost tier always matches the named target station), Electricity Price (industrial + commercial), and the Ramp Schedule table reusing `customRamp`/auto ramp. **Ramp invariant (2026-06-12):** the schedule always lands exactly on the site's decided MW — custom per-year increments only redistribute pace (overshoot clamps, shortfall auto-completes at the standard cap); enforced in `rampFromIncrements({ targetMW })`, consumed by the Executive Summary (screen + PDF) and the report alike. Later review passes REMOVED these PDF pages/blocks (deliberate, do not re-add): General Project Information, ERCOT/SPP Grid Assessment, Data Center Metrics, Constraints & Fatal Flaws, the standalone Recommendation page, the County Power Queue page, the broadband OSP Engineer Assessment, the gas Local Distribution subsection, all data-source attributions (no ACS/HIFLD/vintage strings; FEMA/TCEQ stay as substance) and the Esri imagery credits. All synthesis is pure in `src/lib/exhibitA.ts` (`buildExhibitAModel`, `cleanGridName` rewrites UNKNOWN*/TAP* HIFLD names); composed in `usePdfExport`. The Power section (screen) embeds `GridContextMap` (MapLibre satellite + substation markers by voltage class) and the PDF embeds the equivalent canvas-rendered `buildGridStaticMap` image. The broadband OSP Engineer Assessment block was removed (advisory text, deliberately dropped); drought fetch failures render a friendly note instead of the raw error; the contact page email is bwest@randbpowerinc.us. **Deliberate product decision (do NOT "correct"):** infrastructure STATUS `"NOT AVAILABLE"` (status unknown in the source data) is intentionally displayed as **"Capacity Available"** in tables and PDF pills — JB's call (2026-06-12): unknown status is treated as upgradeable/serviceable. The Exhibit A capacity _prose_ still derives from voltage class + distance, not from status. The report PDF shows no data-source names and no imagery credits (user decision; note: Esri's ToS technically asks for attribution on its imagery — accepted risk).
- **Grid Power Analyzer** — Interactive MapLibre GL map showing power generators, transmission lines, substations, and available capacity with heat map overlay. Coordinate search with gold diamond pin.
- **Market Intelligence** (toolId `market-intel`, route `/market-intel`, lives in the **Pre-Construction** dashboard section) — Live, capture-only feed of US data-center **deal** news, auto-collected so the team stops doing manual market research (MVP "Layer 1: the listener"). A scheduled Cloud Function `refreshMarketIntel` (every 6h, `us-east1`) pulls from three free/keyless sources — **GDELT** DOC 2.0 (US-scoped), **trade-press RSS** (Data Center Dynamics + Data Center Knowledge; Data Center Frontier has no clean public feed and arrives via Google News), and **Google News RSS** — runs a two-stage **topic+event keyword filter** (the shared `functions/src/shared/twoStageClassify.ts` engine, also used by Political Radar's bill filter; market-intel keyword lists live in `functions/src/marketIntel/keywords.ts`, source URLs/queries in `functions/src/marketIntel/sources/config.ts`), applies **light regex tags** (first US state, MW figure, $ amount — _not_ an LLM), dedupes by `sha256(normalizedUrl)` doc id, and upserts into the `market-intel-feed` Firestore collection with `{ merge: true }`. Last-run state lives in `market-intel-meta/feedRefresh`. The client reads the collection (no external call from the browser, no API key in the bundle) and renders a searchable, source/state-filterable feed with near-dup clustering (by `titleKey`) and per-story read/archive. `status` is the only client-mutable field — the ingest job never writes it, so re-ingesting a URL never resets read/archived. **Capture-only:** stores the article + light tags; LLM structured extraction (developer/MW/acres/capex/stage), cross-outlet entity resolution, and the land-identification → county-deed → analysis layers are deferred phases.
- **One-Line Generator** (toolId `one-line-generator`, route `/one-line-generator`, lives in the **Pre-Construction** dashboard section) — Generates utility-grade electrical **one-line diagrams from a structured site spec** instead of hand-drawing them. The pure, framework-agnostic engine in `src/lib/oneLine/` takes an `OneLineSpec` (ultimate MW, phasing, feed type, voltages, MVA/transformer, pf) → derives the electrical design (transformer count via the **N-1 firm rule**, conductor by MW, per-feed amps, bus ratings, representative RMU cell count) → lays it out on a **computed parametric grid** (fixed voltage-tier bands × constant lane pitch + content-sized panels) so labels/lines/boxes **cannot overlap at any MW**. One geometry model serializes to **SVG** (live preview + PDF via offscreen-canvas→jsPDF). Symbols follow **IEEE 315 / ANSI Y32.2 + IEEE C37.2 device numbers**, matched to JH Operating Co's house style (Δ–Y winding transformers via an SVG `path` primitive, knife-switch disconnects, "52" breakers, filled junction dots, fine line weights). Topology is the fixed data-center pattern (dual/single 138 kV feed → main-tie-main bus → step-down transformers → split 13.8 kV bus w/ N.O. tie → RMU cells → 480 V MDP → standby gens). Saved diagrams persist as `OneLineDocument` (spec + metadata; the drawing is **regenerated from spec**, never stored) in the `one-line-diagrams` Firestore collection. The New form can **prefill from a Site Analyzer `SiteRegistryEntry`** (name/MW/coords). Study-stage, unstamped output (a PE seals for construction). Engine proof harness: `scripts/oneLineProof.ts` (`npx tsx`).
- **Labor Pool (Site Analyzer section only)** — County-anchored workforce data: population, labor force, unemployment, education, commute, industry mix, occupational wages, with state/national benchmarks. Live: FCC Area API (county FIPS, CORS-friendly), Census ACS 5yr (population/labor/education/commute), BLS QCEW (private-sector industries by NAICS supersector, county-level), BLS OEWS (occupations + hourly wage percentiles, state-level). MSA resolution requires a server-side proxy (Census Geocoder is CORS-blocked); `resolvedMsa` is null in the browser today. Optional `VITE_BLS_API_KEY` raises the BLS quota from 25 → 500 requests/day.
- **Leads (Sales CRM)** — Lead management for the sales team. Tracks leads through call/email outreach sequence (New → Call 1 → Email → Call 2 → Final Call → Won/Lost).
- **Sales Dashboard** — Admin-only aggregated view of sales performance. Leaderboard, pipeline breakdown, conversion rates.
- **Bailey Project** and **Construction Projects** — Two instances of the same project-tracker tool, kept separate so the CEO's personal data and the construction team's data never mix. Each instance has overview, team (Owner/GC + subcontractors + supervisors + project managers + labor), tasks, photos, documents, and timeline. Permission levels derived from per-project membership: Admin (global) sees everything; a Supervisor sees and edits projects they're assigned to; Labor sees only assigned projects and can update their own task status + upload photos. The category-based **Documents** section (`JobDocumentsSection`) supports **Rename** and **soft Archive** (recoverable via an "Archived" trash toggle with Restore) in addition to upload/download — archive flips an `archivedAt` flag and never deletes the Storage blob, matching the folder system's no-deletion policy. Rename/archive/restore are gated on `canDeleteDocuments` (admin/PM).
  - **Bailey Project** — toolId `construction-tracker`, route `/construction-tracker/*`, collection `construction-jobs`, storage prefixes `construction-photos` + `construction-documents`. Lives in the **Company** dashboard section.
  - **Construction Projects** — toolId `construction-projects`, route `/construction-projects/*`, collection `construction-projects-jobs`, storage prefixes `construction-projects-photos` + `construction-projects-documents`. Lives in the **Construction** dashboard section.
  - Both tools share the same React components, hooks, and lib files. The active collection/storage/route is injected at the route boundary via `<JobToolConfigProvider config={...}>` in `App.tsx`; hooks call `useJobToolConfig()` to read it. To add a third instance, define a new `JobToolConfig` in `src/lib/jobToolConfig.tsx`, add a `ToolId` entry, and wrap a new route block.
- **User Management** — Admin-only tool to view, manage roles, and remove platform users.
- **Activity Log** — Admin-only audit trail at `/admin/activity`. Cloud Functions Firestore triggers (`onDocumentWrittenWithAuthContext`) on every top-level collection (`crm-companies`, `crm-contacts`, `crm-documents`, `sites-registry`, `construction-jobs`, `construction-jobs/*/tasks`, `leads`, `users`) plus a mirror trigger on `user-history` write activity entries to the `activity` collection. Each entry has actor (uid + email), action (create/update/delete/upload/tool-run/login/view/export), resource (type + id + label + optional parent), changedFields, before/after slice, optional client session fingerprint (`session: { ip, userAgent, timezone }` — present on client-driven login/view/tool-run/export entries), and a pre-rendered summary string. `login` entries fire from the client on every fresh sign-in; `view` entries fire on tool-page opens (via `Layout`) and on detail-page opens with the resource id+label (CRM company/contact, Site Analyzer site, Construction job). Page-view dedupe: 60s per (user, route). Session IP is fetched once per browser tab from `api.ipify.org` and cached in sessionStorage. The Admin Activity page surfaces a banner of suspicious patterns: multi-IP within 1 h, or active-without-fresh-sign-in for 7+ days. Idempotent on Functions v2 eventId. See `docs/activity-firestore-setup.md` for required Firestore rules and indexes.
- **Documents** — Internal document hub. Visible to every authenticated user; the cards on the page are filtered by `UserRole`. Each card opens a Google Drive URL in a new tab — no API or OAuth involved (Drive enforces access at click time; users can request access if denied). Shortcuts live in `src/lib/documents.ts` (`DOCUMENT_SHORTCUTS` array, role-gated). Today: My Documents (personal Drive) + Templates (shared folder). Add more shortcuts (HR, Legal, etc.) by appending to the array. _(Note: PR 4.2 will repurpose this tool into a cross-customer search across the new `documents` collection.)_
- **Whitepaper** — Living platform documentation presented as a docs site. **Access is allowlist-only** — tighter than any role, admins included: `WHITEPAPER_ALLOWED_EMAILS` in `src/lib/whitepaperAccess.ts` (currently just jb@randbpowerinc.us) gates both the routes (in-tool redirect) and the dashboard card (`restrictedToEmails`, checked before the admin bypass in `isToolVisible`). The tool is lazy-loaded (`React.lazy` in `App.tsx`) so the doc content ships in its own chunk, not the main bundle. Layout: grouped section nav on the left (Platform / Tools / Backend & Data), content on the right, prev/next pager, per-section URLs (`/whitepaper/:sectionId`). Content lives in `src/content/whitepaper/` — platform-level pages are free-form TSX composed from `DocBlocks` typography primitives; tool pages are data-driven (`toolDocs.tsx` entries rendered through `ToolDocTemplate`, one uniform shape: purpose / access / routes / how-it-works / data sources / key files). Sections register in `src/content/whitepaper/registry.tsx` (drives sidebar, routing, and pager). Unwritten parts render explicit `DocPlaceholder` blocks — fill them progressively and keep this doc in sync with shipped changes. Lives in the **Settings** dashboard section.
- **To-Do List** — Per-user private task list (toolId `todo-list`, route `/todo-list`, available to all authenticated users). Add / edit / complete tasks with category, priority, and due + "do on" dates. Backed by the owner-scoped Firestore collection `user-tasks` — each doc carries an `ownerUid` and a user reads/writes only their own rows (the platform's first owner-scoped collection; Firestore rule documented in `docs/firestore-rules.md`). Active tasks sort **overdue → priority (high→normal→low) → soonest date → newest-created**; done tasks show most-recently-completed first. A category filter and an active/done toggle narrow the view. Lives in the **Company** dashboard section.

### Folder & Document System (Phase 1+2 shipped, partial Phase 3+4)

Customer-rooted folder tree replacing the legacy 6-category flat doc model. Mounted as the **"Folders"** section on the CRM customer profile and as **"Project folders"** scoped to a project's subtree on the construction tracker detail pages (both Bailey Project and Construction Projects). Built around three new Firestore collections (`folders`, `documents`, `customer-projects`) and one shared component (`FolderBrowser`). The legacy `DocumentsSection` (the pre-migration 6-category flat upload UI) was retired on 2026-05-27 once the folder system stabilized — its component, hook (`useDocuments`), and lib (`crmDocuments.ts`) are deleted; only the `crm-documents` Firestore collection itself is preserved as a rollback safety net (see Migration below).

- **Browse**: tile grid + breadcrumb, click a folder to drill in, click a doc to open via Storage signed URL.
- **Mutate**: + New folder (modal), + Upload (multi-file picker, dropped into current folder), Rename / Archive via kebab menu.
- **No deletion**: "Delete" is renamed Archive — Storage blobs are never removed. Archived items live in a Trash view toggled from the header; each has a Restore button that returns it to its original location.
- **Per-folder access**: Manage Access modal on every folder/doc with two axes (view, edit) × three modes (inherit / admin-only / specific people). Admins always pass — they don't appear in the picker and can't be excluded. Enforcement is client-side for v1; server-side Firestore rule walks of `ancestorFolderIds` are a deferred follow-up.
- **Auto-provisioning**: When a new construction job is created, the customer's `cust_{companyId}_construction-root` folder, the `proj_{jobId}_root` folder, and the `Project` record in `customer-projects` are created idempotently — so new jobs land with a working folder browser, not empty state.
- **Migration**: One-shot script `scripts/migrate-to-folder-system.mjs` (idempotent, default `--dry-run`, `--confirm` to write) moved every existing CRM doc and construction-job doc/photo into the new schema without touching Storage blobs. The legacy `crm-documents` and `construction-jobs/*/documents` collections remain readable as a rollback safety net through **2026-06-13** (30 days post-migration). The legacy UI was removed on 2026-05-27; after the rollback window closes, the collections themselves can be dropped along with the dormant `onDocumentWrite` Cloud Function trigger.
- **Naming convention**: deterministic ids — `cat_{companyId}_{category}`, `cust_{companyId}_construction-root`, `proj_{jobId}_root`, `proj_{jobId}_{category}`, `crmDoc_{originalId}`, `jobDoc_{jobId}_{originalDocId}`, `jobPhoto_{jobId}_{originalPhotoId}`. Re-running migration or auto-provisioning is a safe no-op.
- **Pending work**: PR 3.2 (Pre-Con + REP project types), PR 3.3 (dedicated `/projects/:id` route), PR 4.2 (cross-customer Documents tool refactor), PR 4.3 (UM UI for new roles — partial), Phase 5 polish (ADRs 018–020, ERD/PRD updates).
- **Well Finder** — Admin-only map of Texas oil & gas wells from the RRC. Identifies reactivation candidates (shut-in wells) and acquisition candidates (active wells). Status-colored points with toggleable filters. Production mode reads pre-tiled `wells.pmtiles` from Firebase Storage; dev fallback paginates the live RRC ArcGIS layer. Backend pipeline: monthly scheduled function (`fetchRrcWells`) → Storage trigger (`triggerPmtilesBuild`) → Cloud Run tippecanoe service → `wells.pmtiles`. See `functions/src/wellFinder/README.md`.

## Tech Stack

- **Framework:** React 19 + TypeScript
- **Build:** Vite
- **Styling:** Tailwind CSS v4
- **Routing:** React Router DOM v7
- **Backend:** Firebase (Firestore)
- **Animation:** Framer Motion
- **Maps:** MapLibre GL + React Map GL
- **PDF:** @react-pdf/renderer (local TTF fonts in `public/fonts/`)
- **Deploy:** Cloudflare Pages (pushes to `main`)

## MCP Server (v1.52.1, read-only)

The same Cloudflare Pages Worker that serves the SPA also hosts an MCP (Model Context Protocol) server at `/mcp`, exposing read-only access to the platform's Firestore data so any MCP client (Claude Code, Cursor, Manus via the HTTP-tool fallback, etc.) can query sites, LLRs, CRM, and the activity log without going through the SPA UI. Lives in `mcp/`, separate from the React `src/`.

- **Transport**: streamable-HTTP, stateless mode. Uses `McpServer` + `WebStandardStreamableHTTPServerTransport` from `@modelcontextprotocol/sdk` (the SDK's Workers-compatible Web Standards transport; instantiate a fresh transport per request — stateless transports can't be reused). zod v4 validates tool inputs; the SDK auto-converts schemas to JSON Schema for `tools/list` and wraps thrown handler errors as `result.isError: true` so the LLM sees the failure message.
- **Inbound auth**: single shared bearer token in `env.MCP_BEARER_TOKEN`; constant-time compare in `mcp/auth.ts`.
- **Outbound auth**: service-account JSON in `env.FIREBASE_SERVICE_ACCOUNT_JSON`. `mcp/firestore/auth.ts` signs an RS256 JWT via Web Crypto (`crypto.subtle.importKey` + `crypto.subtle.sign`), exchanges it at `oauth2.googleapis.com/token` for a 1h access token, caches the token in module scope. No `firebase-admin` dep — it's Node-only and unreliable under Workers' `nodejs_compat`. Reads/queries go to `firestore.googleapis.com/v1/projects/{projectId}/databases/(default)/documents/...` via `mcp/firestore/client.ts` (`getDoc`, `runQuery`); `mcp/firestore/decode.ts` converts REST `fields` wire format to plain JS.
- **Tools** (`mcp/tools/`): `list_sites` / `get_site` (sites-registry, with optional section projection — full entry can exceed 50KB); `list_llrs` / `get_llr` (preconstruction-sites); `list_companies` / `get_company` / `list_contacts` (crm-companies, crm-contacts); `get_recent_activity` (activity).
- **Composite indexes**: declared in `firestore.indexes.json`; deploy via `firebase deploy --only firestore:indexes`. Covers utility/grade × updatedAt on LLRs, tags/companyIds × updatedAt on CRM, actor.email/resource.type × timestamp on activity, companyId × updatedAt on sites-registry.
- **Wrangler / secrets**: `wrangler.json` declares `FIREBASE_PROJECT_ID` as a var; service-account JSON + bearer token are secrets set via `wrangler secret put`. Local dev: put the same values in `.dev.vars` (gitignored).
- **Client config**: `claude mcp add randb --transport http --url https://<pages-domain>/mcp --header "Authorization: Bearer $RANDB_MCP_TOKEN"`. Same URL + header works in Cursor / Windsurf / Zed MCP settings. For Manus or any agent platform that hasn't shipped MCP yet, register `/mcp` as a generic authenticated POST tool — each call is a single JSON-RPC POST.
- **Typechecking**: covered by `tsconfig.worker.json` (not in the root `references` — run `npx tsc -p tsconfig.worker.json --noEmit` manually before push). Hooks in `.claude/settings.json` only run on `src/`, so they won't auto-check `mcp/` files.
- **Out of scope**: writes (deferred behind future `MCP_WRITE_ENABLED` flag), analysis-tool wrappers (current `src/lib/*Analysis.ts` are browser-coupled through the Census / FCC CORS proxies), OAuth multi-user (today's bearer is single-user-by-design).

## Project Structure

```
src/
  App.tsx                    # Root routes
  main.tsx                   # Entry point
  version.ts                 # APP_VERSION (semver, displayed in navbar)
  components/
    Layout.tsx                # Shared page wrapper (Navbar + Breadcrumb + content)
    Breadcrumb.tsx            # Route-aware breadcrumb navigation
    ProtectedRoute.tsx        # Auth gate with optional allowedRoles or toolId
    ErrorBoundary.tsx         # Error boundary
    navbar/                   # Navbar, NavLinks, UserMenu, MobileMenu, navConfig
    appraiser/                # Shared widgets used by Site Analyzer's Power Infrastructure section
      ElectricityPriceWidget.tsx  # Electricity price comparison
    site-analyzer/            # Site Analyzer components
      DetailHeader.tsx        # Detail page header (name, company chip, last analyzed, action buttons)
      DetailSummary.tsx       # Read-only key/value table of site inputs (view mode)
      DetailEditForm.tsx      # Edit-mode form (mirrors New form, prefilled, Save/Cancel)
      SectionTOC.tsx          # Sticky horizontal tab nav (one section visible at a time, click tab to switch). Each lockable tab has a lock-icon toggle next to its label; clicking the icon toggles the section's lock without switching tabs.
      SiteOverviewSection.tsx # Site overview with map and property details
      SiteExecutiveSummarySection.tsx # Executive Summary tab (hero MW, ramp schedule, per-section mini-summaries, map, PDF download)
      SiteExecutiveSummaryPdfDocument.tsx # Single-page Executive Summary PDF (react-pdf), fed by buildExecutiveSummaryModel
      MetricCard.tsx          # Shared key/value metric tile (Land Valuation)
      LandValuationSection.tsx # Appraisal metrics and breakdown
      LandCompsPanel.tsx    # Collapsible land comps table (CSV paste, stats, apply to valuation)
      BroadbandSection.tsx    # Broadband results wrapper
      WaterSection.tsx        # Water analysis results wrapper
      GasSection.tsx          # Gas analysis results wrapper
      TransportSection.tsx    # Transport infrastructure results (airports, interstates, ports, railroads)
      LaborSection.tsx        # Labor pool results wrapper
      PoliticalRadarSection.tsx # Political Radar section (federal layer + 4 stub layers)
      CountyQueueSection.tsx  # County-level interconnection queue summary inside the Power Infrastructure section (read-only, fed by useCountyQueueLoad)
      SiteAnalysisPdfDocument.tsx # Full PDF document structure (react-pdf)
    broadband/                # Broadband report (rendered inside Site Analyzer's Broadband section)
      BroadbandReport.tsx     # Due diligence report display
    water/                    # Water report (rendered inside Site Analyzer's Water section)
      WaterReport.tsx         # Water analysis report display
    gas/                      # Gas report (rendered inside Site Analyzer's Gas section)
      GasReport.tsx           # Gas analysis report display
    labor/                    # Labor Pool components
      LaborReport.tsx         # Labor pool report display (used by Site Analyzer Labor section)
    political/                # Political Radar components (rendered inside Site Analyzer's Political Radar section)
      FederalLayerCard.tsx    # Full federal-layer card (sub-score + 5 signals + bills panel + reps panel + why)
      SignalRow.tsx           # Single signal row (status icon + label + summary)
      BillsPanel.tsx          # Tracked bills list (clickable congress.gov links + status + latest action date)
      RepsPanel.tsx           # Federal contacts panel (House rep + 2 senators)
      StubLayerCard.tsx       # Placeholder card for the not-yet-built layers (state/county/city/sub-municipal)
    power-map/                # Grid Power Analyzer components
      PowerMapView.tsx        # Main map container (MapLibre GL)
      MapLegend.tsx           # Layer toggles and source legend
      MapStats.tsx            # Viewport statistics panel
      PlantPopup.tsx          # Power plant info popup
      CoordinateSearch.tsx    # Coordinate/address search with geocoding
      SubstationList.tsx      # Substation data table
      Methodology.tsx         # Map methodology docs
      QueueCard.tsx           # Interconnection-queue summary in substation popup (active/withdrawn/in-service MW, withdrawal rate, top competitors)
    power-calculator/         # Power Infrastructure results (rendered inside Site Analyzer's Power section)
      InfrastructureResults.tsx # Main results display
      PowerPlantsTable.tsx    # Power plants table
      SubstationsTable.tsx    # Substations table
      TransmissionLinesTable.tsx # Transmission lines table
      TerritorySection.tsx    # ISO/utility/TSP territory info
      PoiSection.tsx          # Nearest POI section
      CollapsibleSection.tsx  # Collapsible section wrapper
    crm/                      # Sales CRM (Leads) components
      CrmSidebar.tsx          # Left nav panel (Fresh Leads, Archive, Stats)
      LeadTable.tsx           # Leads table with search
      LeadDetail.tsx          # Lead detail modal with notes + status progression
      LeadForm.tsx            # Create new lead form
      BulkUpload.tsx          # CSV bulk upload modal
      CrmStats.tsx            # Stats dashboard (pipeline, conversion, weekly)
      CrmArchive.tsx          # Archive view with Won/Lost filter
      AdminStats.tsx          # Admin sales dashboard stats
    crm-directory/            # CRM (Companies + Contacts) components
      TagChip.tsx             # Colored pill for company tags
      CompanyPicker.tsx       # Searchable company picker (used by Site Analyzer + Construction Tracker)
    well-finder/              # Well Finder components
      WellFinderMap.tsx       # MapLibre map with PMTiles + live-RRC fallback
      StatusFilter.tsx        # Status toggle panel (right sidebar)
    construction/             # Construction Projects components (folder name kept for git history)
      JobStatusBadge.tsx      # Colored status pill (planning/active/on-hold/completed/cancelled)
      JobForm.tsx             # Create/edit form: name, owner/GC + subcontractors, multi-supervisor + multi PM-contact, labor, dates, budget, description
      JobOverviewSection.tsx  # Read-only overview: companies, address, dates, budget, description
      JobTeamSection.tsx      # Read-only team: supervisors + PM contacts + labor
    admin/                    # Admin-only components
      InfraRefreshPanel.tsx   # Infrastructure data cache refresh panel
    whitepaper/               # Whitepaper (docs) components
      DocBlocks.tsx           # Typography primitives (DocTitle, DocH2, DocP, DocTable, Callout, KeyFacts, DocPlaceholder, ...)
      ToolDocTemplate.tsx     # Data-driven tool doc page (ToolDoc interface) with uniform sections
      WhitepaperSidebar.tsx   # Grouped left nav (desktop)
    PowerSlider.tsx           # MW slider input (used in Site Analyzer land valuation)
    precon/                   # Pre-Construction tool components
      PreConGradePill.tsx       # Colored pill: GO / CONDITIONAL GO / NO GO
      PreConHeader.tsx          # Detail-page header card (name, company link, coordinates, grade)
      PreConAppraisalSummary.tsx # Site analysis section status checklist (8 sections) + appraisal metric cards when populated
      PreConStatusCard.tsx      # Merged Site Status card: assigned engineer + verified MW + GO/CONDITIONAL/NO GO grade in one save
      PreConUtilityPicker.tsx   # Oncor / AEP / Coop / Other picker (with coop name)
      PreConLoaTimeline.tsx     # Vertical LOA step list driven by LOA_TIMELINES + advance buttons
      PreConDocumentChecklist.tsx # Per-request document submission checklist (utility-aware via DOCUMENT_CHECKLISTS); binary status (missing/provided) + progress bar; status on PreConSite.documentChecklist
  pages/
    Dashboard.tsx             # Tool grid (root page "/") — grouped by section
    LoginPage.tsx             # Firebase auth login
    UserManagement.tsx        # User management (admin-only)
  tools/
    SiteAnalyzerIndex.tsx     # Site Analyzer index — list of all analyzed sites with search ("/site-analyzer")
    SiteAnalyzerNew.tsx       # New site analysis form ("/site-analyzer/new"; reads ?companyId, ?lat, ?lng)
    SiteAnalyzerDetail.tsx    # Site analysis detail page with view/edit toggle ("/site-analyzer/:siteId")
    GridPowerAnalyzer.tsx     # Grid Power Analyzer ("/grid-power-analyzer")
    SalesCrmTool.tsx          # Sales CRM / Leads ("/sales-crm")
    SalesAdminDashboard.tsx   # Admin sales dashboard ("/sales-admin")
    CrmTool.tsx               # CRM directory ("/crm") — Companies & People list
    CompanyDetailTool.tsx     # Company detail + edit ("/crm/companies/:id", "/crm/companies/new"). Surfaces linked sites + linked construction jobs.
    ContactDetailTool.tsx     # Person detail + edit ("/crm/people/:id", "/crm/people/new")
    ConstructionTrackerIndex.tsx  # Construction Projects index — list of projects with search + status filter ("/construction-tracker")
    ConstructionTrackerNew.tsx    # New construction project form ("/construction-tracker/new"; reads ?companyId)
    ConstructionTrackerDetail.tsx # Construction project detail page with view/edit toggle ("/construction-tracker/:jobId")
    PreConIndex.tsx           # Pre-Construction index — sites grouped by grade + LOA status ("/precon")
    PreConNew.tsx             # New pre-con site form ("/precon/new"; pick/create company, drop coords, runs appraisal)
    PreConDetail.tsx          # Pre-con site dashboard: appraisal, grade, engineer review, LOA timeline, folders ("/precon/:siteId")
    WellFinderTool.tsx        # Well Finder ("/well-finder") — admin-only map of TX oil & gas wells
    DocumentsTool.tsx         # Documents ("/documents") — admin-only embedded Google Drive folder
    TodoListTool.tsx          # To-Do List ("/todo-list") — per-user private tasks
    MarketIntelTool.tsx       # Market Intelligence ("/market-intel") — US data-center deal news feed (search, source/state filter, near-dup clustering, read/archive)
    WhitepaperTool.tsx        # Whitepaper docs site ("/whitepaper", "/whitepaper/:sectionId") — sidebar + content + prev/next pager
  content/
    whitepaper/               # Whitepaper content (filled progressively)
      registry.tsx            # Section groups + ordered flat list (drives sidebar, routing, pager)
      overview.tsx            # Platform Overview
      architecture.tsx        # Architecture & Tech Stack
      auth-roles.tsx          # Authentication & Roles
      data-model.tsx          # Data Model (Firestore collections)
      data-sources.tsx        # External Data Sources
      folder-system.tsx       # Folder & Document System
      backend.tsx             # Backend Services & Pipelines
      mcp-server.tsx          # MCP Server
      toolDocs.tsx            # One ToolDoc data entry per platform tool
  hooks/
    useAuth.ts                # Firebase auth state + user role + allowed tools
    useSiteAnalysis.ts        # Site analysis generation (all 7 sections in parallel)
    usePdfExport.ts           # PDF generation via react-pdf (12-page report)
    useExecutiveSummaryPdfExport.ts # Single-page Executive Summary PDF generation (react-pdf, lazy-loaded)
    useSiteRegistry.ts        # Site registry real-time subscription
    useUsers.ts               # User management CRUD (admin)
    useLeads.ts               # Lead CRUD operations (Sales CRM)
    useCompanies.ts           # CRM company CRUD + single-company subscription
    useContacts.ts            # CRM contact CRUD, by-company, single-contact hooks
    useBroadbandLookup.ts     # Broadband data lookup (used by useSiteAnalysis)
    useLaborAnalysis.ts       # Labor pool analysis hook
    usePowerMap.ts            # Power map data fetching and state
    useInfraData.ts           # Cached infrastructure data (plants, substations, EIA, solar)
    useInfraLookup.ts         # Power infrastructure lookup (used by useSiteAnalysis)
    useUserHistory.ts         # Per-user activity history
    useUserQuota.ts           # Reactive monthly Site Analyzer quota for the signed-in user (admins unlimited)
    useQueueLoad.ts           # One-shot fetch of substation_queue_load doc by HIFLD ID, with session in-memory cache (no live subscription)
    useCountyQueueLoad.ts     # One-shot fetch of county_queue_load doc by (state, county), session-cached
    useConstructionJobs.ts    # Construction Tracker: list, single-job, by-company hooks
    useJobPermissions.ts      # Per-job permission level (admin/pm/worker/none) derived from membership
    useJobTasks.ts            # Construction Tracker: tasks sub-collection list + CRUD
    usePreConSites.ts         # Pre-Construction: list, by-company, single-site live subscriptions
    usePreConPermissions.ts   # Pre-Construction: per-site permission flags (grade, engineer review, LOA)
    useAnimatedNumber.ts      # Number animation utility
    useUserTasks.ts           # To-Do List: per-user tasks subscription + CRUD (user-tasks)
    useMarketFeed.ts          # Market Intelligence: market-intel-feed subscription + setItemStatus
  lib/
    firebase.ts               # Firebase config + legacy site CRUD
    firebaseErrors.ts         # Firebase error handling
    firebaseInfra.ts          # Firestore CRUD for cached infrastructure data
    siteRegistry.ts           # Site registry CRUD, writeback, dedup, migration
    leads.ts                  # Lead Firestore operations
    crmCompanies.ts           # CRM company Firestore operations (collection: crm-companies)
    crmContacts.ts            # CRM contact Firestore operations (collection: crm-contacts)
    userTasks.ts              # To-Do List Firestore CRUD (collection: user-tasks, owner-scoped by ownerUid)
    marketIntel.ts            # Market Intelligence: market-intel-feed subscription + read/archive status writes
    userHistory.ts            # User activity history operations
    userQuotas.ts             # Monthly Site Analyzer generation quotas (5/month default, per-user override, atomic Firestore increment)
    queueLoad.ts              # Read substation_queue_load doc by HIFLD ID (one-shot getDoc; refreshed weekly by scripts/queue-ingestion)
    constructionJobs.ts       # Construction Tracker Firestore CRUD (collection: construction-jobs). Maintains linkedCompanyIds mirror for array-contains queries.
    constructionTasks.ts      # Construction Tracker Firestore CRUD for tasks sub-collection (construction-jobs/{jobId}/tasks)
    preConSites.ts            # Pre-Construction Firestore CRUD (collection: preconstruction-sites). Auto-provisions Project + folder skeleton on create; ships LOA/engineer workflow helpers.
    preConWorkflow.ts         # Pure helpers: suggestGradeFromAppraisal, LOA_TIMELINES (per-utility), nextLoaStatuses, appendLoaStep; DOCUMENT_CHECKLISTS (per-utility) + checklistForUtility / checklistProgress / effectiveChecklistStatus
    appraisal.ts              # Shared pure computeAppraisal() — used by both Site Analyzer and Pre-Construction
    rampSchedule.ts           # Pure computeRampSchedule() (100 MW/yr base, auto-scales to ≤12 yrs) + rampFromIncrements() for manual per-year ramps
    executiveSummary.ts       # Pure buildExecutiveSummaryModel() — per-section mini-summaries feeding Executive Summary screen + PDF
    projectProvisioning.ts    # Idempotent folder + Project record provisioning (provisionProjectFolders for construction, provisionPreConFolders for pre-con)
    projects.ts               # Customer-projects collection CRUD (type='pre-con'|'construction'|'rep')
    broadbandLookup.ts        # FCC Census Block + ArcGIS BDC API
    waterAnalysis.ts          # Water analysis (FEMA, USGS, NWI, groundwater, drought, NPDES)
    waterAnalysis.types.ts    # Water analysis type definitions
    gasAnalysis.ts            # Gas analysis (pipelines, demand, lateral, LDC, pricing)
    laborAnalysis.ts          # Labor pool analysis orchestrator (FCC Area API + Census ACS + BLS QCEW + BLS OEWS)
    blsLabor.ts               # BLS Public Data API v2 client: QCEW (county industries) + OEWS (state occupations & hourly wage percentiles). VITE_BLS_API_KEY optional.
    politicalRadar/           # Political Radar — federal layer signals + 0–3 sub-score; other 4 layers stubbed. Cached in Firestore by geohash5.
      index.ts                # Public entry point (analyzePoliticalRadar) + cache hit/miss
      types.ts                # Shared types — PoliticalRadarResult, FederalLayerData, signals, layers
      federal.ts              # Federal-layer orchestrator + scoring rubric (0–3)
      congressBills.ts        # Reads political-radar-tracked-bills Firestore collection (populated daily by refreshFederalBills Cloud Function)
      executiveOrders.ts      # Federal Register API search (no key)
      congressionalReps.ts    # TIGERweb CD lookup → reads political-radar-federal-officials Firestore collection (populated weekly by refreshFederalOfficials)
      rtoJurisdiction.ts      # State-keyed RTO classifier with TX carve-outs (ERCOT vs FERC-jurisdictional)
      tribalProximity.ts      # TIGERweb AIANNHA point-in-envelope, 50-mi NHPA flag
      cache.ts                # Firestore federal-layer cache, 24 h TTL
      geohash.ts              # Inline base32 geohash encoder (no new dep)
    transportLookup.ts        # Transport infrastructure (airports, interstates, ports, railroads via geo.dot.gov)
    wellFinderRrc.ts          # RRC ArcGIS Layer 1 query helper (paginated). PMTiles URL config.
    documents.ts              # Documents tool: Drive folder ID + embed/open URL constants
    infraLookup.ts            # Infrastructure lookup (substations, lines, plants, geocode)
    infraIngestion.ts         # Admin data ingestion pipeline (ArcGIS → Firestore)
    powerMapData.ts           # Power map data fetching and availability calculations
    eiaApi.ts                 # EIA API integration
    eiaConsumption.ts         # State-level power consumption estimates
    electricityAverages.ts    # State-level electricity price averages
    solarAverages.ts          # State-level solar/wind resource data
    stateBounds.ts            # State geographic bounding boxes
    reverseGeocode.ts         # Coordinate to address lookup
    requestCache.ts           # In-memory request cache with dedup and TTL
  types/
    index.ts                  # UserRole, ToolId, Project, SiteInputs, AppraisalResult, SiteRegistryEntry, etc.
    infrastructure.ts         # CachedPowerPlant, CachedSubstation, EiaStateData, SolarStateAverage
  utils/
    format.ts                 # Formatting helpers
    exportPdf.ts              # HTML-to-PDF fallback (html2canvas + jsPDF)
    parseCoordinates.ts       # Coordinate parsing (decimal + DMS formats)
    landComps.ts              # Land comps CSV parser, stats calculator, Claude prompt
public/
  fonts/                      # Local TTF fonts for PDF (Sora, IBM Plex Sans)
  favicon.svg
  logo.svg
  icons.svg
scripts/
  queue-ingestion/            # Weekly Python pipeline: pulls all 7 ISO queues, matches to HIFLD substations, writes Firestore. See scripts/queue-ingestion/README.md
```

## Routes

| Path                              | Component                   | Access                         | Description                                                                                                            |
| --------------------------------- | --------------------------- | ------------------------------ | ---------------------------------------------------------------------------------------------------------------------- |
| `/login`                          | `LoginPage`                 | —                              | Firebase auth login                                                                                                    |
| `/`                               | `Dashboard`                 | all                            | Tool grid grouped by section                                                                                           |
| `/crm`                            | `CrmTool`                   | toolId: `crm`                  | CRM directory (Companies + People)                                                                                     |
| `/crm/companies/:id`              | `CompanyDetailTool`         | toolId: `crm`                  | Company detail + edit mode (`:id` may be `new`)                                                                        |
| `/crm/people/:id`                 | `ContactDetailTool`         | toolId: `crm`                  | Contact detail + edit mode (`:id` may be `new`)                                                                        |
| `/site-analyzer`                  | `SiteAnalyzerIndex`         | toolId: `site-analyzer`        | Index of all analyzed sites (search by name/company). Legacy `?siteId=` query auto-redirects to `/site-analyzer/<id>`. |
| `/site-analyzer/new`              | `SiteAnalyzerNew`           | toolId: `site-analyzer`        | New analysis form (accepts `?companyId`, `?lat`, `?lng` pre-fills)                                                     |
| `/site-analyzer/:siteId`          | `SiteAnalyzerDetail`        | toolId: `site-analyzer`        | Site analysis detail (view/edit toggle; `?run=1` auto-triggers analysis)                                               |
| `/power-infrastructure-report`    | Redirect → `/site-analyzer` | —                              | Legacy redirect (preserves query string)                                                                               |
| `/grid-power-analyzer`            | `GridPowerAnalyzer`         | toolId: `grid-power-analyzer`  | Interactive power map                                                                                                  |
| `/sales-crm`                      | `SalesCrmTool`              | toolId: `sales-crm`            | Sales lead management                                                                                                  |
| `/sales-admin`                    | `SalesAdminDashboard`       | toolId: `sales-admin`          | Admin sales dashboard                                                                                                  |
| `/construction-tracker`           | `ConstructionTrackerIndex`  | toolId: `construction-tracker` | List of construction projects (labor sees only their assigned projects)                                                |
| `/construction-tracker/new`       | `ConstructionTrackerNew`    | toolId: `construction-tracker` | New project form (accepts `?companyId` pre-fill)                                                                       |
| `/construction-tracker/:jobId`    | `ConstructionTrackerDetail` | toolId: `construction-tracker` | Project detail (view/edit toggle; permissions per Admin/Supervisor/Labor membership)                                   |
| `/llr`                            | `PreConIndex`               | toolId: `large-load-request`   | Large Load Request sites index — search + grade filter                                                                 |
| `/llr/new`                        | `PreConNew`                 | toolId: `large-load-request`   | New LLR site (picks/creates company, drops coordinates, OR converts an existing analyzed Site Analyzer site)           |
| `/llr/:siteId`                    | `PreConDetail`              | toolId: `large-load-request`   | LLR dashboard: appraisal, grade, engineer review, utility-aware LOA timeline, documents                                |
| `/precon*`                        | Redirect → `/llr*`          | —                              | Legacy redirect (preserves trailing path + query string)                                                               |
| `/user-management`                | `UserManagement`            | role: `admin`                  | Manage users and roles                                                                                                 |
| `/admin/activity`                 | `AdminActivity`             | role: `admin`                  | Activity log — every CRUD + tool run, newest first                                                                     |
| `/well-finder`                    | `WellFinderTool`            | role: `admin`                  | Texas oil & gas wells map (reactivation candidates)                                                                    |
| `/documents`                      | `DocumentsTool`             | all                            | Role-gated grid of Google Drive shortcuts (Templates, My Documents, etc.)                                              |
| `/todo-list`                      | `TodoListTool`              | all                            | Per-user private to-do list (collection `user-tasks`, owner-scoped)                                                    |
| `/market-intel`                   | `MarketIntelTool`           | toolId: `market-intel`         | Live capture-only feed of US data-center deal news (collection `market-intel-feed`, written by `refreshMarketIntel`)   |
| `/one-line-generator`             | `OneLineGeneratorIndex`     | toolId: `one-line-generator`   | List of saved one-line diagrams (collection `one-line-diagrams`)                                                       |
| `/one-line-generator/new`         | `OneLineGeneratorNew`       | toolId: `one-line-generator`   | New diagram: spec form + live preview (optional prefill from a Site Analyzer site)                                     |
| `/one-line-generator/:documentId` | `OneLineGeneratorDetail`    | toolId: `one-line-generator`   | Edit spec, live preview, download `.svg` / `.pdf`                                                                      |
| `/whitepaper`                     | `WhitepaperTool`            | email allowlist                | Whitepaper docs site — redirects to the first section (`WHITEPAPER_ALLOWED_EMAILS`)                                    |
| `/whitepaper/:sectionId`          | `WhitepaperTool`            | email allowlist                | One whitepaper section (sidebar nav + prev/next pager; unknown ids redirect to the first section)                      |

## Design System

### Colors

- **Brand red:** `#ED202B` (matches logo)
- **Brand dark:** `#9B0E18` (hover/pressed states)
- **Background:** `#FAFAF9` (near-white)
- **Text primary:** `#201F1E`
- **Text muted:** `#7A756E`
- **Border:** `#D8D5D0`

### Typography

- **Headings:** `Sora` (500, 600, 700) — via `font-heading` class, auto-applied to h1–h6
- **Body:** `IBM Plex Sans` (300, 400, 500, 600)

### Components

- **Cards:** `bg-white rounded-xl shadow-sm border border-[#D8D5D0]`
- **Primary buttons:** `bg-[#ED202B] text-white hover:bg-[#9B0E18]` (filled red). Use for every positive action — Save, Create, Convert, Track, Re-review, "New X" header CTAs. More than one per page is fine; consistency was chosen over hierarchy on 2026-05-27.
- **Ghost buttons:** `text-[#7A756E] hover:text-[#ED202B]` (muted gray, red on hover). Use for Cancel, Archive, Remove, dismissive / destructive actions. Distinguishes "back out" from "commit" when sitting next to a primary button.
- _Don't reintroduce an outlined-red ("secondary") variant._ If a primary button feels too loud next to another primary on the same page, demote it to ghost rather than outlining it. The `<Button>` component in `src/components/ui/Button.tsx` only exposes `primary` and `ghost`.
- **Archive iconography:** soft-archive actions (folder system Archive view + kebab item, LLR site Archive, CRM Leads Archive nav) use `<ArchiveIcon />` from `src/components/icons/ArchiveIcon.tsx`. The Restore-from-archive action uses `<RestoreIcon />`. The trash-can SVG on Site Analyzer's delete button is reserved for **hard delete** (permanent removal) — don't substitute the archive box for it; the visual distinction telegraphs "you can restore this" vs. "this is gone forever."
- **Inputs focus:** `focus:border-[#ED202B] focus:ring-2 focus:ring-[#ED202B]/20`
- **Icon containers:** `bg-[#ED202B]/10 rounded-lg` (tinted, no border)
- **Gray palette:** Use `stone-*` (warm-neutral) or brand hex values — never `slate-*`
- **Layout max-width:** `max-w-6xl` (Layout + Navbar must match)

## Versioning

- Version lives in `src/version.ts` as `APP_VERSION` (semver: `MAJOR.MINOR.PATCH`)
- Displayed in the navbar next to the logo
- **Before pushing any branch**, bump the version in `src/version.ts`:
  - **PATCH** (`x.x.1` → `x.x.2`): bug fixes, small tweaks, styling changes
  - **MINOR** (`x.1.0` → `x.2.0`): new features, new tools, significant enhancements
  - **MAJOR** (`1.0.0` → `2.0.0`): breaking changes, major redesigns
- Default to a **PATCH** bump unless the change clearly warrants MINOR or MAJOR
- If the user specifies a bump level (e.g. "this is a minor bump"), use that instead

## Key Patterns & Conventions

### Tool Architecture

- **CRM is the central database** — companies and contacts live in `crm-companies` and `crm-contacts`. The Site Analyzer's saved sites link to a company via `companyId` on `SiteRegistryEntry`.
- **Site Analyzer** owns writes to `sites-registry` (the analysis output cache).
- **Coordinates are the universal identifier** — sites are matched across tools by coordinates (parsed via `parseCoordinates` which supports decimal and DMS formats).
- **Company linkage** is set via the Site Analyzer's Company picker. Legacy `owner` field retained on pre-link sites for backward compatibility. The Company detail page surfaces all linked sites; clicking a site navigates to `/site-analyzer?siteId=X` which auto-loads the site in the Site Analyzer.
- **Coordinates-only input** — no address search. Coordinates field accepts decimal (`28.65, -98.84`) or DMS (`28°39'22.0"N 98°50'38.3"W`).
- **Backward-compat:** the previous ToolId `'piddr'` is normalized to `'site-analyzer'` on read in `useAuth` and `useUserHistory`. The Firestore field `piddrGeneratedAt` on `SiteRegistryEntry` is intentionally preserved (no migration).

### Site Analysis Generation

- `useSiteAnalysis` hook manages 7 parallel sections: Appraisal (instant), Infrastructure, Broadband, Transport, Water, Gas, Labor
- Each section has `AnalysisSectionState<T>` with `loading`, `error`, `data`
- `ExistingResults` allows skipping re-fetch for cached data from the registry
- Results are auto-saved to the site registry on completion
- PDF export via `usePdfExport` → `SiteAnalysisPdfDocument` (react-pdf with local fonts)

### Site Registry

- Sites stored in Firestore `sites-registry` collection as `SiteRegistryEntry`
- Each entry has an optional `projectId` field — **legacy** from the old folder system; preserved on documents but no UI reads it. Existing folders in the `projects` Firestore collection are also preserved as data; only the UI was removed.
- Sites are grouped by **company** instead (via `companyId`). The Company detail page lists all sites for a company; the Site Analyzer index lists all sites with a search.
- Write-back helpers: `saveAppraisalToSite`, `saveInfraToSite`, `saveBroadbandToSite`, `saveTransportToSite`, `saveWaterToSite`, `saveGasToSite`, `saveLaborToSite`, `saveAnalysisTimestamp`
- Dedup and migration utilities exist in `siteRegistry.ts` but are not auto-run

### Dashboard Organization

Tools are grouped into 6 sections that mirror R&B Power's four business lines (Pre-Construction, Construction, Oil & Gas, REP) plus cross-cutting Company tools and admin Settings. Section headers only render if the signed-in user has at least one visible tool inside.

1. **Company** — Directory, Documents, To-Do List, Bailey Project _(cross-cutting)_
2. **Pre-Construction** — Pre-Construction, Site Analyzer, Grid Power Analyzer, Market Intelligence, One-Line Generator
3. **Construction** — Construction Projects
4. **REP** — Leads, Sales Dashboard _(admin-only)_
5. **Oil and Gas** — Well Finder _(admin-only)_
6. **Settings** _(admin-only)_ — Activity Log, User Management

### Adding a New Tool/Page

When adding a new route, you MUST update these files:

1. **`src/App.tsx`** — Add the route inside `<Routes>`, wrapped in `<ProtectedRoute>`
2. **`src/pages/Dashboard.tsx`** — Add the tool card to the appropriate section in `toolSections`
3. **`src/types/index.ts`** — Add the tool ID to `ToolId`, `ALL_TOOL_IDS`, and `TOOL_LABELS`

### Layout

All protected pages must be wrapped in `<Layout>` which provides:

- Sticky navbar
- Breadcrumb navigation
- Centered content container (`max-w-5xl`), or full-width via `fullWidth` prop

### Data Hierarchy

- **Companies** (CRM) own **Sites** (via `companyId` on `SiteRegistryEntry`)
- Sites can also be unlinked (no `companyId`) — visible on the Site Analyzer index only

### Auth & Roles

- Firebase auth via `useAuth` hook, which returns `{ user, role, loading, logout, allowedTools }`
- `role` is fetched from Firestore `users/{uid}` doc (`UserRole = 'admin' | 'manager' | 'labor'`). `normalizeRole` maps legacy values on read: `'employee' → 'manager'`, `'worker' → 'labor'`.
- Users without a Firestore `users` doc are denied access
- Protected routes use `<ProtectedRoute>` with `toolId` or `allowedRoles` prop
- **Admin**: access to all tools
- **Manager / Labor**: access to tools listed in their `allowedTools` array (manager has the broader default in the folder system — managers can edit folders/docs by default; labor needs an explicit `editorUserIds` grant; see `src/lib/folderAccess.ts`)

### Navigation Config

- `src/components/navbar/navConfig.ts` holds the `navLinks` array for navbar items

## Audit

A living audit document lives at **`AUDIT.md`** in the project root. Every agent working on this codebase must follow these rules:

- **Before fixing a bug or adding a feature**, check `AUDIT.md` for related open issues. If your work resolves one, update its status to `fixed` with the date and commit/PR reference.
- **If you discover a new security, quality, or performance issue** while working, add it to `AUDIT.md` under the appropriate severity section. Assign the next available ID (e.g. `M-14`).
- **If asked to run an audit**, review the codebase for new issues, verify that `fixed` items are actually resolved, and update `AUDIT.md` accordingly. Add a row to the Changelog table.
- **Never remove issues** — mark them `fixed` or `wontfix` with justification.
- Severity levels: **Critical** (security holes, data loss), **High** (reliability, performance), **Medium** (quality, maintainability), **Low** (style, minor improvements).

## Commands

```bash
npm install                         # Install dependencies
npm run dev                         # Start dev server
npm run build                       # Production build (tsc -b + vite build)
npx tsc -p tsconfig.app.json --noEmit  # Type-check the app (root tsconfig.json is a reference shell, plain `tsc --noEmit` checks nothing)
npx eslint --fix path/to/file.tsx   # Auto-fix lint issues on a single file
```

## Claude Code Hooks

Two hooks live in `.claude/settings.json`. Both are project-scoped (committed to git, apply to every Claude session in this repo).

### 1. `PreToolUse` — block edits on `main`

Script: `.claude/hooks/block-main-edit.sh`. Refuses Write/Edit when the current branch is `main`. Forces work onto a feature branch (Cloudflare Pages deploys from `main`, so direct commits there are deploys-by-accident).

If you (a human or Claude) hit this block: `git checkout -b feat/short-description` (or `chore/`, `fix/`) and retry.

### 2. `PostToolUse` — auto-format and type-check

Script: `.claude/hooks/post-edit-check.sh`. After every Write/Edit on a `.ts` or `.tsx` inside `src/`:

1. `prettier --write` on the file (silent)
2. `eslint --fix` on the file (silent)
3. `tsc -p tsconfig.app.json --noEmit` on the project — if it errors, the first 40 lines are fed back as `additionalContext` so the same Claude turn can fix the errors.

If the file is outside `src/` or not TypeScript, the hook exits silently.

**If you restructure `tsconfig` or move source out of `src/`,** update the hook script.

### Formatting (Prettier)

Config: `.prettierrc.json`. Ignore patterns: `.prettierignore`. Scripts:

- `npm run format` — format the whole repo
- `npm run format:check` — list files not formatted (CI-friendly; exits non-zero if drift found)

The PostToolUse hook formats edited files automatically — you rarely need to run these manually.

### Repo cleanup

Script: `.claude/scripts/cleanup.sh`, run via `npm run cleanup`. Idempotent. It:

- Fetches origin and prunes gone refs
- Removes worktrees whose branch is gone from origin
- Deletes local branches that are fully merged into `main` AND gone from origin

Safe by default — won't touch `main`/`dev`, won't force-delete unmerged branches. Run it before starting new work or weekly.
