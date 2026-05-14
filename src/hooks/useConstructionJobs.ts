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
import {
  BAILEY_PROJECT_CONFIG,
  CONSTRUCTION_PROJECTS_CONFIG,
  useJobToolConfig,
} from '../lib/jobToolConfig';
import type { ConstructionJob } from '../types';

/** Real-time list of construction jobs the user can read.
 *  - admin/employee → full collection subscription
 *  - worker         → scoped (workerIds OR projectSupervisorIds)
 *  Mirrors the Firestore rules; the hook also short-circuits for unauthed users. */
export function useConstructionJobs() {
  const config = useJobToolConfig();
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
      role === 'labor'
        ? subscribeConstructionJobsForWorker(config.jobsCollection, user.uid, onSnap, onErr)
        : subscribeConstructionJobs(config.jobsCollection, onSnap, onErr);
    return unsub;
  }, [user, role, config.jobsCollection]);

  const createJob = useCallback(
    async (entry: Omit<ConstructionJob, 'id' | 'createdAt' | 'updatedAt' | 'linkedCompanyIds'>) => {
      return createConstructionJob(config.jobsCollection, entry);
    },
    [config.jobsCollection],
  );

  const updateJob = useCallback(
    async (id: string, updates: Partial<ConstructionJob>) => {
      return updateConstructionJob(config.jobsCollection, id, updates);
    },
    [config.jobsCollection],
  );

  const removeJob = useCallback(
    async (id: string) => {
      return deleteConstructionJob(config.jobsCollection, id);
    },
    [config.jobsCollection],
  );

  return useMemo(
    () => ({ jobs, loading, createJob, updateJob, removeJob }),
    [jobs, loading, createJob, updateJob, removeJob],
  );
}

/** Real-time subscription to a single construction job. */
export function useConstructionJob(id: string | undefined) {
  const config = useJobToolConfig();
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
      config.jobsCollection,
      id,
      (j) => {
        setJob(j);
        setLoading(false);
      },
      () => setLoading(false),
    );
    return unsub;
  }, [id, config.jobsCollection]);

  return { job, loading };
}

/** A job tagged with which tool it came from, so cross-tool surfaces (e.g.,
 *  the CRM company panel) can route clicks back to the correct detail page. */
export interface JobWithOrigin {
  job: ConstructionJob;
  routeBase: string;
  toolLabel: string;
}

/** Cross-tool: list jobs linked to a given company across BOTH tools
 *  (Bailey Project + Construction Projects). Used by the CRM company panel,
 *  which lives outside either tool's config provider. */
export function useConstructionJobsByCompany(companyId: string | undefined) {
  const { user, role } = useAuth();
  const [baileyJobs, setBaileyJobs] = useState<ConstructionJob[]>([]);
  const [teamJobs, setTeamJobs] = useState<ConstructionJob[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user || !role || !companyId) {
      setBaileyJobs([]);
      setTeamJobs([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    let baileyReady = false;
    let teamReady = false;
    const maybeDone = () => {
      if (baileyReady && teamReady) setLoading(false);
    };

    const sub = (
      collectionName: string,
      setter: (j: ConstructionJob[]) => void,
      mark: () => void,
    ) =>
      role === 'labor'
        ? subscribeConstructionJobsForWorker(
            collectionName,
            user.uid,
            (j) => {
              setter(j);
              mark();
            },
            mark,
          )
        : subscribeConstructionJobs(
            collectionName,
            (j) => {
              setter(j);
              mark();
            },
            mark,
          );

    const unsubBailey = sub(BAILEY_PROJECT_CONFIG.jobsCollection, setBaileyJobs, () => {
      baileyReady = true;
      maybeDone();
    });
    const unsubTeam = sub(CONSTRUCTION_PROJECTS_CONFIG.jobsCollection, setTeamJobs, () => {
      teamReady = true;
      maybeDone();
    });

    return () => {
      unsubBailey();
      unsubTeam();
    };
  }, [user, role, companyId]);

  const jobs: JobWithOrigin[] = useMemo(() => {
    if (!companyId) return [];
    const tagged: JobWithOrigin[] = [];
    for (const j of baileyJobs) {
      if (j.linkedCompanyIds.includes(companyId)) {
        tagged.push({
          job: j,
          routeBase: BAILEY_PROJECT_CONFIG.routeBase,
          toolLabel: BAILEY_PROJECT_CONFIG.label,
        });
      }
    }
    for (const j of teamJobs) {
      if (j.linkedCompanyIds.includes(companyId)) {
        tagged.push({
          job: j,
          routeBase: CONSTRUCTION_PROJECTS_CONFIG.routeBase,
          toolLabel: CONSTRUCTION_PROJECTS_CONFIG.label,
        });
      }
    }
    return tagged;
  }, [baileyJobs, teamJobs, companyId]);

  return { jobs, loading };
}
