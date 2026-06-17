import { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import Layout from '../components/Layout';
import Button from '../components/ui/Button';
import { useLeadPipelineJob } from '../hooks/useLeadPipeline';
import { useUsers, userLabel, type UserRecord } from '../hooks/useUsers';
import {
  approveApollo,
  approvePerplexity,
  promoteCompanies,
  estimateCost,
  APOLLO_COST_PER_COMPANY,
  PERPLEXITY_COST_PER_COMPANY,
  JOB_STATUS_CONFIG,
  STAGE_LABELS,
  TIER_CONFIG,
} from '../lib/leadPipeline';
import type { LeadPipelineCompany, LeadPipelineJob, LeadPipelineStage, LeadTier } from '../types';

/** Stages we surface as progress steps, in pipeline order. */
const PROGRESS_STAGES: LeadPipelineStage[] = [
  'ingested',
  'perplexity_done',
  'apollo_done',
  'promoted',
];
const DROPPED_STAGES: LeadPipelineStage[] = ['dropped_perplexity', 'dropped_apollo'];

function Spinner() {
  return (
    <svg className="h-4 w-4 animate-spin text-[#ED202B]" viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.4 0 0 5.4 0 12h4z"
      />
    </svg>
  );
}

function TierPill({ tier }: { tier?: LeadTier }) {
  if (!tier) return <span className="text-[#7A756E]">—</span>;
  const cfg = TIER_CONFIG[tier];
  return (
    <span
      className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold"
      style={{ backgroundColor: cfg.color + '18', color: cfg.color }}
    >
      {cfg.label}
    </span>
  );
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

export default function LeadBuilderRun() {
  const { jobId } = useParams<{ jobId: string }>();
  const navigate = useNavigate();
  const { job, companies, loading } = useLeadPipelineJob(jobId);
  const { users } = useUsers();

  const [approving, setApproving] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  // Review-state selection + promote
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [repId, setRepId] = useState('');
  const [promoting, setPromoting] = useState(false);
  const [promotedCount, setPromotedCount] = useState<number | null>(null);

  // Live company counts per stage.
  const stageCounts = useMemo(() => {
    const counts: Partial<Record<LeadPipelineStage, number>> = {};
    for (const c of companies) counts[c.stage] = (counts[c.stage] ?? 0) + 1;
    return counts;
  }, [companies]);

  const ingestedCount = job?.counts?.ingested ?? companies.length;
  const apolloDoneCompanies = useMemo(
    () => companies.filter((c) => c.stage === 'apollo_done'),
    [companies],
  );

  const handleApprovePerplexity = async () => {
    if (!jobId) return;
    setApproving(true);
    setActionError(null);
    try {
      await approvePerplexity(jobId);
    } catch {
      setActionError('Could not approve. Try again.');
    } finally {
      setApproving(false);
    }
  };

  const handleApproveApollo = async () => {
    if (!jobId) return;
    setApproving(true);
    setActionError(null);
    try {
      await approveApollo(jobId);
    } catch {
      setActionError('Could not approve. Try again.');
    } finally {
      setApproving(false);
    }
  };

  const toggleSelected = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    setSelectedIds((prev) =>
      prev.size === apolloDoneCompanies.length
        ? new Set()
        : new Set(apolloDoneCompanies.map((c) => c.id)),
    );
  };

  const handlePromote = async () => {
    const rep = users.find((u) => u.id === repId);
    const selected = apolloDoneCompanies.filter((c) => selectedIds.has(c.id));
    if (!rep || selected.length === 0) return;
    setPromoting(true);
    setActionError(null);
    try {
      const ids = await promoteCompanies(selected, rep);
      setPromotedCount(ids.length);
      setSelectedIds(new Set());
    } catch {
      setActionError('Promote failed. Some companies may not have been promoted.');
    } finally {
      setPromoting(false);
    }
  };

  if (loading) {
    return (
      <Layout>
        <div className="flex items-center justify-center py-32">
          <div className="h-8 w-8 animate-spin rounded-full border-[3px] border-[#D8D5D0] border-t-[#ED202B]" />
        </div>
      </Layout>
    );
  }

  if (!job) {
    return (
      <Layout>
        <main className="py-2">
          <div className="bg-white rounded-xl border border-[#D8D5D0] p-10 text-center">
            <p className="text-sm text-[#7A756E] mb-4">This build no longer exists.</p>
            <Button onClick={() => navigate('/lead-builder')}>Back to Lead Builder</Button>
          </div>
        </main>
      </Layout>
    );
  }

  return (
    <Layout>
      <main className="py-2">
        {/* Header */}
        <button
          onClick={() => navigate('/lead-builder')}
          className="text-sm text-[#7A756E] hover:text-[#ED202B] transition mb-3 inline-flex items-center gap-1"
        >
          <svg
            className="h-4 w-4"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
          All builds
        </button>
        <div className="flex flex-wrap items-center gap-3 mb-5">
          <h1 className="font-heading text-2xl font-semibold text-[#201F1E]">
            {job.county}, {job.state}
          </h1>
          <StatusBadge status={job.status} />
        </div>

        {/* Stage progress */}
        <div className="bg-white rounded-xl shadow-sm border border-[#D8D5D0] p-5 mb-6">
          <h2 className="font-heading text-base font-semibold text-[#201F1E] mb-4">Progress</h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {PROGRESS_STAGES.map((stage) => (
              <div key={stage} className="rounded-lg bg-stone-50 border border-[#D8D5D0] p-3">
                <div className="text-2xl font-semibold text-[#201F1E] tabular-nums">
                  {stageCounts[stage] ?? 0}
                </div>
                <div className="text-xs text-[#7A756E] mt-0.5">{STAGE_LABELS[stage]}</div>
              </div>
            ))}
          </div>
          {/* Dropped counts */}
          {DROPPED_STAGES.some((s) => (stageCounts[s] ?? 0) > 0) && (
            <div className="flex flex-wrap gap-4 mt-4 pt-4 border-t border-[#D8D5D0]">
              {DROPPED_STAGES.map((stage) =>
                (stageCounts[stage] ?? 0) > 0 ? (
                  <span key={stage} className="text-xs text-[#7A756E]">
                    {STAGE_LABELS[stage]}:{' '}
                    <span className="font-medium text-[#201F1E]">{stageCounts[stage]}</span>
                  </span>
                ) : null,
              )}
            </div>
          )}
        </div>

        {/* Error surfaced from the backend */}
        {job.status === 'error' && (
          <div className="bg-white rounded-xl shadow-sm border border-[#EF4444]/40 p-5 mb-6">
            <h2 className="font-heading text-base font-semibold text-[#EF4444] mb-1">
              Pipeline error
            </h2>
            <p className="text-sm text-[#7A756E]">
              {(job as { error?: string }).error ||
                'The pipeline hit an error. Check the backend logs.'}
            </p>
          </div>
        )}

        {actionError && (
          <div className="bg-white rounded-xl shadow-sm border border-[#EF4444]/40 p-4 mb-6">
            <p className="text-sm text-[#EF4444]">{actionError}</p>
          </div>
        )}

        {/* State-driven controls */}
        {job.status === 'ingesting' && (
          <ProcessingCard label="Ingesting the county tax roll — companies will appear shortly." />
        )}

        {job.status === 'awaiting_perplexity_approval' && (
          <ApprovalCard
            title="Approve Perplexity enrichment"
            count={ingestedCount}
            costLabel={estimateCost(ingestedCount, PERPLEXITY_COST_PER_COMPANY)}
            perCompany={PERPLEXITY_COST_PER_COMPANY}
            note="Resolves the operating company, website, industry, and energy intensity for each ingested company."
            busy={approving}
            onApprove={handleApprovePerplexity}
          />
        )}

        {job.status === 'enriching_perplexity' && (
          <ProcessingCard label="Enriching with Perplexity — this runs on a schedule, check back shortly." />
        )}

        {job.status === 'awaiting_apollo_approval' && (
          <ApprovalCard
            title="Approve Apollo enrichment"
            count={stageCounts.perplexity_done ?? 0}
            costLabel={estimateCost(stageCounts.perplexity_done ?? 0, APOLLO_COST_PER_COMPANY)}
            perCompany={APOLLO_COST_PER_COMPANY}
            note="Pulls the decision-maker's name, title, and email. Mobile numbers are grabbed on-demand later from the lead, not here."
            busy={approving}
            onApprove={handleApproveApollo}
          />
        )}

        {job.status === 'enriching_apollo' && (
          <ProcessingCard label="Enriching with Apollo — this runs on a schedule, check back shortly." />
        )}

        {job.status === 'review' && (
          <ReviewPanel
            companies={apolloDoneCompanies}
            users={users}
            selectedIds={selectedIds}
            onToggle={toggleSelected}
            onToggleAll={toggleSelectAll}
            repId={repId}
            onRepChange={setRepId}
            promoting={promoting}
            promotedCount={promotedCount}
            onPromote={handlePromote}
          />
        )}

        {job.status === 'done' && (
          <div className="bg-white rounded-xl shadow-sm border border-[#D8D5D0] p-5">
            <h2 className="font-heading text-base font-semibold text-[#201F1E] mb-2">
              Build complete
            </h2>
            <p className="text-sm text-[#7A756E] mb-4">
              <span className="font-medium text-[#201F1E]">{stageCounts.promoted ?? 0}</span>{' '}
              {(stageCounts.promoted ?? 0) === 1 ? 'company' : 'companies'} promoted into Leads from
              this build.
            </p>
            <Button onClick={() => navigate('/sales-crm')}>Open Leads</Button>
          </div>
        )}
      </main>
    </Layout>
  );
}

function ProcessingCard({ label }: { label: string }) {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-[#D8D5D0] p-5 flex items-center gap-3">
      <Spinner />
      <p className="text-sm text-[#201F1E]">{label}</p>
    </div>
  );
}

function ApprovalCard({
  title,
  count,
  costLabel,
  perCompany,
  note,
  busy,
  onApprove,
}: {
  title: string;
  count: number;
  costLabel: string;
  perCompany: number;
  note: string;
  busy: boolean;
  onApprove: () => void;
}) {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-[#D8D5D0] p-5">
      <h2 className="font-heading text-base font-semibold text-[#201F1E] mb-1">{title}</h2>
      <p className="text-sm text-[#7A756E] mb-4">{note}</p>
      <div className="flex flex-wrap items-center gap-4 mb-4">
        <div className="rounded-lg bg-stone-50 border border-[#D8D5D0] px-4 py-2.5">
          <div className="text-xl font-semibold text-[#201F1E] tabular-nums">{count}</div>
          <div className="text-xs text-[#7A756E]">companies</div>
        </div>
        <div className="rounded-lg bg-stone-50 border border-[#D8D5D0] px-4 py-2.5">
          <div className="text-xl font-semibold text-[#201F1E] tabular-nums">{costLabel}</div>
          <div className="text-xs text-[#7A756E]">est. cost (${perCompany.toFixed(2)}/co.)</div>
        </div>
      </div>
      <Button onClick={onApprove} disabled={busy || count === 0}>
        {busy ? 'Approving…' : `Approve — ${costLabel}`}
      </Button>
    </div>
  );
}

function ReviewPanel({
  companies,
  users,
  selectedIds,
  onToggle,
  onToggleAll,
  repId,
  onRepChange,
  promoting,
  promotedCount,
  onPromote,
}: {
  companies: LeadPipelineCompany[];
  users: UserRecord[];
  selectedIds: Set<string>;
  onToggle: (id: string) => void;
  onToggleAll: () => void;
  repId: string;
  onRepChange: (id: string) => void;
  promoting: boolean;
  promotedCount: number | null;
  onPromote: () => void;
}) {
  const allSelected = companies.length > 0 && selectedIds.size === companies.length;
  const canPromote = selectedIds.size > 0 && !!repId && !promoting;

  return (
    <div className="bg-white rounded-xl shadow-sm border border-[#D8D5D0] overflow-hidden">
      <div className="px-5 py-4 border-b border-[#D8D5D0]">
        <h2 className="font-heading text-base font-semibold text-[#201F1E]">
          Review &amp; promote
        </h2>
        <p className="text-sm text-[#7A756E] mt-0.5">
          {companies.length} enriched {companies.length === 1 ? 'company' : 'companies'} ready.
          Select the ones to promote, pick a rep, then assign.
        </p>
        {promotedCount !== null && (
          <p className="text-sm text-emerald-600 mt-2">
            Promoted {promotedCount} {promotedCount === 1 ? 'company' : 'companies'} into Leads.
          </p>
        )}
      </div>

      {companies.length === 0 ? (
        <div className="p-8 text-center text-sm text-[#7A756E]">
          No enriched companies left to promote.
        </div>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[#D8D5D0] bg-stone-50/50">
                  <th className="text-left px-4 py-3 w-10">
                    <input
                      type="checkbox"
                      checked={allSelected}
                      onChange={onToggleAll}
                      className="h-4 w-4 rounded border-[#D8D5D0] text-[#ED202B] focus:ring-[#ED202B]/30"
                    />
                  </th>
                  <th className="text-left px-4 py-3 font-medium text-[#7A756E]">Company</th>
                  <th className="text-left px-4 py-3 font-medium text-[#7A756E]">Decision maker</th>
                  <th className="text-left px-4 py-3 font-medium text-[#7A756E]">Title</th>
                  <th className="text-left px-4 py-3 font-medium text-[#7A756E]">Email</th>
                  <th className="text-left px-4 py-3 font-medium text-[#7A756E]">Website</th>
                  <th className="text-left px-4 py-3 font-medium text-[#7A756E]">Tier</th>
                </tr>
              </thead>
              <tbody>
                {companies.map((c) => {
                  const checked = selectedIds.has(c.id);
                  return (
                    <tr
                      key={c.id}
                      onClick={() => onToggle(c.id)}
                      className={`border-b border-[#D8D5D0]/50 cursor-pointer transition ${
                        checked ? 'bg-[#ED202B]/5' : 'hover:bg-stone-50'
                      }`}
                    >
                      <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => onToggle(c.id)}
                          className="h-4 w-4 rounded border-[#D8D5D0] text-[#ED202B] focus:ring-[#ED202B]/30"
                        />
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-medium text-[#201F1E]">
                          {c.operatingCompany || c.taxOwner || 'Unknown'}
                        </div>
                        {c.operatingCompany && c.taxOwner && c.operatingCompany !== c.taxOwner && (
                          <div className="text-xs text-[#7A756E] mt-0.5">Owner: {c.taxOwner}</div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-[#201F1E]">{c.decisionMaker || '—'}</td>
                      <td className="px-4 py-3 text-[#7A756E]">{c.decisionMakerTitle || '—'}</td>
                      <td className="px-4 py-3 text-[#201F1E] max-w-[200px] truncate">
                        {c.email || '—'}
                      </td>
                      <td className="px-4 py-3 max-w-[180px] truncate">
                        {c.website ? (
                          <a
                            href={c.website.startsWith('http') ? c.website : `https://${c.website}`}
                            target="_blank"
                            rel="noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className="text-[#ED202B] hover:underline"
                          >
                            {c.website}
                          </a>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <TierPill tier={c.tier} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Promote action bar */}
          <div className="px-5 py-4 border-t border-[#D8D5D0] flex flex-wrap items-center gap-3">
            <span className="text-sm text-[#7A756E]">{selectedIds.size} selected</span>
            <select
              value={repId}
              onChange={(e) => onRepChange(e.target.value)}
              className="text-sm border border-[#D8D5D0] rounded-lg px-3 py-2 bg-white outline-none transition focus:border-[#ED202B] focus:ring-2 focus:ring-[#ED202B]/20"
            >
              <option value="">Assign to rep…</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {userLabel(u)}
                </option>
              ))}
            </select>
            <Button onClick={onPromote} disabled={!canPromote}>
              {promoting ? 'Promoting…' : 'Promote + assign'}
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
