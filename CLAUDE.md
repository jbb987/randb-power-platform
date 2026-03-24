# CLAUDE.md — R&B Power Platform

> **Keep this file up to date.** Whenever you add, rename, or remove routes, tools, components, hooks, or lib files, update this document to reflect the change.

## Project Overview

Internal tool suite for R&B Power. Currently has two tools:
- **Site Appraiser** — Evaluates renewable energy site value based on power capacity, acreage, and land comparables. Sites are organized under Projects.
- **Site Request** — Kanban pipeline for tracking site requests through stages (new → ongoing → done).

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
  components/
    Layout.tsx                # Shared page wrapper (Navbar + Breadcrumb + content)
    Breadcrumb.tsx            # Route-aware breadcrumb navigation
    ProtectedRoute.tsx        # Auth gate
    ErrorBoundary.tsx         # Error boundary
    navbar/                   # Navbar, NavLinks, UserMenu, MobileMenu, navConfig
    appraiser/                # Site Appraiser components
      ProjectOverview.tsx     # Project list / overview
      ProjectSidebar.tsx      # Sidebar for project navigation
      SiteDetailPanel.tsx     # Individual site detail view
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
  tools/
    SiteAppraiserTool.tsx     # Site Appraiser tool ("/site-appraiser")
    SiteRequestPipeline.tsx   # Site Request pipeline ("/site-request")
  hooks/
    useAuth.ts                # Firebase auth state
    useAppraisal.ts           # Appraisal calculation logic
    useProjects.ts            # Project CRUD operations
    useSites.ts               # Site CRUD operations
    useSiteRequests.ts        # Site request CRUD operations
    useAnimatedNumber.ts      # Number animation utility
  lib/
    firebase.ts               # Firebase config
    projects.ts               # Project Firestore operations
    siteRequests.ts           # Site request Firestore operations
  types/
    index.ts                  # Project, SiteInputs, AppraisalResult, SavedSite, SiteRequest, etc.
  utils/
    format.ts                 # Formatting helpers
```

## Routes

| Path | Component | Description |
|------|-----------|-------------|
| `/login` | `LoginPage` | Firebase auth login |
| `/` | `Dashboard` | Tool grid (root) |
| `/site-appraiser` | `SiteAppraiserTool` | Site appraisal tool |
| `/site-pipeline` | `SiteRequestPipeline` | Request pipeline (kanban) |
| `/site-request/form` | `SiteRequestForm` | Submit new site request |
| `/site-request` | Redirect → `/site-pipeline` | Legacy redirect |

## Design System

- **Brand red:** `#C1121F`
- **Background:** `#E8E6E3`
- **Text primary:** `#201F1E`
- **Text muted:** `#7A756E`
- **Border:** `#D8D5D0`
- Cards use `bg-white rounded-xl shadow-sm border border-[#D8D5D0]`
- Font heading class: `font-heading`

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
- Deleting a Project cascade-deletes its Sites and Site Requests

### Auth

- Firebase auth via `useAuth` hook
- Protected routes use `<ProtectedRoute>` wrapper
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
