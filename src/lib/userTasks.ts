import {
  collection,
  doc,
  query,
  where,
  setDoc,
  updateDoc,
  deleteDoc,
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

export async function updateUserTaskFields(
  id: string,
  fields: Partial<UserTask>,
): Promise<void> {
  try {
    await updateDoc(doc(db, USER_TASKS_COLLECTION, id), {
      ...fields,
      updatedAt: Date.now(),
    });
  } catch (err) {
    console.error('[Firebase] Failed to update task:', err);
    throw err;
  }
}

/**
 * Set a task's status and keep `completedAt` consistent: stamp it on entering
 * 'done', and remove the field (via deleteField) on leaving it. A plain
 * `undefined` would be ignored because Firestore is initialised with
 * `ignoreUndefinedProperties`, so the field must be explicitly deleted.
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

export async function deleteUserTask(id: string): Promise<void> {
  try {
    await deleteDoc(doc(db, USER_TASKS_COLLECTION, id));
  } catch (err) {
    console.error('[Firebase] Failed to delete task:', err);
    throw err;
  }
}

/**
 * Subscribe to a single user's tasks. Filters by ownerUid only (a single
 * equality filter, so no composite index is required) and sorts client-side.
 */
export function subscribeUserTasks(
  ownerUid: string,
  callback: (tasks: UserTask[]) => void,
  onError?: (err: Error) => void,
): Unsubscribe {
  const q = query(
    collection(db, USER_TASKS_COLLECTION),
    where('ownerUid', '==', ownerUid),
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
