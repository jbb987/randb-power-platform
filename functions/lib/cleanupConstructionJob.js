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
exports.cleanupConstructionJob = void 0;
const admin = __importStar(require("firebase-admin"));
const firestore_1 = require("firebase-functions/v2/firestore");
const v2_1 = require("firebase-functions/v2");
/** When a construction job document is deleted, wipe its sub-collections
 *  (tasks, photos, documents) and the Storage prefixes that hold the binary
 *  blobs. Without this, deleting a job leaves orphan data behind forever:
 *  Firestore rules can't reach sub-docs once the parent is gone, and Storage
 *  blobs accumulate cost indefinitely.
 *
 *  Trigger: Firestore document delete on construction-jobs/{jobId}.
 *  Region: us-central1 (default — matches the database location). */
exports.cleanupConstructionJob = (0, firestore_1.onDocumentDeleted)('construction-jobs/{jobId}', async (event) => {
    const { jobId } = event.params;
    v2_1.logger.info(`[cleanup] starting for job ${jobId}`);
    const firestore = admin.firestore();
    const storage = admin.storage().bucket();
    // Sub-collections — recursiveDelete handles arbitrary nesting and uses
    // bulkWriter under the hood, well-suited for large task/photo/doc lists.
    const subCollections = ['tasks', 'photos', 'documents'];
    const subCollectionResults = await Promise.allSettled(subCollections.map((sub) => firestore.recursiveDelete(firestore.collection('construction-jobs').doc(jobId).collection(sub))));
    subCollectionResults.forEach((r, i) => {
        if (r.status === 'rejected') {
            v2_1.logger.error(`[cleanup] failed to delete sub-collection ${subCollections[i]} for ${jobId}`, r.reason);
        }
    });
    // Storage blob prefixes. deleteFiles returns once all matching objects are
    // deleted; there's no batch limit on the client (the SDK paginates).
    const blobPrefixes = [
        `construction-photos/${jobId}/`,
        `construction-documents/${jobId}/`,
    ];
    const blobResults = await Promise.allSettled(blobPrefixes.map((prefix) => storage.deleteFiles({ prefix })));
    blobResults.forEach((r, i) => {
        if (r.status === 'rejected') {
            v2_1.logger.error(`[cleanup] failed to delete Storage prefix ${blobPrefixes[i]} for ${jobId}`, r.reason);
        }
    });
    v2_1.logger.info(`[cleanup] complete for job ${jobId}`);
});
//# sourceMappingURL=cleanupConstructionJob.js.map