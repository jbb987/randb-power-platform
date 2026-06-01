import { useEffect, useRef, useState, type ReactNode } from 'react';

export interface KebabItem {
  label: string;
  onClick: () => void;
  /** Optional leading icon. */
  icon?: ReactNode;
  /** Render in brand red (used for destructive-ish actions like Archive). */
  danger?: boolean;
}

/** Three-dot "⋮" overflow menu with click-outside dismissal. Shared by the
 *  folder system (FolderBrowser) and the construction document UIs, which
 *  previously each carried a near-identical copy.
 *
 *  Pass the actions as `items`; an empty list renders nothing. `disabled`
 *  greys out the trigger and prevents opening (e.g. while a mutation is
 *  in flight) so callers can't fire concurrent actions. */
export default function KebabMenu({
  items,
  disabled = false,
  title = 'More actions',
}: {
  items: KebabItem[];
  disabled?: boolean;
  title?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  if (items.length === 0) return null;

  return (
    <div ref={ref} className="relative shrink-0">
      <button
        onClick={(e) => {
          e.stopPropagation();
          if (!disabled) setOpen((o) => !o);
        }}
        disabled={disabled}
        className="h-8 w-8 rounded-md border border-[#D8D5D0] flex items-center justify-center text-[#7A756E] hover:text-[#ED202B] hover:border-[#ED202B]/40 hover:bg-stone-50 transition disabled:opacity-40 disabled:cursor-not-allowed"
        aria-label={title}
        title={title}
      >
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 5v.01M12 12v.01M12 19v.01" />
        </svg>
      </button>
      {open && (
        <div className="absolute right-0 top-9 z-10 min-w-[160px] rounded-lg border border-[#D8D5D0] bg-white shadow-md py-1">
          {items.map((item) => (
            <button
              key={item.label}
              onClick={() => {
                setOpen(false);
                item.onClick();
              }}
              className={`flex w-full items-center gap-2 text-left text-sm px-3 py-1.5 hover:bg-stone-50 ${
                item.danger ? 'text-[#ED202B]' : 'text-[#201F1E]'
              }`}
            >
              {item.icon}
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
