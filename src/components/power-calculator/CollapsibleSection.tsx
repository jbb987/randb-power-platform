import { useState } from 'react';

interface Props {
  title: string;
  count: number;
  defaultOpen?: boolean;
  collapsible?: boolean;
  children: React.ReactNode;
}

export default function CollapsibleSection({ title, count, defaultOpen = true, collapsible = true, children }: Props) {
  const [open, setOpen] = useState(defaultOpen);

  if (!collapsible) {
    return (
      <div>
        <h3 className="flex items-center gap-2 font-heading text-sm font-semibold text-[#201F1E]">
          {title} {count > 0 && <span className="text-[10px] font-normal text-[#7A756E]">({count})</span>}
        </h3>
        <div className="mt-3">{children}</div>
      </div>
    );
  }

  return (
    <div className="mt-6">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 font-heading text-xs font-semibold text-[#201F1E] uppercase tracking-wider hover:text-[#ED202B] transition"
      >
        <svg
          className={`h-3 w-3 transition-transform ${open ? 'rotate-90' : ''}`}
          fill="currentColor"
          viewBox="0 0 20 20"
        >
          <path fillRule="evenodd" d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z" clipRule="evenodd" />
        </svg>
        {title} {count > 0 && <span className="text-[10px] font-normal text-[#7A756E]">({count})</span>}
      </button>
      {open && <div className="mt-3">{children}</div>}
    </div>
  );
}
