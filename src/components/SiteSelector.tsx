import { useState, useRef, useEffect } from 'react';

export interface SiteSelectorSite {
  id: string;
  name: string;
  address: string;
  coordinates?: { lat: number; lng: number };
  acreage?: number;
  mwCapacity?: number;
}

export interface SiteSelectorProps {
  sites: SiteSelectorSite[];
  loading?: boolean;
  selectedSiteId?: string | null;
  onSelect: (site: SiteSelectorSite) => void;
  onClear: () => void;
  placeholder?: string;
}

export default function SiteSelector({
  sites,
  loading = false,
  selectedSiteId,
  onSelect,
  onClear,
  placeholder = 'Select a saved site...',
}: SiteSelectorProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const selectedSite = sites.find((s) => s.id === selectedSiteId) ?? null;

  // Close dropdown on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  // Filter sites by search query
  const query = search.toLowerCase().trim();
  const filtered = query
    ? sites.filter(
        (s) =>
          s.name.toLowerCase().includes(query) ||
          s.address.toLowerCase().includes(query),
      )
    : sites;

  // Sort: alphabetical by name
  const sorted = [...filtered].sort((a, b) => a.name.localeCompare(b.name));

  if (sites.length === 0 && !loading) return null;

  return (
    <div className="mb-5">
      <div
        ref={containerRef}
        className="bg-white rounded-xl border border-[#D8D5D0] shadow-sm px-4 py-3 flex items-center gap-3"
      >
        {/* Icon */}
        <div className="h-8 w-8 rounded-lg bg-[#ED202B]/10 flex items-center justify-center shrink-0">
          <svg
            className="h-4 w-4 text-[#ED202B]"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={1.5}
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z"
            />
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z"
            />
          </svg>
        </div>

        {/* Selected chip or dropdown trigger */}
        <div className="flex-1 relative min-w-0">
          {selectedSite ? (
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-lg bg-[#ED202B]/10 px-3 py-1.5 text-sm font-medium text-[#201F1E] max-w-full truncate">
                <span className="truncate">{selectedSite.name}</span>
                {selectedSite.address && (
                  <span className="text-[#7A756E] text-xs truncate hidden sm:inline">
                    — {selectedSite.address}
                  </span>
                )}
              </span>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => {
                setOpen(!open);
                setSearch('');
                setTimeout(() => inputRef.current?.focus(), 0);
              }}
              className="w-full text-left text-sm text-[#7A756E] hover:text-[#201F1E] transition py-0.5"
            >
              {loading ? (
                <span className="flex items-center gap-2">
                  <svg className="h-3.5 w-3.5 animate-spin" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Loading sites...
                </span>
              ) : (
                placeholder
              )}
            </button>
          )}

          {/* Dropdown */}
          {open && !selectedSite && (
            <div className="absolute top-full left-0 right-0 mt-2 bg-white rounded-xl border border-[#D8D5D0] shadow-lg z-50 overflow-hidden max-w-md">
              {/* Search input */}
              <div className="p-2 border-b border-[#D8D5D0]">
                <input
                  ref={inputRef}
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search by name or address..."
                  className="w-full rounded-lg border border-[#D8D5D0] bg-white px-3 py-2 text-sm text-[#201F1E] placeholder:text-[#7A756E]/50 focus:border-[#ED202B] focus:ring-2 focus:ring-[#ED202B]/20 focus:outline-none transition"
                />
              </div>

              {/* Site list */}
              <div className="max-h-56 overflow-y-auto">
                {sorted.length === 0 ? (
                  <div className="px-4 py-6 text-center">
                    <p className="text-sm text-[#7A756E]">
                      {query ? 'No sites match your search.' : 'No saved sites.'}
                    </p>
                  </div>
                ) : (
                  sorted.map((site) => (
                    <button
                      key={site.id}
                      type="button"
                      onClick={() => {
                        onSelect(site);
                        setOpen(false);
                        setSearch('');
                      }}
                      className="w-full text-left px-4 py-2.5 hover:bg-[#F5F4F2] transition flex flex-col gap-0.5"
                    >
                      <span className="text-sm font-medium text-[#201F1E] truncate">
                        {site.name}
                      </span>
                      {site.address && (
                        <span className="text-xs text-[#7A756E] truncate">
                          {site.address}
                        </span>
                      )}
                    </button>
                  ))
                )}
              </div>

              {/* Manual entry option */}
              <div className="border-t border-[#D8D5D0]">
                <button
                  type="button"
                  onClick={() => {
                    setOpen(false);
                    setSearch('');
                  }}
                  className="w-full text-left px-4 py-2.5 text-sm text-[#7A756E] hover:bg-[#F5F4F2] transition flex items-center gap-2"
                >
                  <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                  </svg>
                  Enter site details manually
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Clear button */}
        {selectedSite && (
          <button
            type="button"
            onClick={() => {
              onClear();
              setSearch('');
            }}
            className="shrink-0 rounded-lg border border-[#D8D5D0] bg-white px-3 py-1.5 text-xs font-medium text-[#7A756E] hover:bg-[#F5F4F2] transition"
          >
            Clear
          </button>
        )}
      </div>
    </div>
  );
}
