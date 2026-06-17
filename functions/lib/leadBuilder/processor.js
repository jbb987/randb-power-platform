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
/** Process up to CHUNK companies at `inputStage` for a job; `worker` returns the fields + next stage. */
async function runStage(db, jobId, inputStage, dropStage, worker) {
    const snap = await db
        .collection(COMPANIES)
        .where('jobId', '==', jobId)
        .where('stage', '==', inputStage)
        .limit(CHUNK)
        .get();
    for (const doc of snap.docs) {
        try {
            const result = await worker(doc.data());
            await doc.ref.update(cleanUndefined({ ...result, updatedAt: Date.now() }));
        }
        catch (err) {
            await doc.ref.update({ stage: dropStage, stageError: String(err).slice(0, 150), updatedAt: Date.now() });
        }
    }
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
exports.processLeadPipeline = (0, scheduler_1.onSchedule)({
    schedule: 'every 1 minutes',
    region: 'us-central1',
    timeoutSeconds: 300,
    secrets: [APOLLO_API_KEY, PERPLEXITY_API_KEY],
}, async () => {
    const db = admin.firestore();
    const jobs = await db
        .collection(JOBS)
        .where('status', 'in', ['enriching_perplexity', 'enriching_apollo'])
        .get();
    if (jobs.empty)
        return;
    for (const jobDoc of jobs.docs) {
        const jobId = jobDoc.id;
        const status = jobDoc.data().status;
        try {
            if (status === 'enriching_perplexity') {
                const key = PERPLEXITY_API_KEY.value();
                await runStage(db, jobId, 'ingested', 'dropped_perplexity', async (c) => {
                    const e = await (0, perplexity_1.enrichCompanyPerplexity)({
                        taxOwner: c.taxOwner ?? '',
                        parcelAddress: c.parcelAddress ?? '',
                        city: c.city ?? '',
                        classDesc: c.classDesc ?? '',
                    }, key);
                    const drop = !e.website || e.status === 'closed' || e.status === 'unknown';
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
                        stage: drop ? 'dropped_perplexity' : 'perplexity_done',
                    };
                });
                await maybeAdvance(db, jobId, 'ingested', 'awaiting_apollo_approval');
            }
            else if (status === 'enriching_apollo') {
                const key = APOLLO_API_KEY.value();
                await runStage(db, jobId, 'perplexity_done', 'dropped_apollo', async (c) => {
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
        }
        catch (err) {
            v2_1.logger.error(`[pipeline] job ${jobId} tick failed`, err);
        }
    }
});
//# sourceMappingURL=processor.js.map