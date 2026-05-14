import * as admin from 'firebase-admin';
import { onDocumentDeleted } from 'firebase-functions/v2/firestore';
import { logger } from 'firebase-functions/v2';

/** Shared cleanup body. When a job doc is deleted, wipe its sub-collections
 *  (tasks, photos, documents) and the matching Storage prefixes. Without this,
 *  deleting a job leaves orphan data behind forever: Firestore rules can't
 *  reach sub-docs once the parent is gone, and Storage blobs accumulate cost
 *  indefinitely. */
async function cleanupJob(
  jobId: string,
  jobsCollection: string,
  photosPrefix: string,
  documentsPrefix: string,
) {
  logger.info(`[cleanup] starting for ${jobsCollection}/${jobId}`);

  const firestore = admin.firestore();
  const storage = admin.storage().bucket();

  const subCollections = ['tasks', 'photos', 'documents'];
  const subCollectionResults = await Promise.allSettled(
    subCollections.map((sub) =>
      firestore.recursiveDelete(firestore.collection(jobsCollection).doc(jobId).collection(sub)),
    ),
  );
  subCollectionResults.forEach((r, i) => {
    if (r.status === 'rejected') {
      logger.error(
        `[cleanup] failed to delete sub-collection ${subCollections[i]} for ${jobsCollection}/${jobId}`,
        r.reason,
      );
    }
  });

  const blobPrefixes = [`${photosPrefix}/${jobId}/`, `${documentsPrefix}/${jobId}/`];
  const blobResults = await Promise.allSettled(
    blobPrefixes.map((prefix) => storage.deleteFiles({ prefix })),
  );
  blobResults.forEach((r, i) => {
    if (r.status === 'rejected') {
      logger.error(
        `[cleanup] failed to delete Storage prefix ${blobPrefixes[i]} for ${jobsCollection}/${jobId}`,
        r.reason,
      );
    }
  });

  logger.info(`[cleanup] complete for ${jobsCollection}/${jobId}`);
}

/** Bailey Project — original collection, kept for the CEO's existing data. */
export const cleanupConstructionJob = onDocumentDeleted(
  'construction-jobs/{jobId}',
  async (event) =>
    cleanupJob(
      event.params.jobId,
      'construction-jobs',
      'construction-photos',
      'construction-documents',
    ),
);

/** Construction Projects — fresh duplicate for the construction team. */
export const cleanupConstructionProjectsJob = onDocumentDeleted(
  'construction-projects-jobs/{jobId}',
  async (event) =>
    cleanupJob(
      event.params.jobId,
      'construction-projects-jobs',
      'construction-projects-photos',
      'construction-projects-documents',
    ),
);
