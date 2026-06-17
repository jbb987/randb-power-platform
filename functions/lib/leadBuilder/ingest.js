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
const INFRA_CLASSES = new Set(['741', '742', '743']); // gas/water/brine — energy infra, not power customers
const BATCH = 450;
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
        const raw = (await (0, nySocrata_1.fetchNyCountyParcels)(county, s(job.rollYear) || '2025', ranges));
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
        let written = 0;
        for (const g of groups.values()) {
            const industrial = [...g.classes].some((c) => c.startsWith('7'));
            const protectedHi = g.marketValue >= 5_000_000 || industrial;
            const route = g.ownerOccupied || protectedHi
                ? 'owner_operator'
                : (0, classify_1.isLandlordName)(g.name)
                    ? 'find_tenant_by_address'
                    : 'owner_operator';
            const id = `${state}_${county}_${g.name}`.replace(/[^A-Za-z0-9_]+/g, '_').slice(0, 1400);
            batch.set(db.collection(COMPANIES).doc(id), cleanUndefined({
                id,
                jobId,
                county,
                state,
                stage: 'ingested',
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
            counts: { ingested: written },
            updatedAt: Date.now(),
        });
        v2_1.logger.info(`[ingest] job ${jobId}: ${county}, ${state} -> ${written} companies`);
    }
    catch (err) {
        v2_1.logger.error('[ingest] failed', err);
        await snap.ref.update({ status: 'error', error: String(err).slice(0, 200), updatedAt: Date.now() });
    }
});
//# sourceMappingURL=ingest.js.map