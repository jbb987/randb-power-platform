# HANDOFF — 2026-06-12

> SBAR-style summary of the most recent meaningful session. CLAUDE.md
> instructs every new session to read this file first. Replace this content
> (don't append) at the end of any non-trivial session.

## Situation

Two features shipped this session, both driven by JB live-reviewing against the
client deliverable (Scott McMahon / NTNSM, Exhibit A — Phase A, payment
pending on the site reports):

1. **Whitepaper tool (v1.59.0, MERGED to main, PR #149, in production).**
   Living platform docs at `/whitepaper`, allowlist-gated to
   jb@randbpowerinc.us only (`src/lib/whitepaperAccess.ts`), lazy-loaded.
   **Standing rule added to CLAUDE.md: every shipped change updates the
   whitepaper content in the same PR.**

2. **Site Analyzer customer report rework (v1.60.0, branch
   `feat/exhibit-a-report`, 3 commits, NOT yet pushed/merged).** The PDF now
   satisfies Exhibit A's content without ever reading like a contract
   checklist. See CLAUDE.md's Site Analyzer entry for the full final
   structure and the list of deliberately removed pages (do not re-add them).

## Background — key decisions (all JB's, 2026-06-12)

- Report mentions no contract, no data sources, no imagery credits.
- "Capacity Available" label for STATUS="NOT AVAILABLE" is a deliberate
  product decision — do NOT "correct" it. Report prose still derives capacity
  from voltage class + distance, never status.
- Capacity & Load Viability is the single contract-derived page: Status
  (LLR grade, else appraisal-suggested), Target Capacity, static "Initial
  Load (20–50 MW): Supported", Feed Redundancy (100 kV+ subs ≤5 mi),
  Interconnection ROM + basis row, Electricity Price, Ramp Schedule.
- **Ramp invariant:** schedule always lands exactly on the site's decided MW;
  custom per-year entries only redistribute pace
  (`rampFromIncrements({ targetMW })`).
- Logo asset was cleaned (off-white bg + watermark removed, alpha flattened)
  — fixes the cover "shadow".
- Grid Context Map embedded in the Power tab (analysis-result substations
  only, zero extra reads) + "Open in Grid Power Analyzer" deep link
  (`?siteId`, with new `?lat&lng` support in PowerMapView).

## Assessment — open risks / known issues

- **Branch not pushed.** `feat/exhibit-a-report` (84eb24c, cf5fc63, 6d79c91)
  awaits JB's final Joshua re-export approval, then push + PR + merge.
- **Pre-export checklist per site (operational, applies to all 6 NTNSM
  sites):** county/coordinates/address set on the site record; unlock +
  re-run any section whose MW changed since analysis (Joshua's gas ran at
  100 MW, site is 200 MW); link the LLR grade so Status reads
  "engineer-reviewed".
- Henry Hub price renders with a 2024 date (EIA fetch returns a stale
  period) — needs a fix in `eiaApi`/gas pricing.
- Electricity Price appears in both Capacity rows and the Power
  Infrastructure block — JB to decide which to keep.
- Grid Power Analyzer loads TX lines/plants live from GeoPlatform ArcGIS
  every visit — transient "Failed to fetch" happens; durable fix is caching
  those layers like Well Finder (backlog).
- Pre-existing lint errors in LaborPage (`CompareBars` created during
  render) — predate this work.

## Recommendation — what next

1. JB re-exports Joshua, approves → push branch, open PR, merge (Cloudflare
   auto-deploys).
2. Run the pre-export checklist + export reports for the remaining 5 NTNSM
   sites; send to Scott (invoice trigger).
3. Fix Henry Hub date; decide electricity-price duplication.
4. Phase 2 (logged): click-to-load full Grid Analyzer embed with
   snapshot-into-PDF; cache ArcGIS layers; CI build gate + versioned
   Firestore rules (from the macro review).
