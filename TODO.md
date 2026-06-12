# TODO — R&B Power Platform

**Exhibit A customer report + Whitepaper (feat/exhibit-a-report, v1.60.0 — 2026-06-12)**

- [x] **Merged to main + deployed**: PR #150 (report rework), #151 (ROM basis row removed + map tile retry/sequential build), #152 (water CORS proxies: NLDI/ECHO/drought), #153 (NLDI /navigation/ path + ECHO 429 backoff). (done 2026-06-12)
- [ ] **Per-site pre-export checklist for the 6 NTNSM sites** (then send reports to Scott — invoice trigger): county/coordinates/address set; unlock + re-run sections whose MW changed (Joshua gas ran at 100 MW vs 200 MW site); link LLR grade so Status reads "engineer-reviewed". (source: conversation 2026-06-12)
- [ ] **Re-run Water on Joshua once NWI recovers** — USFWS wetlands service was hard-down 2026-06-12 (41s → HTTP 500 direct). Do NOT re-run Water during an NWI outage: an unlocked re-run overwrites previously-good wetlands data with the error. (source: conversation 2026-06-12)
- [ ] **Wetlands fallback via Esri Living Atlas** (`services.arcgis.com/P3ePLMYs2RVChkJx/.../USA_Wetlands`) when the USFWS NWI server 500s — validate layer/fields first (initial probe returned 400; ArcGIS endpoints were flaky from JB's network during the session). (source: conversation 2026-06-12)
- [ ] **EPA ECHO 429s**: get_facilities now retries 3x with backoff, but EPA was rate-limiting even direct requests — if permits stay absent on a final export, retry in a different hour. (source: conversation 2026-06-12)
- [ ] **Fix Henry Hub benchmark date** — gas pricing renders "as of 2024-04-05" from the live EIA fetch; series/endpoint stale. (source: code review 2026-06-12)
- [ ] **Decide electricity-price duplication** — now in both Capacity & Load Viability rows and the Power Infrastructure block. (source: conversation 2026-06-12)
- [ ] **Cache GeoPlatform ArcGIS layers** (lines/plants) like Well Finder — Grid Power Analyzer hits the live service per visit and intermittently fails ("Failed to fetch"). (source: conversation 2026-06-12)
- [ ] **Phase 2: click-to-load full Grid Analyzer embed in the Power tab** with predefined-distance snapshot into the PDF. (source: conversation 2026-06-12)
- [ ] **Macro review follow-ups**: CI build gate on PRs; ~~version firestore.rules into the repo~~ (done 2026-06-12 on feat/todo-collaborative); first Vitest tests on pure engines (appraisal, rampSchedule, exhibitA, oneLine). (source: macro review 2026-06-12)

**Collaborative To-Do List (feat/todo-collaborative, v1.61.0 — 2026-06-12)**

- [x] **Made the To-Do List tool collaborative** per the 2026-06-12 brainstorm: single `assigneeUid` (anyone assigns to anyone via the user directory), `visibility: 'company' | 'private'` (Personal category defaults private; legacy docs without the field treated private), anyone-can-edit trust model, soft archive replaces hard delete (`archivedAt` + Restore view), `or()` subscription mirroring the read rule. Views: My tasks / Delegated / Team (person + category filters). Deviation from the logged spec: names resolve **live** via `useUsers`/`userLabel` instead of cached `ownerName`/`assigneeName` on the doc — matches the platform convention (construction tasks, folder access) and can't go stale on rename. Also fixed: `updateUserTaskFields` now converts explicit-`undefined` to `deleteField()` so clearing a due/"do on" date actually persists (was a silent no-op under `ignoreUndefinedProperties`). New `onUserTaskWrite` activity trigger (resource type `user-task`). (done 2026-06-12)
- [x] **Published the widened `user-tasks` Firestore rule** — deployed 2026-06-12 via `firebase deploy --only firestore:rules` (read+update: company-visible OR owner OR assignee; create: owner==self; delete: false). En route, knocked out the macro-review follow-up: **full ruleset now versioned in-repo as `firestore.rules`**, wired into `firebase.json` — rules deploy via CLI from now on, no more Console copy-paste; `docs/firestore-rules.md` stays as the per-collection rationale doc. (done 2026-06-12)
- [x] **Deployed the activity trigger** `onUserTaskWrite` (us-central1, Node 22 2nd-gen). Note: CLI reauth done under jb@randbpowerinc.us (old @randbpowersolutions.com token had expired). (done 2026-06-12)
- [x] **Code review (10 findings) fixed + redeployed** (2026-06-12): ownerUid immutable in update rule (lockout/expropriation); trigger skips private tasks (admin-readable activity log must never carry private titles/notes); `'user-task': 'to-do'` in summary nouns; private delegations now visible to creator in Team; diff-only modal saves (no clobbering concurrent edits); bounded subscription via queryable `archived` flag + on-demand archived listener; DST-safe addDays date math; Enter submits the task window; whitepaper/CLAUDE.md resynced. Rules + function redeployed.
- [x] **Backfill ran 2026-06-12**: all 49 `user-tasks` docs stamped with `archived:false` + `visibility` ('company'; 'private' for the one Personal-category task). Org policy forbids service-account key creation on this project, so it ran via Firestore REST with JB's gcloud user token instead of `scripts/migrate-user-tasks.mjs` (same logic — script kept in repo for future projects/restores). Verified idempotent (re-run: 0 to migrate). (done 2026-06-12)
- [ ] Future (deliberately excluded 2026-06-12): notifications, per-task comments, platform-object linkage (company/site/project), multi-assignee. Revisit only on user request.

**Site Analyzer — GW-scale MW + editable ramp (feat/site-analyzer-mw-cap-10gw, v1.58.0 — 2026-06-11)**

- [x] Raised MW capacity cap 1000 → **10,000 MW (10 GW)** (`DetailEditForm`, `SiteAnalyzerDetail`); `PowerSlider` now supports a **log scale + typed number box** (new `scale`/`showValueInput`/`unit` props, backward-compatible). Both MW sliders (edit form + valuation tab) use it. (source: conversation 2026-06-11)
- [x] Ramp auto-cap: `computeRampSchedule` per-year cap now **auto-scales so the ramp ≤ ~12 years** (`DEFAULT_MAX_YEARS`); 6.6 GW → ~12 yrs not 66; sub-1.2 GW unaffected. (source: conversation 2026-06-11)
- [x] **Manual per-year ramp editor** (`RampScheduleEditor`): enter MW added each year (e.g. 150/100/70). Stored as `customRamp: number[]` on `SiteRegistryEntry` (empty ⇒ auto); `rampFromIncrements()` builds it; Exec Summary screen + PDF read it via `buildExecutiveSummaryModel`; bar heights clamped so over-capacity totals don't overflow. (source: conversation 2026-06-11)
- [ ] **Verify in the running app** (`npm run dev`): set a site to 6600 MW via the number box + log slider; confirm appraisal reads ~$19.8B; auto ramp shows ~12 bars; enter custom 150/100/70 and confirm Exec Summary screen **and** exported PDF reflect it; "Reset to auto" + reload persist correctly. (source: conversation 2026-06-11)
- [ ] Branch not yet pushed/merged — push `feat/site-analyzer-mw-cap-10gw` and open PR when ready. (source: conversation 2026-06-11)

**Platform Firebase Auth domain migration (2026-06-11)**

- [x] Migrated all 6 platform users' Firebase Auth login + `users/{uid}.email` from `@randbpowersolutions.com` → `@randbpowerinc.us` (mray, mgrenga, jglennon, bwest, jb, zmaxey). The 2026-05-20 Workspace rename had missed Firebase Auth (separate identity store), silently breaking password reset for anyone trying the new address. uid/role/tools/password all preserved. Verified zero old-domain accounts remain. (source: conversation 2026-06-11 — Missy Ray reset failure)
- [ ] **Fix the silent "reset email sent" UX** — `src/pages/LoginPage.tsx` `handleForgotPassword` shows success even when Firebase sends nothing (no account for that email; enumeration protection suppresses the error). At minimum log/telemetry the no-op; consider an admin-side check. This false-positive is exactly what hid the migration gap. (source: conversation 2026-06-11)
- [ ] Revisit **AUDIT.md H-1** (user removal leaves Auth/Firestore drift) in the same pass — same class of Auth-vs-Firestore desync. (source: conversation 2026-06-11)

**Market Intelligence listener — MVP Layer 1 (feat/market-intel-listener, v1.51.0 — 2026-06-03)**

- [x] Capture-only deal feed: scheduled Cloud Function `refreshMarketIntel` (every 6h, us-east1) pulls US data-center-deal news from GDELT + trade RSS + Google News, keyword-filters, light-tags (state/MW/$ via regex, no LLM), dedupes by URL hash, upserts to `market-intel-feed`. New `functions/src/marketIntel/*`, `src/tools/MarketIntelTool.tsx`, `useMarketFeed`, `lib/marketIntel.ts`. (source: conversation 2026-06-03)
- [ ] **Publish Firestore rule for `market-intel-feed` in the Console** — authenticated `read` + `update` (the client writes the `status` field via Mark read / Archive); `create`/`delete` stay `false` (ingest is server-only, Admin SDK bypasses rules). `market-intel-meta` needs no client rule. Also document in `docs/firestore-rules.md`. (source: conversation 2026-06-03)
- [ ] **Deploy the function**: `firebase deploy --only functions:refreshMarketIntel`, then manual-trigger once (`gcloud functions call refreshMarketIntel --region us-east1`) to backfill, and confirm `market-intel-meta/feedRefresh` counts look sane. (source: conversation 2026-06-03)
- [ ] **Grant tool access**: add `market-intel` to non-admin users' `allowedTools` as needed (admins see it automatically). (source: conversation 2026-06-03)
- [ ] Phase 2 (later): LLM structured extraction (developer/MW/acres/capex/stage → typed columns), cross-outlet entity resolution + stage tracking. Then Layer 2 land identification → Layer 3 county-deed lookup → Layer 4 analysis. (source: conversation 2026-06-03)

**To-Do List tool (shipped v1.48.0, PR #131 — 2026-06-02)**

- [x] Per-user private To-Do tool (`user-tasks` collection): add/edit/complete tasks with category, priority, due + "do on" dates. New `src/tools/TodoListTool.tsx`, `useUserTasks`, `lib/userTasks.ts`. (done 2026-06-02)
- [x] Published owner-scoped `user-tasks` Firestore rule in the Console (read/write only own `ownerUid` rows). Also documented in `docs/firestore-rules.md`. (done 2026-06-02)
- [x] Active-task ordering: overdue → priority (high→normal→low) → soonest date → newest-created. (done 2026-06-02)
- [ ] **Decide on `feat/task-foundation` (open PR #125)** — the richer Task tool (Cloud Function + kinds model) we did NOT ship. Now that the simpler To-Do tool is live, close PR #125 or salvage specific ideas from it. (source: conversation 2026-06-02)
- [ ] Document the To-Do List tool in `CLAUDE.md` (Tools list + routes + structure) — it shipped without a CLAUDE.md entry. (source: conversation 2026-06-02)
- [ ] Future: cross-user task sharing (widen the `user-tasks` rule with a `sharedWithUids` array). (source: conversation 2026-06-02)

**Cloud Functions cleanup (2026-06-02)**

- [x] Deleted 3 orphaned prod functions verified dead: `deleteUserAccount` (superseded by `processUserDeletion`), `scrapeMobileBroadband` (no callers), `runRrcBulksIngestNow` (removed from source per org policy). Deployed set now matches source — full `firebase deploy --only functions` no longer aborts. (done 2026-06-02)

**Document rename + archive (shipped v1.47.0, feat/doc-rename-archive — verify)**

- [x] Added Rename + soft Archive (recoverable, with "Archived" trash toggle + Restore) to the construction **Documents** section (`JobDocumentsSection`, shared by Bailey Project + Construction Projects). Storage blobs retained; gated on `canDeleteDocuments`. (source: conversation 2026-06-01)
- [x] Made the `FolderBrowser` "⋮" action menu (Rename/Archive/Manage access) discoverable — bordered button + tooltip (LLR docs, CRM Folders, Project folders). (source: conversation 2026-06-01)
- [ ] **Verify Babi's `users/{uid}.role` is `admin` (or `manager`).** On the LLR docs panel the Rename/Archive ⋮ menu only shows to admin/manager (labor needs an explicit `editorUserIds` grant — `src/lib/folderAccess.ts`). If the role is `labor`, that — not code — is why rename/archive looked unavailable. (source: conversation 2026-06-01)
- [x] ~~Verify deployed Firestore rules allow `update` on the job-docs subcollections.~~ Confirmed: both `construction-jobs/{jobId}/documents/{docId}` and the `construction-projects-jobs` equivalent already have `allow update, delete: if isAuthed() && isAdminOrPm()` (no field restriction) — rename/archive/restore work for admin/PM in prod. (source: code-review 2026-06-01)
- [x] **Deploy functions** — deployed `onJobDocumentWrite` + `onConstructionProjectsDocumentWrite` to prod via targeted `firebase deploy --only functions:...` (avoided the full-deploy orphan-deletion abort). Job-doc upload/rename/archive/restore now log to the Activity Log. (done 2026-06-02)
- [ ] **Altitude / debt:** `JobDocumentsSection` now duplicates the folder system's archive UX. The folder system (`FolderBrowser`, "Project folders") already does rename/archive/restore with per-folder access. Decide whether to retire `JobDocumentsSection` in favor of the folder system rather than maintaining two parallel doc UIs. (source: code-review 2026-06-01)

**Doc-drift cleanup (deferred from chore/retire-legacy-documentssection PR review 2026-05-27)**

- [ ] `docs/activity-firestore-setup.md:64` — note the `crm-documents` trigger is dormant now (no app code writes to it post-2026-05-27)
- [ ] `docs/architecture/ERD.md` — drop `crm-documents` from the "Five collections" canonical list; reflect that `DocumentsSection.tsx` is retired
- [ ] `docs/architecture/PRD.md:19` + `docs/architecture/folder-system-plan.md` — update legacy references to match the new state
- [ ] On or after 2026-06-13: export + delete the `crm-documents` Firestore collection, retire `onDocumentWrite` Cloud Function at `functions/src/activity/triggers.ts:139` (see AUDIT.md `crm-documents` rollback note)

**Folder/Document System (today's focus)**

- [x] Rename current Construction tool → Bailey Project, move from Construction section → Company section
- [x] Duplicate codebase as fresh Construction tool (new collection, empty) for construction team
- [x] Firebase Console: Firestore + Storage rules added for `construction-projects-jobs` and the new storage prefixes (2026-05-14)
- [ ] Get Mike's answers on Q1, Q2, Q6 (folder-system-plan.md §12)
- [x] Drop `restrictedToOwner`, use `viewerUserIds` only — baked into the plan; empty-array semantics replace the boolean (2026-05-14)
- [x] Lock the role model: 3 roles only — `admin` / `manager` / `labor`, all admins godmode (2026-05-14)
- [ ] Spec `effectiveViewerUserIds` denormalization
- [ ] Spec `cascadeArchiveId` for folder restore
- [ ] Document: only top-level move triggers audit entry
- [ ] Dry-run Phase 1 PR 1.2 migration on a second Firebase project

**Backups**

- [ ] Enable Firestore Scheduled Backups (daily 7d + weekly 5w)
- [ ] Replicate Storage bucket to a separate backup project
- [ ] Write restore runbook (PITR, Versioning, authorized users)
- [ ] Custom daily Firestore export to separate GCP project (optional)
- [ ] Annual restore drill

**Large Load Request tool (v1 shipped 2026-05-19 as "Pre-Construction"; renamed to "Large Load Request" 2026-05-27 — follow-ups)**

- [x] "Track in LLR" button on Site Analyzer detail + "From existing analyzed site" mode in `/llr/new` — reuses an already-analyzed `SiteRegistryEntry` instead of provisioning an empty one, so the analyses (power/broadband/water/gas/transport/labor/political/appraisal) carry over with no re-run and no quota burn. Button switches to "Open in LLR" when an LLR site already exists for the registry id. Shipped v1.43.26 on feat/convert-site-to-precon (source: conversation 2026-05-27)
- [x] Rename Pre-Construction → Large Load Request (LLR) — tool label, routes (`/precon` → `/llr` with legacy redirect), ToolId `'pre-construction'` → `'large-load-request'` (via read-time alias normalization in `normalizeToolId` + `scripts/migrate-precon-to-llr.mjs`). **CompanyTag `'Pre Construction'` kept** — tag describes activity/phase, not tool. Internal code identifiers (`PreCon*`, `preconstruction-sites` collection, `*_precon-root` folder ids) kept as-is. Shipped v1.44.0 → v1.44.2 (source: conversation 2026-05-27)
- [ ] **Run `scripts/migrate-precon-to-llr.mjs --confirm` against production** to update `users.allowedTools` entries (`'pre-construction'` → `'large-load-request'`) and pre-con-root folder display names. App stays correct in the meantime via read-time normalization. (source: conversation 2026-05-27)
- [ ] Per-utility LOA templates (Oncor / AEP / each major coop) — drop into `LOA_TIMELINES` in `src/lib/preConWorkflow.ts` (source: conversation 2026-05-19)
- [ ] Notifications/email when engineer review is requested for an assigned user (source: conversation 2026-05-19)
- [ ] "Promote to Construction Job" handoff button on PreCon detail page (source: conversation 2026-05-19)
- [ ] Bulk grading / bulk LOA actions on PreCon index (source: conversation 2026-05-19)
- [ ] Tighten engineer assignment: filter the assignment dropdown to users tagged as engineers (today: any platform user) (source: conversation 2026-05-19)
- [ ] Pre-Con: when site company changes via edit mode, migrate the linked folder skeleton (`cust_{oldCompanyId}_precon-root` → `cust_{newCompanyId}_precon-root`) and update the `customer-projects` Project record (source: conversation 2026-05-19)

**Email / domain migration → randbpowerinc.us (core done 2026-05-20)**

- [ ] **Notify the 12 employees of the new login** — now `name@randbpowerinc.us`, same password; Google Chat flaky ~3 days. Source: conversation 2026-05-20
- [ ] **Fix Google Workspace billing contact** — payments primary contact is ex-employee Preston Mills (prestoncm@randbpowersolutions.com); switch to owner Bailey West (bwest@randbpowerinc.us). Source: conversation 2026-05-20
- [ ] **Update payments account nickname + verify Organization Name** off the old brand. Source: conversation 2026-05-20
- [ ] **Rename Google Groups** (sales@, info@, support@…) to @randbpowerinc.us. Source: conversation 2026-05-20
- [ ] **Upload Google Workspace custom logo** — 320×132 px PNG/GIF, ≤30 KB. Source: conversation 2026-05-20
- [ ] **Rename Workspace org name + OU** — still "R&B Power Solutions". Source: conversation 2026-05-20
- [ ] **Everyone updates email signatures + Google-SSO app emails** (Apollo etc.). Source: conversation 2026-05-20
- [ ] **Tighten DMARC** — after ~2–4 weeks of p=none, move randbpowerinc.us to quarantine → reject. Source: conversation 2026-05-20
- [ ] **Keep randbpowersolutions.com registered indefinitely** — carries all alias mail. Source: conversation 2026-05-20

**Oncor large-load requests — North Select / RPMX (capacity-check results in; 30-day clock running)**
Contact: David Stone, NCM Consultant, Oncor New Construction Mgmt — David.Stone@oncor.com, cell 469.907.7104. All WOs filed as "Data Center: Bailey West". (source: conversation 2026-06-01)

- [ ] **Confirm with David whether Sherman (WO 32485447) & Denison Pit (WO 32485054) really need less than Airport Quarry (WO 32484946).** Airport Quarry's results email asked for 7 items incl. PSSE dynamic composite load model (CMLD), kmz, test-fit design, equipment selection; Sherman & Denison asked for only 4 (Load Questionnaire, one-line diagram, detailed site plan, proof of site control — NO dynamic model). All three got identical "requires substation work / 120-day study" findings, so verify the dynamic model isn't just deferred to the ERCOT/SIS stage before assuming it's not needed. (source: conversation 2026-06-01)
- [ ] **Airport Quarry (McKinney, WO 32484946) — GO.** Submit NTP + 7-item package within 30 days of 2026-05-26 (≈ by 2026-06-25) to start the 120-day study. Docs: Load Questionnaire, PSSE CMLD dynamic model, kmz, test-fit design, equipment selection, one-line diagram, site-control attestation. (source: conversation 2026-06-01)
- [ ] **Sherman (WO 32485447) — GO.** Submit NTP + 4-item package within 30 days of 2026-05-28 (≈ by 2026-06-27): Load Questionnaire, one-line diagram, detailed site plan, proof of site control. (source: conversation 2026-06-01)
- [ ] **Denison Pit (WO 32485054) — GO.** Same 4-item package + 30-day clock from 2026-05-28 as Sherman. (source: conversation 2026-06-01)
- [ ] **Decide on 5th site (WO 32483144, 32.58692/-96.53424, 75159).** David flagged no Oncor facilities nearby — power would have to come from a couple miles away; he asked if R&B still wants to explore. Needs a go/no-go call. (source: conversation 2026-06-01)
- [x] ~~5 sites submitted to Oncor; coop site (WO 32484542, 76227) is a NO-GO — Salim Giotis confirmed it's outside Oncor's certified area (CoServ co-op territory).~~ (source: conversation 2026-06-01)

**MCP server v1 (shipped v1.52.0 + v1.52.1 audit fixes, feat/mcp-server — 2026-06-05)**

- [x] Read-only MCP endpoint at `/mcp` on the platform's Cloudflare Pages Worker. Bearer-gated; service-account JWT (Web Crypto, no firebase-admin) mints a Firestore REST access token. 8 tools: `list_sites`, `get_site` (with section projection), `list_llrs`, `get_llr`, `list_companies`, `get_company`, `list_contacts`, `get_recent_activity`. Stateless streamable-HTTP, works with any MCP client (Claude Code, Cursor, Manus via HTTP-tool fallback, etc.). New `mcp/` directory; wires `/mcp` route into `functions/worker.ts`. (source: conversation 2026-06-05)
- [x] **v1.52.1 audit fixes**: replaced hand-rolled JSON-RPC dispatcher with `McpServer` + `WebStandardStreamableHTTPServerTransport` from the SDK (fixes zod v3/v4 schema-export bug + `result.isError` convention); added 2 missing composite indexes for combined-filter queries; wired worker typecheck into `npm run build`. (source: conversation 2026-06-05)
- [ ] **Set prod secrets**: `wrangler secret put FIREBASE_SERVICE_ACCOUNT_JSON` (download from Firebase Console → Service Accounts) + `wrangler secret put MCP_BEARER_TOKEN` (`openssl rand -hex 32`). Then `firebase deploy --only firestore:indexes` for the 7 composite indexes in `firestore.indexes.json`.
- [ ] **Register in Claude Code** once deployed: `claude mcp add randb --transport http --url https://<prod-pages-domain>/mcp --header "Authorization: Bearer $RANDB_MCP_TOKEN"`. Store `RANDB_MCP_TOKEN` in `~/.zshrc`.
- [ ] **v2 follow-ups**: writes (create/update tools) behind `MCP_WRITE_ENABLED` flag with `activity` audit entries; analysis-tool wrappers (port Census/FCC CORS proxies to call from Worker); OAuth via `@cloudflare/workers-oauth-provider` for multi-user; MCP resources for live `sites/{id}` subscriptions.

**Platform debt**

- [ ] Delete legacy collections `site-requests`, legacy `sites`, legacy `projects` (AUDIT M-1)
- [ ] Decide API data strategy: live vs Postgres+PostGIS for OK/TX/AZ/NM/TN
- [ ] Restore `FIREBASE_ADMIN_KEY` GitHub secret on `jbb987/randb-power-platform` — ISO Queue Ingestion workflow failing every Monday since 2026-05-04 (3 missed runs); fix = generate new Firebase service account key at console.firebase.google.com/project/randb-site-valuator/settings/serviceaccounts/adminsdk, `gh secret set FIREBASE_ADMIN_KEY < key.json`, then `gh workflow run "ISO Queue Ingestion" -f force=true` to backfill. Stale data hits Grid Power Analyzer queue popups + Site Analyzer Power section's County Queue card. (source: conversation 2026-05-19, run 26026522759)

**Renewable developer prospecting (50-site outreach)**

- [ ] Verify landowner page URLs for the remaining ~120 companies in `research/renewable-developer-prospects.csv` (5 verified 2026-05-19: Silicon Ranch, Pine Gate, EDF-RE, Apex, Cypress Creek). Method: Google `site:{domain} landowner OR "partner with us" OR "lease your land"` (source: conversation 2026-05-19)
- [ ] Extract per-company site criteria (min acres / substation distance / slope / wetlands) into structured fields — feed from each verified landowner page (source: conversation 2026-05-19)
- [ ] Pull key contacts via Apollo.io MCP for Tier-A companies — title contains "land acquisition" / "site acquisition" / "real estate" / "development manager" / "greenfield" / "origination"; level Manager/Director/VP (source: conversation 2026-05-19)
- [ ] Cross-reference top 30 developers vs FERC interconnection queue (LBNL `emp.lbl.gov/queues`) to confirm active in R&B's site states (source: conversation 2026-05-19)
- [ ] Decide ingestion path: import `research/renewable-developer-prospects.csv` into `crm-companies` with tag `renewable_developer`, OR build a separate prospect collection. Today CRM tags are fixed-enum (`REP`/`Construction`/`Pre Construction`/`Utility`) — adding `renewable_developer` requires extending `crmCompanies.ts` (source: conversation 2026-05-19)
- [ ] Build site-sheet template (coords, acres, substation distance + voltage, slope, wetlands %, road access, owner status) — what each developer's land acquisition team needs to evaluate (source: conversation 2026-05-19)
- [ ] Score-match each of R&B's 50 sites against verified developer criteria → ranked target list per site (source: conversation 2026-05-19)

**Done**

- [x] Firestore PITR enabled
- [x] Storage Object Versioning enabled (90d noncurrent retention)
- [x] Renewable-developer prospect list drafted: 127 US companies across solar utility-scale, community solar, wind, BESS, utility renewable arms, hyperscalers — saved to `research/renewable-developer-prospects.csv` and plan at `~/.claude/plans/please-refine-the-plan-iridescent-sifakis.md` (2026-05-19)

## Grid Analyzer — PUCT certificated service-area layers (added 2026-06-10)
- [ ] Integrate PUCT electric service-area GIS into Grid Analyzer map + Site Analyzer "Utility Territory / TSP" field
- [ ] Live point-lookup: query IOU + COOP_DIST + MUNI FeatureServers (point-in-polygon) to return authoritative TDU/TSP for a site — replaces inferring from nearby substations
- [ ] Visual layer: simplify (mapshaper) -> vector tiles (tippecanoe -> PMTiles), serve from CDN; refresh quarterly
- [ ] Eval HIFLD "Electric Retail Service Territories" as national base layer if/when multi-state
- [ ] UI note: PUCT labels data "UNOFFICIAL" — show as indicative; verify critical sites w/ PUCT records / TDU
- Endpoints (services6.arcgis.com/N6Lzvtb46cpxThhu/arcgis/rest/services): IOU/FeatureServer/300, COOP_DIST/FeatureServer/310, MUNI/FeatureServer/320 — Query+geoJSON enabled, EPSG:4326
- Local copies: ~/Downloads/puct_service_areas/{IOU,COOP_DIST,MUNI}.geojson
