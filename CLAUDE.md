# CLAUDE.md — R&B Power Platform

> **Keep this file up to date.** Whenever you add, rename, or remove routes, tools, components, hooks, or lib files, update this document to reflect the change.

## Project Overview

Internal tool suite for R&B Power. The **CRM** is the central database (companies, contacts, documents). The **Site Analyzer** (formerly PIDDR / Infrastructure Report) is the analysis tool — input coordinates, run a multi-source analysis (power, broadband, water, gas, transport, valuation), export a PDF, and link the result to a CRM company.

### Tools

- **CRM** — Cross-cutting directory of Companies and Contacts, shared across Pre-Construction, Construction, and REP dimensions. Toggle between Companies and People, search, add/edit/delete. Fixed-enum tags (`REP` / `Construction` / `Pre Construction` / `Utility`) classify each company. Each company has a Documents section (PDFs + images) categorized as Legal / Invoices / Deliverables / Reports / Photos / Other, and a collapsible License Numbers section with free-text fields for the 5 tracked states (OK, TX, AZ, NM, TN). Mobile-first UI.
- **Site Analyzer** — Site analysis tool. Enter coordinates → runs land valuation, power, broadband, transport, water, and gas analyses in parallel. Saves results to the site registry, optionally linked to a CRM company. PDF export. Three routes: index (`/site-analyzer`) lists all sites with search; new (`/site-analyzer/new`) is the entry form; detail (`/site-analyzer/:siteId`) is view/edit + analysis sections.
- **Site Appraiser** — Standalone calculator for site valuation. Input coordinates, acreage, MW, $/acre to see current vs energized value. No sidebar, no data persistence — Site Analyzer owns the registry.
- **Power Calculator** — Analyze nearby substations, transmission lines, power plants, and grid territory for any coordinates.
- **Grid Power Analyzer** — Interactive MapLibre GL map showing power generators, transmission lines, substations, and available capacity with heat map overlay. Coordinate search with gold diamond pin.
- **Water Analysis** — Flood zones, stream networks, wetlands, groundwater, drought, NPDES permits, precipitation analysis from coordinates.
- **Gas Infrastructure Analysis** — Nearby gas pipelines, demand calculation, lateral cost estimate, LDC assessment, supply reliability, gas pricing, environmental compliance.
- **Broadband Lookup** — Broadband due diligence report from site coordinates. Queries FCC Census Block API and ArcGIS FCC BDC.
- **Leads (Sales CRM)** — Lead management for the sales team. Tracks leads through call/email outreach sequence (New → Call 1 → Email → Call 2 → Final Call → Won/Lost).
- **Sales Dashboard** — Admin-only aggregated view of sales performance. Leaderboard, pipeline breakdown, conversion rates.
- **User Management** — Admin-only tool to view, manage roles, and remove platform users.

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
    SiteSelector.tsx          # Searchable site selector dropdown (used by tools)
    navbar/                   # Navbar, NavLinks, UserMenu, MobileMenu, navConfig
    appraiser/                # Site Appraiser components
      SiteDetailPanel.tsx     # Map + calculator (PresentationView only)
      SiteMapCard.tsx         # Google Maps iframe embed
      ElectricityPriceWidget.tsx  # Electricity price comparison
      SolarResourceWidget.tsx # Solar/wind resource display
    site-analyzer/            # Site Analyzer components
      DetailHeader.tsx        # Detail page header (name, company chip, last analyzed, action buttons)
      DetailSummary.tsx       # Read-only key/value table of site inputs (view mode)
      DetailEditForm.tsx      # Edit-mode form (mirrors New form, prefilled, Save/Cancel)
      SectionTOC.tsx          # Sticky horizontal clickable section nav (mobile scrolls, desktop row)
      SiteOverviewSection.tsx # Site overview with map and property details
      LandValuationSection.tsx # Appraisal metrics and breakdown
      LandCompsPanel.tsx    # Collapsible land comps table (CSV paste, stats, apply to valuation)
      BroadbandSection.tsx    # Broadband results wrapper
      WaterSection.tsx        # Water analysis results wrapper
      GasSection.tsx          # Gas analysis results wrapper
      TransportSection.tsx    # Transport infrastructure results (airports, interstates, ports, railroads)
      SiteAnalysisPdfDocument.tsx # Full PDF document structure (react-pdf)
    broadband/                # Broadband Lookup components
      BroadbandReport.tsx     # Due diligence report display
    water/                    # Water Analysis components
      WaterReport.tsx         # Water analysis report display
    gas/                      # Gas Analysis components
      GasReport.tsx           # Gas analysis report display
    power-map/                # Grid Power Analyzer components
      PowerMapView.tsx        # Main map container (MapLibre GL)
      MapLegend.tsx           # Layer toggles and source legend
      MapStats.tsx            # Viewport statistics panel
      PlantPopup.tsx          # Power plant info popup
      CoordinateSearch.tsx    # Coordinate/address search with geocoding
      SubstationList.tsx      # Substation data table
      Methodology.tsx         # Map methodology docs
    power-calculator/         # Power Calculator components
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
      CompanyPicker.tsx       # Searchable company picker (used by Site Analyzer)
      DocumentsSection.tsx    # Company documents panel (upload/view/download/delete, category chips)
    admin/                    # Admin-only components
      InfraRefreshPanel.tsx   # Infrastructure data cache refresh panel
    EnergyBridge.tsx          # Energy bridge visualization
    Header.tsx                # Section header
    OutcomeBar.tsx            # Outcome bar chart
    PowerScale.tsx            # Power scale visualization
    PowerSlider.tsx           # MW slider input
    PresentationView.tsx      # Presentation/summary view (calculator)
    SetupPanel.tsx            # Site setup form panel
    SiteSwitcher.tsx          # Switch between sites
    ValueCard.tsx             # Value display card
  pages/
    Dashboard.tsx             # Tool grid (root page "/") — grouped by section
    LoginPage.tsx             # Firebase auth login
    UserManagement.tsx        # User management (admin-only)
  tools/
    SiteAnalyzerIndex.tsx     # Site Analyzer index — list of all analyzed sites with search ("/site-analyzer")
    SiteAnalyzerNew.tsx       # New site analysis form ("/site-analyzer/new"; reads ?companyId, ?lat, ?lng)
    SiteAnalyzerDetail.tsx    # Site analysis detail page with view/edit toggle ("/site-analyzer/:siteId")
    SiteAppraiserTool.tsx     # Site Appraiser ("/site-appraiser") — standalone calculator
    PowerCalculatorTool.tsx   # Power Calculator ("/power-calculator")
    GridPowerAnalyzer.tsx     # Grid Power Analyzer ("/grid-power-analyzer")
    WaterAnalysisTool.tsx     # Water Analysis ("/water-analysis")
    GasAnalysisTool.tsx       # Gas Infrastructure Analysis ("/gas-analysis")
    BroadbandLookupTool.tsx   # Broadband Lookup ("/broadband-lookup")
    SalesCrmTool.tsx          # Sales CRM / Leads ("/sales-crm")
    SalesAdminDashboard.tsx   # Admin sales dashboard ("/sales-admin")
    CrmTool.tsx               # CRM directory ("/crm") — Companies & People list
    CompanyDetailTool.tsx     # Company detail + edit ("/crm/companies/:id", "/crm/companies/new")
    ContactDetailTool.tsx     # Person detail + edit ("/crm/people/:id", "/crm/people/new")
  hooks/
    useAuth.ts                # Firebase auth state + user role + allowed tools
    useAppraisal.ts           # Appraisal calculation logic
    useSiteAnalysis.ts        # Site analysis generation (all 6 sections in parallel)
    usePdfExport.ts           # PDF generation via react-pdf
    useSites.ts               # Site CRUD operations (legacy appraiser internals)
    useSiteRegistry.ts        # Site registry real-time subscription
    useUsers.ts               # User management CRUD (admin)
    useLeads.ts               # Lead CRUD operations (Sales CRM)
    useCompanies.ts           # CRM company CRUD + single-company subscription
    useContacts.ts            # CRM contact CRUD, by-company, single-contact hooks
    useDocuments.ts           # CRM document upload/delete/list per company (Firebase Storage + Firestore)
    useBroadbandLookup.ts     # Broadband data lookup
    useWaterAnalysis.ts       # Water analysis hook
    useGasAnalysis.ts         # Gas analysis hook
    usePowerMap.ts            # Power map data fetching and state
    useInfraData.ts           # Cached infrastructure data (plants, substations, EIA, solar)
    useInfraLookup.ts         # Infrastructure lookup for Power Calculator
    useUserHistory.ts         # Per-user activity history
    useAnimatedNumber.ts      # Number animation utility
  lib/
    firebase.ts               # Firebase config + legacy site CRUD
    firebaseErrors.ts         # Firebase error handling
    firebaseInfra.ts          # Firestore CRUD for cached infrastructure data
    siteRegistry.ts           # Site registry CRUD, writeback, dedup, migration
    leads.ts                  # Lead Firestore operations
    crmCompanies.ts           # CRM company Firestore operations (collection: crm-companies)
    crmContacts.ts            # CRM contact Firestore operations (collection: crm-contacts)
    crmDocuments.ts           # CRM document Firebase Storage + Firestore ops (collection: crm-documents)
    userHistory.ts            # User activity history operations
    broadbandLookup.ts        # FCC Census Block + ArcGIS BDC API
    waterAnalysis.ts          # Water analysis (FEMA, USGS, NWI, groundwater, drought, NPDES)
    waterAnalysis.types.ts    # Water analysis type definitions
    gasAnalysis.ts            # Gas analysis (pipelines, demand, lateral, LDC, pricing)
    transportLookup.ts        # Transport infrastructure (airports, interstates, ports, railroads via geo.dot.gov)
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
```

## Routes

| Path | Component | Access | Description |
|------|-----------|--------|-------------|
| `/login` | `LoginPage` | — | Firebase auth login |
| `/` | `Dashboard` | all | Tool grid grouped by section |
| `/crm` | `CrmTool` | toolId: `crm` | CRM directory (Companies + People) |
| `/crm/companies/:id` | `CompanyDetailTool` | toolId: `crm` | Company detail + edit mode (`:id` may be `new`) |
| `/crm/people/:id` | `ContactDetailTool` | toolId: `crm` | Contact detail + edit mode (`:id` may be `new`) |
| `/site-analyzer` | `SiteAnalyzerIndex` | toolId: `site-analyzer` | Index of all analyzed sites (search by name/company). Legacy `?siteId=` query auto-redirects to `/site-analyzer/<id>`. |
| `/site-analyzer/new` | `SiteAnalyzerNew` | toolId: `site-analyzer` | New analysis form (accepts `?companyId`, `?lat`, `?lng` pre-fills) |
| `/site-analyzer/:siteId` | `SiteAnalyzerDetail` | toolId: `site-analyzer` | Site analysis detail (view/edit toggle; `?run=1` auto-triggers analysis) |
| `/power-infrastructure-report` | Redirect → `/site-analyzer` | — | Legacy redirect (preserves query string) |
| `/site-appraiser` | `SiteAppraiserTool` | toolId: `site-appraiser` | Standalone site value calculator |
| `/power-calculator` | `PowerCalculatorTool` | toolId: `power-calculator` | Power infrastructure analysis |
| `/grid-power-analyzer` | `GridPowerAnalyzer` | toolId: `grid-power-analyzer` | Interactive power map |
| `/water-analysis` | `WaterAnalysisTool` | toolId: `water-analysis` | Water due diligence |
| `/gas-analysis` | `GasAnalysisTool` | toolId: `gas-analysis` | Gas infrastructure analysis |
| `/broadband-lookup` | `BroadbandLookupTool` | toolId: `broadband-lookup` | Broadband due diligence |
| `/sales-crm` | `SalesCrmTool` | toolId: `sales-crm` | Sales lead management |
| `/sales-admin` | `SalesAdminDashboard` | toolId: `sales-admin` | Admin sales dashboard |
| `/user-management` | `UserManagement` | role: `admin` | Manage users and roles |

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
- **Primary buttons:** `bg-[#ED202B] text-white hover:bg-[#9B0E18]` (filled)
- **Secondary buttons:** `bg-white text-[#ED202B] border border-[#ED202B]` (outline)
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
- **Site Analyzer** owns writes to `sites-registry` (the analysis output cache). Other tools (Power Calculator, Water, Gas) can read from it via `SiteSelector`.
- **Coordinates are the universal identifier** — sites are matched across tools by coordinates (parsed via `parseCoordinates` which supports decimal and DMS formats).
- **Company linkage** is set via the Site Analyzer's Company picker. Legacy `owner` field retained on pre-link sites for backward compatibility. The Company detail page surfaces all linked sites; clicking a site navigates to `/site-analyzer?siteId=X` which auto-loads the site in the Site Analyzer.
- **All tools use coordinates-only input** — no address search. Coordinates field accepts decimal (`28.65, -98.84`) or DMS (`28°39'22.0"N 98°50'38.3"W`).
- **SiteSelector** bar at the top of tools (Power Calculator, Water, Gas) lets users pick a saved site to auto-fill coordinates.
- **Backward-compat:** the previous ToolId `'piddr'` is normalized to `'site-analyzer'` on read in `useAuth` and `useUserHistory`. The Firestore field `piddrGeneratedAt` on `SiteRegistryEntry` is intentionally preserved (no migration).

### Site Analysis Generation

- `useSiteAnalysis` hook manages 6 parallel sections: Appraisal (instant), Infrastructure, Broadband, Transport, Water, Gas
- Each section has `AnalysisSectionState<T>` with `loading`, `error`, `data`
- `ExistingResults` allows skipping re-fetch for cached data from the registry
- Results are auto-saved to the site registry on completion
- PDF export via `usePdfExport` → `SiteAnalysisPdfDocument` (react-pdf with local fonts)

### Site Registry

- Sites stored in Firestore `sites-registry` collection as `SiteRegistryEntry`
- Each entry has an optional `projectId` field — **legacy** from the old folder system; preserved on documents but no UI reads it. Existing folders in the `projects` Firestore collection are also preserved as data; only the UI was removed.
- Sites are grouped by **company** instead (via `companyId`). The Company detail page lists all sites for a company; the Site Analyzer index lists all sites with a search.
- Write-back helpers: `saveAppraisalToSite`, `saveInfraToSite`, `saveBroadbandToSite`, `saveTransportToSite`, `saveWaterToSite`, `saveGasToSite`, `saveAnalysisTimestamp`
- Dedup and migration utilities exist in `siteRegistry.ts` but are not auto-run

### Dashboard Organization

Tools are grouped into 4 sections on the Dashboard (section headers only show if user has access):
1. **CRM** — CRM (cross-cutting hub for Companies + Contacts)
2. **Power Infrastructure Due Diligence Report** — Site Analyzer, Power Calculator, Grid Power Analyzer, Water, Gas, Broadband, Site Appraiser
3. **Sales** — Leads, Sales Dashboard
4. **Settings** — User Management

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
- `role` is fetched from Firestore `users/{uid}` doc (`UserRole = 'admin' | 'employee'`)
- Users without a Firestore `users` doc are denied access
- Protected routes use `<ProtectedRoute>` with `toolId` or `allowedRoles` prop
- **Admin**: access to all tools
- **Employee**: access to tools listed in their `allowedTools` array

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
npm install      # Install dependencies
npm run dev      # Start dev server
npm run build    # Production build (tsc + vite build)
npx tsc --noEmit # Type-check without emitting
```
