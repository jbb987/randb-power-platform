import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Layout from '../components/Layout';
import JobStatusBadge from '../components/construction/JobStatusBadge';
import { useConstructionJobs } from '../hooks/useConstructionJobs';
import { useCompanies } from '../hooks/useCompanies';
import { useUsers } from '../hooks/useUsers';
import { useAuth } from '../hooks/useAuth';
import {
  ALL_CONSTRUCTION_JOB_STATUSES,
  CONSTRUCTION_JOB_STATUS_LABELS,
  type ConstructionJob,
  type ConstructionJobStatus,
} from '../types';

function headlineCompanyId(job: ConstructionJob): string | undefined {
  return job.companyIds?.[0] ?? job.generalContractorIds?.[0] ?? job.subcontractorIds?.[0];
}

function formatDateRange(start?: number, end?: number): string {
  const fmt = (ts: number) =>
    new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  if (start && end) return `${fmt(start)} → ${fmt(end)}`;
  if (start) return `Start ${fmt(start)}`;
  if (end) return `End ${fmt(end)}`;
  return '';
}

export default function ConstructionTrackerIndex() {
  const navigate = useNavigate();
  const { user, role } = useAuth();
  const { jobs, loading } = useConstructionJobs();
  const { companies } = useCompanies();
  const { users } = useUsers();

  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<ConstructionJobStatus | 'all'>('all');

  const companyById = useMemo(() => new Map(companies.map((c) => [c.id, c])), [companies]);
  const userById = useMemo(() => new Map(users.map((u) => [u.id, u])), [users]);

  // Visibility: admins and employees see all jobs; workers see only jobs
  // where they're the PM or a member of workerIds.
  const visibleJobs = useMemo(() => {
    if (!user) return [];
    if (role === 'admin' || role === 'employee') return jobs;
    return jobs.filter(
      (j) => j.projectManagerId === user.uid || (j.workerIds ?? []).includes(user.uid),
    );
  }, [jobs, user, role]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return visibleJobs.filter((j) => {
      if (statusFilter !== 'all' && j.status !== statusFilter) return false;
      if (!q) return true;
      const primary = companyById.get(headlineCompanyId(j) ?? '');
      const haystack = [
        j.name,
        j.address ?? '',
        primary?.name ?? '',
        userById.get(j.projectManagerId)?.email ?? '',
      ]
        .join(' ')
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [visibleJobs, query, statusFilter, companyById, userById]);

  return (
    <Layout>
      <main className="py-6 space-y-5">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="font-heading text-2xl font-semibold text-[#201F1E]">Construction</h1>
            <p className="text-sm text-[#7A756E] mt-0.5">
              {loading ? 'Loading…' : `${filtered.length} job${filtered.length === 1 ? '' : 's'}`}
            </p>
          </div>
          {(role === 'admin' || (role === 'employee')) && (
            <button
              onClick={() => navigate('/construction-tracker/new')}
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-[#ED202B] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#9B0E18] shadow-sm"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
              </svg>
              <span>New job</span>
            </button>
          )}
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[200px]">
            <svg
              className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-[#7A756E] pointer-events-none"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by project name, company, address, PM…"
              className="w-full pl-8 pr-3 py-2 text-sm bg-white border border-[#D8D5D0] rounded-lg focus:outline-none focus:border-[#ED202B] focus:ring-2 focus:ring-[#ED202B]/20 transition"
            />
          </div>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as ConstructionJobStatus | 'all')}
            className="text-sm bg-white border border-[#D8D5D0] rounded-lg px-3 py-2 focus:outline-none focus:border-[#ED202B]"
          >
            <option value="all">All statuses</option>
            {ALL_CONSTRUCTION_JOB_STATUSES.map((s) => (
              <option key={s} value={s}>{CONSTRUCTION_JOB_STATUS_LABELS[s]}</option>
            ))}
          </select>
        </div>

        {/* Empty / Loading / List */}
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="h-8 w-8 animate-spin rounded-full border-[3px] border-[#D8D5D0] border-t-[#ED202B]" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="bg-white rounded-xl border border-dashed border-[#D8D5D0] py-12 text-center">
            <p className="text-sm text-[#7A756E]">
              {visibleJobs.length === 0
                ? 'No construction jobs yet. Click '
                : 'No jobs match your filters. Try clearing them.'}
              {visibleJobs.length === 0 && (
                <button
                  onClick={() => navigate('/construction-tracker/new')}
                  className="font-medium text-[#ED202B] hover:underline"
                >
                  New job
                </button>
              )}
              {visibleJobs.length === 0 && ' to add the first one.'}
            </p>
          </div>
        ) : (
          <ul className="space-y-3">
            {filtered.map((j) => {
              const primary = companyById.get(headlineCompanyId(j) ?? '');
              const pm = userById.get(j.projectManagerId);
              const range = formatDateRange(j.startDate, j.expectedEndDate);
              return (
                <li key={j.id}>
                  <button
                    onClick={() => navigate(`/construction-tracker/${j.id}`)}
                    className="group w-full text-left bg-white rounded-xl border border-[#D8D5D0] shadow-sm p-4 hover:shadow-md hover:border-[#ED202B]/30 transition"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-2 mb-1">
                      <h3 className="font-heading font-semibold text-[#201F1E] group-hover:text-[#ED202B] transition">
                        {j.name}
                      </h3>
                      <JobStatusBadge status={j.status} />
                    </div>
                    <div className="text-xs text-[#7A756E]">
                      {primary?.name ?? 'No company linked'}
                      {pm && <> · PM {pm.email}</>}
                      {(j.workerIds?.length ?? 0) > 0 && <> · {j.workerIds.length} worker{j.workerIds.length === 1 ? '' : 's'}</>}
                    </div>
                    {range && <div className="text-xs text-[#7A756E] mt-0.5">{range}</div>}
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
