# R&B Power Platform — Audit

Living record of known issues across the codebase. Severity levels: **Critical**, **High**, **Medium**, **Low**. Status values: `open`, `fixed`, `wontfix`.

When fixing or discovering issues, update this document per the rules in `CLAUDE.md`.

## Critical

_None recorded._

## High

> **Security review 2026-06-18** (multi-agent audit, 39 verified findings). Threat model: internal employee tool — attackers are a malicious/compromised low-privilege (`labor`) employee using the Firebase SDK directly, an external unauthenticated party hitting backend endpoints, or leaked secrets. Fixes landed on branch `security/platform-hardening`; **Firestore/Storage rule changes require emulator testing + `firebase deploy --only firestore,storage` to take effect.**

### H-11 — No version-controlled Firebase Storage rules (Storage boundary unmanaged)
- **Status:** `fixed` (2026-06-18, branch `security/platform-hardening`).
- `firebase.json` deployed only firestore+functions; there was NO `storage.rules` file, so the ruleset protecting every uploaded blob (CRM/Legal/Invoice documents, construction photos) lived only in the Firebase console — unversioned, unreviewable, possibly on Firebase's permissive default.
- **Fix:** added `storage.rules` (default-deny + per-path `request.auth != null` floor with size/content-type limits) and registered it in `firebase.json`. **Export the current console ruleset first to confirm it isn't default-open, then `firebase deploy --only storage`.**

### H-12 — Sales leads (decision-maker mobile PII) readable/writable by ANY authenticated employee
- **Status:** `fixed` (2026-06-18, branch `security/platform-hardening`).
- `firestore.rules:leads` was `isAuthed()` only; the Sales-tool gate was client-side. Any employee (incl. `labor` never granted Sales) could bulk-read every decision-maker mobile + notes, or write/delete the pipeline, via the SDK/REST.
- **Fix:** `match /leads` now `allow read, write: if isAdmin() || hasTool('sales-crm')` — enforcing the documented "tool access is the gate" model at the server.

### H-13 — Folder/document ACLs enforced client-side only (any employee reads/writes/archives all documents)
- **Status:** `open` — DEFERRED (wave 3, needs design + migration).
- Rules grant `documents`/`folders` `read,write: if isAuthed()`; per-item "Manage Access" ACLs live only in the React UI (CLAUDE.md admits server-side is deferred). Any employee can read/write/archive every document — incl. Legal/Invoices and the CEO's Bailey Project docs — and self-elevate a folder ACL, by querying Firestore directly.
- **Fix (planned):** denormalize resolved viewer/editor allow-lists + companyId onto each doc (ancestor walk) at write time + a backfill migration, enforce in rules, and serve sensitive blobs via signed URLs.

### H-14 — MCP document-id path injection → read ANY Firestore collection
- **Status:** `fixed` (2026-06-18, branch `security/platform-hardening`).
- `mcp/firestore/client.ts getDoc` interpolated a caller-supplied id into the REST path; `get_site`/`get_company`/`get_llr` took `id: z.string()`, so `id="../users/<uid>"` escaped the collection and read arbitrary collections (the MCP service account bypasses rules).
- **Fix:** `assertSafePathSegment` (strict `^[A-Za-z0-9_-]+$`) on collection+id in `getDoc`, plus `.regex()` on the three `getX` id schemas. **Residual:** the single shared bearer still grants unscoped full-DB read if leaked — scope the service account to a read-only custom role + CORS allow-list (follow-up).

### H-15 — Audit-log forgery via client-writable `user-history`
- **Status:** `fixed` (2026-06-18, branch `security/platform-hardening`).
- `user-history` was `read,write: if isAuthed()`; a Cloud Function mirrors it into the admin `activity` log, so any employee could forge audit entries attributed to other users and read/delete others' history.
- **Fix:** create only when `request.resource.data.userId == request.auth.uid`; read own (or admin); no update/delete.

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

### H-9 — Labor Pool ACS demographic fetch blocked by CORS, MSA resolution stubbed null

- **Status:** fixed (2026-05-12, v1.35.3 + v1.35.4, branches `fix/census-acs-cors-proxy` and `fix/worker-side-census-key`)
- **Files:** `functions/worker.ts`, `vite.config.ts`, `src/lib/laborAnalysis.ts`, `.env.example`
- **Description:** `laborAnalysis.ts:534` fetched `https://api.census.gov/data/.../acs/acs5/profile` directly from the browser. Census ACS does not send CORS headers, so every analysis raised `Access-Control-Allow-Origin` errors in console and the ACS-derived fields (population, unemployment, education, age bands, commute) silently fell back to seed estimates with an `acsError` flag. Additionally, MSA resolution via `geocoding.geo.census.gov` was stubbed to return `null` (`resolvedMsa` never populated) for the same CORS reason, per the comment block at line 9 and `CLAUDE.md`.
- **Impact:** Labor Pool section showed seed data + a partial-failure indicator for every site analyzed; `resolvedMsa` field unavailable in the browser since launch.
- **Fix (v1.35.3):** Added two routes to the Cloudflare Worker `PROXY_ROUTES` (`/api/census` → `api.census.gov` and `/api/census-geocoder` → `geocoding.geo.census.gov`) plus matching Vite dev proxies. `laborAnalysis.ts` now routes the ACS call through `/api/census/...` and resolves MSA via a new `resolveMsa()` helper that hits `/api/census-geocoder/geocoder/geographies/coordinates`. Documented `VITE_CENSUS_API_KEY` and `VITE_BLS_API_KEY` in `.env.example`.
- **Follow-up fix (v1.35.4):** v1.35.3 still failed in production because `VITE_CENSUS_API_KEY` was set under the Worker's runtime "Variables & Secrets" (not build-time), so it was never inlined into the client bundle and the proxied URL omitted the `&key=...` param — Census responded with the "Missing Key" HTML page. Moved key injection server-side: the Cloudflare Worker now reads `env.VITE_CENSUS_API_KEY` and appends it to forwarded `/api/census` requests when not already present. Side benefit: the key never appears in the client JS bundle.
- **Production env:** `VITE_CENSUS_API_KEY` set in the Worker's runtime variables (server-side injection). `VITE_BLS_API_KEY` is build-time-only (Vite-inlined); future symmetric move to Worker-side injection would be a clean follow-up.
- **Stale data:** Existing site docs with `acsError` cached in `laborResult` won't auto-heal. Users must unlock the Labor section and re-run analysis per affected site.

### H-8 — `detectIso` mislabeled Oklahoma sites as ERCOT

- **Status:** fixed (2026-05-12, v1.35.2, branch `fix/rto-oklahoma-bug`)
- **Files:** `src/lib/infraLookup.ts:75-156`, `src/lib/broadbandLookup.ts:462-513` (duplicate, removed)
- **Description:** Two duplicate `detectIso(lat, lng)` implementations classified any point in `lat 26-34.5, lng -104 to -94` as ERCOT, with carve-outs for El Paso, the Texas panhandle, and far-east TX — but **no carve-out for Oklahoma**. Sites in southern OK (e.g. Kenefic Pit at 34.17, -96.32, Bryan County) slipped through all three carve-outs and were falsely tagged ERCOT. ERCOT is intra-Texas only and never extends into OK, so the platform was authoritatively wrong on any OK site. Bug surfaced both on the Site Analyzer Power section and the Grid Power Map coordinate-search popup (both call the same lookup).
- **Impact:** Wrong RTO displayed for OK sites in Site Analyzer + PDF export + Grid Power Map popup. Stale cached `iso` values persist on existing `sites-registry` docs until each site is re-analyzed.
- **Fix:** `detectIso` now takes a resolved `state: string | null` and gates ERCOT on `state === 'TX'` (state is already in scope at both call sites — `detectedState` from `detectStateFromCoords` in infraLookup, `census.stateCode` from the FCC Block API in broadbandLookup). Eliminated the duplicate copy in `broadbandLookup.ts` — both files now share the exported `detectIso` from `infraLookup.ts`.
- **Stale data:** the existing Kenefic Pit site doc has `iso='ERCOT'` cached in `infraResult` and `broadbandResult`. Re-running the analysis for any affected site overwrites the cache with the correct value. No migration unless many OK sites accumulate.
- **Related (deferred):** see M-2 (SW Arkansas), M-3 (NC), and M-4 (north-TX bbox fallback) for latent same-class issues in other state-border regions.

### H-10 — "Utility Territory" was the nearest transmission owner, never the retail/distribution utility (co-ops invisible)

- **Status:** fixed (2026-06-17, v1.67.0, branch `feat/retail-utility-territory`)
- **Files:** `src/lib/infraLookup.ts` (`deriveUtility`), `src/lib/retailUtility.ts` (new), `src/components/power-calculator/TerritorySection.tsx`, `src/hooks/useSiteAnalysis.ts`, `scripts/backfill-retail-utility.mjs`, `research/utility-territory/`
- **Description:** `deriveUtility()` set the displayed "Utility Territory"/TSP to the **most frequent transmission-line OWNER** within ~10 mi. That names the transmission owner, not the retail/distribution utility. Rural electric co-ops own little high-voltage transmission, so they were **structurally invisible** — any site in co-op territory was mislabeled. Surfaced when R&B contacted the named utility for the Kenefic Pit site and was told it is served by a co-op (Southeastern Electric Cooperative), not the named entity. Same root class as H-8 (heuristic instead of authoritative boundary data). The value was also never persisted (`utility=null` on all 80 registry sites).
- **Impact:** Wrong serving utility shown in Site Analyzer + PDF; led to contacting the wrong utility on a live deal. Empirical audit of all 80 sites found 10 co-op sites the heuristic would mislabel + 22 ambiguous (overlapping-territory) sites.
- **Fix:** New `resolveRetailUtility(lat,lng)` does point-in-polygon against the Electric Retail Service Territories layer (ORNL/HIFLD/EIA), ranks the (always-overlapping) candidates by **interiority** (distance-to-boundary), and applies a **conservative confidence rule** — auto-pick only when safe, otherwise surface a 2–3 candidate shortlist for a human pick. Validated on 8 known sites: 100% recall, **0 wrong auto-picks**. Modeled as a separate field (retail utility) distinct from transmission owner + RTO; the old field is relabeled "Transmission Owner (nearby lines)". Human confirmation persists in top-level `retailUtilityConfirmedName` (survives re-analysis). Full method + numbers in `research/utility-territory/FINDINGS.md`.
- **Follow-ups (deferred):** NREL utility lookup as an independent second vote (couldn't validate this session — endpoint unreachable); EIA-861 county cross-check to prune shortlists; self-host the polygon snapshot for hosting stability; wire the retail utility into the LLR/Exhibit-A report. This also retires the H-8/M-2/M-3/M-4 "swap to shapefile lookup" recommendation for the *retail* layer.

### H-1 — User removal does not delete the Firebase Auth account

- **Status:** open
- **Reported:** 2026-04-27
- **Files:** `src/hooks/useUsers.ts:40-42`, `src/pages/UserManagement.tsx`
- **Description:** `removeUser()` deletes only the Firestore `users/{uid}` doc. The Firebase Auth account is left intact. Re-inviting the same email then fails with `auth/email-already-in-use` because the client SDK cannot delete other users' Auth accounts.
- **Impact:** Admins cannot cleanly off-board and re-add a user without manually deleting them in the Firebase Console first. Increases risk of stale Auth entries (security: ex-employees retain a usable Auth account even after removal from the app, though `useAuth` signs them out if the Firestore doc is missing).
- **Fix path:** Add a Firebase Cloud Function (Admin SDK) that deletes both the Auth user and the Firestore doc transactionally. Update `removeUser()` in `useUsers.ts` to call the function via `httpsCallable`.
- **Workaround:** Delete the Auth user manually in Firebase Console → Authentication → Users before re-inviting.

## Medium

### M-5 — CRM writable by any authenticated employee (incl. labor)
- **Status:** `fixed` (2026-06-18, branch `security/platform-hardening`) — `crm-companies`/`crm-contacts`/`crm-documents` writes now `roleIn(['admin','manager','employee'])`; reads stay broad because CRM is a cross-cutting directory read by Site Analyzer / Construction.

### M-6 — Broad `isAuthed()` read/write on sites-registry/sites/projects/preconstruction-sites/one-line-diagrams/folders/documents
- **Status:** `open` (partly by design). The "tool access is the gate" model (Design Decisions) was enforced client-side only. Leads (H-12) and CRM writes (M-5) are now server-enforced; the document tree is H-13; remaining lower-sensitivity collections are tracked for the server-side tool-gate rollout.

### M-7 — `revealLeadPhone` authz bypassable via self-assigning a lead (Apollo credit + PII abuse)
- **Status:** `partial` (2026-06-18) — leads now gated to admins/sales-tool holders (H-12), shrinking the population to sales reps. Pinning `assignedTo` immutable on update (admin-only reassignment) is the remaining follow-up.

### M-8 — Persisted long-lived Firebase download tokens on photo docs
- **Status:** `open` — `constructionPhotos.ts` stores tokenized download URLs in Firestore, granting shareable rule-bypassing blob access. Follow-up: store only `storagePath` and resolve fresh scoped URLs at view time (as `documentRecords.ts` already does).

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
- **DO NOT delete:** `sites-registry`, `crm-companies`, `crm-contacts`, `users`, `leads`, or any cached infrastructure collection — these are live.
- **`crm-documents` rollback safety net (delete after 2026-06-13):** the legacy `DocumentsSection` UI was retired on 2026-05-27 once the folder system stabilized; the Firestore collection is kept as a 30-day rollback safety net. After **2026-06-13**, export the collection as a backup, then delete it AND retire the dormant `onDocumentWrite` Cloud Function trigger at `functions/src/activity/triggers.ts:139` (no app code writes to `crm-documents` anymore).

## Low

- **L-2 — Security review lows (2026-06-18, branch `security/platform-hardening`):**
  - **Cloud Run services have no app-level auth** (pdq / rrc-bulks / tippecanoe) — exposure rests on Cloud Run IAM. **VERIFIED not-public 2026-06-18:** `gcloud run services get-iam-policy` across all 33 services (functions + the 3 ingest services) shows NO `allUsers`/`allAuthenticatedUsers` invoker bindings — none are publicly invocable (the no-app-auth worst case of public tippecanoe GCS-overwrite / pdq-rrc DoS is therefore not reachable). `ingress` is `all` (network-reachable but IAM-gated). **Optional defense-in-depth:** set `--ingress=internal` on the purely-internal trigger/scheduled services (keep `apollophonewebhook` + `revealleadphone` reachable for their callers).
  - **construction-jobs role gate checked dead `'employee'`** (role renamed to `manager`) → managers locked out / broad-access branch matched nobody. **Fixed:** rules now accept `employee || manager` in both job tools.
  - **NREL + BLS API keys inlined into the client bundle** (free, rate-limited = low). The NREL key also appears in **git history** → **rotate it** (current source already reads `import.meta.env.VITE_NREL_API_KEY`). Long-term: proxy via the Cloudflare Worker like Census/Congress.
  - **MCP bearer compare early-returns on length mismatch** → leaks token length via timing (minor; hash-then-constant-compare to fix).
  - **Transitive dependency vulns** — `fixed` (2026-06-18) the HIGH/critical tier via non-breaking `npm audit fix` across all 5 packages (root SPA → **0 vulns**, build verified; functions 16→8, pdq 14→7, rrc 14→7, tippecanoe 10→5 — all remaining are **moderate**). The remaining moderates require breaking major-bumps of the Firebase/Google SDKs (`firebase-admin`/`firebase-functions` transitive `form-data`/`ws`/`grpc-js`/`protobufjs`/`fast-xml-builder`/`tmp`) — deferred to a staged `npm audit fix --force` with emulator/staging test, since these backends can't be runtime-tested here.
  - **`users/{uid}` read exposes every employee's email + role** to any authed user (low; internal directory, but consider scoping to self + admin).

- **L-1 — Custom ramp auto-complete ignored the established pace (fixed 2026-06-15, v1.64.1):** `rampFromIncrements` filled a target shortfall at the 100 MW/yr base cap regardless of how fast the user's manual increments ramped. A hand-entered `[0,0,0,0,3000,3000]` ramp (6000 MW) against a 6500 MW target crawled the last 500 MW at 100/yr across five years (6100→6200→…→6500, "full capacity by 2037"). Fix: the auto-complete cap is now floored by the fastest user-entered year, so the remainder finishes at the established pace (now 0,0,0,0,3000,6000,6500, full by 2033). Pure-logic change in `src/lib/rampSchedule.ts`; auto ramp and slow custom ramps unaffected; ramp-lands-exactly-on-target invariant preserved. Same change also caps the result at `maxYears` phases: when manual increments already fill the 12-year budget but fall short of target, the shortfall folds into the final entered year instead of appending a 13th year that overflowed the fixed-width chart + PDF.

## Design Decisions

- **Data access model (2026-04-27):** Tool access (`allowedTools` per user) is the only data-access gate. Once a user has a tool, they see the full dataset for that tool — no per-user, per-project, or per-creator scoping. Companies, Contacts, Documents, Sites, and Site Requests all follow this model.
- **Sales CRM exception (2026-04-27):** `useLeads.ts` filters leads by `assignedTo === user.uid` for non-admins. Intentional — sales reps need "my leads" segregation. Admins still see all.
- **Legacy fields preserved:** `SiteRegistryEntry.createdBy`, `memberIds`, `projectId`, `owner` are written but not read for filtering. Kept for data integrity on existing documents; do not rely on them in new code.
- **Server-side enforcement of the tool-access gate (2026-06-18):** the "tool access is the gate" model was historically enforced only in the SPA router, leaving the Firestore rules at `isAuthed()` — so any logged-in employee could bypass the UI via the SDK. The security review began enforcing it server-side: `leads` now require `hasTool('sales-crm')` and CRM writes require a role. The folder/document tree's per-item ACL (H-13) and the remaining broad-`isAuthed` collections (M-6) are the outstanding work to fully realize this model in rules.

## Changelog

| Date       | Author | Notes                                                                                                                                                                                                                                                                                                                                                                                                        |
| ---------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 2026-04-27 | Claude | Initial audit file. Logged H-1 (incomplete user removal).                                                                                                                                                                                                                                                                                                                                                    |
| 2026-04-27 | Claude | Audit pass on role/data-access simplification. Removed createdBy filter from site registry (v1.15.2). Documented sales-CRM exception. No further conflicts found.                                                                                                                                                                                                                                            |
| 2026-04-29 | Claude | Removed Site Pipeline + Submit Site Request tools (v1.16.2). Logged M-1 to flag orphaned `site-requests`/`sites`/`projects` collections for review on 2026-06-10.                                                                                                                                                                                                                                            |
| 2026-04-29 | Claude | Firestore quota phase 1 (v1.17.1): logged + fixed H-2 (land-comps loop), H-3 (analysis writeback fanout), H-4 (InfraRefreshPanel guardrails), H-5 (Site Appraiser logActivity slider spam), H-6 (filtered-comps debounce), H-7 (Breadcrumb route-gating). Phase 2 (SubscriptionsProvider + shared `<Outlet />` Layout + `findCompanyByName` rewrite + `useUsers` removal from Sales CRM) tracked separately. |
| 2026-05-12 | Claude | Fixed H-8 (RTO/ISO misclassification for OK GPS sites, v1.35.2). State-gated ERCOT in `detectIso`, removed duplicate copy. Logged M-2 (SW Arkansas MISO/SPP), M-3 (NC PJM/SERC), and M-4 (north-TX bbox fallback) as latent same-class issues to address via shapefile lookup later.                                                                                                                         |
| 2026-05-12 | Claude | Fixed H-9 (Census ACS CORS + MSA resolution gap, v1.35.3). Added `/api/census` and `/api/census-geocoder` proxy routes to Cloudflare Worker + Vite. Wired live MSA resolution. Documented `VITE_CENSUS_API_KEY` and `VITE_BLS_API_KEY` in `.env.example`; both keys now set in Cloudflare Pages production env.                                                                                              |
| 2026-06-18 | Claude | Multi-agent security review (39 verified findings). Branch `security/platform-hardening` wave 1–2: **fixed** H-11 (added version-controlled `storage.rules`), H-12 (leads PII → `hasTool('sales-crm')`), H-14 (MCP doc-id path-injection guard), H-15 (`user-history` forgery lockdown), M-5 (CRM writes role-gated), and the construction-jobs dead-`employee` role bug. **Open:** H-13 (folder/document server-side ACL + migration), M-6/M-7/M-8, transitive dependency vulns. **Operational:** verify Cloud Run IAM is not public; rotate the NREL key. Rule changes need emulator testing + `firebase deploy --only firestore,storage`. |
| 2026-06-15 | Claude | Logged + fixed L-1 (custom ramp auto-complete ignored the user-established pace, v1.64.1). Reproduced the Crowell, TX 6500 MW exec-summary ramp; floored the auto-complete cap by the fastest entered year in `rampFromIncrements`. Synced CLAUDE.md + whitepaper ramp-invariant text.                                                                                                                          |
| 2026-06-17 | Claude | Logged + fixed H-10 (utility territory was the nearest transmission owner, not the retail utility — co-ops invisible; surfaced on Kenefic Pit, v1.67.0). New `resolveRetailUtility` (service-territory point-in-polygon + interiority ranking + conservative confidence rule), separate retail/transmission/RTO fields, persisted human override, backfill script. Validated on 8 known sites (100% recall, 0 wrong auto-picks). Research + audit in `research/utility-territory/`. |
