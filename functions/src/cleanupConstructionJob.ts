import * as admin from 'firebase-admin';
import { onDocumentDeleted } from 'firebase-functions/v2/firestore';
import { logger } from 'firebase-functions/v2';

/** When a construction job document is deleted, wipe its sub-collections
 *  (tasks, photos, documents) and the Storage prefixes that hold the binary
 *  blobs. Without this, deleting a job leaves orphan data behind forever:
 *  Firestore rules can't reach sub-docs once the parent is gone, and Storage
 *  blobs accumulate cost indefinitely.
 *
 *  Trigger: Firestore document delete on construction-jobs/{jobId}.
 *  Region: us-central1 (default — matches the database location). */
export const cleanupConstructionJob = onDocumentDeleted(
  'construction-jobs/{jobId}',
  async (event) => {
    const { jobId } = event.params;
    logger.info(`[cleanup] starting for job ${jobId}`);

    const firestore = admin.firestore();
    const storage = admin.storage().bucket();

    // Sub-collections — recursiveDelete handles arbitrary nesting and uses
    // bulkWriter under the hood, well-suited for large task/photo/doc lists.
    const subCollections = ['tasks', 'photos', 'documents'];
    const subCollectionResults = await Promise.allSettled(
      subCollections.map((sub) =>
        firestore.recursiveDelete(
          firestore.collection('construction-jobs').doc(jobId).collection(sub),
        ),
      ),
    );
    subCollectionResults.forEach((r, i) => {
      if (r.status === 'rejected') {
        logger.error(`[cleanup] failed to delete sub-collection ${subCollections[i]} for ${jobId}`, r.reason);
      }
    });

    // Storage blob prefixes. deleteFiles returns once all matching objects are
    // deleted; there's no batch limit on the client (the SDK paginates).
    const blobPrefixes = [
      `construction-photos/${jobId}/`,
      `construction-documents/${jobId}/`,
    ];
    const blobResults = await Promise.allSettled(
      blobPrefixes.map((prefix) => storage.deleteFiles({ prefix })),
    );
    blobResults.forEach((r, i) => {
      if (r.status === 'rejected') {
        logger.error(`[cleanup] failed to delete Storage prefix ${blobPrefixes[i]} for ${jobId}`, r.reason);
      }
    });

    logger.info(`[cleanup] complete for job ${jobId}`);
  },
);
