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
  subscribeArchivedUserTasks,
} from '../lib/userTasks';

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

type NewTaskInput = Omit<
  UserTask,
  | 'id'
  | 'ownerUid'
  | 'status'
  | 'createdAt'
  | 'updatedAt'
  | 'completedAt'
  | 'archived'
  | 'archivedAt'
> & { status?: UserTask['status'] };

export function useUserTasks() {
  // Snapshot is keyed by uid so loading can be derived (no setState in the
  // effect body): we're loading exactly when the stored snapshot isn't the
  // current user's. setState only happens in the subscription callbacks.
  const [snapshot, setSnapshot] = useState<{ uid: string; tasks: UserTask[] } | null>(null);
  const { user } = useAuth();
  const uid = user?.uid;

  useEffect(() => {
    if (!uid) return;
    const unsub = subscribeUserTasks(
      uid,
      (remoteTasks) => setSnapshot({ uid, tasks: remoteTasks }),
      () => setSnapshot({ uid, tasks: [] }),
    );
    return () => unsub();
  }, [uid]);

  // Boolean(uid) guard matters: signed-out, both sides are undefined and
  // `snapshot?.uid === uid` would be true with a null snapshot.
  const ready = Boolean(uid) && snapshot?.uid === uid;

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
        archived: false, // required: the main subscription filters archived==false
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
    tasks: ready ? (snapshot as { tasks: UserTask[] }).tasks : [],
    loading: Boolean(uid) && !ready,
    createTask,
    updateTask,
    setStatus,
    toggleDone,
    archiveTask,
    restoreTask,
  };
}

/**
 * Archived tasks, subscribed only while `enabled` (the Archived view is open).
 * Keeps the ever-growing archive out of the always-on main listener.
 */
export function useArchivedUserTasks(enabled: boolean) {
  // Same derived-loading pattern as useUserTasks: snapshot keyed by uid,
  // setState only from subscription callbacks. The kept snapshot makes
  // re-opening the Archived view paint instantly, then refresh live.
  const [snapshot, setSnapshot] = useState<{ uid: string; tasks: UserTask[] } | null>(null);
  const { user } = useAuth();
  const uid = user?.uid;

  useEffect(() => {
    if (!uid || !enabled) return;
    const unsub = subscribeArchivedUserTasks(
      uid,
      (tasks) => setSnapshot({ uid, tasks }),
      () => setSnapshot({ uid, tasks: [] }),
    );
    return () => unsub();
  }, [uid, enabled]);

  const ready = Boolean(uid) && snapshot?.uid === uid;
  return {
    archivedTasks: enabled && ready ? (snapshot as { tasks: UserTask[] }).tasks : [],
    loading: enabled && Boolean(uid) && !ready,
  };
}
