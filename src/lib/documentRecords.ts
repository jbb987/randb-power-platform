import {
  collection,
  doc,
  setDoc,
  updateDoc,
  getDoc,
  onSnapshot,
  query,
  where,
  orderBy,
  type Unsubscribe,
} from 'firebase/firestore';
import {
  ref as storageRef,
  uploadBytes,
  getDownloadURL,
  getBlob,
} from 'firebase/storage';
import { db, storage } from './firebase';
import { DOCUMENTS_COLLECTION, type DocumentRecord, type Folder } from '../types';

/** Max file size for v1 — raised from the legacy 10 MB to handle CAD/large PDFs.
 *  Anything bigger goes external (per plan §5 edge cases). */
export const MAX_DOCUMENT_BYTES = 100 * 1024 * 1024; // 100 MB

/** Permissive MIME allow-list. The legacy `crm-documents` accepted PDFs +
 *  common images; the new system extends to docs, spreadsheets, CAD-export
 *  PDFs, etc. We still gate by extension/MIME at upload so a renamed `.exe`
 *  can't sneak in. */
export const ACCEPTED_DOCUMENT_MIME = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'text/plain',
  'text/csv',
  'application/vnd.google-earth.kmz',
  'application/vnd.google-earth.kml+xml',
];

/** Extensions accepted even when the browser reports a generic or empty MIME.
 *  KMZ is a zip container, so Chrome/Safari frequently report '', 'application/zip',
 *  or 'application/octet-stream' for it — gate on extension as a fallback so geo
 *  files (KMZ/KML, e.g. Oncor site submittals) upload reliably. */
export const ACCEPTED_DOCUMENT_EXTENSIONS = ['.kmz', '.kml'];

/** True if the file passes the MIME allow-list OR the extension fallback. */
export function isAcceptedDocument(file: File): boolean {
  if (ACCEPTED_DOCUMENT_MIME.includes(file.type)) return true;
  const lower = file.name.toLowerCase();
  return ACCEPTED_DOCUMENT_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

/** Best-effort content type. Browsers often hand us an empty `file.type` for
 *  KMZ/KML; derive a sensible one from the extension so the stored blob opens
 *  in Google Earth on download instead of as an unknown binary. */
function resolveContentType(file: File): string {
  if (file.type) return file.type;
  const lower = file.name.toLowerCase();
  if (lower.endsWith('.kmz')) return 'application/vnd.google-earth.kmz';
  if (lower.endsWith('.kml')) return 'application/vnd.google-earth.kml+xml';
  return 'application/octet-stream';
}

function documentsRef() {
  return collection(db, DOCUMENTS_COLLECTION);
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

export interface UploadDocumentInput {
  file: File;
  companyId: string;
  projectId?: string;
  folder: Folder | null; // null = file goes at the customer root (no folder)
  uploadedBy: string;
  legacyCategory?: DocumentRecord['legacyCategory'];
}

/** Upload a file + write the metadata document. Storage path is
 *  `documents/{companyId}/{documentId}-{sanitized}`, deliberately keyed by the
 *  customer so a doc move between folders never requires touching storage. */
export async function uploadDocument(input: UploadDocumentInput): Promise<DocumentRecord> {
  const { file, companyId, projectId, folder, uploadedBy, legacyCategory } = input;

  if (file.size > MAX_DOCUMENT_BYTES) {
    throw new Error(
      `File is too large (${(file.size / 1024 / 1024).toFixed(1)} MB). ` +
        `Max is ${MAX_DOCUMENT_BYTES / 1024 / 1024} MB.`,
    );
  }
  if (!isAcceptedDocument(file)) {
    throw new Error(
      `Unsupported file type "${file.type || 'unknown'}". See the upload helper for the allowed list.`,
    );
  }

  const id = generateId();
  const safeName = sanitizeFilename(file.name);
  const path = `documents/${companyId}/${id}-${safeName}`;
  const contentType = resolveContentType(file);

  const blobRef = storageRef(storage, path);
  await uploadBytes(blobRef, file, { contentType });

  const now = Date.now();
  const record: DocumentRecord = {
    id,
    companyId,
    ...(projectId ? { projectId } : {}),
    folderId: folder?.id ?? null,
    ancestorFolderIds: folder ? [...folder.ancestorFolderIds, folder.id] : [],
    name: file.name,
    mimeType: contentType,
    byteSize: file.size,
    storagePath: path,
    uploadedAt: now,
    uploadedBy,
    updatedAt: now,
    updatedBy: uploadedBy,
    ...(legacyCategory ? { legacyCategory } : {}),
  };
  await setDoc(doc(db, DOCUMENTS_COLLECTION, id), record);
  return record;
}

/** Rename or otherwise patch a document. Storage path is immutable —
 *  `storagePath` is not modifiable here even if passed in. */
export async function updateDocumentRecord(
  id: string,
  updates: Partial<DocumentRecord>,
  updatedBy: string,
): Promise<void> {
  const { storagePath: _frozenPath, ...safe } = updates;
  await updateDoc(doc(db, DOCUMENTS_COLLECTION, id), {
    ...safe,
    updatedAt: Date.now(),
    updatedBy,
  });
}

/** Archive a document. Storage blob is never deleted — only the metadata
 *  flips. (Plan §4 no-deletion guarantee.) */
export async function archiveDocument(
  id: string,
  archivedBy: string,
  reason?: string,
): Promise<void> {
  await updateDoc(doc(db, DOCUMENTS_COLLECTION, id), {
    archivedAt: Date.now(),
    archivedBy,
    ...(reason ? { archivedReason: reason } : {}),
    updatedAt: Date.now(),
    updatedBy: archivedBy,
  });
}

export async function restoreDocument(id: string, restoredBy: string): Promise<void> {
  await updateDoc(doc(db, DOCUMENTS_COLLECTION, id), {
    archivedAt: null,
    archivedBy: null,
    archivedReason: null,
    updatedAt: Date.now(),
    updatedBy: restoredBy,
  });
}

export async function getDocumentRecord(id: string): Promise<DocumentRecord | null> {
  const snap = await getDoc(doc(db, DOCUMENTS_COLLECTION, id));
  return snap.exists() ? (snap.data() as DocumentRecord) : null;
}

/** Subscribe to every document under a customer. UI filters by folderId /
 *  projectId in memory. */
export function subscribeDocumentsByCompany(
  companyId: string,
  callback: (docs: DocumentRecord[]) => void,
  options: { includeArchived?: boolean } = {},
  onError?: (err: Error) => void,
): Unsubscribe {
  const q = query(
    documentsRef(),
    where('companyId', '==', companyId),
    orderBy('uploadedAt', 'desc'),
  );
  return onSnapshot(
    q,
    (snap) => {
      const list = snap.docs.map((d) => d.data() as DocumentRecord);
      const filtered = options.includeArchived ? list : list.filter((d) => !d.archivedAt);
      callback(filtered);
    },
    (err) => {
      console.error('[documents] subscribe error:', err);
      onError?.(err);
    },
  );
}

export async function getDocumentUrl(record: DocumentRecord): Promise<string> {
  return getDownloadURL(storageRef(storage, record.storagePath));
}

export async function getDocumentBlob(record: DocumentRecord): Promise<Blob> {
  return getBlob(storageRef(storage, record.storagePath));
}
