import {
  collection,
  doc,
  setDoc,
  updateDoc,
  deleteDoc,
  getDoc,
  onSnapshot,
  query,
  where,
  type Unsubscribe,
} from 'firebase/firestore';
import { db } from './firebase';
import type { ConstructionJob } from '../types';

const COLLECTION = 'construction-jobs';

function jobsRef() {
  return collection(db, COLLECTION);
}

/** Pre-1.21.1 jobs were stored as `linkedCompanies: [{companyId, role, isPrimary}]`,
 *  and 1.21.1–1.x stored a single `generalContractorId`. This adapter projects
 *  both legacy shapes into the current array-of-GCs shape so the rest of the
 *  app only ever sees one schema. */
type LegacyLinkedCompany = {
  companyId: string;
  role?: 'client' | 'general-contractor' | 'subcontractor' | 'other';
  isPrimary?: boolean;
};

function normalizeJob(raw: Record<string, unknown>): ConstructionJob {
  const j = raw as Partial<ConstructionJob> & {
    linkedCompanies?: LegacyLinkedCompany[];
    generalContractorId?: string; // legacy single-GC field
  };

  let companyIds: string[];
  let subcontractorIds: string[];
  let generalContractorIds: string[] = Array.isArray(j.generalContractorIds)
    ? j.generalContractorIds
    : (j.generalContractorId ? [j.generalContractorId] : []);

  if (Array.isArray(j.companyIds)) {
    companyIds = j.companyIds;
    subcontractorIds = j.subcontractorIds ?? [];
  } else {
    // Pre-1.21.1: split linkedCompanies by role. Untagged/client/other → companyIds.
    const legacy = j.linkedCompanies ?? [];
    companyIds = [];
    subcontractorIds = [];
    for (const l of legacy) {
      if (l.role === 'general-contractor') generalContractorIds.push(l.companyId);
      else if (l.role === 'subcontractor') subcontractorIds.push(l.companyId);
      else companyIds.push(l.companyId);
    }
  }

  const linkedCompanyIds = j.linkedCompanyIds ?? Array.from(
    new Set([...companyIds, ...subcontractorIds, ...generalContractorIds]),
  );

  return {
    ...(j as ConstructionJob),
    companyIds,
    generalContractorIds,
    subcontractorIds,
    linkedCompanyIds,
    workerIds: j.workerIds ?? [],
  };
}

/** Union of clients + GCs + subs, used as the array-contains mirror so the
 *  company-profile panel can surface jobs that link a company in any role. */
export function deriveLinkedCompanyIds(
  companyIds: string[],
  generalContractorIds: string[],
  subcontractorIds: string[],
): string[] {
  return Array.from(new Set([...companyIds, ...generalContractorIds, ...subcontractorIds]));
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
      entry.generalContractorIds,
      entry.subcontractorIds,
    ),
    createdAt: now,
    updatedAt: now,
  };
  await setDoc(doc(db, COLLECTION, id), full);
  return id;
}

/** Partial update on an existing job. Re-derives linkedCompanyIds when any
 *  of the three company fields changes — merging the patch with the current
 *  stored values so a partial update (e.g., only `subcontractorIds`) doesn't
 *  blow away the unchanged client/GC arrays. */
export async function updateConstructionJob(
  id: string,
  updates: Partial<ConstructionJob>,
): Promise<void> {
  const patch: Partial<ConstructionJob> = { ...updates, updatedAt: Date.now() };
  const companyFieldChanged =
    'companyIds' in updates ||
    'generalContractorIds' in updates ||
    'subcontractorIds' in updates;
  if (companyFieldChanged) {
    const current = await getConstructionJob(id);
    const companyIds = updates.companyIds ?? current?.companyIds ?? [];
    const generalContractorIds = updates.generalContractorIds ?? current?.generalContractorIds ?? [];
    const subcontractorIds = updates.subcontractorIds ?? current?.subcontractorIds ?? [];
    patch.linkedCompanyIds = deriveLinkedCompanyIds(
      companyIds,
      generalContractorIds,
      subcontractorIds,
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

/** Subscribe to real-time updates for the full construction-jobs collection.
 *  Used by admins and employees who can read every job. Workers must use
 *  subscribeConstructionJobsForWorker — under the new rules, this query
 *  fails with permission-denied for any non-member document. */
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

/** Worker-scoped subscription. Runs two parallel queries — `workerIds` array-
 *  contains and `projectManagerId` equals — and merges them. Two subscriptions
 *  costs one extra small initial-snapshot read; in exchange we avoid needing a
 *  composite OR index, which changes operationally with every Firestore SDK
 *  version. */
export function subscribeConstructionJobsForWorker(
  uid: string,
  callback: (jobs: ConstructionJob[]) => void,
  onError?: (err: Error) => void,
): Unsubscribe {
  let memberJobs: ConstructionJob[] = [];
  let pmJobs: ConstructionJob[] = [];

  const emit = () => {
    const byId = new Map<string, ConstructionJob>();
    for (const j of memberJobs) byId.set(j.id, j);
    for (const j of pmJobs) byId.set(j.id, j);
    const merged = Array.from(byId.values()).sort((a, b) => a.name.localeCompare(b.name));
    callback(merged);
  };

  const handleErr = (err: Error) => {
    console.error('[Firebase] Worker-scoped jobs subscription error:', err);
    onError?.(err);
  };

  const unsubMember = onSnapshot(
    query(jobsRef(), where('workerIds', 'array-contains', uid)),
    (snap) => {
      memberJobs = snap.docs.map((d) => normalizeJob(d.data()));
      emit();
    },
    handleErr,
  );
  const unsubPm = onSnapshot(
    query(jobsRef(), where('projectManagerId', '==', uid)),
    (snap) => {
      pmJobs = snap.docs.map((d) => normalizeJob(d.data()));
      emit();
    },
    handleErr,
  );

  return () => {
    unsubMember();
    unsubPm();
  };
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
