import * as admin from 'firebase-admin';
import { onDocumentCreated } from 'firebase-functions/v2/firestore';
import { logger } from 'firebase-functions/v2';

/** Firestore-triggered user-deletion processor.
 *
 *  Why Firestore-triggered instead of HTTPS callable: setting up an HTTPS
 *  callable on a fresh Cloud Run service requires roles/functions.admin on
 *  the deploying account in order to grant the public-invoker IAM policy.
 *  Eventarc / Firestore triggers don't need that — the function is invoked
 *  by the Firebase service account, not by the client.
 *
 *  Flow:
 *    1. Admin clicks "Delete user" in the UI.
 *    2. Client writes a doc to `user-deletion-requests/{auto-id}` with
 *       { targetUid, requestedBy, requestedAt }. Firestore rules verify
 *       that requestedBy is an admin and equals the calling auth uid.
 *    3. This function fires, deletes the auth record + user profile, then
 *       deletes the request doc itself so the queue stays empty. */
export const processUserDeletion = onDocumentCreated(
  'user-deletion-requests/{requestId}',
  async (event) => {
    const requestRef = event.data?.ref;
    const data = event.data?.data();
    if (!requestRef || !data) return;

    const targetUid = data.targetUid;
    const requestedBy = data.requestedBy;

    if (typeof targetUid !== 'string' || typeof requestedBy !== 'string') {
      logger.error('[processUserDeletion] malformed request', { data });
      await requestRef.delete().catch(() => undefined);
      return;
    }

    if (targetUid === requestedBy) {
      logger.warn('[processUserDeletion] refusing self-delete', { requestedBy });
      await requestRef.delete().catch(() => undefined);
      return;
    }

    // Defense-in-depth: re-verify the requester is an admin. Rules already
    // gate this, but a misconfigured rule shouldn't escalate to data loss.
    const requesterDoc = await admin.firestore().doc(`users/${requestedBy}`).get();
    if (!requesterDoc.exists || requesterDoc.data()?.role !== 'admin') {
      logger.error('[processUserDeletion] requester is not an admin', { requestedBy });
      await requestRef.delete().catch(() => undefined);
      return;
    }

    logger.info('[processUserDeletion] processing', { requestedBy, targetUid });

    // Auth side. NotFound means the auth record was already wiped by an
    // earlier broken delete attempt — keep going to clean up the profile doc.
    try {
      await admin.auth().deleteUser(targetUid);
    } catch (err: unknown) {
      const code = (err as { code?: string }).code;
      if (code === 'auth/user-not-found') {
        logger.warn('[processUserDeletion] auth record already gone', { targetUid });
      } else {
        logger.error('[processUserDeletion] auth delete failed', { targetUid, err });
        // Don't delete the request doc — leave it for inspection.
        return;
      }
    }

    // Firestore profile.
    try {
      await admin.firestore().doc(`users/${targetUid}`).delete();
    } catch (err) {
      logger.error('[processUserDeletion] profile delete failed', { targetUid, err });
      return;
    }

    // Clean up the queue doc so the collection doesn't accumulate.
    await requestRef.delete().catch((err) => {
      logger.warn('[processUserDeletion] request cleanup failed (non-fatal)', { err });
    });

    logger.info('[processUserDeletion] complete', { targetUid });
  },
);
