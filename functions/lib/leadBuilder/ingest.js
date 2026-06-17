"use strict";
/**
 * Tax-roll ingestion (P5). Fires when a `lead-pipeline-jobs` doc is created with
 * status 'ingesting' (the Lead Builder UI writes it). Pulls the county's roll via
 * the state source adapter, runs the classifier (keep COMPANY/REVIEW, drop
 * PERSON/EXEMPT + 74x energy-infra classes), dedupes to one row per company with
 * aggregated parcels + market value, tiers + routes them, and writes them to
 * `lead-pipeline-companies` at stage 'ingested'. Then advances the job to the
 * first cost gate. Firestore-triggered → no public HTTP surface.
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.ingestCountyTaxRoll = void 0;
const firestore_1 = require("firebase-functions/v2/firestore");
const v2_1 = require("firebase-functions/v2");
const admin = __importStar(require("firebase-admin"));
const nySocrata_1 = require("./sources/nySocrata");
const classify_1 = require("./classify");
const COMPANIES = 'lead-pipeline-companies';
// Energy/utility infrastructure classes we never target — they're power/fuel
// producers & transporters, not C&I electricity customers:
// 733 gas wells, 741 electric/gas, 742 generation, 743 gas/oil distribution,
// 744 gas/oil pipelines.
const INFRA_CLASSES = new Set(['733', '741', '742', '743', '744']);
const BATCH = 450;
// Public-power suppression. New York retail electricity is deregulated STATEWIDE
// across the six investor-owned utilities — so every county is targetable — EXCEPT
// customers served by a municipal electric utility or a rural electric co-op. Those
// are publicly/member-owned, sit outside the competitive (ESCO) market, and legally
// CANNOT switch supplier — so there is nothing for a broker to sell them. We drop
// them at ingest (before any Perplexity/Apollo spend), routing them to the Dropped
// tab with a clear reason rather than silently skipping, because the match is a
// heuristic (see below) and a reviewer may want to recover a false-exclude.
//
// Source: NY DPS "Electric & Gas Utility Service Territory by County". The 48
// municipal electric systems below are keyed by their municipality name; the ingest
// matches them against the parcel's `municipality_name`.
//
// LIMITATION (v1): a municipal system serves a VILLAGE/CITY footprint, but the
// assessment roll's `municipality_name` is the assessing unit (often the parent
// TOWN). So this reliably catches munis that are their own assessing unit (cities
// like Jamestown/Plattsburgh/Salamanca and coterminous villages) and may over- or
// under-match village-in-town cases. The precise fix is a per-address serving-
// utility resolver (v2, tracked in TODO) — which is also the ONLY way to catch the
// 4 rural co-ops below, since their rural territory has no city name to match on.
//
// The 4 NY rural electric cooperatives (NOT matchable by city — handled in v2):
//   Delaware County Electric Cooperative (Delaware Co.)
//   Oneida-Madison Electric Cooperative (Oneida/Madison Cos.)
//   Otsego Electric Cooperative (Otsego Co.)
//   Steuben Rural Electric Cooperative (Steuben Co.)
const MUNI_ELECTRIC = new Set([
    'GREEN ISLAND', 'ANGELICA', 'ANDOVER', 'WELLSVILLE', 'ENDICOTT', 'LITTLE VALLEY',
    'SALAMANCA', 'BROCTON', 'WESTFIELD', 'MAYVILLE', 'JAMESTOWN', 'SHERBURNE', 'GREENE',
    'ROUSES POINT', 'PLATTSBURGH', 'AKRON', 'SPRINGVILLE', 'LAKE PLACID', 'TUPPER LAKE',
    'BERGEN', 'FRANKFORT', 'ILION', 'MOHAWK', 'THERESA', 'PHILADELPHIA', 'HAMILTON',
    'SPENCERPORT', 'CHURCHVILLE', 'FAIRPORT', 'ROCKVILLE CENTRE', 'FREEPORT', 'BOONVILLE',
    'SHERRILL', 'SOLVAY', 'SKANEATELES', 'HOLLEY', 'RICHMONDVILLE', 'WATKINS GLEN',
    'MASSENA', 'BATH', 'FISHERS ISLAND', 'GREENPORT', 'WAVERLY', 'GROTON', 'SILVER SPRINGS',
    'CASTILE', 'ARCADE', 'PENN YAN',
]);
/** A parcel's municipality is a municipal-electric system → ineligible to switch
 *  supplier. Returns the matched system name, or null. Normalizes case/spacing and
 *  strips a leading "Village of "/"City of "/"Town of " prefix some rolls carry. */
function muniElectricMatch(municipality) {
    const norm = municipality
        .toUpperCase()
        .replace(/\s+/g, ' ')
        .trim()
        .replace(/^(VILLAGE|CITY|TOWN) OF /, '');
    return MUNI_ELECTRIC.has(norm) ? norm : null;
}
/** "WATKINS GLEN" → "Watkins Glen" for display in the drop reason. */
function titleCase(name) {
    return name.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
}
function s(v) {
    return typeof v === 'string' ? v.trim() : '';
}
function joinAddr(...parts) {
    return parts.map((p) => s(p)).filter(Boolean).join(' ');
}
function cleanUndefined(obj) {
    const out = {};
    for (const [k, v] of Object.entries(obj))
        if (v !== undefined)
            out[k] = v;
    return out;
}
exports.ingestCountyTaxRoll = (0, firestore_1.onDocumentWritten)({ document: 'lead-pipeline-jobs/{jobId}', region: 'us-central1', timeoutSeconds: 300, memory: '512MiB' }, async (event) => {
    const after = event.data?.after;
    if (!after?.exists)
        return; // deleted
    const job = after.data();
    // Act on any write that leaves the job at 'ingesting' (initial create or a
    // Re-run flip). Other writes move status to awaiting/enriching/error, so
    // this can't re-enter — and crucially, NOT gating on the previous status
    // means a job wedged at 'ingesting' (e.g. a Re-run that landed during the
    // trigger's post-deploy propagation gap) is recoverable by clicking
    // Re-run again. The clean-slate delete below keeps a double-fire idempotent.
    if (!job || job.status !== 'ingesting')
        return;
    const snap = after;
    const jobId = event.params.jobId;
    const county = s(job.county);
    const state = s(job.state) || 'NY';
    const db = admin.firestore();
    if (state !== 'NY') {
        await snap.ref.update({ status: 'error', error: `No source adapter for ${state} yet.`, updatedAt: Date.now() });
        return;
    }
    // Single-flight lease: a rapid double Re-run (or an in-flight re-run) can
    // fire two concurrent ingests that would interleave the wipe + rebuild.
    // Claim the job for one run; a competing fire sees the live lock and bails.
    // (Writing the lock re-fires this trigger once, which immediately bails.)
    const LOCK_MS = 280_000; // < the 300s timeout
    const claimed = await db.runTransaction(async (tx) => {
        const j = await tx.get(snap.ref);
        const d = j.data();
        if (!d || d.status !== 'ingesting')
            return false;
        if (typeof d.ingestLockUntil === 'number' && d.ingestLockUntil > Date.now())
            return false;
        tx.update(snap.ref, { ingestLockUntil: Date.now() + LOCK_MS });
        return true;
    });
    if (!claimed) {
        v2_1.logger.info(`[ingest] job ${jobId}: another run holds the lease — skipping`);
        return;
    }
    try {
        // Re-run support: wipe any companies from a prior build of this job so we
        // start from a clean slate (deterministic ids would otherwise leave stale
        // rows from a different roll/scope behind).
        const prior = await db.collection(COMPANIES).where('jobId', '==', jobId).get();
        if (!prior.empty) {
            let delBatch = db.batch();
            let delPending = 0;
            for (const d of prior.docs) {
                delBatch.delete(d.ref);
                if (++delPending >= BATCH) {
                    await delBatch.commit();
                    delBatch = db.batch();
                    delPending = 0;
                }
            }
            if (delPending > 0)
                await delBatch.commit();
            v2_1.logger.info(`[ingest] job ${jobId}: cleared ${prior.size} prior companies (re-run)`);
        }
        // 'commercial-industrial' = 400-499 + 700-799; default = industrial 700-799.
        const ranges = job.scope === 'commercial-industrial' ? [['400', '500'], ['700', '800']] : [['700', '800']];
        // Roll-year resolution: an explicit job.rollYear wins; otherwise try the
        // current calendar year and walk back. NY publishes a final roll mid-year,
        // so the latest available is usually last year until ~summer — walking back
        // finds whatever's actually published instead of hardcoding a stale year.
        const thisYear = new Date().getFullYear();
        const candidates = s(job.rollYear)
            ? [s(job.rollYear)]
            : [String(thisYear), String(thisYear - 1), String(thisYear - 2)];
        let raw = [];
        let rollYear = candidates[candidates.length - 1];
        for (const yr of candidates) {
            const pull = (await (0, nySocrata_1.fetchNyCountyParcels)(county, yr, ranges));
            if (pull.length > 0) {
                raw = pull;
                rollYear = yr;
                break;
            }
        }
        // Still nothing across all candidate years → almost always a bad county
        // spelling or an unpublished roll. Surface it instead of a silent "success".
        if (raw.length === 0) {
            await snap.ref.update({
                status: 'error',
                error: `No parcels found for ${county}, ${state} (tried roll years ${candidates.join(', ')}).`,
                ingestLockUntil: 0,
                updatedAt: Date.now(),
            });
            return;
        }
        // Classify + keep operating companies; dedupe to one row per owner.
        const groups = new Map();
        for (const r of raw) {
            const pc = s(r.property_class);
            if (INFRA_CLASSES.has(pc))
                continue;
            const last = s(r.primary_owner_last_name);
            const first = s(r.primary_owner_first_name);
            const { cls, name } = (0, classify_1.classifyEntity)(last, first);
            if (cls === 'PERSON' || cls === 'EXEMPT')
                continue;
            const mv = Number(r.full_market_value ?? 0) || 0;
            const paddr = joinAddr(r.parcel_address_number, r.parcel_address_street, r.parcel_address_suff);
            const maddr = joinAddr(r.mailing_address_number, r.mailing_address_street);
            const occ = paddr !== '' && paddr.toUpperCase() === maddr.toUpperCase();
            const g = groups.get(name);
            if (!g) {
                groups.set(name, {
                    name,
                    taxOwner: (last + (first ? ` ${first}` : '')).trim(),
                    marketValue: mv,
                    nParcels: 1,
                    topValue: mv,
                    parcelAddress: paddr,
                    city: s(r.municipality_name),
                    classDesc: s(r.property_class_description),
                    mailing: `${maddr}, ${s(r.mailing_address_city)} ${s(r.mailing_address_state)}`.trim(),
                    classes: new Set([pc]),
                    ownerOccupied: occ,
                });
            }
            else {
                g.marketValue += mv;
                g.nParcels += 1;
                g.classes.add(pc);
                if (occ)
                    g.ownerOccupied = true;
                if (mv > g.topValue) {
                    g.topValue = mv;
                    g.parcelAddress = paddr;
                    g.city = s(r.municipality_name);
                    g.classDesc = s(r.property_class_description);
                }
            }
        }
        // Write companies (deterministic ids → re-ingest is idempotent).
        let batch = db.batch();
        let pending = 0;
        let written = 0; // targetable companies at stage 'ingested'
        let muniDropped = 0; // public-power parcels dropped as ineligible
        for (const g of groups.values()) {
            const industrial = [...g.classes].some((c) => c.startsWith('7'));
            const protectedHi = g.marketValue >= 5_000_000 || industrial;
            const route = g.ownerOccupied || protectedHi
                ? 'owner_operator'
                : (0, classify_1.isLandlordName)(g.name)
                    ? 'find_tenant_by_address'
                    : 'owner_operator';
            // Public-power parcels can't switch supplier → drop at ingest (no spend),
            // visible in the Dropped tab with a reason rather than silently skipped.
            const muni = muniElectricMatch(g.city);
            const stage = muni ? 'dropped_perplexity' : 'ingested';
            const ineligibleReason = muni
                ? `Served by ${titleCase(muni)} municipal electric — customer can’t choose an electricity supplier`
                : undefined;
            // Include jobId so two builds of the same county can't collide on the
            // same company docs (deterministic-but-job-scoped). Re-ingesting the
            // SAME job still merges in place (same jobId + name).
            const id = `${jobId}_${state}_${county}_${g.name}`
                .replace(/[^A-Za-z0-9_]+/g, '_')
                .slice(0, 1400);
            batch.set(db.collection(COMPANIES).doc(id), cleanUndefined({
                id,
                jobId,
                county,
                state,
                stage,
                ineligibleReason,
                taxOwner: g.taxOwner,
                parcelAddress: g.parcelAddress,
                mailingAddress: g.mailing,
                city: g.city,
                propertyClasses: [...g.classes].sort().join('|'),
                classDesc: g.classDesc,
                marketValue: g.marketValue,
                nParcels: g.nParcels,
                tier: (0, classify_1.tierFor)(g.marketValue),
                contactRoute: route,
                createdAt: Date.now(),
                updatedAt: Date.now(),
            }), { merge: true });
            pending++;
            if (muni)
                muniDropped++;
            else
                written++;
            if (pending >= BATCH) {
                await batch.commit();
                batch = db.batch();
                pending = 0;
            }
        }
        if (pending > 0)
            await batch.commit();
        await snap.ref.update({
            status: 'awaiting_perplexity_approval',
            counts: cleanUndefined({
                ingested: written,
                dropped_perplexity: muniDropped || undefined,
            }),
            ingestLockUntil: 0,
            updatedAt: Date.now(),
        });
        v2_1.logger.info(`[ingest] job ${jobId}: ${county}, ${state} -> ${written} companies` +
            (muniDropped ? ` (+${muniDropped} dropped: municipal-electric, ineligible)` : ''));
    }
    catch (err) {
        v2_1.logger.error('[ingest] failed', err);
        await snap.ref.update({
            status: 'error',
            error: String(err).slice(0, 200),
            ingestLockUntil: 0,
            updatedAt: Date.now(),
        });
    }
});
//# sourceMappingURL=ingest.js.map