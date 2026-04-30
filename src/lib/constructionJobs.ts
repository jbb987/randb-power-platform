import {
  collection,
  doc,
  setDoc,
  updateDoc,
  deleteDoc,
  getDoc,
  onSnapshot,
  type Unsubscribe,
} from 'firebase/firestore';
import { db } from './firebase';
import type { ConstructionJob } from '../types';

const COLLECTION = 'construction-jobs';

function jobsRef() {
  return collection(db, COLLECTION);
}

/** Pre-1.21.1 jobs were stored as `linkedCompanies: [{companyId, role, isPrimary}]`.
 *  This adapter projects the legacy shape into the current 3-field shape so the
 *  rest of the app only ever sees one schema. Once all docs are migrated this
 *  can be removed. */
type LegacyLinkedCompany = {
  companyId: string;
  role?: 'client' | 'general-contractor' | 'subcontractor' | 'other';
  isPrimary?: boolean;
};

function normalizeJob(raw: Record<string, unknown>): ConstructionJob {
  const j = raw as Partial<ConstructionJob> & { linkedCompanies?: LegacyLinkedCompany[] };

  // Derive the three company lists.
  let companyIds: string[];
  let subcontractorIds: string[];
  let generalContractorId: string | undefined = j.generalContractorId;

  if (Array.isArray(j.companyIds)) {
    companyIds = j.companyIds;
    subcontractorIds = j.subcontractorIds ?? [];
  } else {
    // Legacy shape: split linkedCompanies by role. Anything tagged 'client'
    // or 'other' (or untagged) goes to companyIds; first GC wins; subs
    // collect into subcontractorIds.
    const legacy = j.linkedCompanies ?? [];
    companyIds = [];
    subcontractorIds = [];
    for (const l of legacy) {
      if (l.role === 'general-contractor' && !generalContractorId) generalContractorId = l.companyId;
      else if (l.role === 'subcontractor') subcontractorIds.push(l.companyId);
      else companyIds.push(l.companyId);
    }
  }

  const linkedCompanyIds = j.linkedCompanyIds ?? Array.from(
    new Set([
      ...companyIds,
      ...subcontractorIds,
      ...(generalContractorId ? [generalContractorId] : []),
    ]),
  );

  return {
    ...(j as ConstructionJob),
    companyIds,
    ...(generalContractorId && { generalContractorId }),
    subcontractorIds,
    linkedCompanyIds,
    workerIds: j.workerIds ?? [],
  };
}

/** Union of clients + GC + subs, used as the array-contains mirror so the
 *  company-profile panel can surface jobs that link a company in any role. */
export function deriveLinkedCompanyIds(
  companyIds: string[],
  generalContractorId: string | undefined,
  subcontractorIds: string[],
): string[] {
  const all = [...companyIds, ...subcontractorIds];
  if (generalContractorId) all.push(generalContractorId);
  return Array.from(new Set(all));
}

/** Create a new construction job. Returns the generated ID. */
export async function createConstructionJob(
  entry: Omit<ConstructionJob, 'id' | 'createdAt' | 'updatedAt' | 'linkedCompanyIds'>,
): Promise<string> {
  const id = doc(jobsRef()).id;
  const now = Date.now();
  const full: ConstructionJob = {
    ...entry,
    id,
    linkedCompanyIds: deriveLinkedCompanyIds(
      entry.companyIds,
      entry.generalContractorId,
      entry.subcontractorIds,
    ),
    createdAt: now,
    updatedAt: now,
  };
  await setDoc(doc(db, COLLECTION, id), full);
  return id;
}

/** Partial update on an existing job. Re-derives linkedCompanyIds when any
 *  of the three company fields changes. */
export async function updateConstructionJob(
  id: string,
  updates: Partial<ConstructionJob>,
): Promise<void> {
  const patch: Partial<ConstructionJob> = { ...updates, updatedAt: Date.now() };
  const companyFieldChanged =
    'companyIds' in updates ||
    'generalContractorId' in updates ||
    'subcontractorIds' in updates;
  if (companyFieldChanged) {
    // Caller must have included whichever fields changed; pull current values
    // from the patch first, then fall back to whatever the doc already has on
    // the next read. For now we trust the caller passes a coherent set
    // (the form always submits the full company triple together).
    patch.linkedCompanyIds = deriveLinkedCompanyIds(
      updates.companyIds ?? [],
      updates.generalContractorId,
      updates.subcontractorIds ?? [],
    );
  }
  await updateDoc(doc(db, COLLECTION, id), patch as Record<string, unknown>);
}

/** Delete a construction job. */
export async function deleteConstructionJob(id: string): Promise<void> {
  await deleteDoc(doc(db, COLLECTION, id));
}

/** Fetch a single job by ID. */
export async function getConstructionJob(id: string): Promise<ConstructionJob | null> {
  const snap = await getDoc(doc(db, COLLECTION, id));
  return snap.exists() ? normalizeJob(snap.data()) : null;
}

/** Subscribe to real-time updates for the full construction-jobs collection. */
export function subscribeConstructionJobs(
  callback: (jobs: ConstructionJob[]) => void,
  onError?: (err: Error) => void,
): Unsubscribe {
  return onSnapshot(
    jobsRef(),
    (snap) => {
      const jobs = snap.docs.map((d) => normalizeJob(d.data()));
      jobs.sort((a, b) => a.name.localeCompare(b.name));
      callback(jobs);
    },
    (err) => {
      console.error('[Firebase] Construction jobs subscription error:', err);
      onError?.(err);
    },
  );
}

/** Subscribe to a single job by ID. */
export function subscribeConstructionJob(
  id: string,
  callback: (job: ConstructionJob | null) => void,
  onError?: (err: Error) => void,
): Unsubscribe {
  return onSnapshot(
    doc(db, COLLECTION, id),
    (snap) => callback(snap.exists() ? normalizeJob(snap.data()) : null),
    (err) => {
      console.error('[Firebase] Construction job subscription error:', err);
      onError?.(err);
    },
  );
}
