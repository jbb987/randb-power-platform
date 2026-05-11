import { useEffect, useMemo, useRef, useState } from 'react';
import { useContacts } from '../../hooks/useContacts';
import { useCompanies } from '../../hooks/useCompanies';

interface Props {
  value: string | null | undefined;
  onChange: (contactId: string | null) => void;
  placeholder?: string;
  className?: string;
}

function fullName(firstName: string, lastName: string): string {
  return `${firstName} ${lastName}`.trim();
}

/**
 * Searchable contact picker. Reads all CRM contacts via useContacts and renders
 * them in a filterable popover (search by name, title, company, email). Emits
 * the selected contactId (or null when cleared).
 */
export default function ContactPicker({
  value,
  onChange,
  placeholder = 'Select a contact…',
  className,
}: Props) {
  const { contacts, loading } = useContacts();
  const { companies } = useCompanies();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const companyById = useMemo(() => new Map(companies.map((c) => [c.id, c])), [companies]);

  const selected = useMemo(
    () => (value ? (contacts.find((c) => c.id === value) ?? null) : null),
    [contacts, value],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return contacts;
    return contacts.filter((c) => {
      const company = companyById.get(c.companyId);
      const hay = [
        fullName(c.firstName, c.lastName),
        c.title ?? '',
        c.email ?? '',
        company?.name ?? '',
      ]
        .join(' ')
        .toLowerCase();
      return hay.includes(q);
    });
  }, [contacts, companyById, query]);

  useEffect(() => {
    if (!open) return;
    function handleOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function handleEscape(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', handleOutside);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [open]);

  useEffect(() => {
    if (open && searchInputRef.current) {
      searchInputRef.current.focus();
    }
  }, [open]);

  function handleSelect(id: string) {
    onChange(id);
    setQuery('');
    setOpen(false);
  }

  function handleClear(e: React.MouseEvent) {
    e.stopPropagation();
    onChange(null);
  }

  const triggerClass =
    'w-full rounded-lg border border-[#D8D5D0] bg-white/80 px-3 py-2.5 text-sm text-left transition focus:border-[#ED202B] focus:ring-2 focus:ring-[#ED202B]/20 focus:outline-none flex items-center justify-between gap-2 hover:border-[#ED202B]/50';

  return (
    <div ref={containerRef} className={`relative ${className ?? ''}`}>
      <button type="button" onClick={() => setOpen((o) => !o)} className={triggerClass}>
        <span className={`truncate ${selected ? 'text-[#201F1E]' : 'text-[#7A756E]'}`}>
          {selected ? fullName(selected.firstName, selected.lastName) : placeholder}
        </span>
        <span className="flex items-center gap-1 shrink-0">
          {selected && (
            <span
              onClick={handleClear}
              role="button"
              aria-label="Clear"
              className="text-[#7A756E] hover:text-[#ED202B] p-0.5 rounded"
            >
              <svg
                className="h-3.5 w-3.5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2.5}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </span>
          )}
          <svg
            className="h-4 w-4 text-[#7A756E]"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
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
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                />
              </svg>
              <input
                ref={searchInputRef}
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search contacts…"
                className="w-full pl-8 pr-2 py-1.5 text-sm bg-white border border-[#D8D5D0] rounded-md focus:outline-none focus:border-[#ED202B] focus:ring-2 focus:ring-[#ED202B]/20 transition"
              />
            </div>
          </div>
          <div className="max-h-72 overflow-y-auto">
            {loading ? (
              <div className="py-6 text-center text-xs text-[#7A756E]">Loading…</div>
            ) : contacts.length === 0 ? (
              <div className="py-6 text-center text-xs text-[#7A756E]">
                No contacts yet. Add one in the CRM first.
              </div>
            ) : filtered.length === 0 ? (
              <div className="py-6 text-center text-xs text-[#7A756E]">
                No matches for "{query}".
              </div>
            ) : (
              <ul>
                {filtered.map((c) => {
                  const active = c.id === value;
                  const company = companyById.get(c.companyId);
                  const sub = [c.title, company?.name].filter(Boolean).join(' · ');
                  return (
                    <li key={c.id}>
                      <button
                        type="button"
                        onClick={() => handleSelect(c.id)}
                        className={`w-full text-left px-3 py-2 text-sm hover:bg-[#ED202B]/5 transition flex items-center justify-between gap-2 ${
                          active ? 'bg-[#ED202B]/10' : ''
                        }`}
                      >
                        <div className="min-w-0">
                          <div className="font-medium text-[#201F1E] truncate">
                            {fullName(c.firstName, c.lastName)}
                          </div>
                          {sub && (
                            <div className="text-xs text-[#7A756E] mt-0.5 truncate">{sub}</div>
                          )}
                        </div>
                        {active && (
                          <svg
                            className="h-4 w-4 text-[#ED202B] shrink-0"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                            strokeWidth={2.5}
                          >
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
