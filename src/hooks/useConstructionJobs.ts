import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from './useAuth';
import {
  createConstructionJob,
  deleteConstructionJob,
  subscribeConstructionJob,
  subscribeConstructionJobs,
  subscribeConstructionJobsForWorker,
  updateConstructionJob,
} from '../lib/constructionJobs';
import type { ConstructionJob } from '../types';

/** Real-time list of construction jobs the user can read.
 *  - admin/employee → full collection subscription
 *  - worker         → scoped (workerIds OR projectManagerId)
 *  Mirrors the Firestore rules; the hook also short-circuits for unauthed users. */
export function useConstructionJobs() {
  const { user, role } = useAuth();
  const [jobs, setJobs] = useState<ConstructionJob[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user || !role) {
      setJobs([]);
      setLoading(false);
      return;
    }
    setLoading(true);

    const onSnap = (j: ConstructionJob[]) => {
      setJobs(j);
      setLoading(false);
    };
    const onErr = () => setLoading(false);

    const unsub =
      role === 'worker'
        ? subscribeConstructionJobsForWorker(user.uid, onSnap, onErr)
        : subscribeConstructionJobs(onSnap, onErr);
    return unsub;
  }, [user, role]);

  const createJob = useCallback(
    async (entry: Omit<ConstructionJob, 'id' | 'createdAt' | 'updatedAt' | 'linkedCompanyIds'>) => {
      return createConstructionJob(entry);
    },
    [],
  );

  const updateJob = useCallback(
    async (id: string, updates: Partial<ConstructionJob>) => {
      return updateConstructionJob(id, updates);
    },
    [],
  );

  const removeJob = useCallback(async (id: string) => {
    return deleteConstructionJob(id);
  }, []);

  return useMemo(
    () => ({ jobs, loading, createJob, updateJob, removeJob }),
    [jobs, loading, createJob, updateJob, removeJob],
  );
}

/** Real-time subscription to a single construction job. */
export function useConstructionJob(id: string | undefined) {
  const [job, setJob] = useState<ConstructionJob | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) {
      setJob(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    const unsub = subscribeConstructionJob(
      id,
      (j) => {
        setJob(j);
        setLoading(false);
      },
      () => setLoading(false),
    );
    return unsub;
  }, [id]);

  return { job, loading };
}

/** Filter jobs that include the given companyId in linkedCompanyIds.
 *  Used by the company-profile "Construction Jobs" panel. */
export function useConstructionJobsByCompany(companyId: string | undefined) {
  const { jobs, loading } = useConstructionJobs();
  const filtered = useMemo(
    () => (companyId ? jobs.filter((j) => j.linkedCompanyIds.includes(companyId)) : []),
    [jobs, companyId],
  );
  return { jobs: filtered, loading };
}
