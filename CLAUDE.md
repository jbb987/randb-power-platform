# CLAUDE.md — R&B Power Platform

> **Keep this file up to date.** Whenever you add, rename, or remove routes, tools, components, hooks, or lib files, update this document to reflect the change.

## Project Overview

Internal tool suite for R&B Power. The **Infrastructure Report (PIDDR)** is the central hub — it stores all sites in a registry organized by project folders, runs all analyses (power, broadband, water, gas), and generates PDF reports.

### Tools

- **Infrastructure Report (PIDDR)** — Central due diligence hub. Folder sidebar groups sites by project. Generates comprehensive reports covering land valuation, power infrastructure, broadband, water, and gas analysis. Auto-saves results to site registry. PDF export.
- **Site Appraiser** — Standalone calculator for site valuation. Input coordinates, acreage, MW, $/acre to see current vs energized value. No sidebar, no data persistence — PIDDR owns the registry.
- **Power Calculator** — Analyze nearby substations, transmission lines, power plants, and grid territory for any coordinates.
- **Grid Power Analyzer** — Interactive MapLibre GL map showing power generators, transmission lines, substations, and available capacity with heat map overlay. Coordinate search with gold diamond pin.
- **Water Analysis** — Flood zones, stream networks, wetlands, groundwater, drought, NPDES permits, precipitation analysis from coordinates.
- **Gas Infrastructure Analysis** — Nearby gas pipelines, demand calculation, lateral cost estimate, LDC assessment, supply reliability, gas pricing, environmental compliance.
- **Broadband Lookup** — Broadband due diligence report from site coordinates. Queries FCC Census Block API and ArcGIS FCC BDC.
- **Site Pipeline** — Kanban pipeline for tracking site requests through stages (new → ongoing → done).
- **Submit Site Request** — Form to submit new site requests with customer and address details.
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
      ProjectOverview.tsx     # Project list / overview (legacy, used by appraiser internals)
      ProjectSidebar.tsx      # Project sidebar (legacy, no longer used by appraiser)
      ElectricityPriceWidget.tsx  # Electricity price comparison
      SolarResourceWidget.tsx # Solar/wind resource display
    piddr/                    # Infrastructure Report (PIDDR) components
      PiddrSidebar.tsx        # Folder sidebar grouping sites by project
      ReportHeader.tsx        # Report header with section status indicators
      SiteOverviewSection.tsx # Site overview with map and property details
      LandValuationSection.tsx # Appraisal metrics and breakdown
      BroadbandSection.tsx    # Broadband results wrapper
      WaterSection.tsx        # Water analysis results wrapper
      GasSection.tsx          # Gas analysis results wrapper
      PiddrPdfDocument.tsx    # Full PDF document structure (react-pdf)
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
    crm/                      # Sales CRM components
      CrmSidebar.tsx          # Left nav panel (Fresh Leads, Archive, Stats)
      LeadTable.tsx           # Leads table with search
      LeadDetail.tsx          # Lead detail modal with notes + status progression
      LeadForm.tsx            # Create new lead form
      BulkUpload.tsx          # CSV bulk upload modal
      CrmStats.tsx            # Stats dashboard (pipeline, conversion, weekly)
      CrmArchive.tsx          # Archive view with Won/Lost filter
      AdminStats.tsx          # Admin sales dashboard stats
    admin/                    # Admin-only components
      InfraRefreshPanel.tsx   # Infrastructure data cache refresh panel
    site-request/             # Site Request components
      PipelineColumn.tsx      # Kanban column
      RequestCard.tsx         # Request card in pipeline
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
    SiteRequestForm.tsx       # Site request submission form
    UserManagement.tsx        # User management (admin-only)
  tools/
    PowerInfraReportTool.tsx  # Infrastructure Report / PIDDR ("/power-infrastructure-report")
    SiteAppraiserTool.tsx     # Site Appraiser ("/site-appraiser") — standalone calculator
    PowerCalculatorTool.tsx   # Power Calculator ("/power-calculator")
    GridPowerAnalyzer.tsx     # Grid Power Analyzer ("/grid-power-analyzer")
    WaterAnalysisTool.tsx     # Water Analysis ("/water-analysis")
    GasAnalysisTool.tsx       # Gas Infrastructure Analysis ("/gas-analysis")
    BroadbandLookupTool.tsx   # Broadband Lookup ("/broadband-lookup")
    SiteRequestPipeline.tsx   # Site Pipeline ("/site-pipeline")
    SalesCrmTool.tsx          # Sales CRM / Leads ("/sales-crm")
    SalesAdminDashboard.tsx   # Admin sales dashboard ("/sales-admin")
  hooks/
    useAuth.ts                # Firebase auth state + user role + allowed tools
    useAppraisal.ts           # Appraisal calculation logic
    usePiddrReport.ts         # PIDDR report generation (all 5 sections in parallel)
    usePdfExport.ts           # PDF generation via react-pdf
    useProjects.ts            # Project CRUD operations
    useSites.ts               # Site CRUD operations
    useSiteRegistry.ts        # Site registry real-time subscription
    useSiteRequests.ts        # Site request CRUD operations
    useUsers.ts               # User management CRUD (admin)
    useLeads.ts               # Lead CRUD operations (Sales CRM)
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
    projects.ts               # Project Firestore operations
    siteRequests.ts           # Site request Firestore operations
    leads.ts                  # Lead Firestore operations
    userHistory.ts            # User activity history operations
    broadbandLookup.ts        # FCC Census Block + ArcGIS BDC API
    waterAnalysis.ts          # Water analysis (FEMA, USGS, NWI, groundwater, drought, NPDES)
    waterAnalysis.types.ts    # Water analysis type definitions
    gasAnalysis.ts            # Gas analysis (pipelines, demand, lateral, LDC, pricing)
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
| `/power-infrastructure-report` | `PowerInfraReportTool` | toolId: `piddr` | Central due diligence hub |
| `/site-appraiser` | `SiteAppraiserTool` | toolId: `site-appraiser` | Standalone site value calculator |
| `/power-calculator` | `PowerCalculatorTool` | toolId: `power-calculator` | Power infrastructure analysis |
| `/grid-power-analyzer` | `GridPowerAnalyzer` | toolId: `grid-power-analyzer` | Interactive power map |
| `/water-analysis` | `WaterAnalysisTool` | toolId: `water-analysis` | Water due diligence |
| `/gas-analysis` | `GasAnalysisTool` | toolId: `gas-analysis` | Gas infrastructure analysis |
| `/broadband-lookup` | `BroadbandLookupTool` | toolId: `broadband-lookup` | Broadband due diligence |
| `/site-pipeline` | `SiteRequestPipeline` | toolId: `site-pipeline` | Request pipeline (kanban) |
| `/site-request/form` | `SiteRequestForm` | toolId: `site-request-form` | Submit new site request |
| `/sales-crm` | `SalesCrmTool` | toolId: `sales-crm` | Sales lead management |
| `/sales-admin` | `SalesAdminDashboard` | toolId: `sales-admin` | Admin sales dashboard |
| `/user-management` | `UserManagement` | role: `admin` | Manage users and roles |
| `/site-request` | Redirect → `/site-pipeline` | — | Legacy redirect |

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

- **PIDDR is the central hub** — all site data lives in the `sites-registry` Firestore collection. Other tools can read from it via `SiteSelector` but PIDDR owns writes.
- **Coordinates are the universal identifier** — sites are matched across tools by coordinates (parsed via `parseCoordinates` which supports decimal and DMS formats).
- **All tools use coordinates-only input** — no address search. Coordinates field accepts decimal (`28.65, -98.84`) or DMS (`28°39'22.0"N 98°50'38.3"W`).
- **SiteSelector** bar at the top of tools (Power Calculator, Water, Gas) lets users pick a saved site to auto-fill coordinates.

### PIDDR Report Generation

- `usePiddrReport` hook manages 5 parallel sections: Appraisal (instant), Infrastructure, Broadband, Water, Gas
- Each section has `PiddrSectionState<T>` with `loading`, `error`, `data`
- `ExistingResults` allows skipping re-fetch for cached data from the registry
- Results are auto-saved to the site registry on completion
- PDF export via `usePdfExport` → `PiddrPdfDocument` (react-pdf with local fonts)

### Site Registry & Folders

- Sites stored in Firestore `sites-registry` collection as `SiteRegistryEntry`
- Each entry has optional `projectId` linking to a `Project` (folder)
- `PiddrSidebar` groups sites by project, with "Unsorted" for unlinked sites
- Write-back helpers: `saveAppraisalToSite`, `saveInfraToSite`, `saveBroadbandToSite`, `saveWaterToSite`, `saveGasToSite`, `savePiddrTimestamp`
- Dedup and migration utilities exist in `siteRegistry.ts` but are not auto-run

### Dashboard Organization

Tools are grouped into 3 sections on the Dashboard (section headers only show if user has access):
1. **Power Infrastructure Due Diligence Report** — PIDDR, Site Pipeline, Submit Request, Power Calculator, Grid Power Analyzer, Water, Gas, Broadband, Site Appraiser
2. **Sales** — Leads, Sales Dashboard
3. **Settings** — User Management

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

- **Projects** (folders) contain multiple **Sites** (via `projectId` on `SiteRegistryEntry`)
- **Site Requests** are linked to Projects via `projectId`
- Deleting a Project cascade-deletes its Sites and Site Requests

### Auth & Roles

- Firebase auth via `useAuth` hook, which returns `{ user, role, loading, logout, allowedTools }`
- `role` is fetched from Firestore `users/{uid}` doc (`UserRole = 'admin' | 'employee'`)
- Users without a Firestore `users` doc are denied access
- Protected routes use `<ProtectedRoute>` with `toolId` or `allowedRoles` prop
- **Admin**: access to all tools
- **Employee**: access to tools listed in their `allowedTools` array

### Navigation Config

- `src/components/navbar/navConfig.ts` holds the `navLinks` array for navbar items

## Commands

```bash
npm install      # Install dependencies
npm run dev      # Start dev server
npm run build    # Production build (tsc + vite build)
npx tsc --noEmit # Type-check without emitting
```
