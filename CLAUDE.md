# CLAUDE.md — R&B Power Platform

> **Keep this file up to date.** Whenever you add, rename, or remove routes, tools, components, hooks, or lib files, update this document to reflect the change.

## Project Overview

Internal tool suite for R&B Power. Currently has four tools:
- **Site Appraiser** — Evaluates renewable energy site value based on power capacity, acreage, and land comparables. Sites are organized under Projects.
- **Broadband Lookup** — Broadband due diligence report from site coordinates. Queries FCC Census Block API and ArcGIS FCC BDC for provider availability, technology types, speeds, and generates an OSP engineer assessment.
- **Site Request** — Kanban pipeline for tracking site requests through stages (new → ongoing → done).
- **Grid Power Analyzer** — Interactive map showing power generators, transmission lines, substations, and available capacity with heat map overlay. Uses GeoPlataform ArcGIS data and MapLibre GL.
- **User Management** — Admin-only tool to view, manage roles, and remove platform users.

## Tech Stack

- **Framework:** React 19 + TypeScript
- **Build:** Vite
- **Styling:** Tailwind CSS v4
- **Routing:** React Router DOM v7
- **Backend:** Firebase (Firestore)
- **Animation:** Framer Motion
- **Deploy:** GitHub Pages via GitHub Actions (pushes to `main`)

## Project Structure

```
src/
  App.tsx                    # Root routes
  main.tsx                   # Entry point
  version.ts                 # APP_VERSION (semver, displayed in navbar)
  components/
    Layout.tsx                # Shared page wrapper (Navbar + Breadcrumb + content)
    Breadcrumb.tsx            # Route-aware breadcrumb navigation
    ProtectedRoute.tsx        # Auth gate with optional allowedRoles
    ErrorBoundary.tsx         # Error boundary
    navbar/                   # Navbar, NavLinks, UserMenu, MobileMenu, navConfig
    appraiser/                # Site Appraiser components
      ProjectOverview.tsx     # Project list / overview
      ProjectSidebar.tsx      # Sidebar for project navigation
      SiteDetailPanel.tsx     # Individual site detail view
      ElectricityPriceWidget.tsx  # Electricity price comparison (state vs US avg)
    broadband/                # Broadband Lookup components
      BroadbandReport.tsx       # Due diligence report display
    power-map/                # Grid Power Analyzer components
      PowerMapView.tsx        # Main map container (MapLibre GL)
      MapLegend.tsx           # Layer toggles and source legend
      MapStats.tsx            # Viewport statistics panel
      PlantPopup.tsx          # Power plant info popup
    site-request/             # Site Request components
      PipelineColumn.tsx      # Kanban column
      RequestCard.tsx         # Request card in pipeline
    EnergyBridge.tsx          # Energy bridge visualization
    Header.tsx                # Section header
    OutcomeBar.tsx            # Outcome bar chart
    PowerScale.tsx            # Power scale visualization
    PowerSlider.tsx           # MW slider input
    PresentationView.tsx      # Presentation/summary view
    SetupPanel.tsx            # Site setup form panel
    SiteSwitcher.tsx          # Switch between sites
    ValueCard.tsx             # Value display card
  pages/
    Dashboard.tsx             # Tool grid (root page "/")
    LoginPage.tsx             # Firebase auth login
    SiteRequestForm.tsx       # Site request submission form
    UserManagement.tsx        # User management (admin-only)
  tools/
    SiteAppraiserTool.tsx     # Site Appraiser tool ("/site-appraiser")
    BroadbandLookupTool.tsx   # Broadband Lookup tool ("/broadband-lookup")
    SiteRequestPipeline.tsx   # Site Request pipeline ("/site-request")
    GridPowerAnalyzer.tsx     # Grid Power Analyzer ("/grid-power-analyzer")
  hooks/
    useAuth.ts                # Firebase auth state + user role from Firestore
    useAppraisal.ts           # Appraisal calculation logic
    useProjects.ts            # Project CRUD operations
    useSites.ts               # Site CRUD operations
    useSiteRequests.ts        # Site request CRUD operations
    useUsers.ts               # User management CRUD (admin)
    useBroadbandLookup.ts     # Broadband data lookup
    usePowerMap.ts            # Power map data fetching and state
    useAnimatedNumber.ts      # Number animation utility
  lib/
    firebase.ts               # Firebase config
    projects.ts               # Project Firestore operations
    siteRequests.ts           # Site request Firestore operations
    broadbandLookup.ts        # Broadband data lookup (FCC Census + ArcGIS BDC)
    electricityAverages.ts    # State-level electricity price averages (EIA data)
    eiaConsumption.ts         # State-level power consumption estimates (EIA data)
    powerMapData.ts           # Power map data fetching and availability calculations
  types/
    index.ts                  # UserRole, Project, SiteInputs, AppraisalResult, SavedSite, SiteRequest, etc.
  utils/
    format.ts                 # Formatting helpers
```

## Routes

| Path | Component | Roles | Description |
|------|-----------|-------|-------------|
| `/login` | `LoginPage` | — | Firebase auth login |
| `/` | `Dashboard` | all | Tool grid (filtered by role) |
| `/site-appraiser` | `SiteAppraiserTool` | admin, employee | Site appraisal tool (employees see assigned projects only) |
| `/broadband-lookup` | `BroadbandLookupTool` | admin, employee | Broadband due diligence report |
| `/site-pipeline` | `SiteRequestPipeline` | admin | Request pipeline (kanban) |
| `/site-request/form` | `SiteRequestForm` | admin, employee | Submit new site request |
| `/grid-power-analyzer` | `GridPowerAnalyzer` | admin | Power generator map with availability heat map |
| `/user-management` | `UserManagement` | admin | Manage users and roles |
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

## Worktree / Branch Workflow

**IMPORTANT:** When working in a git worktree, ALWAYS sync with `origin/main` before creating a feature branch:

```bash
git fetch origin main
git merge origin/main
```

This ensures you are coding against the latest files. Skipping this step will cause you to edit stale code and create painful merge conflicts.

## Key Patterns & Conventions

### Adding a New Tool/Page

When adding a new route, you MUST update these files:

1. **`src/App.tsx`** — Add the route inside `<Routes>`, wrapped in `<ProtectedRoute>`
2. **`src/components/Breadcrumb.tsx`** — Add the path and label to `routeLabels` map
3. **`src/pages/Dashboard.tsx`** — Add the tool card to the `tools` array

### Breadcrumb Navigation

- Lives in `src/components/Breadcrumb.tsx`
- Rendered automatically by `Layout.tsx` on every page
- Hidden on the root dashboard page (`/`)
- Uses a `routeLabels` record to map paths to display names
- **Always update `routeLabels` when adding or renaming a route**

### Layout

All protected pages must be wrapped in `<Layout>` which provides:
- Sticky navbar
- Breadcrumb navigation
- Centered content container (`max-w-5xl`), or full-width via `fullWidth` prop

### Data Hierarchy

- **Projects** contain multiple **Sites** (Site Appraiser)
- **Site Requests** are linked to Projects via `projectId`
- **Projects** have a `memberIds: string[]` field — an array of Firebase UIDs for site visibility
- Deleting a Project cascade-deletes its Sites and Site Requests

### Site Visibility (memberIds)

- Each **Project** has a `memberIds` array of user UIDs
- **Admins** bypass the filter — they see all projects and sites
- **Employees** only see projects where their UID is in `memberIds`
- When an employee submits a Site Request, their UID is auto-added to the new project's `memberIds`
- When an admin creates a project in Site Appraiser, they can assign members via the sidebar UI
- Multiple employees can be assigned to the same project (both see it)
- Member management UI (add/remove) is in the `ProjectSidebar` (admin-only)
- Filtering happens in `useProjects` hook — employees get a filtered list; sites are filtered accordingly in `SiteAppraiserTool`

### Auth & Roles

- Firebase auth via `useAuth` hook, which returns `{ user, role, loading, logout }`
- `role` is fetched from the Firestore `users/{uid}` collection (`UserRole = 'admin' | 'employee'`)
- Users without a Firestore `users` doc are denied access (redirected to `/login`)
- Protected routes use `<ProtectedRoute>` wrapper with optional `allowedRoles` prop
- Route-level access: `allowedRoles={['admin']}` restricts to admins; omit for all roles
- Dashboard and navbar filter visible tools/links based on `role`
- **Admin**: access to all tools (Site Appraiser, Site Pipeline, Site Request form, User Management)
- **Employee**: access to Site Request form and Site Appraiser (filtered to assigned projects only)
- Login page is at `/login`

### Navigation Config

- `src/components/navbar/navConfig.ts` holds the `navLinks` array for navbar items

## Commands

```bash
npm install      # Install dependencies
npm run dev      # Start dev server
npm run build    # Production build
npx tsc --noEmit # Type-check without emitting
```
