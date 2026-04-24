import { useLocation, useNavigate } from 'react-router-dom';

interface BackState {
  backTo: string;
  backLabel: string;
}

function hasBackState(state: unknown): state is BackState {
  return (
    typeof state === 'object' &&
    state !== null &&
    'backTo' in state &&
    'backLabel' in state &&
    typeof (state as BackState).backTo === 'string' &&
    typeof (state as BackState).backLabel === 'string'
  );
}

/**
 * Returns the appropriate "back" destination for a given path. Tool sub-pages
 * (e.g. /crm/companies/:id) go back to their tool root (/crm) rather than all
 * the way to the dashboard.
 */
function resolveBack(pathname: string): { path: string; label: string } | null {
  if (pathname === '/') return null;
  if (pathname.startsWith('/crm/')) return { path: '/crm', label: 'Directory' };
  return { path: '/', label: 'Dashboard' };
}

export default function Breadcrumb() {
  const { pathname, state } = useLocation();
  const navigate = useNavigate();

  // A caller can override the default breadcrumb by passing
  // `state: { backTo, backLabel }` to navigate(). Used to make
  // /crm/people/:id navigated from a company page return to that company.
  const back = hasBackState(state)
    ? { path: state.backTo, label: state.backLabel }
    : resolveBack(pathname);
  if (!back) return null;

  return (
    <nav aria-label="Navigation" className="mb-4">
      <button
        onClick={() => navigate(back.path)}
        className="inline-flex items-center gap-1.5 bg-white rounded-full border border-[#D8D5D0] shadow-sm px-3 py-1.5 text-sm font-medium text-[#7A756E] hover:text-[#ED202B] hover:border-[#ED202B]/30 hover:shadow transition group"
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
