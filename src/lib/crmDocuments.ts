import {
  collection,
  doc,
  setDoc,
  deleteDoc,
  onSnapshot,
  query,
  where,
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
import type { CrmDocument, DocumentCategory } from '../types';

const DOCUMENTS_COLLECTION = 'crm-documents';

function documentsRef() {
  return collection(db, DOCUMENTS_COLLECTION);
}

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

/** Strip characters that cause trouble in Firebase Storage paths. */
function sanitizeFilename(name: string): string {
  return name
    .replace(/[/\\?%*:|"<>]/g, '-')  // filesystem-illegal chars
    .replace(/\s+/g, '_')             // collapse whitespace
    .slice(0, 120);                   // keep it bounded
}

export interface UploadArgs {
  file: File;
  companyId: string;
  category: DocumentCategory;
  uploadedBy: string;
  uploadedByName: string;
}

/** Upload a blob to Firebase Storage and write its metadata document. */
export async function uploadDocument(args: UploadArgs): Promise<CrmDocument> {
  const { file, companyId, category, uploadedBy, uploadedByName } = args;
  const id = generateId();
  const safeName = sanitizeFilename(file.name);
  const path = `crm-documents/${companyId}/${id}-${safeName}`;

  try {
    const blobRef = storageRef(storage, path);
    await uploadBytes(blobRef, file, { contentType: file.type });

    const document: CrmDocument = {
      id,
      companyId,
      category,
      name: file.name,
      contentType: file.type,
      sizeBytes: file.size,
      storagePath: path,
      uploadedAt: Date.now(),
      uploadedBy,
      uploadedByName,
    };
    await setDoc(doc(db, DOCUMENTS_COLLECTION, id), document);
    return document;
  } catch (err) {
    console.error('[Firebase] Failed to upload document:', err);
    throw err;
  }
}

/** Delete both the Storage blob and the Firestore metadata. */
export async function deleteDocument(document: CrmDocument): Promise<void> {
  try {
    await deleteObject(storageRef(storage, document.storagePath));
  } catch (err) {
    // If the blob is already gone, still proceed to clean up the metadata doc.
    console.warn('[Firebase] Storage delete warning (continuing):', err);
  }
  try {
    await deleteDoc(doc(db, DOCUMENTS_COLLECTION, document.id));
  } catch (err) {
    console.error('[Firebase] Failed to delete document metadata:', err);
    throw err;
  }
}

/** Get a short-lived download URL for viewing or opening the file. */
export async function getDocumentUrl(document: CrmDocument): Promise<string> {
  return getDownloadURL(storageRef(storage, document.storagePath));
}

/**
 * Fetch the file as a Blob via the Firebase SDK. This avoids the CORS
 * issue that `fetch(signedUrl)` hits against the Storage bucket — the SDK
 * uses its own authenticated transport.
 */
export async function getDocumentBlob(document: CrmDocument): Promise<Blob> {
  return getBlob(storageRef(storage, document.storagePath));
}

export function subscribeDocumentsByCompany(
  companyId: string,
  callback: (docs: CrmDocument[]) => void,
  onError?: (err: Error) => void,
): Unsubscribe {
  const q = query(documentsRef(), where('companyId', '==', companyId));
  return onSnapshot(
    q,
    (snapshot) => {
      const docs = snapshot.docs.map((d) => d.data() as CrmDocument);
      docs.sort((a, b) => b.uploadedAt - a.uploadedAt);
      callback(docs);
    },
    (err) => {
      console.error('[Firebase] Documents-by-company subscription error:', err);
      onError?.(err);
    },
  );
}
