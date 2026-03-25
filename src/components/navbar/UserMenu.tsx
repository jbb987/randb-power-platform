import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '../../hooks/useAuth';

function getInitials(email: string | null | undefined): string {
  if (!email) return '?';
  const name = email.split('@')[0];
  const parts = name.split(/[._-]/);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  return name.slice(0, 2).toUpperCase();
}

export default function UserMenu() {
  const { user, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close on click outside
  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
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

  return (
    <div className="relative hidden md:block" ref={menuRef}>
      <button
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        aria-haspopup="true"
        className="h-9 w-9 rounded-full bg-[#ED202B] text-white text-xs font-semibold flex items-center justify-center hover:bg-[#ED202B] transition"
      >
        {getInitials(user?.email)}
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.15 }}
            className="absolute right-0 mt-2 w-56 bg-white rounded-lg shadow-lg border border-[#D8D5D0] py-1 z-50"
            role="menu"
          >
            <div className="px-4 py-2 border-b border-[#D8D5D0]">
              <p className="text-xs text-[#7A756E]">Signed in as</p>
              <p className="text-sm font-medium text-[#201F1E] truncate">{user?.email}</p>
            </div>
            <button
              onClick={() => {
                setOpen(false);
                logout();
              }}
              role="menuitem"
              className="w-full text-left px-4 py-2 text-sm text-[#7A756E] hover:bg-[#FAFAF9] hover:text-[#ED202B] transition"
            >
              Logout
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
