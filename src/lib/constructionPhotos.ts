import {
  collection,
  doc,
  setDoc,
  updateDoc,
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
  deleteObject,
} from 'firebase/storage';
import { db, storage } from './firebase';
import { validateJobPhoto } from './constructionValidators';
import { reportFailure } from './observability';
import type { JobPhoto } from '../types';

/** Photos live as a sub-collection: construction-jobs/{jobId}/photos. */
function photosRef(jobId: string) {
  return collection(db, 'construction-jobs', jobId, 'photos');
}

const FULL_MAX_PX = 2000;
const THUMB_MAX_PX = 400;
const FULL_QUALITY = 0.85;
const THUMB_QUALITY = 0.70;

/** Reject inputs above this size before we ever decode them. A 48MP iPhone Pro
 *  HEIC is ~5–8 MB — well under this. Anything larger is almost certainly a
 *  RAW/uncompressed file that would OOM mobile Safari during decode. */
export const MAX_PHOTO_BYTES = 30 * 1024 * 1024; // 30 MB

/** iPhone default. Browsers can't render HEIC, so we always convert. */
function isHeic(file: File): boolean {
  const t = (file.type || '').toLowerCase();
  if (t === 'image/heic' || t === 'image/heif') return true;
  // Some iOS uploads land with empty MIME — fall back to extension.
  const name = file.name.toLowerCase();
  return name.endsWith('.heic') || name.endsWith('.heif');
}

/** Decode a (possibly HEIC) image file to a Blob the browser can render.
 *  heic2any is dynamically imported so the ~200 KB lib only loads when needed. */
async function decodeToRenderableBlob(file: File): Promise<Blob> {
  if (!isHeic(file)) return file;
  const { default: heic2any } = await import('heic2any');
  const out = await heic2any({ blob: file, toType: 'image/jpeg', quality: 0.92 });
  return Array.isArray(out) ? out[0] : out;
}

/** Render a (pre-decoded) ImageBitmap to a JPEG at the given max long edge.
 *  Caller owns the bitmap lifetime and is responsible for closing it once
 *  every desired size has been rendered — that's how we avoid the
 *  decode-twice / double-memory cost of an iPhone HEIC pipeline. */
async function bitmapToJpeg(
  bitmap: ImageBitmap,
  maxLongEdge: number,
  quality: number,
): Promise<{ blob: Blob; width: number; height: number }> {
  const { width: srcW, height: srcH } = bitmap;
  const longEdge = Math.max(srcW, srcH);
  const scale = longEdge > maxLongEdge ? maxLongEdge / longEdge : 1;
  const w = Math.round(srcW * scale);
  const h = Math.round(srcH * scale);

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Could not get canvas 2d context.');
  ctx.drawImage(bitmap, 0, 0, w, h);

  const out: Blob = await new Promise((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error('Canvas toBlob returned null.'))),
      'image/jpeg',
      quality,
    );
  });
  return { blob: out, width: w, height: h };
}

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

export interface UploadJobPhotoArgs {
  jobId: string;
  file: File;
  uploadedBy: string;
  uploadedByEmail?: string;
}

/** Run the full pipeline: HEIC → JPEG → resize twice → upload both → write
 *  metadata. Throws on the first hard failure; partial uploads are not
 *  cleaned up here (rare, and orphan blobs cost approximately nothing). */
export async function uploadJobPhoto(args: UploadJobPhotoArgs): Promise<JobPhoto> {
  const { jobId, file, uploadedBy, uploadedByEmail } = args;

  if (file.size > MAX_PHOTO_BYTES) {
    throw new Error(
      `Photo is too large (${(file.size / 1024 / 1024).toFixed(1)} MB). Max is ${MAX_PHOTO_BYTES / 1024 / 1024} MB.`,
    );
  }

  const id = generateId();

  // Decode once; render both sizes from the same bitmap. close() is in finally
  // so a thrown render still releases the GPU/RAM-resident decoded image.
  const decoded = await decodeToRenderableBlob(file);
  const bitmap = await createImageBitmap(decoded, { imageOrientation: 'from-image' });
  let full: { blob: Blob; width: number; height: number };
  let thumb: { blob: Blob; width: number; height: number };
  try {
    full = await bitmapToJpeg(bitmap, FULL_MAX_PX, FULL_QUALITY);
    thumb = await bitmapToJpeg(bitmap, THUMB_MAX_PX, THUMB_QUALITY);
  } finally {
    bitmap.close();
  }

  const fullPath = `construction-photos/${jobId}/${id}-full.jpg`;
  const thumbPath = `construction-photos/${jobId}/${id}-thumb.jpg`;

  const fullRef = storageRef(storage, fullPath);
  const thumbRef = storageRef(storage, thumbPath);

  // Upload both blobs first; if either fails, clean up whatever made it
  // through so we don't leave half-orphan files behind.
  try {
    await Promise.all([
      uploadBytes(fullRef, full.blob, { contentType: 'image/jpeg' }),
      uploadBytes(thumbRef, thumb.blob, { contentType: 'image/jpeg' }),
    ]);
  } catch (err) {
    await Promise.allSettled([
      deleteObject(fullRef),
      deleteObject(thumbRef),
    ]);
    reportFailure(err, {
      area: 'photos',
      action: 'upload',
      extra: { jobId, fileName: file.name, fileBytes: file.size },
    });
    throw err;
  }

  const [fullUrl, thumbUrl] = await Promise.all([
    getDownloadURL(fullRef),
    getDownloadURL(thumbRef),
  ]);

  const photo: JobPhoto = {
    id,
    jobId,
    fullPath,
    thumbPath,
    fullUrl,
    thumbUrl,
    contentType: 'image/jpeg',
    sizeBytes: full.blob.size + thumb.blob.size,
    width: full.width,
    height: full.height,
    ...(uploadedByEmail && { uploadedByEmail }),
    uploadedBy,
    uploadedAt: Date.now(),
  };
  await setDoc(doc(photosRef(jobId), id), photo);
  return photo;
}

export async function updateJobPhotoCaption(
  jobId: string,
  photoId: string,
  caption: string,
): Promise<void> {
  await updateDoc(doc(photosRef(jobId), photoId), {
    caption: caption.trim() || null,
  });
}

export async function deleteJobPhoto(photo: JobPhoto): Promise<void> {
  // Delete blobs first, then metadata. If a blob is missing we still wipe the
  // metadata so the gallery doesn't show a broken tile forever.
  await Promise.all([
    deleteObject(storageRef(storage, photo.fullPath)).catch((err) => {
      console.warn('[Photos] full blob delete warning:', err);
    }),
    deleteObject(storageRef(storage, photo.thumbPath)).catch((err) => {
      console.warn('[Photos] thumb blob delete warning:', err);
    }),
  ]);
  await deleteDoc(doc(photosRef(photo.jobId), photo.id));
}

/** Subscribe to photos for a job, newest first. */
export function subscribeJobPhotos(
  jobId: string,
  callback: (photos: JobPhoto[]) => void,
  onError?: (err: Error) => void,
): Unsubscribe {
  const q = query(photosRef(jobId), orderBy('uploadedAt', 'desc'));
  return onSnapshot(
    q,
    (snap) => callback(snap.docs.map((d) => validateJobPhoto(d.data(), jobId))),
    (err) => {
      reportFailure(err, { area: 'photos', action: 'subscribe', extra: { jobId } });
      onError?.(err);
    },
  );
}
