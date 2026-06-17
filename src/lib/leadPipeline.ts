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
  apollo_pending: 'Apollo pending',
  apollo_done: 'Apollo done',
  dropped_apollo: 'Dropped (Apollo)',
  qualified: 'Qualified',
  promoted: 'Promoted',
};

/** Ingest scope options for the New build form. */
export const SCOPE_OPTIONS: ReadonlyArray<{ value: string; label: string }> = [
  { value: 'industrial', label: 'Industrial' },
  { value: 'commercial-industrial', label: 'Commercial + Industrial' },
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
      const jobs = snapshot.docs.map((d) => d.data() as LeadPipelineJob);
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
      callback(snapshot.exists() ? (snapshot.data() as LeadPipelineJob) : null);
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
      const companies = snapshot.docs.map((d) => d.data() as LeadPipelineCompany);
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
