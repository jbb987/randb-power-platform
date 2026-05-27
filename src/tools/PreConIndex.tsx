import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Layout from '../components/Layout';
import Button from '../components/ui/Button';
import PreConGradePill from '../components/precon/PreConGradePill';
import { useAuth } from '../hooks/useAuth';
import { useCompanies } from '../hooks/useCompanies';
import { usePreConSitesList } from '../hooks/usePreConSites';
import { ALL_PRECON_GRADES, PRECON_GRADE_LABELS, type PreConGrade } from '../types';

export default function PreConIndex() {
  const navigate = useNavigate();
  const { role } = useAuth();
  const { sites, loading } = usePreConSitesList();
  const { companies } = useCompanies();

  const companyById = useMemo(() => new Map(companies.map((c) => [c.id, c])), [companies]);

  const [query, setQuery] = useState('');
  const [gradeFilter, setGradeFilter] = useState<PreConGrade | 'all' | 'ungraded'>('all');

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return sites.filter((s) => {
      if (gradeFilter === 'ungraded' && s.grade) return false;
      if (gradeFilter !== 'all' && gradeFilter !== 'ungraded' && s.grade !== gradeFilter)
        return false;
      if (!q) return true;
      const company = companyById.get(s.companyId);
      const haystack = [s.name, company?.name ?? '', s.coordinates.lat, s.coordinates.lng]
        .join(' ')
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [sites, query, gradeFilter, companyById]);

  const canCreate = role === 'admin' || role === 'manager';

  return (
    <Layout>
      <main className="py-6 space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="font-heading text-2xl font-semibold text-[#201F1E]">Large Load Request</h1>
            <p className="text-sm text-[#7A756E] mt-0.5">
              {loading
                ? 'Loading…'
                : `${filtered.length} site${filtered.length === 1 ? '' : 's'}`}
            </p>
          </div>
          {canCreate && (
            <Button onClick={() => navigate('/llr/new')}>
              <svg
                className="h-4 w-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2.5}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
              </svg>
              <span>New site</span>
            </Button>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[200px]">
            <svg
              className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-[#7A756E] pointer-events-none"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
              />
            </svg>
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by site name, company, coordinates…"
              className="w-full pl-8 pr-3 py-2 text-sm bg-white border border-[#D8D5D0] rounded-lg focus:outline-none focus:border-[#ED202B] focus:ring-2 focus:ring-[#ED202B]/20 transition"
            />
          </div>
          <select
            value={gradeFilter}
            onChange={(e) =>
              setGradeFilter(e.target.value as PreConGrade | 'all' | 'ungraded')
            }
            className="text-sm bg-white border border-[#D8D5D0] rounded-lg px-3 py-2 focus:outline-none focus:border-[#ED202B]"
          >
            <option value="all">All grades</option>
            <option value="ungraded">Ungraded</option>
            {ALL_PRECON_GRADES.map((g) => (
              <option key={g} value={g}>
                {PRECON_GRADE_LABELS[g]}
              </option>
            ))}
          </select>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="h-8 w-8 animate-spin rounded-full border-[3px] border-[#D8D5D0] border-t-[#ED202B]" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="bg-white rounded-xl border border-dashed border-[#D8D5D0] py-12 text-center">
            <p className="text-sm text-[#7A756E]">
              {sites.length === 0
                ? 'No Large Load Request sites yet. '
                : 'No sites match your filters. Try clearing them.'}
              {sites.length === 0 && canCreate && (
                <button
                  onClick={() => navigate('/llr/new')}
                  className="font-medium text-[#ED202B] hover:underline"
                >
                  Add the first one.
                </button>
              )}
            </p>
          </div>
        ) : (
          <ul className="space-y-3">
            {filtered.map((s) => {
              const company = companyById.get(s.companyId);
              return (
                <li key={s.id}>
                  <button
                    onClick={() => navigate(`/llr/${s.id}`)}
                    className="group w-full text-left bg-white rounded-xl border border-[#D8D5D0] shadow-sm p-4 hover:shadow-md hover:border-[#ED202B]/30 transition"
                  >
                    <h3 className="font-heading font-semibold text-[#201F1E] group-hover:text-[#ED202B] transition mb-1">
                      {s.name}
                    </h3>
                    <div className="text-xs text-[#7A756E]">
                      {company?.name ?? 'No company linked'}
                      <> · {s.coordinates.lat.toFixed(5)}, {s.coordinates.lng.toFixed(5)}</>
                      {' · '}
                      {s.engineerVerifiedMW !== undefined
                        ? `${s.engineerVerifiedMW} MW`
                        : 'Awaiting engineer review'}
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <PreConGradePill grade={s.grade} />
                      {(s.engineerReviewStatus === 'approved' ||
                        s.engineerReviewStatus === 'rejected') && (
                        <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium bg-[#10B981]/10 text-[#10B981]">
                          <svg
                            className="h-3 w-3"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                            strokeWidth={3}
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              d="M5 13l4 4L19 7"
                            />
                          </svg>
                          Verified by engineer
                        </span>
                      )}
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </main>
    </Layout>
  );
}
