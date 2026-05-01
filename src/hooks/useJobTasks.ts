import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  createJobTask,
  deleteJobTask,
  reorderJobTasks,
  subscribeJobTasks,
  updateJobTask,
} from '../lib/constructionTasks';
import type { JobTask } from '../types';

export function useJobTasks(jobId: string | undefined) {
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
      jobId,
      (t) => {
        setTasks(t);
        setLoading(false);
      },
      () => setLoading(false),
    );
    return unsub;
  }, [jobId]);

  const create = useCallback(
    async (entry: Omit<JobTask, 'id' | 'jobId' | 'createdAt' | 'updatedAt'>) => {
      if (!jobId) throw new Error('No job ID');
      return createJobTask(jobId, entry);
    },
    [jobId],
  );

  const update = useCallback(
    async (taskId: string, updates: Partial<JobTask>) => {
      if (!jobId) throw new Error('No job ID');
      return updateJobTask(jobId, taskId, updates);
    },
    [jobId],
  );

  const remove = useCallback(
    async (taskId: string) => {
      if (!jobId) throw new Error('No job ID');
      return deleteJobTask(jobId, taskId, tasksRef.current);
    },
    [jobId],
  );

  const reorder = useCallback(
    async (updates: Array<{ id: string; order: number }>) => {
      if (!jobId) throw new Error('No job ID');
      return reorderJobTasks(jobId, updates);
    },
    [jobId],
  );

  return useMemo(
    () => ({ tasks, loading, create, update, remove, reorder }),
    [tasks, loading, create, update, remove, reorder],
  );
}
