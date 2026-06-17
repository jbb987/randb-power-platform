import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Layout from '../components/Layout';
import Button from '../components/ui/Button';
import { useAuth } from '../hooks/useAuth';
import { useLeadPipelineJobs } from '../hooks/useLeadPipeline';
import { createPipelineJob, JOB_STATUS_CONFIG, SCOPE_OPTIONS } from '../lib/leadPipeline';
import type { LeadPipelineJob } from '../types';

function formatDate(ts?: number): string {
  if (!ts) return '—';
  return new Date(ts).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function StatusBadge({ status }: { status: LeadPipelineJob['status'] }) {
  const cfg = JOB_STATUS_CONFIG[status];
  return (
    <span
      className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium"
      style={{ backgroundColor: cfg.color + '18', color: cfg.color }}
    >
      {cfg.label}
    </span>
  );
}

/** Sum the company counts a job carries, for a compact "N companies" label. */
function totalCompanies(job: LeadPipelineJob): number {
  return job.counts?.ingested ?? 0;
}

export default function LeadBuilderIndex() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { jobs, loading } = useLeadPipelineJobs();

  const [county, setCounty] = useState('');
  const [stateCode, setStateCode] = useState('NY');
  const [scope, setScope] = useState(SCOPE_OPTIONS[0].value);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmit = county.trim().length > 0 && !!user && !submitting;

  const sortedJobs = useMemo(() => jobs, [jobs]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit || !user) return;
    setSubmitting(true);
    setError(null);
    try {
      const id = await createPipelineJob({
        county: county.trim(),
        state: stateCode.trim().toUpperCase(),
        scope,
        requestedBy: user.uid,
      });
      navigate(`/lead-builder/${id}`);
    } catch {
      setError('Could not start the build. Try again.');
      setSubmitting(false);
    }
  };

  return (
    <Layout>
      <main className="py-2">
        {/* Header */}
        <div className="mb-5">
          <h1 className="font-heading text-2xl font-semibold text-[#201F1E]">Lead Builder</h1>
        </div>

        {/* New build form */}
        <form
          onSubmit={handleSubmit}
          className="bg-white rounded-xl shadow-sm border border-[#D8D5D0] p-5 mb-6"
        >
          <h2 className="font-heading text-base font-semibold text-[#201F1E] mb-4">New build</h2>
          <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto_1fr_auto] gap-4 items-end">
            <div>
              <label className="block text-xs font-medium text-[#7A756E] mb-1">County</label>
              <input
                type="text"
                value={county}
                onChange={(e) => setCounty(e.target.value)}
                placeholder="e.g. Niagara"
                className="w-full text-sm border border-[#D8D5D0] rounded-lg px-3 py-2 bg-white outline-none transition focus:border-[#ED202B] focus:ring-2 focus:ring-[#ED202B]/20 placeholder:text-[#7A756E]"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-[#7A756E] mb-1">State</label>
              <input
                type="text"
                value={stateCode}
                onChange={(e) => setStateCode(e.target.value)}
                maxLength={2}
                className="w-20 text-sm border border-[#D8D5D0] rounded-lg px-3 py-2 bg-white outline-none transition focus:border-[#ED202B] focus:ring-2 focus:ring-[#ED202B]/20 uppercase"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-[#7A756E] mb-1">Scope</label>
              <select
                value={scope}
                onChange={(e) => setScope(e.target.value)}
                className="w-full text-sm border border-[#D8D5D0] rounded-lg px-3 py-2 bg-white outline-none transition focus:border-[#ED202B] focus:ring-2 focus:ring-[#ED202B]/20"
              >
                {SCOPE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
            <Button type="submit" disabled={!canSubmit}>
              {submitting ? 'Starting…' : 'Start build'}
            </Button>
          </div>
          {error && <p className="text-xs text-[#EF4444] mt-3">{error}</p>}
        </form>

        {/* Jobs list */}
        <h2 className="font-heading text-base font-semibold text-[#201F1E] mb-3">Builds</h2>
        {loading ? (
          <div className="bg-white rounded-xl border border-[#D8D5D0] p-8 text-center text-sm text-[#7A756E]">
            Loading…
          </div>
        ) : sortedJobs.length === 0 ? (
          <div className="bg-white rounded-xl border border-[#D8D5D0] p-10 text-center">
            <p className="text-sm text-[#7A756E]">No builds yet.</p>
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-[#D8D5D0] overflow-hidden">
            <table className="w-full">
              <thead className="bg-stone-50 border-b border-[#D8D5D0]">
                <tr>
                  <th className="text-left px-4 py-2.5 text-xs font-semibold text-[#7A756E] uppercase tracking-wide">
                    County
                  </th>
                  <th className="text-left px-4 py-2.5 text-xs font-semibold text-[#7A756E] uppercase tracking-wide">
                    Status
                  </th>
                  <th className="text-right px-4 py-2.5 text-xs font-semibold text-[#7A756E] uppercase tracking-wide w-32">
                    Companies
                  </th>
                  <th className="text-right px-4 py-2.5 text-xs font-semibold text-[#7A756E] uppercase tracking-wide w-36">
                    Created
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#D8D5D0]">
                {sortedJobs.map((job) => (
                  <tr
                    key={job.id}
                    onClick={() => navigate(`/lead-builder/${job.id}`)}
                    className="cursor-pointer hover:bg-stone-50 transition group"
                  >
                    <td className="px-4 py-3 text-sm font-medium text-[#201F1E] group-hover:text-[#ED202B] transition-colors">
                      {job.county}, {job.state}
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={job.status} />
                    </td>
                    <td className="px-4 py-3 text-sm text-[#201F1E] text-right tabular-nums">
                      {totalCompanies(job) > 0 ? totalCompanies(job) : '—'}
                    </td>
                    <td className="px-4 py-3 text-sm text-[#7A756E] text-right">
                      {formatDate(job.createdAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </Layout>
  );
}
