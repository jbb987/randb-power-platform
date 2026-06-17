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

import { onSchedule } from 'firebase-functions/v2/scheduler';
import { logger } from 'firebase-functions/v2';
import { defineSecret } from 'firebase-functions/params';
import * as admin from 'firebase-admin';
import { enrichCompanyPerplexity } from './perplexity';
import { enrichCompanyApollo } from './apollo';

const APOLLO_API_KEY = defineSecret('APOLLO_API_KEY');
const PERPLEXITY_API_KEY = defineSecret('PERPLEXITY_API_KEY');

const COMPANIES = 'lead-pipeline-companies';
const JOBS = 'lead-pipeline-jobs';
const CHUNK = 20; // companies per tick — kept well under the 300s timeout

function cleanUndefined(obj: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) if (v !== undefined) out[k] = v;
  return out;
}

/** Process up to CHUNK companies at `inputStage` for a job; `worker` returns the fields + next stage. */
async function runStage(
  db: admin.firestore.Firestore,
  jobId: string,
  inputStage: string,
  dropStage: string,
  worker: (data: admin.firestore.DocumentData) => Promise<Record<string, unknown>>,
): Promise<void> {
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
    } catch (err) {
      await doc.ref.update({ stage: dropStage, stageError: String(err).slice(0, 150), updatedAt: Date.now() });
    }
  }
}

/** When no companies remain at `inputStage` for the job, advance the job to `nextStatus`. */
async function maybeAdvance(
  db: admin.firestore.Firestore,
  jobId: string,
  inputStage: string,
  nextStatus: string,
): Promise<void> {
  const remaining = await db
    .collection(COMPANIES)
    .where('jobId', '==', jobId)
    .where('stage', '==', inputStage)
    .limit(1)
    .get();
  if (remaining.empty) {
    await db.collection(JOBS).doc(jobId).update({ status: nextStatus, updatedAt: Date.now() });
    logger.info(`[pipeline] job ${jobId} -> ${nextStatus}`);
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
async function refreshCounts(db: admin.firestore.Firestore, jobId: string): Promise<void> {
  const counts: Record<string, number> = {};
  await Promise.all(
    COUNTED_STAGES.map(async (st) => {
      const agg = await db
        .collection(COMPANIES)
        .where('jobId', '==', jobId)
        .where('stage', '==', st)
        .count()
        .get();
      const n = agg.data().count;
      if (n > 0) counts[st] = n;
    }),
  );
  await db.collection(JOBS).doc(jobId).update({ counts, updatedAt: Date.now() });
}

export const processLeadPipeline = onSchedule(
  {
    schedule: 'every 1 minutes',
    region: 'us-central1',
    timeoutSeconds: 300,
    secrets: [APOLLO_API_KEY, PERPLEXITY_API_KEY],
  },
  async () => {
    const db = admin.firestore();
    const jobs = await db
      .collection(JOBS)
      .where('status', 'in', ['enriching_perplexity', 'enriching_apollo'])
      .get();
    if (jobs.empty) return;

    for (const jobDoc of jobs.docs) {
      const jobId = jobDoc.id;
      const status = jobDoc.data().status as string;
      try {
        if (status === 'enriching_perplexity') {
          const key = PERPLEXITY_API_KEY.value();
          await runStage(db, jobId, 'ingested', 'dropped_perplexity', async (c) => {
            const e = await enrichCompanyPerplexity(
              {
                taxOwner: c.taxOwner ?? '',
                parcelAddress: c.parcelAddress ?? '',
                city: c.city ?? '',
                classDesc: c.classDesc ?? '',
              },
              key,
            );
            // Stage routing (softened — see project_niagara_leads memo):
            //  • confidently closed  -> hard drop (genuinely out of business)
            //  • active + website    -> perplexity_done (clean, enrich via Apollo)
            //  • everything else     -> needs_review (real but no findable site,
            //    or low-confidence/unknown) so a human decides instead of the
            //    pipeline silently killing a real lead (e.g. Wilt Industries,
            //    flagged "closed" but actually an active furnace maker).
            let stage: string;
            if (e.status === 'closed' && e.confidence === 'high') {
              stage = 'dropped_perplexity';
            } else if (e.website && e.status === 'active') {
              stage = 'perplexity_done';
            } else {
              stage = 'needs_review';
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
        } else if (status === 'enriching_apollo') {
          const key = APOLLO_API_KEY.value();
          await runStage(db, jobId, 'perplexity_done', 'dropped_apollo', async (c) => {
            const e = await enrichCompanyApollo(
              { operatingCompany: c.operatingCompany, website: c.website, city: c.city },
              key,
            );
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
        // Snapshot the per-stage tally so the jobs list shows real counts.
        // This tick (incl. the one that drains into 'review') refreshes it.
        await refreshCounts(db, jobId);
      } catch (err) {
        logger.error(`[pipeline] job ${jobId} tick failed`, err);
      }
    }
  },
);
