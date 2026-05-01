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

/** Tasks live as a sub-collection on each job: construction-jobs/{jobId}/tasks. */
function tasksRef(jobId: string) {
  return collection(db, 'construction-jobs', jobId, 'tasks');
}

export async function createJobTask(
  jobId: string,
  entry: Omit<JobTask, 'id' | 'jobId' | 'createdAt' | 'updatedAt'>,
): Promise<string> {
  const id = doc(tasksRef(jobId)).id;
  const now = Date.now();
  const full: JobTask = {
    ...entry,
    id,
    jobId,
    createdAt: now,
    updatedAt: now,
  };
  await setDoc(doc(tasksRef(jobId), id), full);
  return id;
}

/** Update a task. Status flips to 'done' stamp completedAt; flips away clear
 *  it. Optional fields explicitly set to undefined in the patch are translated
 *  to `deleteField()` so Firestore actually removes them — a plain `undefined`
 *  is dropped by the SDK and the field stays at its old value. */
export async function updateJobTask(
  jobId: string,
  taskId: string,
  updates: Partial<JobTask>,
): Promise<void> {
  const writePatch: Record<string, unknown> = { updatedAt: Date.now() };

  // Optional fields a user can explicitly clear in the edit modal. If the key
  // is present in `updates` and the value is undefined/empty, we send a
  // delete sentinel; otherwise we pass the value through.
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

  await updateDoc(doc(tasksRef(jobId), taskId), writePatch);
}

/** Delete a task and any subtasks that point to it. Pass the full task list so
 *  the caller doesn't need to issue a separate query — the section already has
 *  a live subscription. */
export async function deleteJobTask(
  jobId: string,
  taskId: string,
  allTasks: JobTask[] = [],
): Promise<void> {
  const subtaskIds = allTasks
    .filter((t) => t.parentTaskId === taskId)
    .map((t) => t.id);
  if (subtaskIds.length === 0) {
    await deleteDoc(doc(tasksRef(jobId), taskId));
    return;
  }
  const batch = writeBatch(db);
  for (const sid of subtaskIds) batch.delete(doc(tasksRef(jobId), sid));
  batch.delete(doc(tasksRef(jobId), taskId));
  await batch.commit();
}

/** Apply a list of (taskId, order) updates in a single batch. Used after
 *  drag-and-drop to persist new positions for all affected siblings. */
export async function reorderJobTasks(
  jobId: string,
  updates: Array<{ id: string; order: number }>,
): Promise<void> {
  if (updates.length === 0) return;
  const now = Date.now();
  const batch = writeBatch(db);
  for (const u of updates) {
    batch.update(doc(tasksRef(jobId), u.id), { order: u.order, updatedAt: now });
  }
  await batch.commit();
}

/** Subscribe to all tasks for a job, ordered by manual `order` then creation
 *  time as a tiebreaker. Requires a composite index on (order asc, createdAt
 *  asc) — Firestore will surface a console URL the first time the query runs
 *  if the index is missing. Pre-DnD tasks default to order 0 and remain
 *  ordered by createdAt within that group. */
export function subscribeJobTasks(
  jobId: string,
  callback: (tasks: JobTask[]) => void,
  onError?: (err: Error) => void,
): Unsubscribe {
  const q = query(tasksRef(jobId), orderBy('order', 'asc'), orderBy('createdAt', 'asc'));
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
  'todo': 1,
  'done': 2,
};
