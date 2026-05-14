import {
  collection,
  doc,
  setDoc,
  updateDoc,
  deleteDoc,
  deleteField,
  onSnapshot,
  query,
  orderBy,
  writeBatch,
  type Unsubscribe,
} from 'firebase/firestore';
import { db } from './firebase';
import { validateJobTask } from './constructionValidators';
import type { JobTask, JobTaskStatus } from '../types';

/** Tasks live as a sub-collection on each job: {collection}/{jobId}/tasks. */
function tasksRef(collectionName: string, jobId: string) {
  return collection(db, collectionName, jobId, 'tasks');
}

export async function createJobTask(
  collectionName: string,
  jobId: string,
  entry: Omit<JobTask, 'id' | 'jobId' | 'createdAt' | 'updatedAt'>,
): Promise<string> {
  const id = doc(tasksRef(collectionName, jobId)).id;
  const now = Date.now();
  const full: JobTask = {
    ...entry,
    id,
    jobId,
    createdAt: now,
    updatedAt: now,
  };
  await setDoc(doc(tasksRef(collectionName, jobId), id), full);
  return id;
}

/** Update a task. Status flips to 'done' stamp completedAt; flips away clear
 *  it. Optional fields explicitly set to undefined in the patch are translated
 *  to `deleteField()` so Firestore actually removes them — a plain `undefined`
 *  is dropped by the SDK and the field stays at its old value. */
export async function updateJobTask(
  collectionName: string,
  jobId: string,
  taskId: string,
  updates: Partial<JobTask>,
): Promise<void> {
  const writePatch: Record<string, unknown> = { updatedAt: Date.now() };

  const clearableKeys: Array<keyof JobTask> = ['assigneeId', 'dueDate', 'notes'];
  for (const [k, v] of Object.entries(updates)) {
    if (clearableKeys.includes(k as keyof JobTask) && (v === undefined || v === '')) {
      writePatch[k] = deleteField();
    } else if (v !== undefined) {
      writePatch[k] = v;
    }
  }

  if (updates.status !== undefined) {
    if (updates.status === 'done') writePatch.completedAt = Date.now();
    else writePatch.completedAt = deleteField();
  }

  await updateDoc(doc(tasksRef(collectionName, jobId), taskId), writePatch);
}

/** Delete a task and any subtasks that point to it. Pass the full task list so
 *  the caller doesn't need to issue a separate query — the section already has
 *  a live subscription. */
export async function deleteJobTask(
  collectionName: string,
  jobId: string,
  taskId: string,
  allTasks: JobTask[] = [],
): Promise<void> {
  const subtaskIds = allTasks.filter((t) => t.parentTaskId === taskId).map((t) => t.id);
  if (subtaskIds.length === 0) {
    await deleteDoc(doc(tasksRef(collectionName, jobId), taskId));
    return;
  }
  const batch = writeBatch(db);
  for (const sid of subtaskIds) batch.delete(doc(tasksRef(collectionName, jobId), sid));
  batch.delete(doc(tasksRef(collectionName, jobId), taskId));
  await batch.commit();
}

/** Subscribe to all tasks for a job, ordered by manual `order` then creation
 *  time as a tiebreaker. New tasks get an `order` set at creation time so they
 *  append to the end of their sibling group. */
export function subscribeJobTasks(
  collectionName: string,
  jobId: string,
  callback: (tasks: JobTask[]) => void,
  onError?: (err: Error) => void,
): Unsubscribe {
  const q = query(
    tasksRef(collectionName, jobId),
    orderBy('order', 'asc'),
    orderBy('createdAt', 'asc'),
  );
  return onSnapshot(
    q,
    (snap) => callback(snap.docs.map((d) => validateJobTask(d.data(), jobId))),
    (err) => {
      console.error('[Firebase] Job tasks subscription error:', err);
      onError?.(err);
    },
  );
}

export const TASK_STATUS_ORDER: Record<JobTaskStatus, number> = {
  'in-progress': 0,
  todo: 1,
  done: 2,
};
