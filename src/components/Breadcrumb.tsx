import { Link, useLocation } from 'react-router-dom';

const routeLabels: Record<string, string> = {
  '/': 'Tools',
  '/site-appraiser': 'Site Appraiser',
};

export default function Breadcrumb() {
  const { pathname } = useLocation();

  // Don't show breadcrumbs on the root/dashboard page
  if (pathname === '/') return null;

  // Build breadcrumb segments from the pathname
  const segments = pathname.split('/').filter(Boolean);
  const crumbs = segments.map((_, index) => {
    const path = '/' + segments.slice(0, index + 1).join('/');
    const label = routeLabels[path] ?? segments[index];
    const isLast = index === segments.length - 1;
    return { path, label, isLast };
  });

  return (
    <nav aria-label="Breadcrumb" className="mb-4">
      <ol className="flex items-center gap-1.5 text-sm">
        <li className="flex items-center gap-1.5">
          <Link
            to="/"
            className="text-[#7A756E] hover:text-[#C1121F] transition font-medium"
          >
            Tools
          </Link>
        </li>
        {crumbs.map(({ path, label, isLast }) => (
          <li key={path} className="flex items-center gap-1.5">
            <ChevronIcon />
            {isLast ? (
              <span className="text-[#201F1E] font-medium">{label}</span>
            ) : (
              <Link
                to={path}
                className="text-[#7A756E] hover:text-[#C1121F] transition font-medium"
              >
                {label}
              </Link>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}

function ChevronIcon() {
  return (
    <svg
      className="h-3.5 w-3.5 text-[#B5B0A8] flex-shrink-0"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2.5}
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
    </svg>
  );
}
