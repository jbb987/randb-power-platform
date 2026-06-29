"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.onUserTaskAssigned = void 0;
const admin = __importStar(require("firebase-admin"));
const v2_1 = require("firebase-functions/v2");
const firestore_1 = require("firebase-functions/v2/firestore");
const params_1 = require("firebase-functions/params");
const email_1 = require("./email");
const RESEND_API_KEY = (0, params_1.defineSecret)('RESEND_API_KEY');
// Absolute base URL of the deployed platform app, used to build the email link.
// Set with: firebase functions:config / .env or `firebase deploy` param prompt.
const APP_BASE_URL = (0, params_1.defineString)('APP_BASE_URL', {
    default: 'https://randb-power-platform.randbpowerinc.us',
});
const NOTIFICATIONS_COLLECTION = 'notifications';
const TODO_PATH = '/todo-list';
/** Effective assignee: explicit assigneeUid, else the owner (creator). */
function effectiveAssignee(data) {
    if (!data)
        return undefined;
    const a = data.assigneeUid;
    if (a)
        return a;
    return data.ownerUid ?? undefined;
}
async function userLabel(uid) {
    try {
        const snap = await admin.firestore().doc(`users/${uid}`).get();
        const d = snap.data();
        const email = d?.email ?? '';
        const displayName = d?.displayName?.trim();
        return { label: displayName || email || 'A teammate', email };
    }
    catch (err) {
        v2_1.logger.warn('[notifications] user lookup failed', { uid, err });
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
exports.onUserTaskAssigned = (0, firestore_1.onDocumentWrittenWithAuthContext)({ document: 'user-tasks/{taskId}', secrets: [RESEND_API_KEY] }, async (event) => {
    try {
        const before = event.data?.before.exists ? event.data.before.data() : undefined;
        const after = event.data?.after.exists ? event.data.after.data() : undefined;
        // Only on create/update — never on delete.
        if (!after)
            return;
        const prevAssignee = before ? effectiveAssignee(before) : undefined;
        const newAssignee = effectiveAssignee(after);
        if (!newAssignee)
            return;
        // No notification unless the responsible person actually changed.
        if (newAssignee === prevAssignee)
            return;
        // The person who performed the write (the assigner).
        const actorUid = event.authId ?? null;
        // Don't notify someone for assigning a task to themselves.
        if (actorUid && newAssignee === actorUid)
            return;
        const taskId = String(event.params.taskId);
        const taskTitle = String(after.title ?? '(untitled task)');
        const recipient = await userLabel(newAssignee);
        const actor = actorUid
            ? await userLabel(actorUid)
            : { label: 'A teammate', email: '' };
        // 1) In-app notification (idempotent on the Functions event id).
        const notification = {
            id: event.id,
            recipientUid: newAssignee,
            type: 'task-assigned',
            title: `${actor.label} assigned you a task`,
            body: taskTitle,
            link: TODO_PATH,
            resource: { type: 'user-task', id: taskId },
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
        await (0, email_1.sendAssignmentEmail)({
            to: recipient.email,
            recipientName: recipient.label,
            actorName: actor.label,
            taskTitle,
            url: `${base}${TODO_PATH}`,
            apiKey: RESEND_API_KEY.value(),
        });
    }
    catch (err) {
        v2_1.logger.error('[notifications] onUserTaskAssigned failed', {
            eventId: event.id,
            err,
        });
    }
});
//# sourceMappingURL=onTaskAssigned.js.map