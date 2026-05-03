import { useEffect, useRef, useState } from 'react';
import { useAuth } from '../../hooks/useAuth';
import { useJobPhotos } from '../../hooks/useJobPhotos';
import type { JobPermissions } from '../../hooks/useJobPermissions';
import type { ConstructionJob, JobPhoto } from '../../types';
import PhotoLightbox from './PhotoLightbox';

interface Props {
  job: ConstructionJob;
  perms: JobPermissions;
}

interface PendingUpload {
  id: string;        // local-only key
  fileName: string;  // shown to the user; not used as a lookup key
  file: File;        // direct reference — avoids name-collision lookup
  status: 'queued' | 'uploading' | 'error';
  error?: string;
  /** Wall-clock at which the file moved into 'uploading'. Drives the
   *  elapsed-time display so a long iPhone HEIC upload doesn't look frozen. */
  startedAt?: number;
}

/** Live tick-counter that re-renders ~once per second while any pending
 *  upload is in 'uploading'. Lets us show "12s" alongside the spinner without
 *  storing per-row state. */
function useTickEverySecond(active: boolean): number {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, [active]);
  return tick;
}

export default function JobPhotosSection({ job, perms }: Props) {
  const { user } = useAuth();
  const { photos, loading, upload, updateCaption, remove } = useJobPhotos(job.id);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState<PendingUpload[]>([]);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  function openFilePicker() {
    fileInputRef.current?.click();
  }

  async function handleFiles(e: React.ChangeEvent<HTMLInputElement>) {
    if (!user) return;
    const files = Array.from(e.target.files ?? []);
    if (files.length === 0) return;

    // Reset the input so the same file can be picked again later.
    e.target.value = '';

    // Seed pending rows so the UI shows progress immediately. Each row holds
    // a direct File reference so we don't need a name lookup later — that
    // matters because iPhones routinely emit IMG_0001.HEIC for distinct shots.
    const queued: PendingUpload[] = files.map((f, i) => ({
      id: `${Date.now()}-${i}-${f.name}`,
      fileName: f.name,
      file: f,
      status: 'queued',
    }));
    setPending((p) => [...p, ...queued]);
    setError(null);

    await runUploads(queued);
  }

  /** Walk a list of pending rows and upload each in turn. Extracted so that
   *  the "Retry" button on an errored row can re-enqueue a single upload
   *  without touching the rest of the list. */
  async function runUploads(rows: PendingUpload[]) {
    if (!user) return;
    // Process serially — multiple createImageBitmap + canvas + HEIC decode
    // operations in parallel can blow up phone memory. Serial is fast enough.
    for (const q of rows) {
      setPending((p) => p.map((x) => (x.id === q.id
        ? { ...x, status: 'uploading', error: undefined, startedAt: Date.now() }
        : x)));
      try {
        await upload({
          file: q.file,
          uploadedBy: user.uid,
          uploadedByEmail: user.email ?? undefined,
        });
        setPending((p) => p.filter((x) => x.id !== q.id));
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Upload failed';
        setPending((p) => p.map((x) => (x.id === q.id ? { ...x, status: 'error', error: msg } : x)));
        setError(`Failed to upload ${q.fileName}: ${msg}`);
      }
    }
  }

  function retryUpload(id: string) {
    const row = pending.find((p) => p.id === id);
    if (!row) return;
    setError(null);
    void runUploads([row]);
  }

  function dismissPending(id: string) {
    setPending((p) => p.filter((x) => x.id !== id));
  }

  async function handleDelete(photo: JobPhoto) {
    if (!perms.canDeletePhoto(photo.uploadedBy)) return;
    if (!window.confirm('Delete this photo?')) return;
    try {
      await remove(photo);
      // If the deleted photo was the one open in the lightbox, step back.
      if (lightboxIndex !== null) {
        const remaining = photos.length - 1;
        if (remaining <= 0) setLightboxIndex(null);
        else setLightboxIndex((i) => Math.min(i ?? 0, remaining - 1));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete photo.');
    }
  }

  async function handleSaveCaption(photoId: string, caption: string) {
    await updateCaption(photoId, caption);
  }

  const lightboxOpen = lightboxIndex !== null && photos[lightboxIndex];

  // The current user can edit a caption if they uploaded the photo or they
  // have admin/PM rights (which canDeletePhoto already encodes).
  function canEditCaption(photo: JobPhoto): boolean {
    return perms.canDeletePhoto(photo.uploadedBy);
  }

  return (
    <section className="bg-white rounded-xl border border-[#D8D5D0] shadow-sm p-4 sm:p-5">
      <div className="flex items-center justify-between gap-3 mb-3">
        <h3 className="font-heading font-semibold text-[#201F1E]">
          Photos
          {photos.length > 0 && (
            <span className="text-[#7A756E] font-normal ml-2">· {photos.length}</span>
          )}
        </h3>
        {perms.canUploadPhotos && (
          <button
            type="button"
            onClick={openFilePicker}
            className="text-sm font-medium text-[#ED202B] border border-[#ED202B] px-3 py-1 rounded-lg hover:bg-[#ED202B]/5 transition"
          >
            + Add photo
          </button>
        )}
        {/* `capture="environment"` opens the back camera on iOS Safari when
         *  used. Without it the picker still offers Photos + Camera options. */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*,image/heic,image/heif"
          multiple
          onChange={handleFiles}
          className="hidden"
        />
      </div>

      {/* Pending uploads strip */}
      <PendingStrip
        pending={pending}
        onRetry={retryUpload}
        onDismiss={dismissPending}
      />

      {loading ? (
        <p className="text-sm text-[#7A756E]">Loading…</p>
      ) : photos.length === 0 ? (
        <p className="text-sm text-[#7A756E]">No photos uploaded.</p>
      ) : (
        <ul className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2">
          {photos.map((p, i) => (
            <li key={p.id} className="relative aspect-square overflow-hidden rounded-lg border border-[#D8D5D0] bg-stone-50 group">
              <button
                type="button"
                onClick={() => setLightboxIndex(i)}
                className="block w-full h-full"
              >
                <img
                  src={p.thumbUrl}
                  alt={p.caption ?? 'Job photo'}
                  loading="lazy"
                  className="w-full h-full object-cover transition group-hover:scale-105"
                />
              </button>
              {p.caption && (
                <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent p-1.5">
                  <p className="text-[11px] text-white truncate">{p.caption}</p>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      {error && (
        <p className="text-sm text-[#ED202B] mt-2" role="alert">
          {error}
        </p>
      )}

      {lightboxOpen && lightboxIndex !== null && (
        <PhotoLightbox
          photos={photos}
          startIndex={lightboxIndex}
          onClose={() => setLightboxIndex(null)}
          onPrev={() => setLightboxIndex((i) => (i === null ? null : (i - 1 + photos.length) % photos.length))}
          onNext={() => setLightboxIndex((i) => (i === null ? null : (i + 1) % photos.length))}
          onSaveCaption={handleSaveCaption}
          onDelete={handleDelete}
          canEditCaption={canEditCaption(photos[lightboxIndex])}
          canDelete={(p) => perms.canDeletePhoto(p.uploadedBy)}
        />
      )}
    </section>
  );
}

/** Visual pending-uploads list. Re-renders once per second while any row is
 *  uploading so the elapsed-time stays current. Errored rows expose Retry
 *  and Dismiss; queued/uploading rows are passive. */
function PendingStrip({
  pending,
  onRetry,
  onDismiss,
}: {
  pending: PendingUpload[];
  onRetry: (id: string) => void;
  onDismiss: (id: string) => void;
}) {
  const hasActive = pending.some((p) => p.status === 'uploading');
  useTickEverySecond(hasActive);
  if (pending.length === 0) return null;
  return (
    <ul className="mb-3 space-y-1">
      {pending.map((p) => {
        const elapsed = p.startedAt ? Math.floor((Date.now() - p.startedAt) / 1000) : 0;
        return (
          <li key={p.id} className="flex items-center gap-2 text-xs text-[#7A756E]">
            <span
              className={`inline-block h-1.5 w-1.5 rounded-full ${
                p.status === 'error' ? 'bg-[#ED202B]' : 'bg-[#ED202B] animate-pulse'
              }`}
            />
            <span className="truncate flex-1">{p.fileName}</span>
            <span>
              {p.status === 'queued' && 'Queued…'}
              {p.status === 'uploading' && `Uploading… ${elapsed}s`}
              {p.status === 'error' && (
                <span className="text-[#ED202B]">Failed: {p.error}</span>
              )}
            </span>
            {p.status === 'error' && (
              <>
                <button
                  type="button"
                  onClick={() => onRetry(p.id)}
                  className="text-[#ED202B] hover:underline shrink-0"
                >
                  Retry
                </button>
                <button
                  type="button"
                  onClick={() => onDismiss(p.id)}
                  className="text-[#7A756E] hover:text-[#201F1E] shrink-0"
                >
                  Dismiss
                </button>
              </>
            )}
          </li>
        );
      })}
    </ul>
  );
}
