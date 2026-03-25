import { useLocation, useNavigate } from 'react-router-dom';

export default function Breadcrumb() {
  const { pathname } = useLocation();
  const navigate = useNavigate();

  // Don't show on the root/dashboard page
  if (pathname === '/') return null;

  return (
    <nav aria-label="Navigation" className="mb-4">
      <button
        onClick={() => navigate('/')}
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
        Dashboard
      </button>
    </nav>
  );
}
