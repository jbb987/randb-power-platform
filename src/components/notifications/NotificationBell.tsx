import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useNotifications, FEED_LIMIT } from '../../hooks/useNotifications';
import { useActivityBell } from '../../hooks/useActivityBell';
import { resourceUrl } from '../../lib/activityRoutes';
import { formatRelativeTime } from '../../utils/format';
import type { AppNotification } from '../../types/notification';
import type { ActivityEntry } from '../../types/activity';

// Render every notification the hook loads, so nothing in the badge count is
// counted-but-unviewable; the dropdown scrolls (max-h + overflow-y-auto).
const PREVIEW_COUNT = FEED_LIMIT;
const ACTIVITY_PREVIEW_COUNT = 10;

type Tab = 'notifications' | 'activity';

function notifMillis(entry: AppNotification): number {
  return entry.createdAt?.toMillis ? entry.createdAt.toMillis() : 0;
}

function activityMillis(entry: ActivityEntry): number {
  return entry.timestamp?.toMillis ? entry.timestamp.toMillis() : 0;
}

/**
 * The single navbar bell. Every role sees their own personal notifications
 * (task assignments, etc.). Admins additionally get an "App Activity" tab that
 * surfaces the company-wide audit feed — non-admins never see that tab, and the
 * underlying activity data is never subscribed for them (see useActivityBell).
 *
 * The two tabs are backed by separate data models on purpose: `notifications`
 * is recipient-scoped with a per-item read flag, while `activity` is the
 * admin-only audit feed tracked by a single `activityLastSeenAt` timestamp.
 * Only the UI is merged here.
 */
export default function NotificationBell() {
  const { entries, unreadCount, loading, markRead, markAllRead } = useNotifications();
  const {
    enabled: isAdmin,
    entries: activityEntries,
    unreadCount: activityUnread,
    markSeen: markActivitySeen,
  } = useActivityBell();

  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<Tab>('notifications');
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

  // Non-admins have no Activity tab, so the active tab is always derived from
  // role — never trust a stale 'activity' selection if the user isn't an admin.
  const activeTab: Tab = isAdmin ? tab : 'notifications';

  // Clear the activity dot only once the admin actually views the Activity tab.
  useEffect(() => {
    if (open && activeTab === 'activity') void markActivitySeen();
  }, [open, activeTab, markActivitySeen]);

  const notifPreview = entries.slice(0, PREVIEW_COUNT);
  const activityPreview = activityEntries.slice(0, ACTIVITY_PREVIEW_COUNT);

  // The closed-bell badge reflects personal unread only, so the red number
  // always means "something addressed to you". New app activity gets its own
  // subtle dot on the Activity tab instead.
  const badgeCount = unreadCount;

  function handleNotifClick(entry: AppNotification) {
    setOpen(false);
    if (!entry.read) void markRead(entry.id);
    if (entry.link) navigate(entry.link);
  }

  function handleActivityClick(entry: ActivityEntry) {
    setOpen(false);
    const url = resourceUrl(entry.resource);
    if (url) navigate(url);
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
        {badgeCount > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-[#ED202B] text-white text-[10px] font-bold flex items-center justify-center">
            {badgeCount > 99 ? '99+' : badgeCount}
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
              {isAdmin ? (
                <div className="flex items-stretch border-b border-[#D8D5D0]">
                  <TabButton active={activeTab === 'notifications'} onClick={() => setTab('notifications')}>
                    Notifications
                    {unreadCount > 0 && (
                      <span className="ml-1.5 inline-flex min-w-[16px] h-4 px-1 rounded-full bg-[#ED202B] text-white text-[10px] font-bold items-center justify-center align-middle">
                        {unreadCount > 99 ? '99+' : unreadCount}
                      </span>
                    )}
                  </TabButton>
                  <TabButton active={activeTab === 'activity'} onClick={() => setTab('activity')}>
                    App Activity
                    {activityUnread > 0 && (
                      <span className="ml-1.5 inline-block h-2 w-2 rounded-full bg-[#ED202B] align-middle" />
                    )}
                  </TabButton>
                </div>
              ) : (
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
              )}

              {/* Contextual action row for the admin tabbed view */}
              {isAdmin && (
                <div className="px-4 py-2 border-b border-[#D8D5D0] flex items-center justify-end min-h-[34px]">
                  {activeTab === 'notifications'
                    ? unreadCount > 0 && (
                        <button
                          type="button"
                          onClick={() => void markAllRead()}
                          className="text-xs text-[#ED202B] hover:text-[#9B0E18] font-medium"
                        >
                          Mark all read
                        </button>
                      )
                    : (
                        <Link
                          to="/admin/activity"
                          onClick={() => setOpen(false)}
                          className="text-xs text-[#ED202B] hover:text-[#9B0E18] font-medium"
                        >
                          See all →
                        </Link>
                      )}
                </div>
              )}

              <div className="flex-1 overflow-y-auto">
                {activeTab === 'notifications' ? (
                  notifPreview.length === 0 ? (
                    <div className="px-4 py-12 text-center">
                      <p className="text-sm text-[#7A756E]">
                        {loading ? 'Loading…' : 'You are all caught up.'}
                      </p>
                    </div>
                  ) : (
                    notifPreview.map((entry) => (
                      <button
                        key={entry.id}
                        type="button"
                        onClick={() => handleNotifClick(entry)}
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
                          {formatRelativeTime(notifMillis(entry))}
                        </span>
                      </button>
                    ))
                  )
                ) : activityPreview.length === 0 ? (
                  <div className="px-4 py-12 text-center">
                    <p className="text-sm text-[#7A756E]">No activity yet.</p>
                  </div>
                ) : (
                  activityPreview.map((entry) => (
                    <button
                      key={entry.id}
                      type="button"
                      onClick={() => handleActivityClick(entry)}
                      className="w-full flex items-start gap-3 px-4 py-3 text-left hover:bg-[#F5F4F2] transition border-b border-[#D8D5D0] last:border-b-0"
                    >
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-[#201F1E] truncate">{entry.summary}</p>
                        <p className="text-[11px] text-[#7A756E] mt-0.5 truncate">{entry.actor.email}</p>
                      </div>
                      <span className="text-[11px] text-[#7A756E] shrink-0">
                        {formatRelativeTime(activityMillis(entry))}
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

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex-1 px-4 py-3 text-sm font-heading font-semibold transition border-b-2 -mb-px ${
        active
          ? 'text-[#201F1E] border-[#ED202B]'
          : 'text-[#7A756E] border-transparent hover:text-[#201F1E]'
      }`}
    >
      {children}
    </button>
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
