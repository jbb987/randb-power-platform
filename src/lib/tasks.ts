import {
  collection,
  doc,
  setDoc,
  updateDoc,
  deleteField,
  onSnapshot,
  query,
  where,
  orderBy,
  type Unsubscribe,
} from 'firebase/firestore';
import { db } from './firebase';
import type {
  TaskItem,
  TaskKind,
  TaskStatus,
  TaskVisibility,
  TaskSourceTool,
  TaskSourceRef,
  MyWorkEntry,
} from '../types';

/** Single writer for `work-items`. Every tool that emits tasks (Construction,
 *  Pre-Con, Leads, Site Analyzer, native Task) goes through this lib — never
 *  writes the collection directly — so the per-user mirror, soft-delete
 *  semantics, and completedAt stamping stay consistent. */

const WORK_ITEMS = 'work-items';

function workItemsRef() {
  return collection(db, WORK_ITEMS);
}

function workItemDoc(id: string) {
  return doc(db, WORK_ITEMS, id);
}

function myWorkRef(uid: string) {
  return collection(db, 'users', uid, 'my-work');
}

export interface CreateTaskInput {
  kind: TaskKind;
  sourceTool: TaskSourceTool;
  sourceRef?: TaskSourceRef;
  title: string;
  notes?: string;
  createdBy: string;
  assigneeIds: string[];
  dueAt?: number;
  startAt?: number;
  /** Defaults to 'planned' when kind === 'task'; ignored otherwise. */
  status?: TaskStatus;
  visibility: TaskVisibility;
}

export async function createTask(input: CreateTaskInput): Promise<string> {
  const id = doc(workItemsRef()).id;
  const now = Date.now();
  const item: TaskItem = {
    id,
    kind: input.kind,
    sourceTool: input.sourceTool,
    title: input.title,
    createdBy: input.createdBy,
    assigneeIds: input.assigneeIds ?? [],
    visibility: input.visibility,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
  };
  if (input.kind === 'task') item.status = input.status ?? 'planned';
  if (input.notes) item.notes = input.notes;
  if (input.sourceRef) item.sourceRef = input.sourceRef;
  if (input.dueAt !== undefined) item.dueAt = input.dueAt;
  if (input.startAt !== undefined) item.startAt = input.startAt;
  await setDoc(workItemDoc(id), item);
  return id;
}

/** Patch a work-item. Optional fields explicitly set to undefined/empty in
 *  the patch are translated to `deleteField()` so Firestore removes them —
 *  a plain undefined would be dropped by the SDK. Status flip to 'done'
 *  stamps completedAt; flip away clears it. */
export async function updateTask(
  taskId: string,
  updates: Partial<Omit<TaskItem, 'id' | 'createdAt' | 'createdBy'>>,
): Promise<void> {
  const writePatch: Record<string, unknown> = { updatedAt: Date.now() };
  const clearable: Array<keyof TaskItem> = ['notes', 'dueAt', 'startAt', 'sourceRef'];
  for (const [k, v] of Object.entries(updates)) {
    if (clearable.includes(k as keyof TaskItem) && (v === undefined || v === '')) {
      writePatch[k] = deleteField();
    } else if (v !== undefined) {
      writePatch[k] = v;
    }
  }
  if (updates.status !== undefined) {
    writePatch.completedAt = updates.status === 'done' ? Date.now() : deleteField();
  }
  await updateDoc(workItemDoc(taskId), writePatch);
}

export async function setStatus(taskId: string, status: TaskStatus): Promise<void> {
  await updateTask(taskId, { status });
}

export async function addAssignee(
  taskId: string,
  uid: string,
  current: string[],
): Promise<void> {
  if (current.includes(uid)) return;
  await updateTask(taskId, { assigneeIds: [...current, uid] });
}

export async function removeAssignee(
  taskId: string,
  uid: string,
  current: string[],
): Promise<void> {
  await updateTask(taskId, { assigneeIds: current.filter((x) => x !== uid) });
}

/** Soft-delete. Sets deletedAt; the per-user index trigger sees the flip and
 *  removes mirrors. Reads filter on `deletedAt == null`. */
export async function softDeleteTask(taskId: string): Promise<void> {
  const now = Date.now();
  await updateDoc(workItemDoc(taskId), { deletedAt: now, updatedAt: now });
}

/** Subscribe to every non-deleted work-item the caller is allowed to read.
 *  Server-side filter is `deletedAt == null` only — visibility rules are
 *  enforced by Firestore security rules at read time, not in this query.
 *  Ordered by updatedAt desc so the most-recently-touched items lead. */
export function subscribeTasks(
  callback: (items: TaskItem[]) => void,
  onError?: (err: Error) => void,
): Unsubscribe {
  const q = query(workItemsRef(), where('deletedAt', '==', null), orderBy('updatedAt', 'desc'));
  return onSnapshot(
    q,
    (snap) => callback(snap.docs.map((d) => d.data() as TaskItem)),
    (err) => {
      console.error('[Firebase] work-items subscription error:', err);
      onError?.(err);
    },
  );
}

/** Subscribe to the signed-in user's slim assignment mirror. One subcollection
 *  query — no fan-out across source tools, no cross-collection joins. */
export function subscribeMyWork(
  uid: string,
  callback: (entries: MyWorkEntry[]) => void,
  onError?: (err: Error) => void,
): Unsubscribe {
  const q = query(myWorkRef(uid), orderBy('updatedAt', 'desc'));
  return onSnapshot(
    q,
    (snap) => callback(snap.docs.map((d) => d.data() as MyWorkEntry)),
    (err) => {
      console.error('[Firebase] my-work subscription error:', err);
      onError?.(err);
    },
  );
}
