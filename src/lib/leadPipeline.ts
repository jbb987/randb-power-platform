import {
  collection,
  doc,
  setDoc,
  updateDoc,
  increment,
  query,
  where,
  onSnapshot,
  getDocs,
  writeBatch,
  deleteField,
  type Unsubscribe,
} from 'firebase/firestore';
import { db } from './firebase';
import type {
  LeadPipelineCompany,
  LeadPipelineJob,
  LeadPipelineJobStatus,
  LeadPipelineStage,
  LeadTier,
} from '../types';
import { LEAD_PIPELINE_COMPANIES_COLLECTION, LEAD_PIPELINE_JOBS_COLLECTION } from '../types';
import type { UserRecord } from '../hooks/useUsers';
import { userLabel } from '../hooks/useUsers';

const LEADS_COLLECTION = 'leads';

// ── Display config (shared by the index, run page, and Leads badges) ───────

/** Per-job status pill: label + brand-consistent color. */
export const JOB_STATUS_CONFIG: Record<LeadPipelineJobStatus, { label: string; color: string }> = {
  ingesting: { label: 'Ingesting tax roll', color: '#7A756E' },
  awaiting_perplexity_approval: { label: 'Awaiting Perplexity approval', color: '#F59E0B' },
  enriching_perplexity: { label: 'Enriching (Perplexity)', color: '#3B82F6' },
  awaiting_apollo_approval: { label: 'Awaiting Apollo approval', color: '#F59E0B' },
  enriching_apollo: { label: 'Enriching (Apollo)', color: '#3B82F6' },
  review: { label: 'Ready for review', color: '#8B5CF6' },
  done: { label: 'Done', color: '#10B981' },
  error: { label: 'Error', color: '#EF4444' },
};

/** Tier pill colors — GIANT → SMALL, hottest to coolest. */
export const TIER_CONFIG: Record<LeadTier, { label: string; color: string }> = {
  GIANT: { label: 'GIANT', color: '#9B0E18' },
  BIG: { label: 'BIG', color: '#ED202B' },
  MID: { label: 'MID', color: '#F59E0B' },
  SMALL: { label: 'SMALL', color: '#7A756E' },
};

/** Human labels for the company stages we surface in progress + counts. */
export const STAGE_LABELS: Record<LeadPipelineStage, string> = {
  ingested: 'Ingested',
  perplexity_pending: 'Perplexity pending',
  perplexity_done: 'Perplexity done',
  dropped_perplexity: 'Dropped (Perplexity)',
  needs_review: 'Needs review',
  apollo_pending: 'Apollo pending',
  apollo_done: 'Apollo done',
  dropped_apollo: 'Dropped (Apollo)',
  qualified: 'Qualified',
  promoted: 'Promoted',
};

/**
 * Human-readable reason a company sits where it does — drives the "Reason"
 * column in the audit view. Derived purely from the stored enrichment fields
 * (pplxStatus / website / qualified / stageError), no extra reads.
 */
export function companyReason(c: LeadPipelineCompany): string {
  switch (c.stage) {
    case 'apollo_done':
      return 'Decision-maker + verified email found';
    case 'needs_review':
      if (c.pplxStatus === 'closed')
        return `Possibly closed (${c.pplxConfidence ?? 'low'} confidence) — verify before promoting`;
      if (!c.website && c.pplxStatus === 'active')
        return 'Active company, but no website found — reach by phone, or add a site to enrich';
      if (!c.website) return 'No website and identity unconfirmed — verify before promoting';
      return 'Couldn’t auto-qualify — needs a manual look';
    case 'dropped_perplexity':
      if (c.ineligibleReason) return c.ineligibleReason;
      if (c.dismissed) return 'Dismissed by reviewer';
      if (c.pplxStatus === 'closed') return 'Confirmed out of business';
      if (c.stageError) return `Enrichment failed — ${c.stageError}`;
      return 'Could not identify an operating company';
    case 'dropped_apollo':
      if (c.stageError && c.stageError !== 'no domain') return `Apollo lookup failed — ${c.stageError}`;
      if (!c.apolloOrgId) return 'Company not in Apollo (small/private) — reach by phone';
      if (!c.decisionMaker) return 'No on-target decision-maker at this company';
      return 'No verified email for the decision-maker';
    case 'promoted':
      return 'Promoted into Leads';
    default:
      return STAGE_LABELS[c.stage] ?? '';
  }
}

/** Which enrichment step dropped a company — shown as a badge on the Dropped
 *  tab. A reviewer-dismissed company has no automated step. */
export function droppedStep(c: LeadPipelineCompany): 'Perplexity' | 'Apollo' | null {
  if (c.ineligibleReason) return null; // not an enrichment-step drop — never enriched
  if (c.dismissed) return null;
  if (c.stage === 'dropped_perplexity') return 'Perplexity';
  if (c.stage === 'dropped_apollo') return 'Apollo';
  return null;
}

/** Fields the audit view lets an admin repair on a pipeline company. */
export type EditableCompanyFields = Pick<
  LeadPipelineCompany,
  'operatingCompany' | 'website' | 'decisionMaker' | 'decisionMakerTitle' | 'email' | 'orgPhone'
>;

/** Write hand-edited contact fields back onto a pipeline company (audit repair). */
export async function updateCompanyFields(
  companyId: string,
  fields: EditableCompanyFields,
): Promise<void> {
  try {
    await updateDoc(doc(db, LEAD_PIPELINE_COMPANIES_COLLECTION, companyId), {
      ...fields,
      updatedAt: Date.now(),
    });
  } catch (err) {
    console.error('[Firebase] Failed to update pipeline company:', err);
    throw err;
  }
}

/** Reviewer rejects a company — move it to the Dropped tab with a clear reason. */
export async function dismissCompany(companyId: string): Promise<void> {
  try {
    await updateDoc(doc(db, LEAD_PIPELINE_COMPANIES_COLLECTION, companyId), {
      stage: 'dropped_perplexity',
      dismissed: true,
      updatedAt: Date.now(),
    });
  } catch (err) {
    console.error('[Firebase] Failed to dismiss pipeline company:', err);
    throw err;
  }
}

/**
 * States/counties we can build leads for today. Gated by having a tax-roll
 * source adapter — NOT just retail deregulation. Only NY has an adapter
 * (functions/src/leadBuilder/sources/nySocrata.ts), which covers the 57
 * counties in the state's open assessment-roll dataset (NYC boroughs excluded).
 * County names are the EXACT `county_name` values from the dataset so the
 * ingest query matches. Add a state here once its source adapter ships.
 */
export const TARGETABLE_REGIONS: Record<string, { label: string; counties: string[] }> = {
  NY: {
    label: 'New York',
    counties: [
      'Albany', 'Allegany', 'Broome', 'Cattaraugus', 'Cayuga', 'Chautauqua',
      'Chemung', 'Chenango', 'Clinton', 'Columbia', 'Cortland', 'Delaware',
      'Dutchess', 'Erie', 'Essex', 'Franklin', 'Fulton', 'Genesee', 'Greene',
      'Hamilton', 'Herkimer', 'Jefferson', 'Lewis', 'Livingston', 'Madison',
      'Monroe', 'Montgomery', 'Nassau', 'Niagara', 'Oneida', 'Onondaga',
      'Ontario', 'Orange', 'Orleans', 'Oswego', 'Otsego', 'Putnam',
      'Rensselaer', 'Rockland', 'Saratoga', 'Schenectady', 'Schoharie',
      'Schuyler', 'Seneca', 'Steuben', 'St Lawrence', 'Suffolk', 'Sullivan',
      'Tioga', 'Tompkins', 'Ulster', 'Warren', 'Washington', 'Wayne',
      'Westchester', 'Wyoming', 'Yates',
    ],
  },
};

/** Targetable state codes, in display order. */
export const TARGETABLE_STATES = Object.keys(TARGETABLE_REGIONS);

/**
 * Ingest scope. Commercial (400s) is not production-ready, so the build form
 * offers Industrial only for now; the backend still understands
 * 'commercial-industrial' for when the commercial classifier lands.
 */
export const SCOPE_OPTIONS: ReadonlyArray<{ value: string; label: string }> = [
  { value: 'industrial', label: 'Industrial' },
];

/** Per-company enrichment cost estimates (USD), shown on the approval gates. */
export const PERPLEXITY_COST_PER_COMPANY = 0.02;
export const APOLLO_COST_PER_COMPANY = 0.03;

/** Format a per-company cost estimate for N companies as "$X.XX". */
export function estimateCost(count: number, perCompany: number): string {
  return `$${(count * perCompany).toFixed(2)}`;
}

function jobsRef() {
  return collection(db, LEAD_PIPELINE_JOBS_COLLECTION);
}

function companiesRef() {
  return collection(db, LEAD_PIPELINE_COMPANIES_COLLECTION);
}

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

/**
 * Create a new pipeline job. Writing the doc with status 'ingesting' fires the
 * deployed `ingestCountyTaxRoll` Firestore trigger, which ingests the county
 * tax roll → companies appear at stage 'ingested' and the job flips to
 * 'awaiting_perplexity_approval'. Returns the new job id.
 *
 * `scope` is forwarded for the ingest classifier (industrial vs.
 * commercial-industrial); it is not part of the typed `LeadPipelineJob` shape
 * but is read by the backend, so we write it through.
 */
export async function createPipelineJob(input: {
  county: string;
  state: string;
  scope: string;
  requestedBy: string;
}): Promise<string> {
  const id = generateId();
  const now = Date.now();
  try {
    await setDoc(doc(db, LEAD_PIPELINE_JOBS_COLLECTION, id), {
      id,
      county: input.county,
      state: input.state,
      scope: input.scope,
      status: 'ingesting',
      counts: {},
      requestedBy: input.requestedBy,
      createdAt: now,
      updatedAt: now,
    });
    return id;
  } catch (err) {
    console.error('[Firebase] Failed to create pipeline job:', err);
    throw err;
  }
}

/**
 * Re-run a build in place: flip the job back to 'ingesting' so the
 * ingestCountyTaxRoll trigger re-fires (it clears the prior companies and
 * rebuilds from the current roll). Keeps the same job id / URL, so the user
 * stays on the run page and watches the progress bar.
 */
export async function rerunPipelineJob(jobId: string): Promise<void> {
  try {
    await updateDoc(doc(db, LEAD_PIPELINE_JOBS_COLLECTION, jobId), {
      status: 'ingesting',
      counts: {},
      updatedAt: Date.now(),
    });
  } catch (err) {
    console.error('[Firebase] Failed to re-run pipeline job:', err);
    throw err;
  }
}

/**
 * Retry the Apollo stage ONLY — without re-paying for Perplexity.
 *
 * Re-run wipes the whole build and re-enriches from scratch (repaying
 * Perplexity for every company). When only Apollo failed — e.g. a bad/expired
 * API key returned 401 on every call — that's pure waste. This instead resets
 * just the rows that FAILED Apollo *with an error* (`dropped_apollo` +
 * `stageError`) back to `perplexity_done`, clears their stale Apollo fields, and
 * re-opens the Apollo cost gate (`awaiting_apollo_approval`). Genuine "not
 * found" drops (no `stageError`) are left alone — retrying them just burns
 * credits for the same miss. Perplexity is never touched, never re-charged.
 *
 * Returns the number of companies queued for retry (0 ⇒ nothing to retry).
 */
export async function retryApolloStage(jobId: string): Promise<number> {
  const snap = await getDocs(
    query(
      companiesRef(),
      where('jobId', '==', jobId),
      where('stage', '==', 'dropped_apollo' satisfies LeadPipelineStage),
    ),
  );
  // Only rows whose Apollo call errored (auth/network) — not clean not-founds.
  const targets = snap.docs.filter((d) => {
    const e = (d.data() as LeadPipelineCompany).stageError;
    return typeof e === 'string' && e.trim().length > 0;
  });
  if (targets.length === 0) return 0;

  // Firestore caps a batch at 500 writes.
  for (let i = 0; i < targets.length; i += 450) {
    const batch = writeBatch(db);
    for (const d of targets.slice(i, i + 450)) {
      batch.update(d.ref, {
        stage: 'perplexity_done' satisfies LeadPipelineStage,
        stageError: deleteField(),
        apolloOrgId: deleteField(),
        apolloPersonId: deleteField(),
        decisionMaker: deleteField(),
        decisionMakerTitle: deleteField(),
        email: deleteField(),
        linkedinUrl: deleteField(),
        orgPhone: deleteField(),
        qualified: deleteField(),
        updatedAt: Date.now(),
      });
    }
    await batch.commit();
  }

  // Re-open the Apollo cost gate so the admin approves the (Apollo-only) spend.
  // Clear any stale processing lease so the next tick picks the job up cleanly.
  await updateDoc(doc(db, LEAD_PIPELINE_JOBS_COLLECTION, jobId), {
    status: 'awaiting_apollo_approval' satisfies LeadPipelineJobStatus,
    lockUntil: 0,
    updatedAt: Date.now(),
  });
  return targets.length;
}

export function subscribeJobs(
  callback: (jobs: LeadPipelineJob[]) => void,
  onError?: (err: Error) => void,
): Unsubscribe {
  return onSnapshot(
    jobsRef(),
    (snapshot) => {
      // Always derive `id` from the Firestore doc id — backend- and test-created
      // job docs don't store an `id` field, so trusting `data().id` yields
      // undefined (breaks the `/lead-builder/:jobId` link + React list key).
      const jobs = snapshot.docs.map((d) => ({ ...d.data(), id: d.id }) as LeadPipelineJob);
      jobs.sort((a, b) => b.createdAt - a.createdAt);
      callback(jobs);
    },
    (err) => {
      console.error('[Firebase] Pipeline jobs subscription error:', err);
      onError?.(err);
    },
  );
}

export function subscribeJob(
  jobId: string,
  callback: (job: LeadPipelineJob | null) => void,
  onError?: (err: Error) => void,
): Unsubscribe {
  return onSnapshot(
    doc(db, LEAD_PIPELINE_JOBS_COLLECTION, jobId),
    (snapshot) => {
      callback(snapshot.exists() ? ({ ...snapshot.data(), id: snapshot.id } as LeadPipelineJob) : null);
    },
    (err) => {
      console.error('[Firebase] Pipeline job subscription error:', err);
      onError?.(err);
    },
  );
}

export function subscribePipelineCompanies(
  jobId: string,
  callback: (companies: LeadPipelineCompany[]) => void,
  onError?: (err: Error) => void,
): Unsubscribe {
  return onSnapshot(
    query(companiesRef(), where('jobId', '==', jobId)),
    (snapshot) => {
      // Derive `id` from the doc id for the same reason as jobs — `company.id`
      // drives both the promote write-back and the run page's list keys.
      const companies = snapshot.docs.map((d) => ({ ...d.data(), id: d.id }) as LeadPipelineCompany);
      companies.sort((a, b) => a.createdAt - b.createdAt);
      callback(companies);
    },
    (err) => {
      console.error('[Firebase] Pipeline companies subscription error:', err);
      onError?.(err);
    },
  );
}

/**
 * Cost gate 1 — flip the job from awaiting_perplexity_approval →
 * enriching_perplexity. The scheduled `processLeadPipeline` function then runs
 * the Perplexity enrichment.
 */
export async function approvePerplexity(jobId: string): Promise<void> {
  try {
    await updateDoc(doc(db, LEAD_PIPELINE_JOBS_COLLECTION, jobId), {
      status: 'enriching_perplexity',
      updatedAt: Date.now(),
    });
  } catch (err) {
    console.error('[Firebase] Failed to approve Perplexity stage:', err);
    throw err;
  }
}

/**
 * Cost gate 2 — flip the job from awaiting_apollo_approval →
 * enriching_apollo. The scheduled `processLeadPipeline` function then runs the
 * Apollo enrichment.
 */
export async function approveApollo(jobId: string): Promise<void> {
  try {
    await updateDoc(doc(db, LEAD_PIPELINE_JOBS_COLLECTION, jobId), {
      status: 'enriching_apollo',
      updatedAt: Date.now(),
    });
  } catch (err) {
    console.error('[Firebase] Failed to approve Apollo stage:', err);
    throw err;
  }
}

/**
 * Promote the selected pipeline companies into the `leads` collection and mark
 * each company `promoted`. Mirrors the field mapping in
 * functions/scripts/leadbuilder-promote.mjs.
 *
 * `orgPhone` is written onto the company doc by the backend Apollo processor
 * but isn't part of the typed `LeadPipelineCompany` shape, so we read it via a
 * narrow cast. The client `db` is initialized with `ignoreUndefinedProperties`,
 * so undefined optional fields are dropped automatically.
 */
export async function promoteCompanies(
  companies: LeadPipelineCompany[],
  rep: UserRecord,
): Promise<string[]> {
  const repName = userLabel(rep);

  // Never re-promote: an already-promoted company has its lead; minting another
  // would duplicate it (the leads collection has no sourcePipelineId dedupe).
  const toPromote = companies.filter((c) => c.stage !== 'promoted');
  if (toPromote.length === 0) return [];

  // Collapse rows that resolve to the same company so a rep never gets duplicate
  // leads (e.g. three ITT/Goulds parcels → one Ray Hendershot). Key by Apollo
  // person, else verified email, else domain, else name. One lead per group;
  // every member of the group still flips to 'promoted' pointing at that lead.
  const dedupKey = (c: LeadPipelineCompany): string => {
    if (c.apolloPersonId) return `p:${c.apolloPersonId}`;
    if (c.email) return `e:${c.email.toLowerCase()}`;
    const d = (c.website ?? '')
      .replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/.*$/, '').trim().toLowerCase();
    if (d) return `d:${d}`;
    return `n:${(c.operatingCompany || c.taxOwner || c.id).toLowerCase()}`;
  };
  const groups = new Map<string, LeadPipelineCompany[]>();
  for (const c of toPromote) {
    const k = dedupKey(c);
    const g = groups.get(k);
    if (g) g.push(c);
    else groups.set(k, [c]);
  }

  // One lead per group; tolerate partial failure so one bad write can't skew counts.
  const results = await Promise.allSettled(
    [...groups.values()].map(async (members) => {
      const lead = members.find((m) => m.email) ?? members[0]; // prefer a member with a verified email
      const leadId = generateId();
      const now = Date.now();
      const orgPhone = (lead as { orgPhone?: string }).orgPhone;

      await setDoc(doc(db, LEADS_COLLECTION, leadId), {
        id: leadId,
        assignedTo: rep.id,
        assignedToName: repName,
        businessName: lead.operatingCompany || lead.taxOwner || 'Unknown',
        phone: orgPhone || '',
        email: lead.email || '',
        description: lead.description || '',
        decisionMakerName: lead.decisionMaker || '',
        decisionMakerRole: lead.decisionMakerTitle || '',
        status: 'new',
        notes: [],
        source: 'lead-builder',
        sourcePipelineId: lead.id,
        tier: lead.tier,
        energyIntensity: lead.energyIntensity,
        operatingCompany: lead.operatingCompany,
        website: lead.website,
        linkedinUrl: lead.linkedinUrl,
        apolloPersonId: lead.apolloPersonId,
        mobileStatus: 'none',
        createdAt: now,
        updatedAt: now,
      });

      // Flip every member (incl. the duplicates) to promoted → same lead.
      await Promise.all(
        members.map((m) =>
          updateDoc(doc(db, LEAD_PIPELINE_COMPANIES_COLLECTION, m.id), {
            stage: 'promoted',
            promotedLeadId: leadId,
            updatedAt: now,
          }),
        ),
      );

      return { leadId, stages: members.map((m) => m.stage) };
    }),
  );

  const succeeded = results.flatMap((r) => (r.status === 'fulfilled' ? [r.value] : []));
  const failed = results.length - succeeded.length;
  if (failed > 0) {
    console.error(`[Firebase] promoteCompanies: ${failed}/${results.length} groups failed`);
  }

  // Keep the job's per-stage tally honest (the processor stops touching a job at
  // review/done). Decrement each promoted company's original stage; increment
  // 'promoted' by the total companies moved (not the lead count).
  const jobId = toPromote[0]?.jobId;
  if (jobId && succeeded.length > 0) {
    const movedTotal = succeeded.reduce((n, s) => n + s.stages.length, 0);
    const delta: Record<string, ReturnType<typeof increment> | number> = {
      'counts.promoted': increment(movedTotal),
      updatedAt: Date.now(),
    };
    const byStage: Record<string, number> = {};
    for (const s of succeeded) for (const st of s.stages) byStage[st] = (byStage[st] ?? 0) + 1;
    for (const [stage, n] of Object.entries(byStage)) {
      delta[`counts.${stage}`] = increment(-n);
    }
    try {
      await updateDoc(doc(db, LEAD_PIPELINE_JOBS_COLLECTION, jobId), delta);
    } catch (err) {
      // Non-fatal — the leads were created; only the index tally drifts.
      console.error('[Firebase] Failed to update job counts after promote:', err);
    }
  }

  return succeeded.map((s) => s.leadId); // one id per unique company
}
