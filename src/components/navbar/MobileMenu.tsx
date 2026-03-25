import { useState } from 'react';
import { NavLink } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { navLinks } from './navConfig';
import { useAuth } from '../../hooks/useAuth';

export default function MobileMenu() {
  const [open, setOpen] = useState(false);
  const { user, role, logout } = useAuth();

  const visibleLinks = navLinks.filter(
    (link) => !link.roles || (role && link.roles.includes(role))
  );

  return (
    <div className="md:hidden">
      {/* Hamburger button */}
      <button
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        aria-label="Toggle navigation menu"
        className="p-2 text-[#7A756E] hover:text-[#201F1E] transition"
      >
        <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          {open ? (
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          ) : (
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
          )}
        </svg>
      </button>

      {/* Slide-down panel */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="absolute left-0 right-0 top-full bg-white border-b border-[#D8D5D0] shadow-md overflow-hidden z-50"
          >
            <nav className="px-4 py-3 space-y-1">
              {visibleLinks.map((link) => (
                <NavLink
                  key={link.path}
                  to={link.path}
                  onClick={() => setOpen(false)}
                  className={({ isActive }) =>
                    `block px-3 py-2 rounded-lg text-sm font-medium transition ${
                      isActive
                        ? 'text-[#ED202B] bg-[#ED202B]/5'
                        : 'text-[#7A756E] hover:bg-[#FAFAF9]'
                    }`
                  }
                >
                  {link.label}
                </NavLink>
              ))}
            </nav>
            <div className="border-t border-[#D8D5D0] px-4 py-3">
              <p className="text-xs text-[#7A756E] mb-2 truncate">{user?.email}</p>
              <button
                onClick={() => {
                  setOpen(false);
                  logout();
                }}
                className="text-sm text-[#7A756E] hover:text-[#ED202B] transition font-medium"
              >
                Logout
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
