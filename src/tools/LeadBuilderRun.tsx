import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import Layout from '../components/Layout';
import Button from '../components/ui/Button';
import { useLeadPipelineJob } from '../hooks/useLeadPipeline';
import { useUsers, userLabel, type UserRecord } from '../hooks/useUsers';
import {
  approveApollo,
  approvePerplexity,
  promoteCompanies,
  rerunPipelineJob,
  updateCompanyFields,
  companyReason,
  droppedStep,
  estimateCost,
  APOLLO_COST_PER_COMPANY,
  PERPLEXITY_COST_PER_COMPANY,
  JOB_STATUS_CONFIG,
  TIER_CONFIG,
  type EditableCompanyFields,
} from '../lib/leadPipeline';
import type { LeadPipelineCompany, LeadPipelineJob, LeadPipelineStage, LeadTier } from '../types';

// Companies advance ~CHUNK per scheduled minute (see processor.ts) — used for
// the rough ETA on the live progress bar.
const PER_MINUTE = 20;

// ── Audit tabs ──────────────────────────────────────────────────────────────
type TabKey = 'ready' | 'needs_review' | 'dropped' | 'promoted';

const TAB_ORDER: { key: TabKey; label: string }[] = [
  { key: 'ready', label: 'Qualified' },
  { key: 'needs_review', label: 'Needs review' },
  { key: 'dropped', label: 'Dropped' },
  { key: 'promoted', label: 'Promoted' },
];

/** One-line explainer per tab so the meaning is obvious at a glance. */
const TAB_CAPTIONS: Record<TabKey, string> = {
  ready: 'Decision-maker + verified email found — select and promote to a rep.',
  needs_review:
    'Real companies the pipeline couldn’t auto-qualify (usually no website). Repair, promote phone-first, or ignore.',
  dropped: 'Filtered out — each row shows the step and the reason.',
  promoted: 'Already promoted into Leads and assigned to a rep.',
};

/** Which audit tab a company's stage belongs to (null = still in flight). */
function tabForStage(stage: LeadPipelineStage): TabKey | null {
  switch (stage) {
    case 'apollo_done':
      return 'ready';
    case 'needs_review':
      return 'needs_review';
    case 'dropped_perplexity':
    case 'dropped_apollo':
      return 'dropped';
    case 'promoted':
      return 'promoted';
    default:
      return null;
  }
}

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
  const [rerunConfirm, setRerunConfirm] = useState(false);
  const [rerunning, setRerunning] = useState(false);

  // Audit view: active tab, selection, rep, promote + edit state.
  const [activeTab, setActiveTab] = useState<TabKey>('ready');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [repId, setRepId] = useState('');
  const [promoting, setPromoting] = useState(false);
  const [promotedCount, setPromotedCount] = useState<number | null>(null);
  const [editing, setEditing] = useState<LeadPipelineCompany | null>(null);

  // Live company counts per stage.
  const stageCounts = useMemo(() => {
    const counts: Partial<Record<LeadPipelineStage, number>> = {};
    for (const c of companies) counts[c.stage] = (counts[c.stage] ?? 0) + 1;
    return counts;
  }, [companies]);

  const ingestedCount = job?.counts?.ingested ?? companies.length;

  // Live enrichment progress (only while a stage is actively running). Counts
  // come from the live company list, so this updates in real time. ETA is a
  // rough estimate — the processor runs on a fixed schedule and per-company
  // API latency varies — so it's labelled as such.
  const enrichProgress = useMemo(() => {
    const c = stageCounts;
    if (job?.status === 'enriching_perplexity') {
      const total = companies.length;
      const remaining = c.ingested ?? 0;
      return { label: 'Enriching with Perplexity', done: total - remaining, total, remaining };
    }
    if (job?.status === 'enriching_apollo') {
      const total = (c.perplexity_done ?? 0) + (c.apollo_done ?? 0) + (c.dropped_apollo ?? 0);
      const remaining = c.perplexity_done ?? 0;
      return { label: 'Enriching with Apollo', done: total - remaining, total, remaining };
    }
    return null;
  }, [job?.status, stageCounts, companies.length]);

  // Companies grouped by audit tab.
  const buckets = useMemo(() => {
    const b: Record<TabKey, LeadPipelineCompany[]> = {
      ready: [],
      needs_review: [],
      dropped: [],
      promoted: [],
    };
    for (const c of companies) {
      const t = tabForStage(c.stage);
      if (t) b[t].push(c);
    }
    return b;
  }, [companies]);

  const tabCompanies = buckets[activeTab];
  // Selection resets whenever the tab changes so the promote bar only ever acts
  // on rows the user can currently see.
  useEffect(() => setSelectedIds(new Set()), [activeTab]);

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
      prev.size === tabCompanies.length ? new Set() : new Set(tabCompanies.map((c) => c.id)),
    );
  };

  const handlePromote = async () => {
    const rep = users.find((u) => u.id === repId);
    const selected = companies.filter((c) => selectedIds.has(c.id));
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

  const handleSaveEdit = async (id: string, fields: EditableCompanyFields) => {
    await updateCompanyFields(id, fields);
    setEditing(null);
  };

  const handleRerun = async () => {
    if (!jobId) return;
    setRerunning(true);
    setActionError(null);
    try {
      await rerunPipelineJob(jobId);
      setRerunConfirm(false);
      setSelectedIds(new Set());
      setPromotedCount(null);
    } catch {
      setActionError('Could not re-run. Try again.');
    } finally {
      setRerunning(false);
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

  const showAudit = job.status === 'review' || job.status === 'done';

  return (
    <Layout>
      <main className="py-2">
        {/* Header */}
        <div className="flex flex-wrap items-center gap-3 mb-5">
          <h1 className="font-heading text-2xl font-semibold text-[#201F1E]">
            {job.county}, {job.state}
          </h1>
          <StatusBadge status={job.status} />
          {['review', 'done', 'error'].includes(job.status) &&
            (rerunConfirm ? (
              <span className="ml-auto flex items-center gap-2 text-sm">
                <span className="text-[#7A756E]">Rebuild from scratch and replace results?</span>
                <Button onClick={handleRerun} disabled={rerunning}>
                  {rerunning ? 'Starting…' : 'Re-run'}
                </Button>
                <button
                  onClick={() => setRerunConfirm(false)}
                  className="text-[#7A756E] hover:text-[#ED202B] transition font-medium"
                >
                  Cancel
                </button>
              </span>
            ) : (
              <button
                onClick={() => setRerunConfirm(true)}
                className="ml-auto text-sm text-[#7A756E] hover:text-[#ED202B] transition font-medium"
              >
                Re-run
              </button>
            ))}
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
        {job.status === 'ingesting' && <ProcessingCard label="Ingesting the county tax roll…" />}

        {job.status === 'awaiting_perplexity_approval' && (
          <ApprovalCard
            title="Approve Perplexity enrichment"
            count={ingestedCount}
            costLabel={estimateCost(ingestedCount, PERPLEXITY_COST_PER_COMPANY)}
            perCompany={PERPLEXITY_COST_PER_COMPANY}
            note="Operating company, website, industry, energy intensity."
            busy={approving}
            onApprove={handleApprovePerplexity}
          />
        )}

        {job.status === 'awaiting_apollo_approval' && (
          <ApprovalCard
            title="Approve Apollo enrichment"
            count={stageCounts.perplexity_done ?? 0}
            costLabel={estimateCost(stageCounts.perplexity_done ?? 0, APOLLO_COST_PER_COMPANY)}
            perCompany={APOLLO_COST_PER_COMPANY}
            note="Decision-maker name, title, and email."
            busy={approving}
            onApprove={handleApproveApollo}
          />
        )}

        {enrichProgress && (
          <ProgressCard
            label={enrichProgress.label}
            done={enrichProgress.done}
            total={enrichProgress.total}
            remaining={enrichProgress.remaining}
          />
        )}

        {showAudit && (
          <AuditPanel
            buckets={buckets}
            activeTab={activeTab}
            onTabChange={setActiveTab}
            tabCompanies={tabCompanies}
            users={users}
            selectedIds={selectedIds}
            onToggle={toggleSelected}
            onToggleAll={toggleSelectAll}
            repId={repId}
            onRepChange={setRepId}
            promoting={promoting}
            promotedCount={promotedCount}
            onPromote={handlePromote}
            onEdit={setEditing}
            done={job.status === 'done'}
            promotedTotal={stageCounts.promoted ?? 0}
          />
        )}
      </main>

      {editing && (
        <EditCompanyModal
          company={editing}
          onClose={() => setEditing(null)}
          onSave={handleSaveEdit}
        />
      )}
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

function ProgressCard({
  label,
  done,
  total,
  remaining,
}: {
  label: string;
  done: number;
  total: number;
  remaining: number;
}) {
  const pct = total > 0 ? Math.min(100, Math.round((done / total) * 100)) : 0;
  const etaMin = remaining > 0 ? Math.ceil(remaining / PER_MINUTE) : 0;
  return (
    <div className="bg-white rounded-xl shadow-sm border border-[#D8D5D0] p-5">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <Spinner />
          <span className="text-sm font-medium text-[#201F1E]">{label}</span>
        </div>
        <span className="text-sm font-semibold text-[#201F1E] tabular-nums">{pct}%</span>
      </div>
      <div className="h-2 rounded-full bg-stone-100 overflow-hidden">
        <div
          className="h-full bg-[#ED202B] transition-all duration-500"
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className="text-xs text-[#7A756E] mt-2 tabular-nums">
        {done} / {total} companies
        {etaMin > 0 ? ` · ~${etaMin} min left (est.)` : ' · finishing up…'}
      </div>
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

function AuditPanel({
  buckets,
  activeTab,
  onTabChange,
  tabCompanies,
  users,
  selectedIds,
  onToggle,
  onToggleAll,
  repId,
  onRepChange,
  promoting,
  promotedCount,
  onPromote,
  onEdit,
  done,
  promotedTotal,
}: {
  buckets: Record<TabKey, LeadPipelineCompany[]>;
  activeTab: TabKey;
  onTabChange: (t: TabKey) => void;
  tabCompanies: LeadPipelineCompany[];
  users: UserRecord[];
  selectedIds: Set<string>;
  onToggle: (id: string) => void;
  onToggleAll: () => void;
  repId: string;
  onRepChange: (id: string) => void;
  promoting: boolean;
  promotedCount: number | null;
  onPromote: () => void;
  onEdit: (c: LeadPipelineCompany) => void;
  done: boolean;
  promotedTotal: number;
}) {
  const isPromotedTab = activeTab === 'promoted';
  const selectable = !isPromotedTab;
  const allSelected = tabCompanies.length > 0 && selectedIds.size === tabCompanies.length;
  const canPromote = selectedIds.size > 0 && !!repId && !promoting;

  return (
    <div className="bg-white rounded-xl shadow-sm border border-[#D8D5D0] overflow-hidden">
      {done && (
        <div className="px-5 py-3 bg-emerald-50 border-b border-emerald-200 text-sm text-emerald-700">
          Build complete — {promotedTotal} {promotedTotal === 1 ? 'company' : 'companies'} promoted.
          You can still pick up anything left in Needs review or Dropped.
        </div>
      )}

      {/* Tabs */}
      <div className="flex flex-wrap gap-1 px-3 pt-3 border-b border-[#D8D5D0]">
        {TAB_ORDER.map(({ key, label }) => {
          const count = buckets[key].length;
          const active = key === activeTab;
          return (
            <button
              key={key}
              onClick={() => onTabChange(key)}
              className={`px-3 py-2 text-sm font-medium rounded-t-lg transition border-b-2 -mb-px ${
                active
                  ? 'border-[#ED202B] text-[#ED202B]'
                  : 'border-transparent text-[#7A756E] hover:text-[#201F1E]'
              }`}
            >
              {label}
              <span
                className={`ml-1.5 text-xs tabular-nums ${active ? 'text-[#ED202B]' : 'text-[#7A756E]'}`}
              >
                {count}
              </span>
            </button>
          );
        })}
      </div>

      <p className="px-5 py-2.5 text-xs text-[#7A756E] border-b border-[#D8D5D0] bg-stone-50/40">
        {TAB_CAPTIONS[activeTab]}
      </p>

      {tabCompanies.length === 0 ? (
        <div className="p-8 text-center text-sm text-[#7A756E]">Nothing here.</div>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[#D8D5D0] bg-stone-50/50">
                  {selectable && (
                    <th className="text-left px-4 py-3 w-10">
                      <input
                        type="checkbox"
                        checked={allSelected}
                        onChange={onToggleAll}
                        className="h-4 w-4 rounded border-[#D8D5D0] text-[#ED202B] focus:ring-[#ED202B]/30"
                      />
                    </th>
                  )}
                  <th className="text-left px-4 py-3 font-medium text-[#7A756E]">Company</th>
                  <th className="text-left px-4 py-3 font-medium text-[#7A756E]">Reason</th>
                  <th className="text-left px-4 py-3 font-medium text-[#7A756E]">Decision maker</th>
                  <th className="text-left px-4 py-3 font-medium text-[#7A756E]">Email</th>
                  <th className="text-left px-4 py-3 font-medium text-[#7A756E]">Tier</th>
                  {selectable && <th className="px-4 py-3 w-16" />}
                </tr>
              </thead>
              <tbody>
                {tabCompanies.map((c) => {
                  const checked = selectedIds.has(c.id);
                  return (
                    <tr
                      key={c.id}
                      onClick={() => selectable && onToggle(c.id)}
                      className={`border-b border-[#D8D5D0]/50 transition ${
                        selectable ? 'cursor-pointer' : ''
                      } ${checked ? 'bg-[#ED202B]/5' : 'hover:bg-stone-50'}`}
                    >
                      {selectable && (
                        <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => onToggle(c.id)}
                            className="h-4 w-4 rounded border-[#D8D5D0] text-[#ED202B] focus:ring-[#ED202B]/30"
                          />
                        </td>
                      )}
                      <td className="px-4 py-3">
                        <div className="font-medium text-[#201F1E]">
                          {c.operatingCompany || c.taxOwner || 'Unknown'}
                        </div>
                        {c.operatingCompany && c.taxOwner && c.operatingCompany !== c.taxOwner && (
                          <div className="text-xs text-[#7A756E] mt-0.5">Owner: {c.taxOwner}</div>
                        )}
                        {c.website && (
                          <a
                            href={c.website.startsWith('http') ? c.website : `https://${c.website}`}
                            target="_blank"
                            rel="noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className="text-xs text-[#ED202B] hover:underline"
                          >
                            {c.website}
                          </a>
                        )}
                      </td>
                      <td className="px-4 py-3 text-[#7A756E] max-w-[280px]">
                        {droppedStep(c.stage) && (
                          <span className="inline-flex items-center px-1.5 py-0.5 mr-1.5 rounded text-[10px] font-semibold uppercase tracking-wide bg-stone-100 text-[#7A756E]">
                            {droppedStep(c.stage)}
                          </span>
                        )}
                        {companyReason(c)}
                      </td>
                      <td className="px-4 py-3 text-[#201F1E]">
                        {c.decisionMaker || '—'}
                        {c.decisionMakerTitle && (
                          <div className="text-xs text-[#7A756E]">{c.decisionMakerTitle}</div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-[#201F1E] max-w-[200px] truncate">
                        {c.email || '—'}
                      </td>
                      <td className="px-4 py-3">
                        <TierPill tier={c.tier} />
                      </td>
                      {selectable && (
                        <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                          <button
                            onClick={() => onEdit(c)}
                            className="text-xs text-[#7A756E] hover:text-[#ED202B] transition"
                          >
                            Edit
                          </button>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Promote action bar (hidden on the read-only Promoted tab) */}
          {selectable && (
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
              {promotedCount !== null && (
                <span className="text-sm text-emerald-600">
                  Promoted {promotedCount} {promotedCount === 1 ? 'company' : 'companies'}.
                </span>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function EditCompanyModal({
  company,
  onClose,
  onSave,
}: {
  company: LeadPipelineCompany;
  onClose: () => void;
  onSave: (id: string, fields: EditableCompanyFields) => Promise<void>;
}) {
  const [fields, setFields] = useState<EditableCompanyFields>({
    operatingCompany: company.operatingCompany ?? '',
    website: company.website ?? '',
    decisionMaker: company.decisionMaker ?? '',
    decisionMakerTitle: company.decisionMakerTitle ?? '',
    email: company.email ?? '',
    orgPhone: company.orgPhone ?? '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set = (k: keyof EditableCompanyFields, v: string) =>
    setFields((prev) => ({ ...prev, [k]: v }));

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      await onSave(company.id, fields);
    } catch {
      setError('Could not save. Try again.');
      setSaving(false);
    }
  };

  const row = (label: string, key: keyof EditableCompanyFields, placeholder?: string) => (
    <div>
      <label className="block text-xs font-medium text-[#7A756E] mb-1">{label}</label>
      <input
        type="text"
        value={fields[key] ?? ''}
        onChange={(e) => set(key, e.target.value)}
        placeholder={placeholder}
        className="w-full text-sm border border-[#D8D5D0] rounded-lg px-3 py-2 bg-white outline-none transition focus:border-[#ED202B] focus:ring-2 focus:ring-[#ED202B]/20 placeholder:text-[#7A756E]"
      />
    </div>
  );

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-xl shadow-lg border border-[#D8D5D0] w-full max-w-md p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="font-heading text-base font-semibold text-[#201F1E] mb-4">Repair company</h2>
        <div className="grid grid-cols-1 gap-3">
          {row('Company', 'operatingCompany')}
          {row('Website', 'website', 'example.com')}
          {row('Decision maker', 'decisionMaker')}
          {row('Title', 'decisionMakerTitle')}
          {row('Email', 'email')}
          {row('Phone', 'orgPhone')}
        </div>
        {error && <p className="text-xs text-[#EF4444] mt-3">{error}</p>}
        <div className="flex items-center justify-end gap-3 mt-5">
          <button
            onClick={onClose}
            className="text-sm text-[#7A756E] hover:text-[#ED202B] transition font-medium"
          >
            Cancel
          </button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? 'Saving…' : 'Save'}
          </Button>
        </div>
      </div>
    </div>
  );
}
