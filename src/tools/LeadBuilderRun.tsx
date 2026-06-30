import { useEffect, useMemo, useState, type ReactNode } from 'react';
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
  retryApolloStage,
  updateCompanyFields,
  dismissCompany,
  companyReason,
  droppedStep,
  estimateCost,
  APOLLO_COST_PER_COMPANY,
  APOLLO_CREDITS_PER_COMPANY,
  PERPLEXITY_COST_PER_COMPANY,
  JOB_STATUS_CONFIG,
  TIER_CONFIG,
  type EditableCompanyFields,
} from '../lib/leadPipeline';
import type { LeadPipelineCompany, LeadPipelineJob, LeadPipelineStage, LeadTier } from '../types';
import { downloadLeadPipelineCsv } from '../utils/exportLeadPipelineCsv';

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
  ready: 'Decision-maker + verified email found — select and promote to a rep or to prospects.',
  needs_review:
    'Real companies the pipeline couldn’t auto-qualify (usually no website). Repair, promote phone-first, or ignore.',
  dropped: 'Filtered out — each row shows the step and the reason.',
  promoted: 'Already promoted into Leads — assigned to a rep or sitting in prospects.',
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
  const [retrying, setRetrying] = useState(false);

  // Audit view: active tab, selection, rep, promote + edit state.
  const [activeTab, setActiveTab] = useState<TabKey>('ready');
  const [tierFilter, setTierFilter] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [repId, setRepId] = useState('');
  const [promoting, setPromoting] = useState(false);
  const [promotedCount, setPromotedCount] = useState<number | null>(null);
  const [sendingId, setSendingId] = useState<string | null>(null);
  const [editing, setEditing] = useState<LeadPipelineCompany | null>(null);
  const [viewing, setViewing] = useState<LeadPipelineCompany | null>(null);

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

  // Tier filter narrows the active tab (e.g. promote only the MID fish). Tiers
  // available are those present in the active tab, in size order.
  const tabAll = buckets[activeTab];
  const availableTiers = useMemo(
    () => (['GIANT', 'BIG', 'MID', 'SMALL'] as const).filter((t) => tabAll.some((c) => c.tier === t)),
    [tabAll],
  );
  const tabCompanies = useMemo(
    () => (tierFilter ? tabAll.filter((c) => c.tier === tierFilter) : tabAll),
    [tabAll, tierFilter],
  );
  // Selection resets whenever the tab OR tier filter changes so the promote bar
  // only ever acts on rows the user can currently see.
  useEffect(() => setSelectedIds(new Set()), [activeTab, tierFilter]);

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
    const selected = companies.filter((c) => selectedIds.has(c.id));
    if (selectedIds.size === 0 || !repId) return;
    // repId '__pool__' = send to the shared grab pool (no rep); otherwise resolve
    // the chosen rep and bail if it somehow doesn't exist.
    const rep = repId === '__pool__' ? null : (users.find((u) => u.id === repId) ?? null);
    if (repId !== '__pool__' && !rep) return;
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

  // Per-row quick action: send ONE company straight to the prospects pool (no rep,
  // no checkbox, no scrolling to the promote bar).
  const handleSendOneToProspects = async (company: LeadPipelineCompany) => {
    setSendingId(company.id);
    setActionError(null);
    try {
      const ids = await promoteCompanies([company], null);
      setPromotedCount(ids.length);
    } catch {
      setActionError('Could not send to prospects. Try again.');
    } finally {
      setSendingId(null);
    }
  };

  const handleSaveEdit = async (id: string, fields: EditableCompanyFields) => {
    await updateCompanyFields(id, fields);
    setEditing(null);
  };

  const handleDismiss = async (id: string) => {
    try {
      await dismissCompany(id);
    } catch {
      setActionError('Could not dismiss. Try again.');
    }
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

  const handleRetryApollo = async () => {
    if (!jobId) return;
    setRetrying(true);
    setActionError(null);
    try {
      const n = await retryApolloStage(jobId);
      if (n === 0) {
        setActionError('Nothing to retry — no Apollo rows with a recoverable error.');
      }
      // On success the job flips to awaiting_apollo_approval and the live
      // subscription swaps the banner for the Apollo cost-approval card.
      setSelectedIds(new Set());
      setPromotedCount(null);
    } catch {
      setActionError('Could not queue the Apollo retry. Try again.');
    } finally {
      setRetrying(false);
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

  // Re-run is offered when the build is at rest (review/done/error) OR when it
  // looks wedged — a non-terminal status that hasn't advanced in a while (e.g.
  // an ingest/enrich that died, or a Re-run flip that never fired). Without
  // this, a job stuck mid-pipeline has no recovery affordance.
  const atRest = job.status === 'review' || job.status === 'done' || job.status === 'error';
  const stale = typeof job.updatedAt === 'number' && Date.now() - job.updatedAt > 3 * 60 * 1000;
  const canRerun = atRest || stale;

  // Companies that FAILED Apollo with an error (vs. a clean not-found) — these
  // are recoverable by retrying Apollo only, without re-paying for Perplexity.
  const apolloRetryable = companies.filter(
    (c) => c.stage === 'dropped_apollo' && !!c.stageError,
  ).length;

  return (
    <Layout>
      <main className="py-2">
        {/* Header */}
        <div className="flex flex-wrap items-center gap-3 mb-5">
          <h1 className="font-heading text-2xl font-semibold text-[#201F1E]">
            {job.county}, {job.state}
          </h1>
          <StatusBadge status={job.status} />
          {canRerun && (
            <Button variant="ghost" onClick={() => setRerunConfirm(true)} className="ml-auto">
              <svg
                className="h-4 w-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                />
              </svg>
              Re-run
            </Button>
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

        {/* Apollo retry — recover rows that errored on the Apollo step (e.g. a
            bad API key) without re-running (and re-paying for) Perplexity. */}
        {apolloRetryable > 0 && (
          <div className="bg-white rounded-xl shadow-sm border border-[#F59E0B]/50 p-5 mb-6 flex flex-wrap items-center gap-4">
            <div className="flex-1 min-w-[260px]">
              <h2 className="font-heading text-base font-semibold text-[#201F1E] mb-1">
                {apolloRetryable} {apolloRetryable === 1 ? 'company' : 'companies'} failed Apollo
                enrichment
              </h2>
              <p className="text-sm text-[#7A756E]">
                These errored on the Apollo step (often an invalid API key) — not genuine misses.
                Retry runs <strong>Apollo only</strong>; Perplexity is not re-charged. You’ll approve
                the Apollo cost before it runs.
              </p>
            </div>
            <Button onClick={handleRetryApollo} disabled={retrying} className="shrink-0">
              {retrying ? 'Queuing…' : `Retry Apollo (${apolloRetryable})`}
            </Button>
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
            credits={(stageCounts.perplexity_done ?? 0) * APOLLO_CREDITS_PER_COMPANY}
            creditsPerCompany={APOLLO_CREDITS_PER_COMPANY}
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
            county={job.county}
            state={job.state}
            activeTab={activeTab}
            onTabChange={setActiveTab}
            tabCompanies={tabCompanies}
            tierFilter={tierFilter}
            onTierChange={setTierFilter}
            availableTiers={availableTiers}
            users={users}
            selectedIds={selectedIds}
            onToggle={toggleSelected}
            onToggleAll={toggleSelectAll}
            repId={repId}
            onRepChange={setRepId}
            promoting={promoting}
            promotedCount={promotedCount}
            onPromote={handlePromote}
            onSendToProspects={handleSendOneToProspects}
            sendingId={sendingId}
            onEdit={setEditing}
            onView={setViewing}
            onDismiss={handleDismiss}
            done={job.status === 'done'}
            promotedTotal={stageCounts.promoted ?? 0}
          />
        )}
      </main>

      {viewing && (
        <CompanyDetailModal
          company={viewing}
          onClose={() => setViewing(null)}
          onEdit={(c) => {
            setViewing(null);
            setEditing(c);
          }}
          onSendToProspects={(c) => {
            setViewing(null);
            void handleSendOneToProspects(c);
          }}
          sending={sendingId === viewing.id}
        />
      )}

      {editing && (
        <EditCompanyModal
          company={editing}
          onClose={() => setEditing(null)}
          onSave={handleSaveEdit}
        />
      )}

      {rerunConfirm && (
        <RerunModal
          county={`${job.county}, ${job.state}`}
          busy={rerunning}
          onConfirm={handleRerun}
          onClose={() => setRerunConfirm(false)}
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
  credits,
  creditsPerCompany,
  note,
  busy,
  onApprove,
}: {
  title: string;
  count: number;
  costLabel: string;
  perCompany: number;
  credits?: number;
  creditsPerCompany?: number;
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
        {credits !== undefined && (
          <div className="rounded-lg bg-stone-50 border border-[#D8D5D0] px-4 py-2.5">
            <div className="text-xl font-semibold text-[#201F1E] tabular-nums">
              ≈{credits.toLocaleString()}
            </div>
            <div className="text-xs text-[#7A756E]">
              Apollo credits{creditsPerCompany ? ` (~${creditsPerCompany}/co.)` : ''}
            </div>
          </div>
        )}
      </div>
      <Button onClick={onApprove} disabled={busy || count === 0}>
        {busy ? 'Approving…' : `Approve — ${costLabel}`}
      </Button>
    </div>
  );
}

function AuditPanel({
  buckets,
  county,
  state,
  activeTab,
  onTabChange,
  tabCompanies,
  tierFilter,
  onTierChange,
  availableTiers,
  users,
  selectedIds,
  onToggle,
  onToggleAll,
  repId,
  onRepChange,
  promoting,
  promotedCount,
  onPromote,
  onSendToProspects,
  sendingId,
  onEdit,
  onView,
  onDismiss,
  done,
  promotedTotal,
}: {
  buckets: Record<TabKey, LeadPipelineCompany[]>;
  county: string;
  state: string;
  activeTab: TabKey;
  onTabChange: (t: TabKey) => void;
  tabCompanies: LeadPipelineCompany[];
  tierFilter: string;
  onTierChange: (t: string) => void;
  availableTiers: readonly LeadTier[];
  users: UserRecord[];
  selectedIds: Set<string>;
  onToggle: (id: string) => void;
  onToggleAll: () => void;
  repId: string;
  onRepChange: (id: string) => void;
  promoting: boolean;
  promotedCount: number | null;
  onPromote: () => void;
  onSendToProspects: (c: LeadPipelineCompany) => void;
  sendingId: string | null;
  onEdit: (c: LeadPipelineCompany) => void;
  onView: (c: LeadPipelineCompany) => void;
  onDismiss: (id: string) => void;
  done: boolean;
  promotedTotal: number;
}) {
  const isPromotedTab = activeTab === 'promoted';
  const selectable = !isPromotedTab;
  // Dismiss only makes sense for live candidates (Qualified / Needs review) —
  // not for already-dropped or already-promoted rows.
  const canDismiss = activeTab === 'ready' || activeTab === 'needs_review';
  const allSelected = tabCompanies.length > 0 && selectedIds.size === tabCompanies.length;
  const canPromote = selectedIds.size > 0 && !!repId && !promoting;
  const activeTabLabel = TAB_ORDER.find((t) => t.key === activeTab)?.label ?? activeTab;
  const allCompanies = TAB_ORDER.flatMap(({ key }) => buckets[key]);

  return (
    <div className="bg-white rounded-xl shadow-sm border border-[#D8D5D0] overflow-hidden">
      {done && (
        <div className="px-5 py-3 bg-emerald-50 border-b border-emerald-200 text-sm text-emerald-700">
          Build complete — {promotedTotal} {promotedTotal === 1 ? 'company' : 'companies'} promoted.
          You can still pick up anything left in Needs review or Dropped.
        </div>
      )}

      {/* Tabs + export */}
      <div className="flex flex-wrap items-end justify-between gap-2 px-3 pt-3 border-b border-[#D8D5D0]">
        <div className="flex flex-wrap gap-1">
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
        <div className="flex items-center gap-3 pb-1.5">
          <select
            value={tierFilter}
            onChange={(e) => onTierChange(e.target.value)}
            disabled={availableTiers.length === 0}
            className="text-sm bg-white border border-[#D8D5D0] rounded-lg px-2.5 py-1.5 outline-none transition focus:border-[#ED202B] focus:ring-2 focus:ring-[#ED202B]/20 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <option value="">All tiers</option>
            {availableTiers.map((t) => (
              <option key={t} value={t}>
                {TIER_CONFIG[t].label}
              </option>
            ))}
          </select>
          <button
            onClick={() =>
              downloadLeadPipelineCsv(tabCompanies, { county, state, tab: activeTabLabel })
            }
            disabled={tabCompanies.length === 0}
            className="text-sm font-medium text-[#7A756E] hover:text-[#ED202B] disabled:opacity-40 disabled:hover:text-[#7A756E]"
          >
            Export tab CSV
          </button>
          <button
            onClick={() => downloadLeadPipelineCsv(allCompanies, { county, state, tab: 'all' })}
            disabled={allCompanies.length === 0}
            className="text-sm font-medium text-[#7A756E] hover:text-[#ED202B] disabled:opacity-40 disabled:hover:text-[#7A756E]"
          >
            Export all CSV
          </button>
        </div>
      </div>

      <p className="px-5 py-2.5 text-xs text-[#7A756E] border-b border-[#D8D5D0] bg-stone-50/40">
        {TAB_CAPTIONS[activeTab]}
      </p>

      {promotedCount !== null && (
        <p className="px-5 py-2 text-sm text-emerald-700 bg-emerald-50 border-b border-emerald-200">
          Promoted {promotedCount} {promotedCount === 1 ? 'company' : 'companies'}.
        </p>
      )}

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
                  {selectable && <th className="px-4 py-3 w-44" />}
                </tr>
              </thead>
              <tbody>
                {tabCompanies.map((c) => {
                  const checked = selectedIds.has(c.id);
                  return (
                    <tr
                      key={c.id}
                      onClick={() => onView(c)}
                      title="Open company details"
                      className={`border-b border-[#D8D5D0]/50 transition cursor-pointer ${
                        checked ? 'bg-[#ED202B]/5' : 'hover:bg-stone-50'
                      }`}
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
                        {c.description && (
                          <div className="text-xs text-[#7A756E] mt-1 max-w-[340px] line-clamp-2">
                            {c.description}
                          </div>
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
                        {droppedStep(c) && (
                          <span className="inline-flex items-center px-1.5 py-0.5 mr-1.5 rounded text-[10px] font-semibold uppercase tracking-wide bg-stone-100 text-[#7A756E]">
                            {droppedStep(c)}
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
                          <div className="flex items-center gap-3">
                            <button
                              onClick={() => onSendToProspects(c)}
                              disabled={sendingId === c.id}
                              title="Send this lead straight to the prospects pool"
                              className="text-xs font-medium text-[#ED202B] hover:text-[#9B0E18] transition disabled:opacity-50 whitespace-nowrap"
                            >
                              {sendingId === c.id ? 'Sending…' : '→ Prospects'}
                            </button>
                            <button
                              onClick={() => onEdit(c)}
                              className="text-xs text-[#7A756E] hover:text-[#ED202B] transition"
                            >
                              Edit
                            </button>
                            {canDismiss && (
                              <button
                                onClick={() => onDismiss(c.id)}
                                className="text-xs text-[#7A756E] hover:text-[#ED202B] transition"
                              >
                                Dismiss
                              </button>
                            )}
                          </div>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Bulk promote bar — floats at the bottom of the viewport whenever rows
              are selected, so you never scroll to the end of a long list to act.
              (Single sends use the per-row "→ Prospects" button instead.) */}
          {selectable && selectedIds.size > 0 && (
            <div className="fixed inset-x-0 bottom-4 z-40 flex justify-center px-4 pointer-events-none">
              <div className="pointer-events-auto flex flex-wrap items-center gap-3 bg-white border border-[#D8D5D0] rounded-xl shadow-lg px-5 py-3">
                <span className="text-sm font-medium text-[#201F1E]">
                  {selectedIds.size} selected
                </span>
                <select
                  value={repId}
                  onChange={(e) => onRepChange(e.target.value)}
                  className="text-sm border border-[#D8D5D0] rounded-lg px-3 py-2 bg-white outline-none transition focus:border-[#ED202B] focus:ring-2 focus:ring-[#ED202B]/20"
                >
                  <option value="">Assign to…</option>
                  <option value="__pool__">Send to prospects (no rep)</option>
                  {users.map((u) => (
                    <option key={u.id} value={u.id}>
                      {userLabel(u)}
                    </option>
                  ))}
                </select>
                <Button onClick={onPromote} disabled={!canPromote}>
                  {promoting
                    ? 'Promoting…'
                    : repId === '__pool__'
                      ? 'Send to prospects'
                      : 'Promote + assign'}
                </Button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function RerunModal({
  county,
  busy,
  onConfirm,
  onClose,
}: {
  county: string;
  busy: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-xl shadow-lg border border-[#D8D5D0] w-full max-w-sm p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="font-heading text-base font-semibold text-[#201F1E] mb-2">Re-run build</h2>
        <p className="text-sm text-[#7A756E] mb-5">
          Rebuild {county} from scratch? This replaces the current results.
        </p>
        <div className="flex items-center justify-end gap-3">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={onConfirm} disabled={busy}>
            {busy ? 'Starting…' : 'Re-run'}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ── Read-only company detail (same look as the Leads-tool LeadDetail) ────────
function cap(s?: string): string {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : '';
}
function detailWebsiteHref(url: string): string {
  return /^https?:\/\//i.test(url) ? url : `https://${url}`;
}
function DSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h3 className="text-xs font-semibold uppercase tracking-wide text-[#7A756E] mb-3">{title}</h3>
      {children}
    </section>
  );
}
function DField({
  label,
  span,
  children,
}: {
  label: string;
  span?: boolean;
  children: ReactNode;
}) {
  return (
    <div className={span ? 'sm:col-span-2' : ''}>
      <label className="block text-xs font-medium text-[#7A756E] mb-1">{label}</label>
      <div className="text-sm text-[#201F1E] bg-stone-50 rounded-lg px-3 py-2 min-h-[38px]">
        {children}
      </div>
    </div>
  );
}

function CompanyDetailModal({
  company: c,
  onClose,
  onEdit,
  onSendToProspects,
  sending,
}: {
  company: LeadPipelineCompany;
  onClose: () => void;
  onEdit: (c: LeadPipelineCompany) => void;
  onSendToProspects: (c: LeadPipelineCompany) => void;
  sending: boolean;
}) {
  const name = c.operatingCompany || c.taxOwner || 'Unknown';
  const county = c.county?.trim();
  const loc = county
    ? `${/county$/i.test(county) ? county : `${county} County`}${c.state ? `, ${c.state}` : ''}`
    : [c.city, c.state].filter(Boolean).join(', ');
  const showMailing =
    c.mailingAddress?.trim() && c.mailingAddress.trim() !== c.parcelAddress?.trim();
  const dStep = droppedStep(c);
  const reason = companyReason(c);
  const canSend = c.stage === 'apollo_done' || c.stage === 'needs_review';
  const dash = <span className="text-[#A9A39B]">—</span>;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[8vh] px-4">
      <div className="fixed inset-0 bg-black/30" onClick={onClose} />
      <div className="relative bg-white rounded-xl shadow-xl border border-[#D8D5D0] w-full max-w-2xl max-h-[84vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 z-10 bg-white border-b border-[#D8D5D0] px-6 py-4 flex items-start justify-between gap-3 rounded-t-xl">
          <div className="min-w-0">
            <h2 className="font-heading text-xl font-semibold text-[#201F1E] truncate">{name}</h2>
            <div className="flex flex-wrap items-center gap-2 mt-1">
              <TierPill tier={c.tier} />
              <span className="text-xs text-[#7A756E]">{loc || '—'}</span>
            </div>
            {c.operatingCompany && c.taxOwner && c.operatingCompany !== c.taxOwner && (
              <p className="text-xs text-[#7A756E] mt-1">Owner of record: {c.taxOwner}</p>
            )}
          </div>
          <button
            onClick={onClose}
            className="text-[#7A756E] hover:text-[#201F1E] transition p-1 flex-shrink-0"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="px-6 py-5 space-y-6">
          <DSection title="Company info">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <DField label="Location" span>
                {loc && <div className="font-medium">{loc}</div>}
                {c.parcelAddress?.trim() && <div className="text-[#7A756E]">{c.parcelAddress}</div>}
                {showMailing && (
                  <div className="text-xs text-[#7A756E] mt-1">Mailing: {c.mailingAddress}</div>
                )}
              </DField>
              <DField label="Website" span>
                {c.website ? (
                  <a
                    href={detailWebsiteHref(c.website)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[#ED202B] hover:text-[#9B0E18] transition"
                  >
                    {c.website}
                  </a>
                ) : (
                  dash
                )}
              </DField>
              <DField label="Market value">
                {c.marketValue ? `$${c.marketValue.toLocaleString()}` : dash}
              </DField>
              <DField label="Parcels">{c.nParcels || dash}</DField>
              <DField label="Property class">
                {c.classDesc || '—'}
                {c.propertyClasses ? ` (${c.propertyClasses})` : ''}
              </DField>
              <DField label="Energy intensity">
                {c.energyIntensity ? `${cap(c.energyIntensity)} use` : dash}
              </DField>
              <DField label="Industry" span>
                {c.industry || '—'}
                {c.naics ? ` · NAICS ${c.naics}` : ''}
              </DField>
              <DField label="Description" span>{c.description || dash}</DField>
            </div>
          </DSection>

          <DSection title="People info">
            <p className="text-xs font-medium text-[#7A756E] mb-1.5">Decision maker</p>
            <div className="bg-stone-50 rounded-lg p-3">
              <p className="text-sm font-medium text-[#201F1E]">{c.decisionMaker || dash}</p>
              {c.decisionMakerTitle && (
                <p className="text-xs text-[#7A756E]">{c.decisionMakerTitle}</p>
              )}
              <div className="mt-2.5 space-y-1.5 text-sm text-[#201F1E]">
                <div>
                  ✉{' '}
                  {c.email ? (
                    <a href={`mailto:${c.email}`} className="hover:text-[#ED202B] transition">
                      {c.email}
                    </a>
                  ) : (
                    dash
                  )}
                </div>
                <div>
                  ☎{' '}
                  {c.orgPhone ? (
                    <a href={`tel:${c.orgPhone}`} className="hover:text-[#ED202B] transition">
                      {c.orgPhone}
                    </a>
                  ) : (
                    dash
                  )}
                  <span className="text-xs text-[#A9A39B]"> · Main line</span>
                </div>
                {c.linkedinUrl && (
                  <div>
                    🔗{' '}
                    <a
                      href={detailWebsiteHref(c.linkedinUrl)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="hover:text-[#ED202B] transition"
                    >
                      LinkedIn profile
                    </a>
                  </div>
                )}
              </div>
            </div>
          </DSection>

          <DSection title="Enrichment & pipeline">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <DField label="Qualified">{c.qualified ? 'Yes' : '—'}</DField>
              <DField label="Contact route">
                {c.contactRoute === 'owner_operator' ? 'Owner / operator' : 'Find tenant by address'}
              </DField>
              <DField label="Perplexity status" span>
                {c.pplxStatus ? cap(c.pplxStatus) : '—'}
                {c.pplxConfidence ? ` · ${cap(c.pplxConfidence)} confidence` : ''}
              </DField>
              {(dStep || reason) && (
                <DField label="Status reason" span>
                  {dStep && <span className="font-semibold">{dStep}: </span>}
                  {reason}
                </DField>
              )}
              {c.stageError && (
                <DField label="Error" span>
                  <span className="text-[#EF4444]">{c.stageError}</span>
                </DField>
              )}
            </div>
          </DSection>
        </div>

        {/* Footer actions */}
        <div className="sticky bottom-0 bg-white border-t border-[#D8D5D0] px-6 py-3 flex items-center justify-end gap-3 rounded-b-xl">
          <Button variant="ghost" onClick={() => onEdit(c)}>
            Edit
          </Button>
          {canSend && (
            <Button onClick={() => onSendToProspects(c)} disabled={sending}>
              {sending ? 'Sending…' : '→ Send to prospects'}
            </Button>
          )}
        </div>
      </div>
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
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? 'Saving…' : 'Save'}
          </Button>
        </div>
      </div>
    </div>
  );
}
