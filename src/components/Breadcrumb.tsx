import { useLocation, useNavigate } from 'react-router-dom';

/**
 * Returns the appropriate "back" destination for a given path. Tool sub-pages
 * (e.g. /crm/companies/:id) go back to their tool root (/crm) rather than all
 * the way to the dashboard.
 */
function resolveBack(pathname: string): { path: string; label: string } | null {
  if (pathname === '/') return null;
  if (pathname.startsWith('/crm/')) return { path: '/crm', label: 'CRM' };
  return { path: '/', label: 'Dashboard' };
}

export default function Breadcrumb() {
  const { pathname } = useLocation();
  const navigate = useNavigate();

  const back = resolveBack(pathname);
  if (!back) return null;

  return (
    <nav aria-label="Navigation" className="mb-4">
      <button
        onClick={() => navigate(back.path)}
        className="inline-flex items-center gap-1.5 text-sm text-[#7A756E] hover:text-[#ED202B] transition font-medium group"
      >
        <svg
          className="h-4 w-4 flex-shrink-0 transition-transform group-hover:-translate-x-0.5"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2.5}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
        </svg>
        {back.label}
      </button>
    </nav>
  );
}
