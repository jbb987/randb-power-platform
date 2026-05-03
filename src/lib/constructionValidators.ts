import type { JobDocument, JobPhoto, JobTask, JobTaskStatus } from '../types';

/** Hand-rolled lightweight validators for Firestore docs in the Construction
 *  Tracker. We don't pull in zod/yup just for these — a few defensive
 *  default-fills + a console warning when a required field is missing keeps
 *  render from crashing on a malformed doc and surfaces the drift to logs.
 *
 *  All validators take the raw doc payload and return a typed object that
 *  components can render against without nullability drama. They never throw —
 *  failure mode is a warned-and-defaulted record, because dropping a row mid-
 *  list looks worse than rendering it with empty placeholders. */

const ALLOWED_TASK_STATUSES: JobTaskStatus[] = ['todo', 'in-progress', 'done'];

function warn(component: string, docId: string | undefined, problem: string) {
  console.warn(`[validators] ${component} ${docId ?? '<missing id>'}: ${problem}`);
}

function asString(v: unknown, fallback = ''): string {
  return typeof v === 'string' ? v : fallback;
}
function asNumber(v: unknown, fallback = 0): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
}
function asOptionalString(v: unknown): string | undefined {
  return typeof v === 'string' && v.length > 0 ? v : undefined;
}
function asOptionalNumber(v: unknown): number | undefined {
  return typeof v === 'number' && Number.isFinite(v) ? v : undefined;
}

export function validateJobTask(raw: unknown, jobIdHint?: string): JobTask {
  const r = (raw ?? {}) as Record<string, unknown>;
  const id = asString(r.id, '');
  const status = ALLOWED_TASK_STATUSES.includes(r.status as JobTaskStatus)
    ? (r.status as JobTaskStatus)
    : 'todo';
  if (!id) warn('JobTask', undefined, 'missing id');
  if (!r.title) warn('JobTask', id, 'missing title');
  return {
    id,
    jobId: asString(r.jobId, jobIdHint ?? ''),
    title: asString(r.title, '(untitled)'),
    status,
    assigneeId: asOptionalString(r.assigneeId),
    dueDate: asOptionalNumber(r.dueDate),
    completedAt: asOptionalNumber(r.completedAt),
    notes: asOptionalString(r.notes),
    parentTaskId: asOptionalString(r.parentTaskId),
    order: asOptionalNumber(r.order),
    createdAt: asNumber(r.createdAt, Date.now()),
    updatedAt: asNumber(r.updatedAt, Date.now()),
    createdBy: asString(r.createdBy, ''),
  };
}

export function validateJobPhoto(raw: unknown, jobIdHint?: string): JobPhoto {
  const r = (raw ?? {}) as Record<string, unknown>;
  const id = asString(r.id, '');
  if (!id) warn('JobPhoto', undefined, 'missing id');
  if (!r.fullUrl) warn('JobPhoto', id, 'missing fullUrl');
  return {
    id,
    jobId: asString(r.jobId, jobIdHint ?? ''),
    fullPath: asString(r.fullPath, ''),
    thumbPath: asString(r.thumbPath, ''),
    fullUrl: asString(r.fullUrl, ''),
    thumbUrl: asString(r.thumbUrl, asString(r.fullUrl, '')),
    contentType: asString(r.contentType, 'image/jpeg'),
    sizeBytes: asNumber(r.sizeBytes, 0),
    width: asNumber(r.width, 0),
    height: asNumber(r.height, 0),
    caption: asOptionalString(r.caption),
    uploadedBy: asString(r.uploadedBy, ''),
    uploadedByEmail: asOptionalString(r.uploadedByEmail),
    uploadedAt: asNumber(r.uploadedAt, Date.now()),
  };
}

export function validateJobDocument(raw: unknown, jobIdHint?: string): JobDocument {
  const r = (raw ?? {}) as Record<string, unknown>;
  const id = asString(r.id, '');
  if (!id) warn('JobDocument', undefined, 'missing id');
  if (!r.storagePath) warn('JobDocument', id, 'missing storagePath');
  return {
    id,
    jobId: asString(r.jobId, jobIdHint ?? ''),
    category: (r.category as JobDocument['category']) ?? 'other',
    name: asString(r.name, '(unnamed)'),
    contentType: asString(r.contentType, 'application/octet-stream'),
    sizeBytes: asNumber(r.sizeBytes, 0),
    storagePath: asString(r.storagePath, ''),
    uploadedAt: asNumber(r.uploadedAt, Date.now()),
    uploadedBy: asString(r.uploadedBy, ''),
    uploadedByEmail: asOptionalString(r.uploadedByEmail),
  };
}
