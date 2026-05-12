# R&B Power Platform — Audit

Living record of known issues across the codebase. Severity levels: **Critical**, **High**, **Medium**, **Low**. Status values: `open`, `fixed`, `wontfix`.

When fixing or discovering issues, update this document per the rules in `CLAUDE.md`.

## Critical

_None recorded._

## High

### H-2 — Site Analyzer Detail land-comps autosave wrote in an infinite loop

- **Status:** fixed (2026-04-29, v1.17.1, branch `fix/firestore-quota-phase-1`)
- **Files:** `src/tools/SiteAnalyzerDetail.tsx`
- **Description:** The land-comps autosave effect depended on the whole `site` reference. Every save echoed back through `onSnapshot`, replacing `site`, re-firing the effect, and scheduling another identical save 1 second later — a steady ~60 writes/min per open tab on any site with comps.
- **Impact:** Likely the dominant cause of Firestore daily write quota exhaustion (26K/20K observed 2026-04-29).
- **Fix:** keyed the effect on `site?.id`, added `lastSavedLandCompsRef` JSON-string comparison to skip no-op writes, and removed the `landComps.length === 0` early-return so "Clear All" persists.

### H-3 — Analysis writeback fanned out to 8 separate Firestore writes per run

- **Status:** fixed (2026-04-29, v1.17.1)
- **Files:** `src/tools/SiteAnalyzerDetail.tsx`, `src/lib/siteRegistry.ts`
- **Description:** Each Site Analyzer run wrote 7 sequential `updateDoc` calls (one per section + timestamp) plus a `user-history` entry. Each write also produced a snapshot to every active listener, amplifying read costs.
- **Fix:** new `saveAnalysisResults` helper merges every section + `piddrGeneratedAt` into a single `updateDoc`. 8 writes per run → 2 (1 registry + 1 history).

### H-4 — InfraRefreshPanel could write ~90K Firestore docs with one click

- **Status:** fixed (2026-04-29, v1.17.1)
- **Files:** `src/components/admin/InfraRefreshPanel.tsx`
- **Description:** The "Refresh Data" button called `refreshAllInfraData` immediately. A real run rewrites every cached plant + substation + EIA + solar record (~90K writes), more than 4× the daily free-tier write quota. No confirmation, no cooldown.
- **Fix:** confirmation modal showing the write count + cost; 7-day cooldown enforced client-side via the `lastRefreshedAt` log doc.

### H-5 — `logActivity` slider drags bypassed 60-second dedup

- **Status:** fixed (2026-04-29, v1.17.1)
- **Files:** `src/tools/SiteAppraiserTool.tsx`
- **Description:** The Site Appraiser logged a history entry every time `inputs.mw` changed. Because the dedup key included `mw`, dragging the slider through 99 distinct values produced 99 distinct history writes within seconds, all bypassing the 60s window.
- **Fix:** removed `mw` from the effect's trigger key + deps. The current `mw` value is still captured in the entry payload (so prefill from history works), but mw drags no longer fire the effect.

### H-6 — Filtered-comps median writeback was un-debounced

- **Status:** fixed (2026-04-29, v1.17.1)
- **Files:** `src/tools/SiteAnalyzerDetail.tsx`
- **Description:** `handleFilteredCompsChange` wrote `dollarPerAcreLow/High` synchronously on every median change. Comp-table edits / CSV pastes produced a flurry of intermediate medians, each a separate Firestore write.
- **Fix:** added 1-second debounce + `lastSavedMedianRef` dedup. Skips writes when median is unchanged.

### H-7 — Breadcrumb mounted full-collection listeners on every protected route

- **Status:** fixed (2026-04-29, v1.17.1)
- **Files:** `src/components/Breadcrumb.tsx`
- **Description:** `Breadcrumb` (rendered by every `Layout`) called `useCompanies()` and `useSiteRegistry()` unconditionally — even on routes (Power Calculator, Water, Gas, Broadband, Site Appraiser, Sales CRM, User Management) that never read those collections. With no shared `<Outlet />` route layout, these listeners also re-mounted on every navigation.
- **Fix:** split into `BreadcrumbMinimal` (no data hooks) and `BreadcrumbWithData` (CRM + Site Analyzer routes). The dispatcher picks the right variant by pathname. Phase 2 will further consolidate via a single shared `<Outlet />` layout + `SubscriptionsProvider` mounted once at the app root.

### H-8 — `detectIso` mislabeled Oklahoma sites as ERCOT

- **Status:** fixed (2026-05-12, v1.35.2, branch `fix/rto-oklahoma-bug`)
- **Files:** `src/lib/infraLookup.ts:75-156`, `src/lib/broadbandLookup.ts:462-513` (duplicate, removed)
- **Description:** Two duplicate `detectIso(lat, lng)` implementations classified any point in `lat 26-34.5, lng -104 to -94` as ERCOT, with carve-outs for El Paso, the Texas panhandle, and far-east TX — but **no carve-out for Oklahoma**. Sites in southern OK (e.g. Kenefic Pit at 34.17, -96.32, Bryan County) slipped through all three carve-outs and were falsely tagged ERCOT. ERCOT is intra-Texas only and never extends into OK, so the platform was authoritatively wrong on any OK site. Bug surfaced both on the Site Analyzer Power section and the Grid Power Map coordinate-search popup (both call the same lookup).
- **Impact:** Wrong RTO displayed for OK sites in Site Analyzer + PDF export + Grid Power Map popup. Stale cached `iso` values persist on existing `sites-registry` docs until each site is re-analyzed.
- **Fix:** `detectIso` now takes a resolved `state: string | null` and gates ERCOT on `state === 'TX'` (state is already in scope at both call sites — `detectedState` from `detectStateFromCoords` in infraLookup, `census.stateCode` from the FCC Block API in broadbandLookup). Eliminated the duplicate copy in `broadbandLookup.ts` — both files now share the exported `detectIso` from `infraLookup.ts`.
- **Stale data:** the existing Kenefic Pit site doc has `iso='ERCOT'` cached in `infraResult` and `broadbandResult`. Re-running the analysis for any affected site overwrites the cache with the correct value. No migration unless many OK sites accumulate.
- **Related (deferred):** see M-2 (SW Arkansas), M-3 (NC), and M-4 (north-TX bbox fallback) for latent same-class issues in other state-border regions.

### H-1 — User removal does not delete the Firebase Auth account

- **Status:** open
- **Reported:** 2026-04-27
- **Files:** `src/hooks/useUsers.ts:40-42`, `src/pages/UserManagement.tsx`
- **Description:** `removeUser()` deletes only the Firestore `users/{uid}` doc. The Firebase Auth account is left intact. Re-inviting the same email then fails with `auth/email-already-in-use` because the client SDK cannot delete other users' Auth accounts.
- **Impact:** Admins cannot cleanly off-board and re-add a user without manually deleting them in the Firebase Console first. Increases risk of stale Auth entries (security: ex-employees retain a usable Auth account even after removal from the app, though `useAuth` signs them out if the Firestore doc is missing).
- **Fix path:** Add a Firebase Cloud Function (Admin SDK) that deletes both the Auth user and the Firestore doc transactionally. Update `removeUser()` in `useUsers.ts` to call the function via `httpsCallable`.
- **Workaround:** Delete the Auth user manually in Firebase Console → Authentication → Users before re-inviting.

## Medium

### M-4 — `detectState` bbox fallback misclassifies north-TX sites as OK when both reverse-geocoding APIs fail

- **Status:** open
- **Reported:** 2026-05-12
- **Files:** `src/lib/stateBounds.ts` (OK rectangle), `src/lib/solarAverages.ts` (`detectState`, `detectStateFromCoords`)
- **Description:** The OK rectangle in `stateBounds.ts` has `latMin: 33.84`, which dips south of the actual TX-OK border (Red River, ~lat 33.7-34.0). Because OK is checked **before** TX in array order, the local bbox fallback returns `'OK'` for sites like Wichita Falls TX (33.91°N), Vernon TX (34.15°N), and other north-TX cities. This only manifests when both BigDataCloud AND Nominatim reverse-geocoding APIs fail — `detectStateFromCoords` prefers the live API result. The post-H-8 ERCOT state gate now makes this fallback misclassification flow through to a wrong RTO (TX site → 'OK' → SPP instead of ERCOT). Before H-8, the polygon-only `detectIso` was unaffected by state.
- **Impact:** Rare. Requires both reverse-geocoding APIs down simultaneously AND a north-TX coord. Affected sites would get SPP instead of ERCOT.
- **Fix path:** Tighten OK rectangle to `latMin: 34.0` (or use the actual Red River line) in `stateBounds.ts`. Possibly also re-order TX before OK in array, since checking the larger state first reduces false matches. Either fix is a one-line change.

### M-3 — North Carolina defaults to PJM though most of NC is SERC bilateral

- **Status:** open
- **Reported:** 2026-05-12
- **Files:** `src/lib/politicalRadar/rtoJurisdiction.ts:31` (NC → PJM), `src/lib/infraLookup.ts` PJM polygon
- **Description:** `STATE_TO_DEFAULT_RTO` maps `NC: 'PJM'`, and the PJM polygon in `detectIso` (`lat 36-42.5, lng -85.5 to -74`) claims most of NC. In reality only the far-western AEP slice of NC is in PJM — the bulk of NC (Duke Energy Carolinas, Duke Energy Progress) is SERC bilateral, not part of an organized RTO. Any NC site (e.g. Charlotte at 35.23, -80.84) will be reported as PJM today.
- **Impact:** Wrong RTO label on NC sites in Political Radar federal layer + Site Analyzer Power section.
- **Fix path:** Either swap to a true shapefile lookup (Tier 3 from the H-8 reflection), or split NC into utility-keyed sub-regions in `rtoJurisdiction.ts` and add a state-aware carve-out to the PJM polygon. Same class of bug as H-8 but inverse direction.

### M-2 — Southwest Arkansas may be misclassified MISO when it should be SPP (AECC territory)

- **Status:** open
- **Reported:** 2026-05-12
- **Files:** `src/lib/infraLookup.ts` MISO polygon, `src/lib/politicalRadar/rtoJurisdiction.ts:41` (AR → MISO)
- **Description:** `STATE_TO_DEFAULT_RTO` maps `AR: 'MISO'`, and the MISO south polygon in `detectIso` (`lat 29-37, lng -97 to -88`) claims all of Arkansas. In reality the southwestern slice of AR around Hope / Texarkana — served by Arkansas Electric Cooperative Corporation (AECC) — is SPP, not MISO.
- **Impact:** Wrong RTO label on AECC-served AR sites. No active sites in this area today, so cosmetic only for now.
- **Fix path:** Add a utility-keyed sub-region carve-out or, preferably, swap to HIFLD shapefile lookup. Same class of bug as H-8.

### M-1 — Orphaned Firestore collections from removed Site Pipeline / Submit Site Request tools

- **Status:** open
- **Reported:** 2026-04-29
- **Collections:** `site-requests`, `sites`, `projects` (Firestore project: `randb-site-valuator`)
- **Description:** The Site Pipeline (`/site-pipeline`) and Submit Site Request (`/site-request/form`) tools were removed in v1.16.2. They wrote to three Firestore collections that are no longer read by any code in the app: `site-requests` (kanban data), `sites` (legacy appraiser stub records — distinct from the live `sites-registry`), and `projects` (legacy folder grouping).
- **Impact:** Negligible storage cost; no functional impact. Data is not exposed in the UI. Confusing names (`sites` vs `sites-registry`) increase the risk of accidental deletion of live data during cleanup.
- **Action plan:** Leave in place for ~6 weeks (review on or after **2026-06-10**) to confirm no regression / no need to restore. After that window, export the three collections as a backup via Firebase Console, then delete.
- **DO NOT delete:** `sites-registry`, `crm-companies`, `crm-contacts`, `crm-documents`, `users`, `leads`, or any cached infrastructure collection — these are live.

## Low

_None recorded._

## Design Decisions

- **Data access model (2026-04-27):** Tool access (`allowedTools` per user) is the only data-access gate. Once a user has a tool, they see the full dataset for that tool — no per-user, per-project, or per-creator scoping. Companies, Contacts, Documents, Sites, and Site Requests all follow this model.
- **Sales CRM exception (2026-04-27):** `useLeads.ts` filters leads by `assignedTo === user.uid` for non-admins. Intentional — sales reps need "my leads" segregation. Admins still see all.
- **Legacy fields preserved:** `SiteRegistryEntry.createdBy`, `memberIds`, `projectId`, `owner` are written but not read for filtering. Kept for data integrity on existing documents; do not rely on them in new code.

## Changelog

| Date       | Author | Notes                                                                                                                                                                                                                                                                                                                                                                                                        |
| ---------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 2026-04-27 | Claude | Initial audit file. Logged H-1 (incomplete user removal).                                                                                                                                                                                                                                                                                                                                                    |
| 2026-04-27 | Claude | Audit pass on role/data-access simplification. Removed createdBy filter from site registry (v1.15.2). Documented sales-CRM exception. No further conflicts found.                                                                                                                                                                                                                                            |
| 2026-04-29 | Claude | Removed Site Pipeline + Submit Site Request tools (v1.16.2). Logged M-1 to flag orphaned `site-requests`/`sites`/`projects` collections for review on 2026-06-10.                                                                                                                                                                                                                                            |
| 2026-04-29 | Claude | Firestore quota phase 1 (v1.17.1): logged + fixed H-2 (land-comps loop), H-3 (analysis writeback fanout), H-4 (InfraRefreshPanel guardrails), H-5 (Site Appraiser logActivity slider spam), H-6 (filtered-comps debounce), H-7 (Breadcrumb route-gating). Phase 2 (SubscriptionsProvider + shared `<Outlet />` Layout + `findCompanyByName` rewrite + `useUsers` removal from Sales CRM) tracked separately. |
| 2026-05-12 | Claude | Fixed H-8 (RTO/ISO misclassification for OK GPS sites, v1.35.2). State-gated ERCOT in `detectIso`, removed duplicate copy. Logged M-2 (SW Arkansas MISO/SPP), M-3 (NC PJM/SERC), and M-4 (north-TX bbox fallback) as latent same-class issues to address via shapefile lookup later.                                                                                                                         |
