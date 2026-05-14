import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  createJobTask,
  deleteJobTask,
  subscribeJobTasks,
  updateJobTask,
} from '../lib/constructionTasks';
import { useJobToolConfig } from '../lib/jobToolConfig';
import type { JobTask } from '../types';

export function useJobTasks(jobId: string | undefined) {
  const config = useJobToolConfig();
  const [tasks, setTasks] = useState<JobTask[]>([]);
  const [loading, setLoading] = useState(true);
  const tasksRef = useRef<JobTask[]>([]);
  tasksRef.current = tasks;

  useEffect(() => {
    if (!jobId) {
      setTasks([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const unsub = subscribeJobTasks(
      config.jobsCollection,
      jobId,
      (t) => {
        setTasks(t);
        setLoading(false);
      },
      () => setLoading(false),
    );
    return unsub;
  }, [jobId, config.jobsCollection]);

  const create = useCallback(
    async (entry: Omit<JobTask, 'id' | 'jobId' | 'createdAt' | 'updatedAt'>) => {
      if (!jobId) throw new Error('No job ID');
      return createJobTask(config.jobsCollection, jobId, entry);
    },
    [jobId, config.jobsCollection],
  );

  const update = useCallback(
    async (taskId: string, updates: Partial<JobTask>) => {
      if (!jobId) throw new Error('No job ID');
      return updateJobTask(config.jobsCollection, jobId, taskId, updates);
    },
    [jobId, config.jobsCollection],
  );

  const remove = useCallback(
    async (taskId: string) => {
      if (!jobId) throw new Error('No job ID');
      return deleteJobTask(config.jobsCollection, jobId, taskId, tasksRef.current);
    },
    [jobId, config.jobsCollection],
  );

  return useMemo(
    () => ({ tasks, loading, create, update, remove }),
    [tasks, loading, create, update, remove],
  );
}
