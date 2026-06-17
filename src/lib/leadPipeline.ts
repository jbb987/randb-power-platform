import {
  collection,
  doc,
  setDoc,
  updateDoc,
  query,
  where,
  onSnapshot,
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
        return `Flagged possibly closed (${c.pplxConfidence ?? 'low'} confidence) — verify`;
      if (!c.website)
        return c.pplxStatus === 'active'
          ? 'Active, but no website found — reach by phone, or add a site to enrich'
          : 'Identity unclear and no website — verify before promoting';
      return 'Needs a manual look';
    case 'dropped_perplexity':
      if (c.pplxStatus === 'closed') return 'Confirmed out of business';
      if (c.stageError) return `Enrichment error: ${c.stageError}`;
      return 'Dropped during enrichment';
    case 'dropped_apollo':
      if (c.stageError && c.stageError !== 'no domain') return `Apollo error: ${c.stageError}`;
      if (c.apolloOrgId && !c.decisionMaker)
        return 'Company found, but no on-target decision-maker';
      if (!c.apolloOrgId) return 'Not in Apollo (small/private) — reach by phone';
      return 'No verified contact found';
    case 'promoted':
      return 'Promoted into Leads';
    default:
      return STAGE_LABELS[c.stage] ?? '';
  }
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
  const promotedLeadIds: string[] = [];

  await Promise.all(
    companies.map(async (company) => {
      const leadId = generateId();
      const now = Date.now();
      const orgPhone = (company as { orgPhone?: string }).orgPhone;

      await setDoc(doc(db, LEADS_COLLECTION, leadId), {
        id: leadId,
        assignedTo: rep.id,
        assignedToName: repName,
        businessName: company.operatingCompany || company.taxOwner || 'Unknown',
        phone: orgPhone || '',
        email: company.email || '',
        description: company.description || '',
        decisionMakerName: company.decisionMaker || '',
        decisionMakerRole: company.decisionMakerTitle || '',
        status: 'new',
        notes: [],
        source: 'lead-builder',
        sourcePipelineId: company.id,
        tier: company.tier,
        energyIntensity: company.energyIntensity,
        operatingCompany: company.operatingCompany,
        website: company.website,
        linkedinUrl: company.linkedinUrl,
        apolloPersonId: company.apolloPersonId,
        mobileStatus: 'none',
        createdAt: now,
        updatedAt: now,
      });

      await updateDoc(doc(db, LEAD_PIPELINE_COMPANIES_COLLECTION, company.id), {
        stage: 'promoted',
        promotedLeadId: leadId,
        updatedAt: now,
      });

      promotedLeadIds.push(leadId);
    }),
  );

  return promotedLeadIds;
}
