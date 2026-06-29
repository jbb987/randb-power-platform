import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useNotifications, FEED_LIMIT } from '../../hooks/useNotifications';
import { formatRelativeTime } from '../../utils/format';
import type { AppNotification } from '../../types/notification';

// Render every notification the hook loads, so nothing in the badge count is
// counted-but-unviewable; the dropdown scrolls (max-h + overflow-y-auto).
const PREVIEW_COUNT = FEED_LIMIT;

function entryMillis(entry: AppNotification): number {
  return entry.createdAt?.toMillis ? entry.createdAt.toMillis() : 0;
}

/**
 * Per-user notification bell (all roles). Shows the recipient's latest
 * notifications with a red unread badge; clicking a row navigates to the
 * linked resource and marks it read. The admin-only activity audit feed lives
 * separately in ActivityBell / the /admin/activity page.
 */
export default function NotificationBell() {
  const { entries, unreadCount, loading, markRead, markAllRead } = useNotifications();
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

  const preview = entries.slice(0, PREVIEW_COUNT);

  function handleRowClick(entry: AppNotification) {
    setOpen(false);
    if (!entry.read) void markRead(entry.id);
    if (entry.link) navigate(entry.link);
  }

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label="Notifications"
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
            {/* Mobile fullscreen sheet backdrop */}
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
                  Notifications
                </span>
                {unreadCount > 0 && (
                  <button
                    type="button"
                    onClick={() => void markAllRead()}
                    className="text-xs text-[#ED202B] hover:text-[#9B0E18] font-medium"
                  >
                    Mark all read
                  </button>
                )}
              </div>

              <div className="flex-1 overflow-y-auto">
                {preview.length === 0 ? (
                  <div className="px-4 py-12 text-center">
                    <p className="text-sm text-[#7A756E]">
                      {loading ? 'Loading…' : 'You are all caught up.'}
                    </p>
                  </div>
                ) : (
                  preview.map((entry) => (
                    <button
                      key={entry.id}
                      type="button"
                      onClick={() => handleRowClick(entry)}
                      className={`w-full flex items-start gap-3 px-4 py-3 text-left transition border-b border-[#D8D5D0] last:border-b-0 ${
                        entry.read ? 'hover:bg-[#F5F4F2]' : 'bg-[#ED202B]/5 hover:bg-[#ED202B]/10'
                      }`}
                    >
                      {!entry.read && (
                        <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-[#ED202B]" />
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-[#201F1E] truncate">{entry.title}</p>
                        <p className="text-[12px] text-[#7A756E] mt-0.5 truncate">{entry.body}</p>
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
