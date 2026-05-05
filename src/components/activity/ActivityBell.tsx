import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useActivityBell } from '../../hooks/useActivityBell';
import { resourceUrl } from '../../lib/activityRoutes';
import { formatRelativeTime } from '../../utils/format';
import type { ActivityEntry } from '../../types/activity';

const PREVIEW_COUNT = 10;

function entryMillis(entry: ActivityEntry): number {
  return entry.timestamp?.toMillis ? entry.timestamp.toMillis() : 0;
}

export default function ActivityBell() {
  const { enabled, entries, unreadCount, markSeen } = useActivityBell();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  // Close on click outside
  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [open]);

  // Mark as seen on open
  useEffect(() => {
    if (open) void markSeen();
  }, [open, markSeen]);

  if (!enabled) return null;

  const preview = entries.slice(0, PREVIEW_COUNT);

  function handleRowClick(entry: ActivityEntry) {
    setOpen(false);
    const url = resourceUrl(entry.resource);
    if (url) navigate(url);
  }

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label="Activity"
        aria-expanded={open}
        className="relative h-9 w-9 rounded-full bg-white border border-[#D8D5D0] flex items-center justify-center hover:border-[#ED202B] transition"
      >
        <BellIcon />
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-[#ED202B] text-white text-[10px] font-bold flex items-center justify-center">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      <AnimatePresence>
        {open && (
          <>
            {/* Mobile fullscreen sheet */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="md:hidden fixed inset-0 bg-black/40 z-40"
              onClick={() => setOpen(false)}
            />
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.15 }}
              className="fixed md:absolute z-50
                         inset-x-0 top-16 md:inset-auto md:top-auto md:right-0 md:mt-2
                         md:w-96 md:max-h-[70vh]
                         bg-white md:rounded-xl shadow-lg border-y md:border border-[#D8D5D0]
                         overflow-hidden flex flex-col"
              role="menu"
            >
              <div className="px-4 py-3 border-b border-[#D8D5D0] flex items-center justify-between">
                <span className="font-heading text-sm font-semibold text-[#201F1E]">
                  Activity
                </span>
                <Link
                  to="/admin/activity"
                  onClick={() => setOpen(false)}
                  className="text-xs text-[#ED202B] hover:text-[#9B0E18] font-medium"
                >
                  See all →
                </Link>
              </div>

              <div className="flex-1 overflow-y-auto">
                {preview.length === 0 ? (
                  <div className="px-4 py-12 text-center">
                    <p className="text-sm text-[#7A756E]">No activity yet.</p>
                  </div>
                ) : (
                  preview.map((entry) => (
                    <button
                      key={entry.id}
                      type="button"
                      onClick={() => handleRowClick(entry)}
                      className="w-full flex items-start gap-3 px-4 py-3 text-left hover:bg-[#F5F4F2] transition border-b border-[#D8D5D0] last:border-b-0"
                    >
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-[#201F1E] truncate">{entry.summary}</p>
                        <p className="text-[11px] text-[#7A756E] mt-0.5 truncate">
                          {entry.actor.email}
                        </p>
                      </div>
                      <span className="text-[11px] text-[#7A756E] shrink-0">
                        {formatRelativeTime(entryMillis(entry))}
                      </span>
                    </button>
                  ))
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}

function BellIcon() {
  return (
    <svg
      className="h-4 w-4 text-[#201F1E]"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={1.8}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0"
      />
    </svg>
  );
}
