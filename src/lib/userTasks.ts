import {
  collection,
  doc,
  query,
  where,
  or,
  setDoc,
  updateDoc,
  deleteField,
  onSnapshot,
  type Unsubscribe,
} from 'firebase/firestore';
import { db } from './firebase';
import type { UserTask, TodoStatus } from '../types';

const USER_TASKS_COLLECTION = 'user-tasks';

export async function saveUserTask(task: UserTask): Promise<void> {
  try {
    await setDoc(doc(db, USER_TASKS_COLLECTION, task.id), task);
  } catch (err) {
    console.error('[Firebase] Failed to save task:', err);
    throw err;
  }
}

/**
 * Update task fields. Keys explicitly present with an `undefined` value are
 * converted to deleteField() — Firestore is initialised with
 * `ignoreUndefinedProperties`, so a plain `undefined` would be silently
 * dropped and "clear the due date" would never persist.
 */
export async function updateUserTaskFields(
  id: string,
  fields: Partial<UserTask>,
): Promise<void> {
  const payload: Record<string, unknown> = { updatedAt: Date.now() };
  for (const [key, value] of Object.entries(fields)) {
    payload[key] = value === undefined ? deleteField() : value;
  }
  try {
    await updateDoc(doc(db, USER_TASKS_COLLECTION, id), payload);
  } catch (err) {
    console.error('[Firebase] Failed to update task:', err);
    throw err;
  }
}

/**
 * Set a task's status and keep `completedAt` consistent: stamp it on entering
 * 'done', and remove the field (via deleteField) on leaving it.
 */
export async function setUserTodoStatus(id: string, status: TodoStatus): Promise<void> {
  try {
    await updateDoc(doc(db, USER_TASKS_COLLECTION, id), {
      status,
      completedAt: status === 'done' ? Date.now() : deleteField(),
      updatedAt: Date.now(),
    });
  } catch (err) {
    console.error('[Firebase] Failed to set task status:', err);
    throw err;
  }
}

/** Soft archive — no hard deletes, matching the platform-wide convention. */
export async function archiveUserTask(id: string): Promise<void> {
  try {
    await updateDoc(doc(db, USER_TASKS_COLLECTION, id), {
      archivedAt: Date.now(),
      updatedAt: Date.now(),
    });
  } catch (err) {
    console.error('[Firebase] Failed to archive task:', err);
    throw err;
  }
}

export async function restoreUserTask(id: string): Promise<void> {
  try {
    await updateDoc(doc(db, USER_TASKS_COLLECTION, id), {
      archivedAt: deleteField(),
      updatedAt: Date.now(),
    });
  } catch (err) {
    console.error('[Firebase] Failed to restore task:', err);
    throw err;
  }
}

/**
 * Subscribe to every task the user may see: company-visible tasks, tasks they
 * created, and tasks assigned to them. The or() disjuncts mirror the Firestore
 * read rule exactly (each one provably passes, so the query is allowed).
 * Equality-only disjuncts need no composite index; sorting stays client-side.
 * Legacy docs (no visibility/assigneeUid fields) still match via ownerUid.
 */
export function subscribeUserTasks(
  uid: string,
  callback: (tasks: UserTask[]) => void,
  onError?: (err: Error) => void,
): Unsubscribe {
  const q = query(
    collection(db, USER_TASKS_COLLECTION),
    or(
      where('visibility', '==', 'company'),
      where('ownerUid', '==', uid),
      where('assigneeUid', '==', uid),
    ),
  );
  return onSnapshot(
    q,
    (snapshot) => {
      const tasks = snapshot.docs.map((d) => d.data() as UserTask);
      callback(tasks);
    },
    (err) => {
      console.error('[Firebase] Tasks subscription error:', err);
      onError?.(err);
    },
  );
}
