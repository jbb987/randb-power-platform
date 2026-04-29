import { useMemo, useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import Layout from '../components/Layout';
import { useSiteRegistry } from '../hooks/useSiteRegistry';
import { useCompanies } from '../hooks/useCompanies';
import { downloadSitesCsv } from '../utils/exportSitesCsv';
import type { SiteRegistryEntry, Company } from '../types';

function formatLastAnalyzed(ts?: number | null): string | null {
  if (!ts) return null;
  return new Date(ts).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function getCompanyName(site: SiteRegistryEntry, byId: Map<string, Company>): string {
  if (site.companyId) {
    const c = byId.get(site.companyId);
    if (c) return c.name;
  }
  if (site.owner) return site.owner; // legacy free-text owner
  return '';
}

export default function SiteAnalyzerIndex() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { sites, loading } = useSiteRegistry();
  const { companies } = useCompanies();
  const [query, setQuery] = useState('');

  // Legacy redirect: /site-analyzer?siteId=X → /site-analyzer/X
  useEffect(() => {
    const legacyId = searchParams.get('siteId');
    if (legacyId) {
      navigate(`/site-analyzer/${legacyId}`, { replace: true });
    }
  }, [searchParams, navigate]);

  const companiesById = useMemo(() => {
    const m = new Map<string, Company>();
    for (const c of companies) m.set(c.id, c);
    return m;
  }, [companies]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const sorted = [...sites].sort((a, b) => {
      const ta = a.piddrGeneratedAt ?? a.updatedAt ?? 0;
      const tb = b.piddrGeneratedAt ?? b.updatedAt ?? 0;
      return tb - ta;
    });
    if (!q) return sorted;
    return sorted.filter((s) => {
      const name = (s.name || '').toLowerCase();
      const companyName = getCompanyName(s, companiesById).toLowerCase();
      return name.includes(q) || companyName.includes(q);
    });
  }, [sites, query, companiesById]);

  return (
    <Layout>
      <main className="py-2">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-5">
          <div className="min-w-0">
            <h1 className="font-heading text-2xl font-semibold text-[#201F1E] truncate">
              Site Analyzer
            </h1>
            <p className="text-sm text-[#7A756E] mt-0.5">
              {sites.length} {sites.length === 1 ? 'site' : 'sites'} analyzed
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => downloadSitesCsv(sites)}
              disabled={loading || sites.length === 0}
              className="inline-flex items-center justify-center gap-2 rounded-lg border border-[#ED202B] bg-white px-4 py-2.5 text-sm font-semibold text-[#ED202B] transition hover:bg-[#ED202B]/5 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v12m0 0l-4-4m4 4l4-4M4 20h16" />
              </svg>
              <span>Export Excel</span>
            </button>
            <button
              onClick={() => navigate('/site-analyzer/new')}
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-[#ED202B] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#9B0E18] shadow-sm"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
              </svg>
              <span>New Analysis</span>
            </button>
          </div>
        </div>

        {/* Search */}
        <div className="relative mb-5">
          <svg
            className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#7A756E] pointer-events-none"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M11 19a8 8 0 100-16 8 8 0 000 16z" />
          </svg>
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by site or company name…"
            className="w-full rounded-lg border border-[#D8D5D0] bg-white pl-9 pr-3 py-2.5 text-sm text-[#201F1E] outline-none transition focus:border-[#ED202B] focus:ring-2 focus:ring-[#ED202B]/20 placeholder:text-[#7A756E]"
          />
        </div>

        {/* List */}
        {loading ? (
          <div className="bg-white rounded-xl border border-[#D8D5D0] p-8 text-center text-sm text-[#7A756E]">
            Loading…
          </div>
        ) : filtered.length === 0 ? (
          <div className="bg-white rounded-xl border border-[#D8D5D0] p-10 text-center">
            {sites.length === 0 ? (
              <>
                <p className="text-sm text-[#7A756E] mb-4">No analyses yet — create your first.</p>
                <button
                  onClick={() => navigate('/site-analyzer/new')}
                  className="inline-flex items-center gap-2 rounded-lg bg-[#ED202B] px-4 py-2 text-sm font-semibold text-white hover:bg-[#9B0E18] transition"
                >
                  + New Analysis
                </button>
              </>
            ) : (
              <p className="text-sm text-[#7A756E]">No sites match "{query}".</p>
            )}
          </div>
        ) : (
          <SitesList sites={filtered} companiesById={companiesById} onOpen={(id) => navigate(`/site-analyzer/${id}`)} />
        )}
      </main>
    </Layout>
  );
}

function SitesList({
  sites,
  companiesById,
  onOpen,
}: {
  sites: SiteRegistryEntry[];
  companiesById: Map<string, Company>;
  onOpen: (id: string) => void;
}) {
  return (
    <>
      {/* Mobile: stacked cards */}
      <ul className="md:hidden space-y-2">
        {sites.map((s) => {
          const company = getCompanyName(s, companiesById);
          const last = formatLastAnalyzed(s.piddrGeneratedAt);
          return (
            <li key={s.id}>
              <button
                onClick={() => onOpen(s.id)}
                className="group w-full text-left bg-white rounded-xl border border-[#D8D5D0] p-4 hover:border-[#ED202B] hover:shadow-sm transition"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="font-medium text-[#201F1E] truncate group-hover:text-[#ED202B] transition-colors">
                      {s.name || (s.coordinates ? `${s.coordinates.lat.toFixed(4)}, ${s.coordinates.lng.toFixed(4)}` : 'Untitled Site')}
                    </div>
                    <div className="text-xs text-[#7A756E] mt-0.5 truncate">
                      {company || <span className="italic">Unlinked</span>}
                    </div>
                    {last && (
                      <div className="text-[11px] text-[#7A756E] mt-1.5">Analyzed · {last}</div>
                    )}
                  </div>
                  {s.mwCapacity > 0 && (
                    <div className="shrink-0 rounded-full bg-[#ED202B]/10 px-2.5 py-1 text-[11px] font-semibold text-[#ED202B]">
                      {s.mwCapacity} MW
                    </div>
                  )}
                </div>
              </button>
            </li>
          );
        })}
      </ul>

      {/* Desktop: 3-column table */}
      <div className="hidden md:block bg-white rounded-xl border border-[#D8D5D0] overflow-hidden">
        <table className="w-full">
          <thead className="bg-stone-50 border-b border-[#D8D5D0]">
            <tr>
              <th className="text-left px-4 py-2.5 text-xs font-semibold text-[#7A756E] uppercase tracking-wide">
                Site Name
              </th>
              <th className="text-left px-4 py-2.5 text-xs font-semibold text-[#7A756E] uppercase tracking-wide">
                Company
              </th>
              <th className="text-right px-4 py-2.5 text-xs font-semibold text-[#7A756E] uppercase tracking-wide w-32">
                MW
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#D8D5D0]">
            {sites.map((s) => {
              const company = getCompanyName(s, companiesById);
              return (
                <tr
                  key={s.id}
                  onClick={() => onOpen(s.id)}
                  className="cursor-pointer hover:bg-stone-50 transition group"
                >
                  <td className="px-4 py-3 text-sm font-medium text-[#201F1E] group-hover:text-[#ED202B] transition-colors">
                    {s.name || (s.coordinates ? `${s.coordinates.lat.toFixed(4)}, ${s.coordinates.lng.toFixed(4)}` : 'Untitled Site')}
                  </td>
                  <td className="px-4 py-3 text-sm text-[#7A756E]">
                    {company || <span className="italic">Unlinked</span>}
                  </td>
                  <td className="px-4 py-3 text-sm text-[#201F1E] text-right tabular-nums">
                    {s.mwCapacity > 0 ? `${s.mwCapacity}` : '—'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}
