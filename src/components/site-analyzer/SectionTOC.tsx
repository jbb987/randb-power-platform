interface SectionEntry {
  id: string;
  label: string;
  state: 'pending' | 'loading' | 'done' | 'error';
  /** Whether the section is locked. `undefined` for sections that don't participate in the lock model (Overview, Valuation). */
  locked?: boolean;
}

interface Props {
  sections: SectionEntry[];
  activeId: string;
  onSelect: (id: string) => void;
  /** Toggle lock for the given section. Only called for sections whose `locked` is not undefined. */
  onToggleLock?: (id: string) => void;
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

function LockIcon({ locked, active }: { locked: boolean; active: boolean }) {
  // Locked = solid; unlocked = outline with subtle styling. Color flips with
  // active state so the icon stays legible on the red active-tab background.
  const color = active ? 'text-white' : locked ? 'text-amber-600' : 'text-stone-400';
  if (locked) {
    return (
      <svg className={`h-3 w-3 ${color}`} fill="currentColor" viewBox="0 0 20 20" aria-hidden>
        <path
          fillRule="evenodd"
          d="M10 1a4 4 0 00-4 4v3H5a2 2 0 00-2 2v7a2 2 0 002 2h10a2 2 0 002-2v-7a2 2 0 00-2-2h-1V5a4 4 0 00-4-4zm2 7V5a2 2 0 10-4 0v3h4z"
          clipRule="evenodd"
        />
      </svg>
    );
  }
  return (
    <svg
      className={`h-3 w-3 ${color}`}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
      aria-hidden
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M13.5 10.5V6.75a4.5 4.5 0 119 0v3.75M3.75 21.75h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H3.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z"
      />
    </svg>
  );
}

/**
 * Horizontal tab nav for the Site Analyzer detail page. One tab is active at
 * a time; the parent renders only that section's content. The strip sticks
 * to the top of the viewport just under the app navbar.
 *
 * Mobile: horizontal scroll. Desktop: single row.
 *
 * For lockable sections, a small lock toggle sits next to the label. Click
 * the toggle to flip the lock without switching tabs; click the label or
 * status dot to switch tabs.
 */
export default function SectionTOC({ sections, activeId, onSelect, onToggleLock }: Props) {
  return (
    <div className="sticky top-16 z-30 -mx-4 px-4 sm:-mx-6 sm:px-6 bg-[#FAFAF9]/95 backdrop-blur-sm border-b border-[#D8D5D0]">
      <div className="flex gap-1.5 overflow-x-auto py-2.5" style={{ scrollbarWidth: 'thin' }}>
        {sections.map((s) => {
          const active = activeId === s.id;
          const lockable = s.locked !== undefined;
          return (
            <div
              key={s.id}
              className={`shrink-0 inline-flex items-center gap-1.5 rounded-full pl-3 pr-1 py-1.5 text-xs font-medium transition ${
                active
                  ? 'bg-[#ED202B] text-white shadow-sm'
                  : 'bg-white border border-[#D8D5D0] text-[#7A756E] hover:text-[#201F1E] hover:border-[#ED202B]/40'
              }`}
            >
              <button
                type="button"
                onClick={() => onSelect(s.id)}
                className="inline-flex items-center gap-1.5 cursor-pointer"
                aria-pressed={active}
              >
                <StatusDot state={s.state} />
                <span className="whitespace-nowrap">{s.label}</span>
              </button>
              {lockable && onToggleLock && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onToggleLock(s.id);
                  }}
                  title={s.locked ? 'Locked — click to unlock and re-run' : 'Click to lock'}
                  className={`p-1 rounded-full transition ${
                    active ? 'hover:bg-white/15' : 'hover:bg-stone-100'
                  }`}
                  aria-label={s.locked ? 'Unlock section' : 'Lock section'}
                >
                  <LockIcon locked={!!s.locked} active={active} />
                </button>
              )}
              {!lockable && <span className="pr-2" />}
            </div>
          );
        })}
      </div>
    </div>
  );
}
