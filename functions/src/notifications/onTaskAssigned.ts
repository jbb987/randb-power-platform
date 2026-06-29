import * as admin from 'firebase-admin';
import { logger } from 'firebase-functions/v2';
import { onDocumentWrittenWithAuthContext } from 'firebase-functions/v2/firestore';
import { defineSecret, defineString } from 'firebase-functions/params';
import { sendAssignmentEmail } from './email';

const RESEND_API_KEY = defineSecret('RESEND_API_KEY');
// Absolute base URL of the deployed platform app, used to build the email link.
// Set with: firebase functions:config / .env or `firebase deploy` param prompt.
const APP_BASE_URL = defineString('APP_BASE_URL', {
  default: 'https://platform.randbpowerinc.us',
});

const NOTIFICATIONS_COLLECTION = 'notifications';
const TODO_PATH = '/todo-list';

/** Effective assignee: explicit assigneeUid, else the owner (creator). */
function effectiveAssignee(data: Record<string, unknown> | undefined): string | undefined {
  if (!data) return undefined;
  const a = data.assigneeUid as string | undefined;
  if (a) return a;
  return (data.ownerUid as string | undefined) ?? undefined;
}

async function userLabel(uid: string): Promise<{ label: string; email: string }> {
  try {
    const snap = await admin.firestore().doc(`users/${uid}`).get();
    const d = snap.data();
    const email = (d?.email as string | undefined) ?? '';
    const displayName = (d?.displayName as string | undefined)?.trim();
    return { label: displayName || email || 'A teammate', email };
  } catch (err) {
    logger.warn('[notifications] user lookup failed', { uid, err });
    return { label: 'A teammate', email: '' };
  }
}

/**
 * Notifies the assignee when a To-Do task is assigned to them by someone else.
 * Fires on every `user-tasks` write but only acts when the effective assignee
 * changed to a new person who is NOT the actor performing the write (so
 * self-assignments stay silent). Writes a per-user notification doc and sends
 * an email. Runs independently of the activity-audit trigger, so it also
 * notifies on private tasks (a direct assignee must always be told).
 */
export const onUserTaskAssigned = onDocumentWrittenWithAuthContext(
  { document: 'user-tasks/{taskId}', secrets: [RESEND_API_KEY] },
  async (event) => {
    try {
      const before = event.data?.before.exists ? event.data.before.data() : undefined;
      const after = event.data?.after.exists ? event.data.after.data() : undefined;

      // Only on create/update — never on delete.
      if (!after) return;

      const prevAssignee = before ? effectiveAssignee(before) : undefined;
      const newAssignee = effectiveAssignee(after);
      if (!newAssignee) return;

      // No notification unless the responsible person actually changed.
      if (newAssignee === prevAssignee) return;

      // The person who performed the write (the assigner).
      const actorUid = event.authId ?? null;

      // Don't notify someone for assigning a task to themselves.
      if (actorUid && newAssignee === actorUid) return;

      const taskId = String(event.params.taskId);
      const taskTitle = String(after.title ?? '(untitled task)');

      const recipient = await userLabel(newAssignee);
      const actor = actorUid ? await userLabel(actorUid) : { label: 'A teammate', email: '' };

      // 1) In-app notification (idempotent on the Functions event id).
      const notification = {
        id: event.id,
        recipientUid: newAssignee,
        type: 'task-assigned' as const,
        title: `${actor.label} assigned you a task`,
        body: taskTitle,
        link: TODO_PATH,
        resource: { type: 'user-task' as const, id: taskId },
        actorUid: actorUid ?? 'system',
        actorLabel: actor.label,
        read: false,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      };
      await admin
        .firestore()
        .collection(NOTIFICATIONS_COLLECTION)
        .doc(event.id)
        .set(notification, { merge: false });

      // 2) Email (best-effort — never block on a mail failure).
      const base = APP_BASE_URL.value().replace(/\/$/, '');
      await sendAssignmentEmail({
        to: recipient.email,
        recipientName: recipient.label,
        actorName: actor.label,
        taskTitle,
        url: `${base}${TODO_PATH}`,
        apiKey: RESEND_API_KEY.value(),
      });
    } catch (err) {
      logger.error('[notifications] onUserTaskAssigned failed', {
        eventId: event.id,
        err,
      });
    }
  },
);
