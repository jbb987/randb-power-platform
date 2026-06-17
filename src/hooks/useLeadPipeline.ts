import { useEffect, useState } from 'react';
import type { LeadPipelineCompany, LeadPipelineJob } from '../types';
import { subscribeJob, subscribeJobs, subscribePipelineCompanies } from '../lib/leadPipeline';

/** Real-time list of all pipeline jobs, newest first. Admin-only data. */
export function useLeadPipelineJobs() {
  const [jobs, setJobs] = useState<LeadPipelineJob[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsub = subscribeJobs(
      (remote) => {
        setJobs(remote);
        setLoading(false);
      },
      () => setLoading(false),
    );
    return () => unsub();
  }, []);

  return { jobs, loading };
}

/**
 * Real-time view of one pipeline job plus its companies. Both the job doc and
 * the companies query are subscribed via onSnapshot and torn down on unmount /
 * jobId change. `loading` stays true until both first snapshots have landed.
 */
export function useLeadPipelineJob(jobId: string | undefined) {
  const [job, setJob] = useState<LeadPipelineJob | null>(null);
  const [companies, setCompanies] = useState<LeadPipelineCompany[]>([]);
  const [jobLoaded, setJobLoaded] = useState(false);
  const [companiesLoaded, setCompaniesLoaded] = useState(false);

  useEffect(() => {
    if (!jobId) return;

    const unsubJob = subscribeJob(
      jobId,
      (remote) => {
        setJob(remote);
        setJobLoaded(true);
      },
      () => setJobLoaded(true),
    );
    const unsubCompanies = subscribePipelineCompanies(
      jobId,
      (remote) => {
        setCompanies(remote);
        setCompaniesLoaded(true);
      },
      () => setCompaniesLoaded(true),
    );

    return () => {
      unsubJob();
      unsubCompanies();
      // Reset for the next jobId so stale data never flashes.
      setJob(null);
      setCompanies([]);
      setJobLoaded(false);
      setCompaniesLoaded(false);
    };
  }, [jobId]);

  // No jobId ⇒ nothing to load (the route always supplies one, but keep the
  // hook total). Otherwise wait for both first snapshots.
  const loading = jobId ? !jobLoaded || !companiesLoaded : false;

  return { job, companies, loading };
}
