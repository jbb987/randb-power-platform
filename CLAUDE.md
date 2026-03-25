# CLAUDE.md — R&B Power Platform

> **Keep this file up to date.** Whenever you add, rename, or remove routes, tools, components, hooks, or lib files, update this document to reflect the change.

## Project Overview

Internal tool suite for R&B Power. Currently has three tools:
- **Site Appraiser** — Evaluates renewable energy site value based on power capacity, acreage, and land comparables. Sites are organized under Projects.
- **Site Request** — Kanban pipeline for tracking site requests through stages (new → ongoing → done).
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
    SiteRequestPipeline.tsx   # Site Request pipeline ("/site-request")
  hooks/
    useAuth.ts                # Firebase auth state + user role from Firestore
    useAppraisal.ts           # Appraisal calculation logic
    useProjects.ts            # Project CRUD operations
    useSites.ts               # Site CRUD operations
    useSiteRequests.ts        # Site request CRUD operations
    useUsers.ts               # User management CRUD (admin)
    useAnimatedNumber.ts      # Number animation utility
  lib/
    firebase.ts               # Firebase config
    projects.ts               # Project Firestore operations
    siteRequests.ts           # Site request Firestore operations
    electricityAverages.ts    # State-level electricity price averages (EIA data)
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
| `/site-appraiser` | `SiteAppraiserTool` | admin | Site appraisal tool |
| `/site-pipeline` | `SiteRequestPipeline` | admin | Request pipeline (kanban) |
| `/site-request/form` | `SiteRequestForm` | admin, agent | Submit new site request |
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
- Deleting a Project cascade-deletes its Sites and Site Requests

### Auth & Roles

- Firebase auth via `useAuth` hook, which returns `{ user, role, loading, logout }`
- `role` is fetched from the Firestore `users/{uid}` collection (`UserRole = 'admin' | 'agent'`)
- Users without a Firestore `users` doc are denied access (redirected to `/login`)
- Protected routes use `<ProtectedRoute>` wrapper with optional `allowedRoles` prop
- Route-level access: `allowedRoles={['admin']}` restricts to admins; omit for all roles
- Dashboard and navbar filter visible tools/links based on `role`
- **Admin**: access to all tools (Site Appraiser, Site Pipeline, Site Request form)
- **Agent**: access only to the Site Request form
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
