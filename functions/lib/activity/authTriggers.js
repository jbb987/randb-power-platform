"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.onAuthUserCreated = exports.onUserSignedIn = void 0;
const v2_1 = require("firebase-functions/v2");
const identity_1 = require("firebase-functions/v2/identity");
const writeActivity_1 = require("./writeActivity");
/**
 * Logs a `login` activity entry on every successful Firebase Auth sign-in.
 * Token refreshes do NOT fire this — only real sign-ins.
 */
exports.onUserSignedIn = (0, identity_1.beforeUserSignedIn)(async (event) => {
    try {
        const user = event.data;
        if (!user?.uid)
            return;
        const email = user.email ?? 'unknown';
        await (0, writeActivity_1.writeActivity)({
            eventId: event.eventId ?? `signin-${user.uid}-${Date.now()}`,
            actor: { uid: user.uid, email },
            action: 'login',
            resource: {
                type: 'session',
                id: user.uid,
                label: email,
            },
        });
    }
    catch (err) {
        v2_1.logger.error('[activity] onUserSignedIn failed', { err });
    }
    // Returning nothing allows the sign-in to proceed normally.
});
/**
 * Logs a `create` activity entry when a new Firebase Auth user is provisioned.
 * Note: a parallel `users/{uid}` Firestore doc create will also fire onUserWrite —
 * the two entries are complementary (auth account vs. role/profile doc).
 */
exports.onAuthUserCreated = (0, identity_1.beforeUserCreated)(async (event) => {
    try {
        const user = event.data;
        if (!user?.uid)
            return;
        const email = user.email ?? 'unknown';
        await (0, writeActivity_1.writeActivity)({
            eventId: event.eventId ?? `auth-create-${user.uid}-${Date.now()}`,
            actor: { uid: user.uid, email },
            action: 'create',
            resource: {
                type: 'user',
                id: user.uid,
                label: email,
            },
        });
    }
    catch (err) {
        v2_1.logger.error('[activity] onAuthUserCreated failed', { err });
    }
});
//# sourceMappingURL=authTriggers.js.map