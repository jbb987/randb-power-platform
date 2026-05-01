import { useEffect, useRef, useState } from 'react';
import type { JobPhoto } from '../../types';

interface Props {
  photos: JobPhoto[];
  startIndex: number;
  onClose: () => void;
  onPrev: () => void;
  onNext: () => void;
  onSaveCaption?: (photoId: string, caption: string) => Promise<void>;
  onDelete?: (photo: JobPhoto) => void;
  canEditCaption: boolean;
  canDelete: (photo: JobPhoto) => boolean;
}

function formatDate(ts: number): string {
  return new Date(ts).toLocaleString(undefined, {
    year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
  });
}

export default function PhotoLightbox({
  photos, startIndex, onClose, onPrev, onNext, onSaveCaption, onDelete, canEditCaption, canDelete,
}: Props) {
  const photo = photos[startIndex];

  const [editingCaption, setEditingCaption] = useState(false);
  const [draftCaption, setDraftCaption] = useState(photo?.caption ?? '');
  const [savingCaption, setSavingCaption] = useState(false);

  // Reset caption draft when navigating to a different photo.
  useEffect(() => {
    setDraftCaption(photo?.caption ?? '');
    setEditingCaption(false);
  }, [photo?.id, photo?.caption]);

  // Keyboard nav: arrows change photo, Escape closes.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (editingCaption) return;
      if (e.key === 'Escape') onClose();
      else if (e.key === 'ArrowLeft') onPrev();
      else if (e.key === 'ArrowRight') onNext();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose, onPrev, onNext, editingCaption]);

  // Touch swipe (left/right) for mobile navigation.
  const touchStart = useRef<{ x: number; y: number } | null>(null);
  function handleTouchStart(e: React.TouchEvent) {
    const t = e.touches[0];
    touchStart.current = { x: t.clientX, y: t.clientY };
  }
  function handleTouchEnd(e: React.TouchEvent) {
    if (!touchStart.current) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - touchStart.current.x;
    const dy = t.clientY - touchStart.current.y;
    touchStart.current = null;
    // Only trigger on a clearly horizontal swipe.
    if (Math.abs(dx) < 50 || Math.abs(dx) < Math.abs(dy)) return;
    if (dx > 0) onPrev();
    else onNext();
  }

  if (!photo) return null;

  async function handleSaveCaption() {
    if (!onSaveCaption || !photo) return;
    setSavingCaption(true);
    try {
      await onSaveCaption(photo.id, draftCaption);
      setEditingCaption(false);
    } finally {
      setSavingCaption(false);
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Photo ${startIndex + 1} of ${photos.length}`}
      className="fixed inset-0 z-50 bg-black/90 flex flex-col"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      {/* Top bar */}
      <div className="flex items-center justify-between px-4 py-2 text-white text-xs sm:text-sm">
        <div className="opacity-80">
          {startIndex + 1} / {photos.length}
        </div>
        <div className="flex items-center gap-3">
          {onDelete && canDelete(photo) && (
            <button
              type="button"
              onClick={() => onDelete(photo)}
              className="opacity-80 hover:opacity-100 hover:text-[#ED202B] transition"
            >
              Delete
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            className="opacity-80 hover:opacity-100 transition"
            aria-label="Close"
          >
            <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>

      {/* Image area */}
      <div
        className="relative flex-1 flex items-center justify-center px-2 select-none"
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        {photos.length > 1 && (
          <button
            type="button"
            onClick={onPrev}
            className="absolute left-2 sm:left-3 top-1/2 -translate-y-1/2 h-9 w-9 sm:h-10 sm:w-10 flex items-center justify-center rounded-full bg-white/10 hover:bg-white/20 text-white transition"
            aria-label="Previous"
          >
            <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
          </button>
        )}
        <img
          src={photo.fullUrl}
          alt={photo.caption ?? 'Job photo'}
          className="max-h-full max-w-full object-contain"
          draggable={false}
        />
        {photos.length > 1 && (
          <button
            type="button"
            onClick={onNext}
            className="absolute right-2 sm:right-3 top-1/2 -translate-y-1/2 h-9 w-9 sm:h-10 sm:w-10 flex items-center justify-center rounded-full bg-white/10 hover:bg-white/20 text-white transition"
            aria-label="Next"
          >
            <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
            </svg>
          </button>
        )}
      </div>

      {/* Bottom caption / meta */}
      <div className="px-4 py-3 text-white text-xs sm:text-sm bg-black/40">
        {editingCaption ? (
          <div className="flex flex-wrap items-end gap-2">
            <textarea
              autoFocus
              value={draftCaption}
              onChange={(e) => setDraftCaption(e.target.value)}
              className="flex-1 min-w-[200px] rounded-lg bg-white/10 border border-white/20 px-2 py-1 text-sm focus:outline-none focus:border-white"
              placeholder="Add a caption…"
              rows={2}
            />
            <button
              type="button"
              onClick={handleSaveCaption}
              disabled={savingCaption}
              className="px-3 py-1 rounded-lg bg-[#ED202B] hover:bg-[#9B0E18] text-sm font-semibold disabled:opacity-50"
            >
              {savingCaption ? 'Saving…' : 'Save'}
            </button>
            <button
              type="button"
              onClick={() => {
                setEditingCaption(false);
                setDraftCaption(photo.caption ?? '');
              }}
              disabled={savingCaption}
              className="px-3 py-1 rounded-lg bg-white/10 hover:bg-white/20 text-sm"
            >
              Cancel
            </button>
          </div>
        ) : (
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <div className="flex-1 min-w-0">
              {photo.caption ? (
                <p className="break-words">{photo.caption}</p>
              ) : (
                <p className="opacity-50 italic">No caption</p>
              )}
              <p className="opacity-60 mt-0.5 text-[11px]">
                {photo.uploadedByEmail ?? 'Unknown'} · {formatDate(photo.uploadedAt)}
              </p>
            </div>
            {canEditCaption && onSaveCaption && (
              <button
                type="button"
                onClick={() => setEditingCaption(true)}
                className="opacity-80 hover:opacity-100 transition"
              >
                {photo.caption ? 'Edit caption' : 'Add caption'}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
