import { useEffect } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import Layout from '../components/Layout';
import WhitepaperSidebar from '../components/whitepaper/WhitepaperSidebar';
import { useAuth } from '../hooks/useAuth';
import { canSeeWhitepaper } from '../lib/whitepaperAccess';
import {
  WHITEPAPER_GROUPS,
  WHITEPAPER_SECTIONS,
  DEFAULT_SECTION_ID,
  findSection,
} from '../content/whitepaper/registry';

/**
 * Whitepaper — the platform's living documentation, presented as a classic
 * docs site: grouped section nav on the left, content on the right. Content
 * lives in src/content/whitepaper/ and is filled in progressively.
 *
 * Access is allowlist-only (src/lib/whitepaperAccess.ts) — tighter than any
 * role; even admins outside the list are redirected.
 */
export default function WhitepaperTool() {
  const { sectionId } = useParams();
  const navigate = useNavigate();
  const { user, loading } = useAuth();
  const section = findSection(sectionId ?? DEFAULT_SECTION_ID);

  // Reset scroll when switching sections — long doc pages otherwise keep the
  // previous section's scroll offset.
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [sectionId]);

  if (loading) {
    return null;
  }
  if (!canSeeWhitepaper(user)) {
    return <Navigate to="/" replace />;
  }

  if (!section) {
    return <Navigate to={`/whitepaper/${DEFAULT_SECTION_ID}`} replace />;
  }

  const index = WHITEPAPER_SECTIONS.findIndex((s) => s.id === section.id);
  const prev = index > 0 ? WHITEPAPER_SECTIONS[index - 1] : undefined;
  const next = index < WHITEPAPER_SECTIONS.length - 1 ? WHITEPAPER_SECTIONS[index + 1] : undefined;

  return (
    <Layout fullWidth>
      <div className="mx-auto flex max-w-7xl gap-10">
        {/* Desktop sidebar */}
        <aside className="hidden w-60 shrink-0 lg:block">
          <div className="sticky top-6 max-h-[calc(100vh-3rem)] overflow-y-auto pb-8 pr-1">
            <WhitepaperSidebar activeId={section.id} />
          </div>
        </aside>

        <div className="min-w-0 flex-1 pb-16">
          {/* Mobile section picker */}
          <div className="mb-6 lg:hidden">
            <label htmlFor="whitepaper-section" className="sr-only">
              Whitepaper section
            </label>
            <select
              id="whitepaper-section"
              value={section.id}
              onChange={(e) => navigate(`/whitepaper/${e.target.value}`)}
              className="w-full rounded-xl border border-[#D8D5D0] bg-white px-3 py-2.5 text-sm text-[#201F1E] shadow-sm focus:border-[#ED202B]/40 focus:outline-none"
            >
              {WHITEPAPER_GROUPS.map((group) => (
                <optgroup key={group.title} label={group.title}>
                  {group.sections.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.title}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </div>

          <div className="max-w-3xl">
            {section.render()}

            {/* Prev / next pager */}
            <nav
              aria-label="Section pager"
              className="mt-12 flex gap-4 border-t border-[#D8D5D0] pt-6"
            >
              {prev && (
                <button
                  onClick={() => navigate(`/whitepaper/${prev.id}`)}
                  className="group flex-1 rounded-xl border border-[#D8D5D0] bg-white px-4 py-3 text-left shadow-sm transition hover:border-[#ED202B]/30 hover:shadow"
                >
                  <span className="text-xs text-[#7A756E]">‹ Previous</span>
                  <span className="mt-0.5 block truncate text-sm font-medium text-[#201F1E] group-hover:text-[#ED202B]">
                    {prev.title}
                  </span>
                </button>
              )}
              {next && (
                <button
                  onClick={() => navigate(`/whitepaper/${next.id}`)}
                  className="group flex-1 rounded-xl border border-[#D8D5D0] bg-white px-4 py-3 text-right shadow-sm transition hover:border-[#ED202B]/30 hover:shadow"
                >
                  <span className="text-xs text-[#7A756E]">Next ›</span>
                  <span className="mt-0.5 block truncate text-sm font-medium text-[#201F1E] group-hover:text-[#ED202B]">
                    {next.title}
                  </span>
                </button>
              )}
            </nav>
          </div>
        </div>
      </div>
    </Layout>
  );
}
