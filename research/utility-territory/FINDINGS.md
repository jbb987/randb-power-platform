# Retail-utility territory — research findings

**Date:** 2026-06-17 · **Status:** in progress (disambiguation unsolved)

## The bug

`src/lib/infraLookup.ts` → `deriveUtility()` sets "Utility Territory" / TSP to the
**most frequent transmission-line OWNER within ~10 mi**. That names the *transmission*
owner, never the *retail/distribution* utility. Co-ops own little high-voltage
transmission, so they are **structurally invisible** to this method.

The tool also conflates three distinct things into one field:

| Concept | Kenefic truth | Tool today |
|---|---|---|
| RTO/ISO | SPP | ✅ correct |
| Transmission provider (TSP) | ~WFEC | ❌ shown as "the utility" |
| Retail/distribution utility | **Southeastern Electric Coop** | ❌ never computed |

Separately: all 8 tested sites have `utility = null` stored in `sites-registry` — the
displayed territory is never even persisted.

## Candidate fix: point-in-polygon on "Electric Retail Service Territories"

Canonical ORNL/HIFLD/EIA polygon layer. HIFLD Open shut down Aug 2025; live mirrors
found via ArcGIS Online search (NASA NCCS was down). Working endpoint used in tests:

```
https://services6.arcgis.com/BAJNi3EgCdtQ1BCG/arcgis/rest/services/Electric_Retail_Service_Territories/FeatureServer/0
```

Fields: `NAME, TYPE (COOPERATIVE|INVESTOR OWNED|MUNICIPAL|...), STATE, CUSTOMERS, ...`

## Empirical result (8 ground-truth sites, exact coords from Firestore)

| Metric | Value |
|---|---|
| Recall (correct utility present in hits) | **8/8 = 100%** |
| Naive precision (first hit correct) | **2/8 = 25%** |
| Overlap rate (>1 polygon) | **8/8** (2–6 each) |

Ground truth: Kenefic→Southeastern Electric Coop, Ike Byrom→CoServ (= Denton County
Elec Coop), Asherton→AEP Texas Central; Joshua/Sherman/Denison/Combine/Airport Quarry→Oncor.

**Conclusion:** the dataset contains the right answer ~always. The unsolved problem is
**overlap disambiguation**, and no single-attribute rule works (truth set mixes 2 co-ops
+ 6 IOUs, so neither "prefer co-op" nor "prefer IOU" nor customers/area succeeds).

## Disambiguation experiment result (disambiguate.mjs)

Ranked overlapping candidates by 3 signals; scored vs truth:

| signal | precision@1 | recall@2 | recall@3 |
|---|---|---|---|
| **interiority** (dist-to-boundary) | 7/8* | 7/8 | **8/8 (100%)** |
| areaAsc | 1/8 | 3/8 | 3/8 |
| custDesc | 1/8 | 2/8 | 3/8 |

*Interiority p@1 is optimistic — honest breakdown:
- **5/8 confidently correct** with real margin (Kenefic, Joshua, Combine, Asherton, Airport Quarry).
- **2/8 genuine ties** (Sherman, Denison) — all candidates share boundary geometry, 0 margin; #1 is stable-sort luck → must flag low-confidence.
- **1/8 mis-ranked** (Ike Byrom): true co-op CoServ ranks #3 behind Oncor (210k km²) and
  TNMP (118k km²) — oversized blanket IOU polygons (both `CUSTOMERS=-999999`) over-cover.
- **recall@3 = 100%**: true utility is always in the top 3.

**Kenefic (the original bug) is solved cleanly:** Southeastern 15.4km vs PSO 1.6km (~10× margin) → confident + correct.

## Recommended design

1. **`resolveRetailUtility(lat,lng)`** → point-in-polygon on Electric Retail Service
   Territories, rank by interiority, return `{ best, confidence, candidates[] }`.
2. **Confidence tier:** large #1-vs-#2 interiority gap ⇒ auto-pick one; tie/close ⇒ show
   top 2-3 and ask for human pick. (Matches the "2-3 possibilities, never wrong again" requirement.)
3. **Three separate fields:** retailUtility (new) / transmissionProvider (today's heuristic, relabeled) / rtoIso (existing).
4. **Persist + human override** on SiteRegistryEntry (`utility` is currently null on all sites).
5. **Fallback** to the transmission-owner heuristic only when 0 polygons, clearly labeled.
6. **Second source** (NREL utility lookup / nearest distribution substation) to break ties — NEXT experiment.
7. **Backfill/audit** the 81 existing sites to find other mislabeled ones.

## Registry audit result (audit-all-sites.mjs) — see audit-results.md

80 sites, 0 errors, 0 coverage gaps. 48 CONFIDENT-IOU, **10 CONFIDENT-COOP** (the other
Kenefics), 22 REVIEW. **Caveat:** Ike Byrom resolved CONFIDENT→Oncor but truth is CoServ —
interiority confidence is unsafe in the blanket-IOU/co-op-interleave zone → second source needed.

## Second-source experiments (step #1)

- **Nearest substation owner (no key): NOT VIABLE.** The substation mirror
  (`services1.arcgis.com/PMShNXB1carltgVf/.../Electric_Substations`) has **no OWNER field**;
  names are UNKNOWN######/TAP######. Identifies truth **0/8**. Dead end.
- **NREL Utility Rates API (needs free key): the path.** Returns `utility_name` for a lat/lon
  as an independent vote. Sign up: https://developer.nrel.gov/signup/ ·
  docs: https://developer.nrel.gov/docs/electricity/utility-rates-v3/
  Test harness already supports it — set `NREL_API_KEY` and re-run territory-test.mjs.
- **EIA-861 county→utility crosswalk (no key): useful complement.** Can't pin a point, but can
  prune REVIEW shortlists by dropping utilities that don't operate in the site's county.
- **NREL was unreachable from both the user's Mac ("fetch failed") and this env (ECONNREFUSED)
  on 2026-06-17** — could not validate this session (looks transient/network, not the key).

## DECISION: conservative rule is shippable WITHOUT a second source

Rule: auto-pick only when (a) one candidate, or (b) #1 is a co-op/muni with ≥1.5× interiority
margin, or (c) #1 with ≥1.5× margin and no competing co-op. **Otherwise show the top-3 shortlist.**

Result on the 8-site truth set: **0 wrong auto-picks** (was 1), **shortlist contains truth 7/7**,
Kenefic still auto-confirms correctly. This meets the "never wrong again, options are fine"
requirement using only the validated polygon data. NREL stays an *optional enhancement* to
auto-resolve more shortlists later — not a blocker.

## Files

- `territory-test.mjs` — the validation harness (recall / naive precision / overlaps).
- `fetch-sites.mjs` — read-only pull of ground-truth coords from `sites-registry` (gcloud ADC).
- `find-endpoint.mjs` — discovers a live retail-territories ArcGIS mirror.
