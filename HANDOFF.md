# HANDOFF — 2026-05-27

> SBAR-style summary of the most recent meaningful session. CLAUDE.md
> instructs every new session to read this file first, so it's the canonical
> starting point for the next Claude Code session in this repo. Replace this
> content (don't append) at the end of any non-trivial session.

## Situation

Two shipments on top of the v1.43.x "Pre-Construction" baseline:

1. **v1.43.26** — "Track in LLR" cross-tool conversion: a Site Analyzer site can become an LLR site **without** re-running any analysis (no quota burn). The reverse direction ("Open in LLR") also wires up so the button is idempotent.
2. **v1.44.0** — Tool renamed from **Pre-Construction → Large Load Request** (LLR). User rationale: "pre-construction" is the phase, "Large Load Request" is the actual workflow (LLR-to-LOA process with the utility). User-visible everywhere (dashboard card, nav, breadcrumbs, page headers, buttons, company tag, ToolId label). Internal code identifiers (`PreCon*`, `preconstruction-sites` collection, `*_precon-root` folder IDs) intentionally kept to avoid data migration risk.

Both changes are on the feature branch **`feat/convert-site-to-precon`** (poorly named in hindsight — the rename was added to the same branch). **Not yet pushed / merged to `main`** at end of session.

## Background — what shipped

### v1.43.26 — Convert analyzed Site Analyzer site → LLR

Before the change, `createPreConSite` always provisioned an **empty** `SiteRegistryEntry` for the new LLR site, ignoring any existing analyzed entry for the same customer. Babi was re-running power/broadband/water/gas/transport/labor/political analyses by hand for every site that had already been analyzed (Crowell most recently, North Select, Concensus Core).

The fix:

- `createPreConSiteFromRegistry({ siteRegistryId, createdBy })` in `src/lib/preConSites.ts` — mirrors `createPreConSite` but reuses an existing `SiteRegistryEntry` instead of creating a fresh empty one. Idempotent: throws `PreConSiteAlreadyExistsError` (carries the existing PreCon id) if one already references the registry id, so callers can redirect rather than double-create.
- `getPreConSiteByRegistryId` + `subscribePreConSiteByRegistryId` + the React hook `usePreConSiteByRegistryId` — live lookup by registry id.
- **Site Analyzer detail page** gains a "Track in LLR" / "Open in LLR" button (`DetailHeader.tsx`). Tri-state:
  - Loading → hidden (avoid flicker).
  - Existing LLR site found → "Open in LLR" deep-link.
  - No LLR site, site has `companyId` → "Track in LLR" with confirm dialog, then create + navigate.
  - No `companyId` → disabled with tooltip "Link this site to a company first."
- **`/llr/new` form** gains a third mode "From existing analyzed site": searchable picker filtered to sites that (a) have a `companyId` and (b) aren't already tracked. Submitting calls `createPreConSiteFromRegistry`.

### v1.44.0 — Pre-Construction → Large Load Request rename

Single coherent rename across all user-visible surfaces:

- **Display labels**: dashboard tool card ("Large Load Request"), breadcrumbs, page headers (`PreConIndex` h1, `PreConNew` h1), button labels ("Track in LLR", "Open in LLR", "Convert to LLR", "New LLR site"), folder browser title, error messages, `TOOL_LABELS['large-load-request']`.
- **Routes**: `/precon` → `/llr` (`/llr/new`, `/llr/:siteId`). `App.tsx` keeps a `LegacyPreConRedirect` for old `/precon*` URLs (preserves trailing path + query — same pattern as `/power-infrastructure-report` → `/site-analyzer`).
- **ToolId**: `'pre-construction'` → `'large-load-request'` in the `ToolId` union, `ALL_TOOL_IDS`, `TOOL_LABELS`. Backward-compat alias in `normalizeToolId` (`'pre-construction'` → `'large-load-request'`) so existing `users/{uid}.allowedTools` arrays keep working without a hard migration — same pattern as the `piddr` → `site-analyzer` alias.
- **CompanyTag**: `'Pre Construction'` → `'Large Load Request'`. Backward-compat alias in `normalizeCompanyTag` (new helper); applied on every read of `crm-companies` in `subscribeCompanies` / `subscribeCompany` so the UI sees the canonical tag regardless of what's actually stored. Color preserved (#3B82F6 blue).
- **`ProjectType` label**: `PROJECT_TYPE_LABELS['pre-con']` flips to `'Large Load Request'` (the type key `'pre-con'` stays; it's just an internal identifier).
- **Auto-provisioned folder name**: `'Pre-Construction Sites'` → `'Large Load Request Sites'` (in `provisionPreConFolders`). Existing folders get renamed via the migration script.
- **Migration script**: `scripts/migrate-precon-tag.mjs` (dry-run by default, `--confirm` to write). Walks `crm-companies` and replaces `'Pre Construction'` with `'Large Load Request'` in `tags[]`; walks `folders` with `systemRole == 'pre-con-root'` and renames `'Pre-Construction Sites'` → `'Large Load Request Sites'`. Idempotent.
- **Internal code identifiers kept**: file names (`PreConDetail.tsx`, `PreConNew.tsx`, etc.), types (`PreConSite`, `PreConLoaStep`, `PreConEngineerStatus`, `PreConLoaStatus`), hooks (`usePreConSites`, `usePreConSiteByRegistryId`, `usePreConPermissions`), functions (`createPreConSite`, `createPreConSiteFromRegistry`, `provisionPreConFolders`), Firestore collection (`preconstruction-sites`), folder ID prefixes (`cust_{id}_precon-root`, `precon_{id}_root`). Renaming these is pure cosmetic churn and would require data migrations for the collection name and folder IDs — explicitly out of scope.

## Assessment — known limitations / risks

- **Production migration not yet run.** `scripts/migrate-precon-tag.mjs --confirm` needs to be run against prod to update existing crm-companies docs and pre-con-root folders. App stays correct in the meantime via the read-time aliases, but the underlying data is still in legacy form. Logged in TODO.md.
- **Branch name lies.** Feature branch is `feat/convert-site-to-precon` but also contains the rename. Acceptable but worth noting in the PR description.
- **PR not opened, not pushed.** End of session leaves the branch local.
- All v1.43.25-era limitations still open: customer reassignment locked, coordinate drift (M2), engineer role tagging, per-utility LOA templates, Promote-to-Construction button, no bulk actions, no archived-site restore UI, zero unit tests.

## Recommendation — what next

1. **Open PR, review, merge to main.** Cloudflare Pages will auto-deploy.
2. **Run `node scripts/migrate-precon-tag.mjs --confirm`** against prod once deployed. (Dry-run first to eyeball expected changes.) Idempotent — safe to re-run.
3. **Smoke test on prod**:
   - Open a fully-analyzed Site Analyzer site (Crowell), confirm "Track in LLR" appears, convert, land on `/llr/<id>` with analyses pre-populated.
   - Open an existing LLR site → button should read "Open in LLR".
   - Visit `/precon` → should redirect to `/llr`.
   - Check company profiles: tag chip reads "Large Load Request" with the same blue color; folder tree shows "Large Load Request Sites".
4. After the migration runs, the read-time aliases (`normalizeToolId` for `'pre-construction'`, `normalizeCompanyTag` for `'Pre Construction'`) become belt-and-suspenders. Keep them — they cost ~nothing and document the rename.

## Key file map

### Convert feature (v1.43.26)
- `src/lib/preConSites.ts` — `createPreConSiteFromRegistry`, `getPreConSiteByRegistryId`, `subscribePreConSiteByRegistryId`, `PreConSiteAlreadyExistsError`.
- `src/hooks/usePreConSites.ts` — `usePreConSiteByRegistryId`.
- `src/components/site-analyzer/DetailHeader.tsx` — "Track in LLR" / "Open in LLR" button props + tri-state rendering.
- `src/tools/SiteAnalyzerDetail.tsx` — `handlePreConAction` orchestration, hook wiring.
- `src/tools/PreConNew.tsx` — third mode "From existing analyzed site" + picker.

### Rename (v1.44.0)
- `src/types/index.ts` — `ToolId` union, `ALL_TOOL_IDS`, `TOOL_LABELS`, `normalizeToolId`; `CompanyTag` union, `ALL_COMPANY_TAGS`, `COMPANY_TAG_COLORS`, `normalizeCompanyTag` (new); `PROJECT_TYPE_LABELS['pre-con']`.
- `src/lib/crmCompanies.ts` — `normalizeCompanyOnRead` applied in subscribe paths.
- `src/App.tsx` — `/llr*` routes + `LegacyPreConRedirect`.
- `src/pages/Dashboard.tsx` — tool card entry.
- `src/components/Breadcrumb.tsx` — `/llr` matchers + labels.
- `src/lib/projectProvisioning.ts` — folder display name.
- `scripts/migrate-precon-tag.mjs` — one-time data migration.
- `CLAUDE.md`, `TODO.md` — docs updated.

### Inherited from v1.43.x
- `src/lib/preConWorkflow.ts` — `suggestGradeFromAppraisal`, `LOA_TIMELINES`, `appendLoaStep`.
- `src/lib/appraisal.ts` — shared `computeAppraisal`.
- `src/hooks/usePreConPermissions.ts`.
- `src/tools/PreConIndex.tsx`, `PreConDetail.tsx`.
- `src/components/precon/PreConGradePill.tsx`, `PreConHeader.tsx`, `PreConAppraisalSummary.tsx`, `PreConStatusCard.tsx`, `PreConLoaTimeline.tsx`.
- `src/components/ui/Button.tsx`.
- `functions/src/activity/triggers.ts` — `onPreConSiteWrite`.
- `docs/firestore-rules.md`.
