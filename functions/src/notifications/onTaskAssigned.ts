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

/**
 * The explicitly-delegated assignee (the `assigneeUid` field only). We do NOT
 * fall back to ownerUid here: a notification should fire only on an explicit
 * delegation, never because a task happens to have an owner. Falling back to
 * the owner would misfire — e.g. clearing the assignee would read as "assigned
 * to the owner" and email them about a task nobody was put on.
 */
function explicitAssignee(data: Record<string, unknown> | undefined): string | undefined {
  const a = data?.assigneeUid;
  return typeof a === 'string' && a ? a : undefined;
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
 * Notifies the assignee when a To-Do task is explicitly assigned to them by
 * someone else. Fires on every `user-tasks` write but only acts when the
 * explicit `assigneeUid` changes to a new person who is NOT the actor making
 * the change (so self-assignments stay silent). Writes a per-user notification
 * doc and sends an email. Runs independently of the activity-audit trigger, so
 * it also notifies on private tasks (a direct assignee must always be told).
 *
 * Idempotent on the Functions event id: Eventarc delivers at-least-once, so we
 * `create()` the notification doc (which fails if it already exists) and treat
 * ALREADY_EXISTS as a duplicate delivery — skipping both the doc overwrite
 * (which would reset read state + re-bump createdAt) and the duplicate email.
 */
export const onUserTaskAssigned = onDocumentWrittenWithAuthContext(
  { document: 'user-tasks/{taskId}', secrets: [RESEND_API_KEY] },
  async (event) => {
    try {
      const before = event.data?.before.exists ? event.data.before.data() : undefined;
      const after = event.data?.after.exists ? event.data.after.data() : undefined;

      // Only on create/update — never on delete.
      if (!after) return;

      const prevAssignee = explicitAssignee(before);
      const newAssignee = explicitAssignee(after);
      // Notify only on an explicit delegation that actually changed the assignee.
      if (!newAssignee || newAssignee === prevAssignee) return;

      // The person who performed the write (the assigner).
      const actorUid = event.authId ?? null;

      // Don't notify someone for assigning a task to themselves.
      if (actorUid && newAssignee === actorUid) return;

      const taskId = String(event.params.taskId);
      const taskTitle = String(after.title ?? '(untitled task)');

      const recipient = await userLabel(newAssignee);
      const actor = actorUid ? await userLabel(actorUid) : { label: 'A teammate', email: '' };

      // 1) In-app notification — idempotent create keyed on the event id.
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
      try {
        await admin
          .firestore()
          .collection(NOTIFICATIONS_COLLECTION)
          .doc(event.id)
          .create(notification);
      } catch (err) {
        // gRPC ALREADY_EXISTS (code 6) → this event was already processed.
        // Skip the duplicate email too.
        if ((err as { code?: number }).code === 6) {
          logger.info('[notifications] duplicate event, skipping', { eventId: event.id });
          return;
        }
        throw err;
      }

      // 2) Email (best-effort — never block the in-app notification on a mail
      // failure, but surface the failure with enough context to act on).
      const base = APP_BASE_URL.value().replace(/\/$/, '');
      const sent = await sendAssignmentEmail({
        to: recipient.email,
        recipientName: recipient.label,
        actorName: actor.label,
        taskTitle,
        url: `${base}${TODO_PATH}`,
        apiKey: RESEND_API_KEY.value(),
      });
      if (!sent) {
        logger.error('[notifications] assignment email not sent', {
          eventId: event.id,
          to: recipient.email,
          recipientUid: newAssignee,
        });
      }
    } catch (err) {
      logger.error('[notifications] onUserTaskAssigned failed', {
        eventId: event.id,
        err,
      });
    }
  },
);
