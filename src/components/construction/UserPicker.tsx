import { useEffect, useMemo, useRef, useState } from 'react';
import type { UserRecord } from '../../hooks/useUsers';

interface Props {
  /** Selected user id, or null/undefined when nothing is picked. */
  value: string | null | undefined;
  onChange: (uid: string | null) => void;
  /** All users available for selection. Caller is responsible for fetching. */
  users: UserRecord[];
  /** UIDs to hide from the dropdown — e.g., already-assigned workers when
   *  picking a PM, or already-on-job users when adding another worker. */
  excludeIds?: string[];
  placeholder?: string;
  className?: string;
  loading?: boolean;
  /** When true, the picker shows no clear (×) button — useful for required
   *  fields like Project Manager where empty isn't valid. */
  required?: boolean;
}

/** Searchable user picker. Mirrors CompanyPicker's API. Searches by displayName
 *  (when present) and email. Use this anywhere the platform currently has a
 *  flat <select> of users — past ~20 users a flat select stops scaling. */
export default function UserPicker({
  value, onChange, users, excludeIds, placeholder = 'Select a user…', className, loading, required,
}: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const excludeSet = useMemo(() => new Set(excludeIds ?? []), [excludeIds]);

  const selected = useMemo(
    () => (value ? users.find((u) => u.id === value) ?? null : null),
    [users, value],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return users.filter((u) => {
      if (excludeSet.has(u.id) && u.id !== value) return false;
      if (!q) return true;
      const name = (u.displayName ?? '').toLowerCase();
      return name.includes(q) || u.email.toLowerCase().includes(q);
    });
  }, [users, query, excludeSet, value]);

  // Close on outside click / Escape.
  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  // Focus the search box on open.
  useEffect(() => {
    if (open) searchInputRef.current?.focus();
  }, [open]);

  function pick(id: string) {
    onChange(id);
    setQuery('');
    setOpen(false);
  }

  function clear(e: React.MouseEvent) {
    e.stopPropagation();
    onChange(null);
  }

  function userLabel(u: UserRecord): string {
    return u.displayName ? u.displayName : u.email;
  }

  function userSubLabel(u: UserRecord): string | null {
    return u.displayName ? u.email : null;
  }

  const triggerClass =
    'w-full rounded-lg border border-[#D8D5D0] bg-white px-3 py-2 text-sm text-left transition focus:border-[#ED202B] focus:ring-2 focus:ring-[#ED202B]/20 focus:outline-none flex items-center justify-between gap-2';

  return (
    <div ref={containerRef} className={`relative ${className ?? ''}`}>
      <button type="button" onClick={() => setOpen((o) => !o)} className={triggerClass}>
        <span className={`truncate ${selected ? 'text-[#201F1E]' : 'text-[#7A756E]'}`}>
          {selected ? userLabel(selected) : placeholder}
        </span>
        <span className="flex items-center gap-1 shrink-0">
          {selected && !required && (
            <span
              onClick={clear}
              role="button"
              aria-label="Clear"
              className="text-[#7A756E] hover:text-[#ED202B] p-0.5 rounded"
            >
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </span>
          )}
          <svg className="h-4 w-4 text-[#7A756E]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </span>
      </button>

      {open && (
        <div className="absolute z-20 left-0 right-0 mt-1 bg-white rounded-lg border border-[#D8D5D0] shadow-lg overflow-hidden">
          <div className="p-2 border-b border-[#D8D5D0]">
            <div className="relative">
              <svg
                className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-[#7A756E] pointer-events-none"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input
                ref={searchInputRef}
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search users…"
                className="w-full pl-8 pr-2 py-1.5 text-sm bg-white border border-[#D8D5D0] rounded-md focus:outline-none focus:border-[#ED202B] focus:ring-2 focus:ring-[#ED202B]/20 transition"
              />
            </div>
          </div>
          <div className="max-h-72 overflow-y-auto">
            {loading ? (
              <div className="py-6 text-center text-xs text-[#7A756E]">Loading…</div>
            ) : filtered.length === 0 ? (
              <div className="py-6 text-center text-xs text-[#7A756E]">
                {query ? `No matches for "${query}".` : 'No users available.'}
              </div>
            ) : (
              <ul>
                {filtered.map((u) => {
                  const active = u.id === value;
                  const sub = userSubLabel(u);
                  return (
                    <li key={u.id}>
                      <button
                        type="button"
                        onClick={() => pick(u.id)}
                        className={`w-full text-left px-3 py-2 text-sm hover:bg-[#ED202B]/5 transition flex items-center justify-between gap-2 ${
                          active ? 'bg-[#ED202B]/10' : ''
                        }`}
                      >
                        <div className="min-w-0">
                          <div className="font-medium text-[#201F1E] truncate">{userLabel(u)}</div>
                          {sub && <div className="text-xs text-[#7A756E] mt-0.5 truncate">{sub}</div>}
                        </div>
                        {active && (
                          <svg className="h-4 w-4 text-[#ED202B] shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                          </svg>
                        )}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
