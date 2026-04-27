interface SectionEntry {
  id: string;
  label: string;
  state: 'pending' | 'loading' | 'done' | 'error';
}

interface Props {
  sections: SectionEntry[];
  activeId: string | null;
}

function StatusDot({ state }: { state: SectionEntry['state'] }) {
  if (state === 'loading') {
    return (
      <span className="h-2 w-2 rounded-full border-[1.5px] border-current border-t-transparent animate-spin" />
    );
  }
  if (state === 'done') return <span className="h-2 w-2 rounded-full bg-green-500" />;
  if (state === 'error') return <span className="h-2 w-2 rounded-full bg-red-500" />;
  return <span className="h-2 w-2 rounded-full bg-stone-300" />;
}

/**
 * Sticky horizontal TOC strip rendering the analysis sections as clickable chips.
 * - Mobile: horizontal scroll (overflow-x-auto)
 * - Desktop: single row
 * Sticks to the top of the viewport just under the app navbar so the user can
 * always see the report outline and jump between sections.
 */
export default function SectionTOC({ sections, activeId }: Props) {
  function jumpTo(id: string) {
    const el = document.getElementById(id);
    if (!el) return;
    const navbarOffset = 80; // approximate sticky-navbar height + breathing room
    const top = el.getBoundingClientRect().top + window.scrollY - navbarOffset;
    window.scrollTo({ top, behavior: 'smooth' });
  }

  return (
    <div className="sticky top-16 z-30 -mx-4 px-4 sm:-mx-6 sm:px-6 bg-[#FAFAF9]/95 backdrop-blur-sm border-b border-[#D8D5D0]">
      <div
        className="flex gap-1.5 overflow-x-auto py-2.5"
        style={{ scrollbarWidth: 'thin' }}
      >
        {sections.map((s) => {
          const active = activeId === s.id;
          return (
            <button
              key={s.id}
              onClick={() => jumpTo(s.id)}
              className={`shrink-0 inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition ${
                active
                  ? 'bg-[#ED202B] text-white shadow-sm'
                  : 'bg-white border border-[#D8D5D0] text-[#7A756E] hover:text-[#201F1E] hover:border-[#ED202B]/40'
              }`}
            >
              <StatusDot state={s.state} />
              <span className="whitespace-nowrap">{s.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
