# Registry audit — new retail-utility resolver vs all 80 sites (2026-06-17)

Resolver = point-in-polygon on Electric Retail Service Territories, ranked by
interiority, confidence = (#1 edge-distance ÷ #2 edge-distance) ≥ 1.5.

| Bucket | Count | Meaning |
|---|---|---|
| CONFIDENT (IOU/muni) | 48 | clear single utility, mostly metro IOUs |
| **CONFIDENT-COOP** | **10** | co-ops the *transmission-owner heuristic structurally misses* — the "other Kenefics" |
| REVIEW (show 2–3) | 22 | overlapping/tied — present a shortlist, human picks |
| NO-COVERAGE | 0 | every site had ≥1 polygon |
| NON-US / ERR | 0 / 0 | — |

## ⚠ Critical caveat — confidence can be WRONG (the canary)

**Ike Byrom Pit** resolved CONFIDENT → ONCOR, but the **known truth is CoServ**
(Denton County Elec Coop). The blanket IOU polygons (Oncor 210k km², TNMP 118k km²,
both `CUSTOMERS=missing`) sit deeply interior everywhere, so they beat the real co-op
on interiority and clear the 1.5 ratio (50.6 / 32.0 = 1.58). **Interiority alone is not
safe in the DFW co-op-interleave zone** → this is exactly why a second source (step #1)
is required before trusting CONFIDENT-IOU there. Other suspect CONFIDENT→Oncor sites in
the same zone: Moore Property, Mustang Pit, La Cima Crusher, McKinney Rex/Crusher/EDC,
Sand Dollar RV, Quinlan — may actually be CoServ/Grayson-Collin/Farmers co-op.

Ground-truth checks that PASSED: Kenefic→Southeastern (coop ✓), North Bokchito→Southeastern,
Airport Quarry/Joshua/Combine→Oncor ✓; Sherman/Denison→Oncor correctly flagged REVIEW
(truth #1 in shortlist); Asherton→AEP correctly in REVIEW shortlist.

## CONFIDENT-COOP (verify these — high value)

- Kenefic Pit → SOUTHEASTERN ELECTRIC COOP (OK)
- North Bokchito → SOUTHEASTERN ELECTRIC COOP (OK)
- Austin Texas → BLUEBONNET ELECTRIC COOP
- Bastrop, Elgin → BLUEBONNET ELECTRIC COOP
- Cedar Park, TX → PEDERNALES ELECTRIC COOP
- Georgetown, TX → PEDERNALES ELECTRIC COOP
- Greeley Bigfoot → KARNES ELECTRIC COOP
- Eagleville, TN → MIDDLE TENNESSEE EMC
- Ac Missouri, Linn Creek → LACLEDE ELECTRIC COOP
- Site 1 - Estancia NM → CENTRAL NEW MEXICO EL COOP

## REVIEW — needs human pick from shortlist (22)

Asherton TX, Bacon Homestead, Binz Engleman, Creek Valley Pike, Crossroads Ranch,
Denison Pit North, Dennis project, Economic Development Greater Waco/FTI,
Fm 1582 Pearsall, Indianapolis, Julio Perez, Leam Realty-Cirrascale, Mercedes Cattle,
Moore Property, Mustang Pit, Quinlan Property, sand plant, Sherman Property,
South Texas Powered Data Campus, Terry Properties, test, Wichita Falls.

(Full per-site shortlists: re-run `node research/utility-territory/audit-all-sites.mjs`.)
