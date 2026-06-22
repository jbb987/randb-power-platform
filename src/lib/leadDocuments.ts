import {
  ref as storageRef,
  uploadBytes,
  getDownloadURL,
  getBlob,
  deleteObject,
} from 'firebase/storage';
import { storage } from './firebase';
import { addLeadArrayItem, removeLeadArrayItem } from './leads';
import { ACCEPTED_DOCUMENT_MIME } from './documentRecords';
import type { Lead, LeadDocument, LeadDocumentCategory } from '../types';

const STORAGE_PREFIX = 'leads';

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

// Mirror of the folder-system helper: collapse anything risky in a filename to a
// dash so the Storage path stays well-formed (the user-visible name is kept
// verbatim on the doc record).
function sanitizeFilename(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, '-').replace(/-+/g, '-').slice(0, 120) || 'file';
}

/**
 * Upload one document for a lead into a named slot (bill / contract / other).
 * Uploads the blob to `leads/{leadId}/…`, then appends a `LeadDocument` to the
 * lead's inline `documents[]` array. Returns the new document record.
 */
export async function uploadLeadDocument(
  lead: Lead,
  category: LeadDocumentCategory,
  file: File,
  uploadedBy: string,
  uploadedByName: string,
): Promise<LeadDocument> {
  // The picker's `accept` attribute is advisory only; a renamed file can arrive
  // with a fake MIME. Reject anything outside the allow-list before it touches
  // Storage. (Empty type is allowed — some browsers omit it for valid files.)
  if (file.type && !(ACCEPTED_DOCUMENT_MIME as readonly string[]).includes(file.type)) {
    throw new Error(
      `Unsupported file type "${file.type}". Allowed: PDF, images, Office docs, CSV, text.`,
    );
  }

  const id = generateId();
  const safeName = sanitizeFilename(file.name);
  const path = `${STORAGE_PREFIX}/${lead.id}/${id}-${safeName}`;

  const blobRef = storageRef(storage, path);
  await uploadBytes(blobRef, file, { contentType: file.type || 'application/octet-stream' });

  const record: LeadDocument = {
    id,
    category,
    name: file.name,
    contentType: file.type || 'application/octet-stream',
    sizeBytes: file.size,
    storagePath: path,
    uploadedAt: Date.now(),
    uploadedBy,
    uploadedByName,
  };

  await addLeadArrayItem(lead.id, 'documents', record);
  return record;
}

/** Remove a lead document. Drops the Firestore record FIRST (atomic
 *  arrayRemove), then best-effort deletes the Storage blob — so a failed blob
 *  delete leaves a harmless orphan rather than a record pointing at a missing
 *  file (which would render a broken, undownloadable row forever). */
export async function removeLeadDocument(lead: Lead, docId: string): Promise<void> {
  const target = (lead.documents ?? []).find((d) => d.id === docId);
  if (!target) return;
  await removeLeadArrayItem(lead.id, 'documents', target);
  try {
    await deleteObject(storageRef(storage, target.storagePath));
  } catch (err) {
    console.warn('[LeadDocuments] Storage delete warning (continuing):', err);
  }
}

export async function getLeadDocumentUrl(document: LeadDocument): Promise<string> {
  return getDownloadURL(storageRef(storage, document.storagePath));
}

/** Fetch via the SDK (avoids the CORS issue that fetch(signedUrl) hits against
 *  the Storage bucket). Used by the download button. */
export async function getLeadDocumentBlob(document: LeadDocument): Promise<Blob> {
  return getBlob(storageRef(storage, document.storagePath));
}
