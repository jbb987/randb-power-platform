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
exports.processUserDeletion = void 0;
const admin = __importStar(require("firebase-admin"));
const firestore_1 = require("firebase-functions/v2/firestore");
const v2_1 = require("firebase-functions/v2");
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
exports.processUserDeletion = (0, firestore_1.onDocumentCreated)('user-deletion-requests/{requestId}', async (event) => {
    const requestRef = event.data?.ref;
    const data = event.data?.data();
    if (!requestRef || !data)
        return;
    const targetUid = data.targetUid;
    const requestedBy = data.requestedBy;
    if (typeof targetUid !== 'string' || typeof requestedBy !== 'string') {
        v2_1.logger.error('[processUserDeletion] malformed request', { data });
        await requestRef.delete().catch(() => undefined);
        return;
    }
    if (targetUid === requestedBy) {
        v2_1.logger.warn('[processUserDeletion] refusing self-delete', { requestedBy });
        await requestRef.delete().catch(() => undefined);
        return;
    }
    // Defense-in-depth: re-verify the requester is an admin. Rules already
    // gate this, but a misconfigured rule shouldn't escalate to data loss.
    const requesterDoc = await admin.firestore().doc(`users/${requestedBy}`).get();
    if (!requesterDoc.exists || requesterDoc.data()?.role !== 'admin') {
        v2_1.logger.error('[processUserDeletion] requester is not an admin', { requestedBy });
        await requestRef.delete().catch(() => undefined);
        return;
    }
    v2_1.logger.info('[processUserDeletion] processing', { requestedBy, targetUid });
    // Auth side. NotFound means the auth record was already wiped by an
    // earlier broken delete attempt — keep going to clean up the profile doc.
    try {
        await admin.auth().deleteUser(targetUid);
    }
    catch (err) {
        const code = err.code;
        if (code === 'auth/user-not-found') {
            v2_1.logger.warn('[processUserDeletion] auth record already gone', { targetUid });
        }
        else {
            v2_1.logger.error('[processUserDeletion] auth delete failed', { targetUid, err });
            // Don't delete the request doc — leave it for inspection.
            return;
        }
    }
    // Firestore profile.
    try {
        await admin.firestore().doc(`users/${targetUid}`).delete();
    }
    catch (err) {
        v2_1.logger.error('[processUserDeletion] profile delete failed', { targetUid, err });
        return;
    }
    // Clean up the queue doc so the collection doesn't accumulate.
    await requestRef.delete().catch((err) => {
        v2_1.logger.warn('[processUserDeletion] request cleanup failed (non-fatal)', { err });
    });
    v2_1.logger.info('[processUserDeletion] complete', { targetUid });
});
//# sourceMappingURL=deleteUserAccount.js.map