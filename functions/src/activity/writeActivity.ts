import * as admin from 'firebase-admin';
import { logger } from 'firebase-functions/v2';
import {
  type ActivityAction,
  type ActivityActor,
  type ActivityResource,
  SYSTEM_ACTOR,
} from './types';
import { buildSummary } from './summary';

const ACTIVITY_COLLECTION = 'activity';

interface WriteActivityArgs {
  /** The Functions v2 event ID — used as the activity doc ID for idempotent retries. */
  eventId: string;
  /** Auth UID from the trigger event, if any. Missing for Admin SDK / system writes. */
  authUid?: string | null;
  /** Optional explicit actor override (e.g. for user-history mirror, where we already know the uid). */
  actor?: ActivityActor;
  action: ActivityAction;
  resource: ActivityResource;
  changedFields?: string[];
  before?: Record<string, unknown>;
  after?: Record<string, unknown>;
  /** Skip writing if true (caller short-circuits noisy events). */
  skip?: boolean;
}

/**
 * Resolves the actor for an event: explicit override > authUid lookup > SYSTEM_ACTOR.
 */
async function resolveActor(args: {
  authUid?: string | null;
  actor?: ActivityActor;
}): Promise<ActivityActor> {
  if (args.actor) return args.actor;
  if (!args.authUid) return SYSTEM_ACTOR;
  try {
    const snap = await admin.firestore().doc(`users/${args.authUid}`).get();
    const data = snap.data();
    if (data?.email) {
      return { uid: args.authUid, email: String(data.email) };
    }
    // Fallback: try Firebase Auth record
    const userRecord = await admin
      .auth()
      .getUser(args.authUid)
      .catch(() => null);
    if (userRecord?.email) {
      return { uid: args.authUid, email: userRecord.email };
    }
  } catch (err) {
    logger.warn('[activity] actor lookup failed', { authUid: args.authUid, err });
  }
  return { uid: args.authUid, email: 'unknown' };
}

/**
 * Writes a single activity entry. Idempotent on `eventId` (uses it as the doc ID).
 */
export async function writeActivity(args: WriteActivityArgs): Promise<void> {
  if (args.skip) return;

  const actor = await resolveActor(args);
  const summary = buildSummary({
    actorEmail: actor.email,
    action: args.action,
    resource: args.resource,
    changedFields: args.changedFields,
  });

  const doc: Record<string, unknown> = {
    id: args.eventId,
    timestamp: admin.firestore.FieldValue.serverTimestamp(),
    actor,
    action: args.action,
    resource: stripUndefined({ ...args.resource }),
    summary,
    eventId: args.eventId,
  };
  if (args.changedFields && args.changedFields.length > 0) {
    doc.changedFields = args.changedFields;
  }
  if (args.before) doc.before = args.before;
  if (args.after) doc.after = args.after;

  try {
    await admin
      .firestore()
      .collection(ACTIVITY_COLLECTION)
      .doc(args.eventId)
      .set(doc, { merge: false });
  } catch (err) {
    // Never let activity logging break the underlying user action.
    logger.error('[activity] write failed', { eventId: args.eventId, err });
  }
}

function stripUndefined(obj: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined) out[k] = v;
  }
  return out;
}
