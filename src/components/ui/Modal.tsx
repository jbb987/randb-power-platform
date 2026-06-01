import type { ReactNode } from 'react';

/** Centered modal over a dimmed backdrop. Click-outside closes via `onClose`;
 *  clicks inside the card are stopped. Shared by the folder system and the
 *  construction document UIs (was duplicated in both). */
export default function Modal({
  children,
  onClose,
}: {
  children: ReactNode;
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm rounded-xl bg-white p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
}
