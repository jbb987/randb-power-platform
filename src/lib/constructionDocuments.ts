import {
  collection,
  doc,
  setDoc,
  deleteDoc,
  onSnapshot,
  query,
  orderBy,
  type Unsubscribe,
} from 'firebase/firestore';
import {
  ref as storageRef,
  uploadBytes,
  getDownloadURL,
  getBlob,
  deleteObject,
} from 'firebase/storage';
import { db, storage } from './firebase';
import { validateJobDocument } from './constructionValidators';
import { reportFailure } from './observability';
import { ACCEPTED_DOCUMENT_MIME, type JobDocument, type JobDocumentCategory } from '../types';

/** Documents live as a sub-collection: construction-jobs/{jobId}/documents. */
function documentsRef(jobId: string) {
  return collection(db, 'construction-jobs', jobId, 'documents');
}

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

function sanitizeFilename(name: string): string {
  return name
    .replace(/[/\\?%*:|"<>]/g, '-')
    .replace(/\s+/g, '_')
    .slice(0, 120);
}

export interface UploadJobDocumentArgs {
  file: File;
  jobId: string;
  category: JobDocumentCategory;
  uploadedBy: string;
  uploadedByEmail?: string;
}

export async function uploadJobDocument(args: UploadJobDocumentArgs): Promise<JobDocument> {
  const { file, jobId, category, uploadedBy, uploadedByEmail } = args;

  // The picker's `accept` attribute is advisory only; a renamed `.exe` can
  // arrive with a fake MIME. Reject anything outside the allow-list before
  // it touches Storage.
  if (!(ACCEPTED_DOCUMENT_MIME as readonly string[]).includes(file.type)) {
    throw new Error(`Unsupported file type "${file.type || 'unknown'}". Allowed: PDF, JPEG, PNG, WebP.`);
  }

  const id = generateId();
  const safeName = sanitizeFilename(file.name);
  const path = `construction-documents/${jobId}/${id}-${safeName}`;

  const blobRef = storageRef(storage, path);
  await uploadBytes(blobRef, file, { contentType: file.type });

  const document: JobDocument = {
    id,
    jobId,
    category,
    name: file.name,
    contentType: file.type,
    sizeBytes: file.size,
    storagePath: path,
    uploadedAt: Date.now(),
    uploadedBy,
    ...(uploadedByEmail && { uploadedByEmail }),
  };
  await setDoc(doc(documentsRef(jobId), id), document);
  return document;
}

export async function deleteJobDocument(document: JobDocument): Promise<void> {
  try {
    await deleteObject(storageRef(storage, document.storagePath));
  } catch (err) {
    // If the blob is already gone, still wipe the metadata so the list
    // doesn't show a broken row forever.
    console.warn('[Documents] Storage delete warning (continuing):', err);
  }
  await deleteDoc(doc(documentsRef(document.jobId), document.id));
}

export async function getJobDocumentUrl(document: JobDocument): Promise<string> {
  return getDownloadURL(storageRef(storage, document.storagePath));
}

/** Fetch via the Firebase SDK (avoids the CORS issue that fetch(signedUrl)
 *  hits against the Storage bucket). Used by the download button. */
export async function getJobDocumentBlob(document: JobDocument): Promise<Blob> {
  return getBlob(storageRef(storage, document.storagePath));
}

export function subscribeJobDocuments(
  jobId: string,
  callback: (docs: JobDocument[]) => void,
  onError?: (err: Error) => void,
): Unsubscribe {
  const q = query(documentsRef(jobId), orderBy('uploadedAt', 'desc'));
  return onSnapshot(
    q,
    (snap) => callback(snap.docs.map((d) => validateJobDocument(d.data(), jobId))),
    (err) => {
      reportFailure(err, { area: 'documents', action: 'subscribe', extra: { jobId } });
      onError?.(err);
    },
  );
}
