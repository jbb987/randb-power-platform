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
exports.writeActivity = writeActivity;
const admin = __importStar(require("firebase-admin"));
const v2_1 = require("firebase-functions/v2");
const types_1 = require("./types");
const summary_1 = require("./summary");
const ACTIVITY_COLLECTION = 'activity';
/**
 * Resolves the actor for an event: explicit override > authUid lookup > SYSTEM_ACTOR.
 */
async function resolveActor(args) {
    if (args.actor)
        return args.actor;
    if (!args.authUid)
        return types_1.SYSTEM_ACTOR;
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
    }
    catch (err) {
        v2_1.logger.warn('[activity] actor lookup failed', { authUid: args.authUid, err });
    }
    return { uid: args.authUid, email: 'unknown' };
}
/**
 * Writes a single activity entry. Idempotent on `eventId` (uses it as the doc ID).
 */
async function writeActivity(args) {
    if (args.skip)
        return;
    const actor = await resolveActor(args);
    const summary = (0, summary_1.buildSummary)({
        actorEmail: actor.email,
        action: args.action,
        resource: args.resource,
        changedFields: args.changedFields,
    });
    const doc = {
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
    if (args.before)
        doc.before = args.before;
    if (args.after)
        doc.after = args.after;
    try {
        await admin
            .firestore()
            .collection(ACTIVITY_COLLECTION)
            .doc(args.eventId)
            .set(doc, { merge: false });
    }
    catch (err) {
        // Never let activity logging break the underlying user action.
        v2_1.logger.error('[activity] write failed', { eventId: args.eventId, err });
    }
}
function stripUndefined(obj) {
    const out = {};
    for (const [k, v] of Object.entries(obj)) {
        if (v !== undefined)
            out[k] = v;
    }
    return out;
}
//# sourceMappingURL=writeActivity.js.map