import type { Timestamp } from 'firebase/firestore';

/**
 * Per-user notification. Unlike the admin-only `activity` audit feed, these are
 * recipient-scoped (every role sees their own) and carry a per-item read flag.
 * Written server-side only (Cloud Functions / Admin SDK); clients may only flip
 * `read`/`readAt` on their own docs. See firestore.rules `notifications`.
 */
export type NotificationType = 'task-assigned';

export interface AppNotification {
  id: string;
  recipientUid: string; // who sees it (query key)
  type: NotificationType;
  title: string; // e.g. "Bailey West assigned you a task"
  body: string; // the task title
  link: string; // in-app route, e.g. "/todo-list"
  resource: { type: 'user-task'; id: string };
  actorUid: string; // who triggered it (the assigner)
  actorLabel: string; // snapshot of the assigner's name/email
  read: boolean;
  createdAt: Timestamp;
  readAt?: Timestamp;
}
