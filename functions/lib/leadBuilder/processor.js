"use strict";
/**
 * Lead Builder pipeline processor (drives the P3 Apollo + P4 Perplexity stages).
 *
 * A scheduled tick that advances active jobs through the enrichment stages in
 * bounded chunks — fully server-side (no public HTTP surface, so none of the
 * org-policy / public-invoker pain). Resumable: each tick processes a chunk and
 * the next tick continues; when a stage is drained the job transitions, pausing
 * at the admin cost gates (awaiting_apollo_approval, review).
 *
 * Job lifecycle (status):
 *   ingesting → awaiting_perplexity_approval → [admin] → enriching_perplexity
 *   → awaiting_apollo_approval → [admin] → enriching_apollo → review → [admin promotes] → done
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
exports.processLeadPipeline = void 0;
const scheduler_1 = require("firebase-functions/v2/scheduler");
const v2_1 = require("firebase-functions/v2");
const params_1 = require("firebase-functions/params");
const admin = __importStar(require("firebase-admin"));
const perplexity_1 = require("./perplexity");
const apollo_1 = require("./apollo");
const APOLLO_API_KEY = (0, params_1.defineSecret)('APOLLO_API_KEY');
const PERPLEXITY_API_KEY = (0, params_1.defineSecret)('PERPLEXITY_API_KEY');
const COMPANIES = 'lead-pipeline-companies';
const JOBS = 'lead-pipeline-jobs';
const CHUNK = 20; // companies per tick — kept well under the 300s timeout
function cleanUndefined(obj) {
    const out = {};
    for (const [k, v] of Object.entries(obj))
        if (v !== undefined)
            out[k] = v;
    return out;
}
/**
 * Process up to CHUNK companies at `inputStage` for a job; `worker` returns the
 * fields + next stage. The chunk runs CONCURRENTLY (the per-job lease in the
 * caller guarantees no other tick touches these same docs), collapsing ~20
 * sequential API round-trips into one. Returns how many docs were processed so
 * the caller can skip a no-op count refresh. Each worker has its own try/catch
 * (routes failures to dropStage), so the Promise.all never rejects.
 */
async function runStage(db, jobId, inputStage, dropStage, worker) {
    const snap = await db
        .collection(COMPANIES)
        .where('jobId', '==', jobId)
        .where('stage', '==', inputStage)
        .limit(CHUNK)
        .get();
    await Promise.all(snap.docs.map(async (doc) => {
        try {
            const result = await worker(doc.data());
            await doc.ref.update(cleanUndefined({ ...result, updatedAt: Date.now() }));
        }
        catch (err) {
            await doc.ref.update({
                stage: dropStage,
                stageError: String(err).slice(0, 150),
                updatedAt: Date.now(),
            });
        }
    }));
    return snap.size;
}
const JOB_LOCK_MS = 280_000; // < the 300s timeout
/** Claim a job for this tick so overlapping scheduled ticks can't reprocess the
 *  same companies (which would double-spend Apollo/Perplexity credits). */
async function claimJob(db, jobId) {
    const ref = db.collection(JOBS).doc(jobId);
    return db.runTransaction(async (tx) => {
        const d = (await tx.get(ref)).data();
        if (!d)
            return false;
        if (typeof d.lockUntil === 'number' && d.lockUntil > Date.now())
            return false;
        tx.update(ref, { lockUntil: Date.now() + JOB_LOCK_MS });
        return true;
    });
}
async function releaseJob(db, jobId) {
    await db.collection(JOBS).doc(jobId).update({ lockUntil: 0 });
}
/** When no companies remain at `inputStage` for the job, advance the job to `nextStatus`. */
async function maybeAdvance(db, jobId, inputStage, nextStatus) {
    const remaining = await db
        .collection(COMPANIES)
        .where('jobId', '==', jobId)
        .where('stage', '==', inputStage)
        .limit(1)
        .get();
    if (remaining.empty) {
        await db.collection(JOBS).doc(jobId).update({ status: nextStatus, updatedAt: Date.now() });
        v2_1.logger.info(`[pipeline] job ${jobId} -> ${nextStatus}`);
    }
}
/** Stages we keep a live tally of on the job doc (drives the index "Qualified"
 *  column + any future dashboards — the run page counts client-side). */
const COUNTED_STAGES = [
    'ingested',
    'perplexity_done',
    'needs_review',
    'dropped_perplexity',
    'apollo_done',
    'dropped_apollo',
    'promoted',
];
/**
 * Recompute the per-stage company tally and write it onto the job doc. Uses
 * count() aggregation (cheap, served by the (jobId,stage) composite index) so
 * the jobs list can show real "ready" counts without subscribing to companies.
 */
async function refreshCounts(db, jobId) {
    const counts = {};
    await Promise.all(COUNTED_STAGES.map(async (st) => {
        const agg = await db
            .collection(COMPANIES)
            .where('jobId', '==', jobId)
            .where('stage', '==', st)
            .count()
            .get();
        const n = agg.data().count;
        if (n > 0)
            counts[st] = n;
    }));
    await db.collection(JOBS).doc(jobId).update({ counts, updatedAt: Date.now() });
}
exports.processLeadPipeline = (0, scheduler_1.onSchedule)({
    schedule: 'every 1 minutes',
    region: 'us-central1',
    timeoutSeconds: 300,
    secrets: [APOLLO_API_KEY, PERPLEXITY_API_KEY],
}, async () => {
    const db = admin.firestore();
    // Watchdog: recover jobs stranded at 'ingesting'. The ingest function has a
    // 300s timeout, so >6min there means it crashed/timed out (or a Re-run flip
    // never fired) — surface an error so the UI offers Re-run instead of an
    // infinite spinner. (This also bounds a runaway re-ingest.)
    const STUCK_MS = 6 * 60 * 1000;
    const stuck = await db.collection(JOBS).where('status', '==', 'ingesting').get();
    for (const j of stuck.docs) {
        const updatedAt = j.data().updatedAt;
        if (typeof updatedAt === 'number' && Date.now() - updatedAt > STUCK_MS) {
            await j.ref.update({
                status: 'error',
                error: 'Ingest didn’t complete — click Re-run.',
                ingestLockUntil: 0,
                updatedAt: Date.now(),
            });
            v2_1.logger.warn(`[pipeline] job ${j.id} stuck at ingesting -> error`);
        }
    }
    const jobs = await db
        .collection(JOBS)
        .where('status', 'in', ['enriching_perplexity', 'enriching_apollo'])
        .get();
    for (const jobDoc of jobs.docs) {
        const jobId = jobDoc.id;
        const status = jobDoc.data().status;
        // One tick per job: skip if another (slow) tick still holds the lease.
        if (!(await claimJob(db, jobId))) {
            v2_1.logger.info(`[pipeline] job ${jobId} locked by another tick — skipping`);
            continue;
        }
        try {
            let processed = 0;
            if (status === 'enriching_perplexity') {
                const key = PERPLEXITY_API_KEY.value();
                processed = await runStage(db, jobId, 'ingested', 'dropped_perplexity', async (c) => {
                    const e = await (0, perplexity_1.enrichCompanyPerplexity)({
                        taxOwner: c.taxOwner ?? '',
                        parcelAddress: c.parcelAddress ?? '',
                        city: c.city ?? '',
                        classDesc: c.classDesc ?? '',
                    }, key);
                    // Stage routing (softened — see project_niagara_leads memo):
                    //  • active + website     -> perplexity_done (clean, enrich via Apollo)
                    //  • active, no website    -> needs_review (real lead, reach by phone /
                    //    add a site) — the recoverable case (e.g. a real local contractor)
                    //  • closed, high conf     -> dropped (genuinely out of business)
                    //  • closed, low/med conf  -> needs_review (Perplexity can be wrong —
                    //    e.g. Wilt Industries, flagged closed but an active furnace maker)
                    //  • unknown/moved/blank   -> dropped: couldn't confirm a real operating
                    //    company (holding-LLC shells like "110 Properties") — still visible
                    //    + promotable in the Dropped tab, just not cluttering needs_review.
                    let stage;
                    if (e.status === 'active') {
                        stage = e.website ? 'perplexity_done' : 'needs_review';
                    }
                    else if (e.status === 'closed') {
                        stage = e.confidence === 'high' ? 'dropped_perplexity' : 'needs_review';
                    }
                    else {
                        stage = 'dropped_perplexity';
                    }
                    return {
                        operatingCompany: e.operatingCompany,
                        website: e.website,
                        description: e.description,
                        industry: e.industry,
                        naics: e.naics,
                        energyIntensity: e.energyIntensity,
                        pplxStatus: e.status,
                        pplxConfidence: e.confidence,
                        stageError: e.pplxError,
                        stage,
                    };
                });
                await maybeAdvance(db, jobId, 'ingested', 'awaiting_apollo_approval');
            }
            else if (status === 'enriching_apollo') {
                const key = APOLLO_API_KEY.value();
                processed = await runStage(db, jobId, 'perplexity_done', 'dropped_apollo', async (c) => {
                    const e = await (0, apollo_1.enrichCompanyApollo)({ operatingCompany: c.operatingCompany, website: c.website, city: c.city }, key);
                    return {
                        apolloOrgId: e.apolloOrgId,
                        apolloPersonId: e.apolloPersonId,
                        decisionMaker: e.decisionMaker,
                        decisionMakerTitle: e.decisionMakerTitle,
                        email: e.email,
                        linkedinUrl: e.linkedinUrl,
                        orgPhone: e.orgPhone,
                        qualified: e.qualified,
                        stageError: e.apolloError,
                        stage: e.qualified ? 'apollo_done' : 'dropped_apollo',
                    };
                });
                await maybeAdvance(db, jobId, 'perplexity_done', 'review');
            }
            // Refresh the per-stage tally only when this tick actually moved
            // companies — a no-op tick (stage already drained) can't have changed
            // the counts, so skip the count() reads.
            if (processed > 0)
                await refreshCounts(db, jobId);
        }
        catch (err) {
            v2_1.logger.error(`[pipeline] job ${jobId} tick failed`, err);
        }
        finally {
            await releaseJob(db, jobId);
        }
    }
});
//# sourceMappingURL=processor.js.map