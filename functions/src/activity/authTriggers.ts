import { logger } from 'firebase-functions/v2';
import { beforeUserSignedIn, beforeUserCreated } from 'firebase-functions/v2/identity';
import { writeActivity } from './writeActivity';

/**
 * Logs a `login` activity entry on every successful Firebase Auth sign-in.
 * Token refreshes do NOT fire this — only real sign-ins.
 */
export const onUserSignedIn = beforeUserSignedIn(async (event) => {
  try {
    const user = event.data;
    if (!user?.uid) return;
    const email = user.email ?? 'unknown';
    await writeActivity({
      eventId: event.eventId ?? `signin-${user.uid}-${Date.now()}`,
      actor: { uid: user.uid, email },
      action: 'login',
      resource: {
        type: 'session',
        id: user.uid,
        label: email,
      },
    });
  } catch (err) {
    logger.error('[activity] onUserSignedIn failed', { err });
  }
  // Returning nothing allows the sign-in to proceed normally.
});

/**
 * Logs a `create` activity entry when a new Firebase Auth user is provisioned.
 * Note: a parallel `users/{uid}` Firestore doc create will also fire onUserWrite —
 * the two entries are complementary (auth account vs. role/profile doc).
 */
export const onAuthUserCreated = beforeUserCreated(async (event) => {
  try {
    const user = event.data;
    if (!user?.uid) return;
    const email = user.email ?? 'unknown';
    await writeActivity({
      eventId: event.eventId ?? `auth-create-${user.uid}-${Date.now()}`,
      actor: { uid: user.uid, email },
      action: 'create',
      resource: {
        type: 'user',
        id: user.uid,
        label: email,
      },
    });
  } catch (err) {
    logger.error('[activity] onAuthUserCreated failed', { err });
  }
});
