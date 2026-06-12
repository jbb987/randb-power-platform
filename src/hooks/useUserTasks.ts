import { useState, useCallback, useEffect } from 'react';
import type { UserTask } from '../types';
import { defaultTodoVisibility } from '../types';
import { useAuth } from './useAuth';
import {
  saveUserTask,
  updateUserTaskFields,
  setUserTodoStatus,
  archiveUserTask,
  restoreUserTask,
  subscribeUserTasks,
} from '../lib/userTasks';

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

type NewTaskInput = Omit<
  UserTask,
  'id' | 'ownerUid' | 'status' | 'createdAt' | 'updatedAt' | 'completedAt' | 'archivedAt'
> & { status?: UserTask['status'] };

export function useUserTasks() {
  const [tasks, setTasks] = useState<UserTask[]>([]);
  const [loading, setLoading] = useState(true);
  const { user } = useAuth();
  const uid = user?.uid;

  useEffect(() => {
    if (!uid) {
      setTasks([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const unsub = subscribeUserTasks(
      uid,
      (remoteTasks) => {
        setTasks(remoteTasks);
        setLoading(false);
      },
      () => setLoading(false),
    );
    return () => unsub();
  }, [uid]);

  const createTask = useCallback(
    async (data: NewTaskInput) => {
      if (!uid) return;
      const now = Date.now();
      const id = generateId();
      const task: UserTask = {
        ...data,
        id,
        ownerUid: uid,
        // Self-assigned unless the creator delegated to someone else.
        assigneeUid: data.assigneeUid ?? uid,
        visibility: data.visibility ?? defaultTodoVisibility(data.category),
        status: data.status ?? 'todo',
        createdAt: now,
        updatedAt: now,
      };
      await saveUserTask(task);
      return id;
    },
    [uid],
  );

  const updateTask = useCallback(async (id: string, fields: Partial<UserTask>) => {
    await updateUserTaskFields(id, fields);
  }, []);

  // Set status; the lib keeps completedAt in sync (stamped on 'done',
  // removed otherwise).
  const setStatus = useCallback(async (id: string, status: UserTask['status']) => {
    await setUserTodoStatus(id, status);
  }, []);

  const toggleDone = useCallback(
    async (task: UserTask) => {
      const next = task.status === 'done' ? 'todo' : 'done';
      await setStatus(task.id, next);
    },
    [setStatus],
  );

  const archiveTask = useCallback(async (id: string) => {
    await archiveUserTask(id);
  }, []);

  const restoreTask = useCallback(async (id: string) => {
    await restoreUserTask(id);
  }, []);

  return {
    tasks,
    loading,
    createTask,
    updateTask,
    setStatus,
    toggleDone,
    archiveTask,
    restoreTask,
  };
}
