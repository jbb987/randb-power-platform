import { useLocation, useNavigate } from 'react-router-dom';

const routeLabels: Record<string, string> = {
  '/': 'Power Infrastructure Due Diligence Report',
  '/site-appraiser': 'Site Appraiser',
  '/site-request': 'Site Request',
  '/site-request/form': 'Submit Request',
};

export default function Breadcrumb() {
  const { pathname } = useLocation();
  const navigate = useNavigate();

  // Don't show on the root/dashboard page
  if (pathname === '/') return null;

  // Determine the back destination: parent path or dashboard
  const segments = pathname.split('/').filter(Boolean);
  const parentPath = segments.length > 1
    ? '/' + segments.slice(0, -1).join('/')
    : '/';
  const parentLabel = routeLabels[parentPath] ?? 'Back';

  return (
    <nav aria-label="Navigation" className="mb-4">
      <button
        onClick={() => navigate(parentPath)}
        className="inline-flex items-center gap-1.5 text-sm text-[#7A756E] hover:text-[#C1121F] transition font-medium group"
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
        {parentLabel}
      </button>
    </nav>
  );
}
