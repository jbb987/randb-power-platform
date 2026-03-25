import { motion, AnimatePresence } from 'framer-motion';
import { useState, useRef, useEffect } from 'react';
import type { SavedSite } from '../types';

interface Props {
  sites: SavedSite[];
  activeId: string;
  onSwitch: (id: string) => void;
  onCreate: (name?: string) => string;
  onDelete: (id: string) => void;
}

export default function SiteSwitcher({ sites, activeId, onSwitch, onCreate, onDelete }: Props) {
  const [open, setOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    function handle(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false);
        setConfirmDelete(null);
      }
    }
    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, [open]);

  return (
    <div className="no-print relative mb-3" ref={dropdownRef}>
      {/* Pill-style tabs for sites */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-hide">
        {sites.map((site) => (
          <button
            key={site.id}
            onClick={() => onSwitch(site.id)}
            className={`
              shrink-0 rounded-full px-4 py-1.5 text-xs font-medium transition-all
              ${site.id === activeId
                ? 'bg-[#201F1E] text-white shadow-sm'
                : 'bg-[white] text-[#7A756E] border border-[#D8D5D0] hover:border-[#7A756E] hover:text-[#7A756E]'
              }
            `}
          >
            {site.inputs.siteName || 'Untitled'}
          </button>
        ))}

        {/* Add site */}
        <button
          onClick={() => setOpen(!open)}
          className="shrink-0 rounded-full w-7 h-7 flex items-center justify-center bg-[white] border border-dashed border-[#7A756E] text-[#7A756E] hover:border-[#7A756E] hover:text-[#7A756E] transition"
          title="Add or manage sites"
          aria-label="Add or manage sites"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
          </svg>
        </button>
      </div>

      {/* Dropdown */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -4, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.98 }}
            transition={{ duration: 0.15 }}
            className="absolute right-0 top-full mt-1 z-30 w-72 bg-white rounded-xl border border-[#D8D5D0] shadow-xl overflow-hidden"
          >
            <div className="p-3">
              <div className="text-[10px] font-semibold uppercase tracking-wider text-[#7A756E] mb-2 px-1">
                Sites ({sites.length})
              </div>

              <div className="space-y-0.5 max-h-48 overflow-y-auto">
                {sites.map((site) => (
                  <div
                    key={site.id}
                    className={`flex items-center justify-between rounded-lg px-2.5 py-2 cursor-pointer transition group ${
                      site.id === activeId ? 'bg-stone-100' : 'hover:bg-stone-50'
                    }`}
                    onClick={() => {
                      onSwitch(site.id);
                      setOpen(false);
                      setConfirmDelete(null);
                    }}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <div className={`w-2 h-2 rounded-full shrink-0 ${
                        site.id === activeId ? 'bg-[#ED202B]' : 'bg-stone-300'
                      }`} />
                      <div className="min-w-0">
                        <div className="text-sm font-medium text-[#201F1E] truncate">
                          {site.inputs.siteName || 'Untitled'}
                        </div>
                        {site.inputs.totalAcres > 0 && (
                          <div className="text-[10px] text-[#7A756E]">
                            {site.inputs.totalAcres.toLocaleString()} acres · {site.inputs.mw} MW
                          </div>
                        )}
                      </div>
                    </div>

                    {sites.length > 1 && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          if (confirmDelete === site.id) {
                            onDelete(site.id);
                            setConfirmDelete(null);
                          } else {
                            setConfirmDelete(site.id);
                          }
                        }}
                        className={`shrink-0 rounded p-1 transition ${
                          confirmDelete === site.id
                            ? 'bg-red-100 text-red-600'
                            : 'opacity-0 group-hover:opacity-100 hover:bg-stone-200 text-[#7A756E]'
                        }`}
                        title={confirmDelete === site.id ? 'Click again to confirm' : 'Delete site'}
                        aria-label={confirmDelete === site.id ? 'Confirm delete site' : 'Delete site'}
                      >
                        {confirmDelete === site.id ? (
                          <span className="text-[10px] font-medium px-1">Delete?</span>
                        ) : (
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        )}
                      </button>
                    )}
                  </div>
                ))}
              </div>

              <div className="mt-2 pt-2 border-t border-stone-100">
                <button
                  onClick={() => {
                    onCreate();
                    setOpen(false);
                  }}
                  className="w-full flex items-center gap-2 rounded-lg px-2.5 py-2 text-sm font-medium text-[#ED202B] hover:bg-red-50 transition"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                  </svg>
                  New Site
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
