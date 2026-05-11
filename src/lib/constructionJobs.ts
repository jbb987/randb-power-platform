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

/** Legacy shapes folded into the current schema:
 *  - Pre-1.21.1 jobs were stored as `linkedCompanies: [{companyId, role, isPrimary}]`.
 *  - 1.21.1–1.30.x stored separate `generalContractorIds[]` (and earlier `generalContractorId`).
 *  As of 1.31, GCs merge into `companyIds` (the "Owner / General Contractor" field). */
type LegacyLinkedCompany = {
  companyId: string;
  role?: 'client' | 'general-contractor' | 'subcontractor' | 'other';
  isPrimary?: boolean;
};

function normalizeJob(raw: Record<string, unknown>): ConstructionJob {
  const j = raw as Partial<ConstructionJob> & {
    linkedCompanies?: LegacyLinkedCompany[];
    generalContractorIds?: string[];
    generalContractorId?: string;
    projectManagerId?: string; // pre-1.32: single supervisor UID
    projectSupervisorId?: string; // 1.32: single supervisor UID
    projectManagerContactId?: string; // 1.32: single PM contact ID
  };
  // Supervisors: prefer array; fall back to either single-id legacy field.
  const projectSupervisorIds: string[] = Array.isArray(j.projectSupervisorIds)
    ? j.projectSupervisorIds
    : j.projectSupervisorId
      ? [j.projectSupervisorId]
      : j.projectManagerId
        ? [j.projectManagerId]
        : [];
  // PM contacts: prefer array; fall back to single id.
  const projectManagerContactIds: string[] = Array.isArray(j.projectManagerContactIds)
    ? j.projectManagerContactIds
    : j.projectManagerContactId
      ? [j.projectManagerContactId]
      : [];

  const legacyGcs: string[] = Array.isArray(j.generalContractorIds)
    ? j.generalContractorIds
    : j.generalContractorId
      ? [j.generalContractorId]
      : [];

  let companyIds: string[];
  let subcontractorIds: string[];

  if (Array.isArray(j.companyIds)) {
    companyIds = Array.from(new Set([...j.companyIds, ...legacyGcs]));
    subcontractorIds = j.subcontractorIds ?? [];
  } else {
    // Pre-1.21.1: split linkedCompanies by role. Clients + GCs + others → companyIds.
    const legacy = j.linkedCompanies ?? [];
    companyIds = [...legacyGcs];
    subcontractorIds = [];
    for (const l of legacy) {
      if (l.role === 'subcontractor') subcontractorIds.push(l.companyId);
      else companyIds.push(l.companyId);
    }
    companyIds = Array.from(new Set(companyIds));
  }

  const linkedCompanyIds =
    j.linkedCompanyIds ?? Array.from(new Set([...companyIds, ...subcontractorIds]));

  return {
    ...(j as ConstructionJob),
    companyIds,
    subcontractorIds,
    linkedCompanyIds,
    projectSupervisorIds,
    projectManagerContactIds,
    workerIds: j.workerIds ?? [],
  };
}

/** Union of owners/GCs + subs, used as the array-contains mirror so the
 *  company-profile panel can surface jobs that link a company in any role. */
export function deriveLinkedCompanyIds(
  companyIds: string[],
  subcontractorIds: string[],
): string[] {
  return Array.from(new Set([...companyIds, ...subcontractorIds]));
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
    linkedCompanyIds: deriveLinkedCompanyIds(entry.companyIds, entry.subcontractorIds),
    createdAt: now,
    updatedAt: now,
  };
  // Mirror the first supervisor to the legacy `projectManagerId` field so any
  // worker-scoped query still keyed on it keeps matching. The canonical multi
  // field is `projectSupervisorIds`.
  const persisted: Record<string, unknown> = {
    ...(full as unknown as Record<string, unknown>),
    projectManagerId: full.projectSupervisorIds[0] ?? '',
  };
  await setDoc(doc(db, COLLECTION, id), persisted);
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
  const companyFieldChanged = 'companyIds' in updates || 'subcontractorIds' in updates;
  if (companyFieldChanged) {
    const current = await getConstructionJob(id);
    const companyIds = updates.companyIds ?? current?.companyIds ?? [];
    const subcontractorIds = updates.subcontractorIds ?? current?.subcontractorIds ?? [];
    patch.linkedCompanyIds = deriveLinkedCompanyIds(companyIds, subcontractorIds);
  }
  const persisted: Record<string, unknown> = { ...(patch as Record<string, unknown>) };
  // Mirror the first supervisor to legacy `projectManagerId` for any
  // worker-scoped query still keyed on it.
  if ('projectSupervisorIds' in updates) {
    persisted.projectManagerId = updates.projectSupervisorIds?.[0] ?? '';
  }
  await updateDoc(doc(db, COLLECTION, id), persisted);
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

/** Worker-scoped subscription. Runs three parallel queries — `workerIds`
 *  array-contains, `projectSupervisorIds` array-contains, and legacy
 *  `projectManagerId` equals — and merges them. The legacy equality query
 *  picks up pre-1.33 jobs that only have the single-id field set. */
export function subscribeConstructionJobsForWorker(
  uid: string,
  callback: (jobs: ConstructionJob[]) => void,
  onError?: (err: Error) => void,
): Unsubscribe {
  let memberJobs: ConstructionJob[] = [];
  let supervisorJobs: ConstructionJob[] = [];
  let legacyPmJobs: ConstructionJob[] = [];

  const emit = () => {
    const byId = new Map<string, ConstructionJob>();
    for (const j of memberJobs) byId.set(j.id, j);
    for (const j of supervisorJobs) byId.set(j.id, j);
    for (const j of legacyPmJobs) byId.set(j.id, j);
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
  const unsubSupervisor = onSnapshot(
    query(jobsRef(), where('projectSupervisorIds', 'array-contains', uid)),
    (snap) => {
      supervisorJobs = snap.docs.map((d) => normalizeJob(d.data()));
      emit();
    },
    handleErr,
  );
  const unsubLegacyPm = onSnapshot(
    query(jobsRef(), where('projectManagerId', '==', uid)),
    (snap) => {
      legacyPmJobs = snap.docs.map((d) => normalizeJob(d.data()));
      emit();
    },
    handleErr,
  );

  return () => {
    unsubMember();
    unsubSupervisor();
    unsubLegacyPm();
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
