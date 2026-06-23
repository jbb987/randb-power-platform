import { useMemo, useState } from 'react';
import Layout from '../components/Layout';
import { useSiteLeads } from '../hooks/useSiteLeads';
import { useAuth } from '../hooks/useAuth';
import type { SiteLead, SiteLeadStatus } from '../types';

const inputClass =
  'w-full rounded-lg border border-[#D8D5D0] bg-white px-3 py-2 text-sm transition focus:border-[#ED202B] focus:ring-2 focus:ring-[#ED202B]/20 focus:outline-none';

const VERDICT_STYLE: Record<SiteLead['verdict'], { label: string; cls: string }> = {
  GO: { label: 'Go', cls: 'bg-[#E6F4EA] text-[#1B7A3D]' },
  CONDITIONAL: { label: 'Conditional', cls: 'bg-[#FFF4E5] text-[#9A6700]' },
  NO_GO: { label: 'No-go', cls: 'bg-[#FBE9E9] text-[#9B0E18]' },
};

const STATUS_LABEL: Record<SiteLeadStatus, string> = {
  submitted: 'New',
  'under-review': 'Under review',
  qualified: 'Promoted',
  rejected: 'Rejected',
};

function formatDate(ms: number): string {
  if (!ms) return '';
  return new Date(ms).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function mwLabel(mwRange: SiteLead['mwRange']): string {
  if (!mwRange) return '';
  if (mwRange.low && mwRange.high) return `${mwRange.low}–${mwRange.high} MW`;
  return mwRange.mid ? `${mwRange.mid} MW` : '';
}

export default function SiteLeadsTool() {
  const { items, loading, error, retry, setSiteLeadStatus, promoteSiteLeadToLead } = useSiteLeads();
  const { user } = useAuth();

  const [search, setSearch] = useState('');
  const [verdictFilter, setVerdictFilter] = useState<SiteLead['verdict'] | 'all'>('all');
  const [statusFilter, setStatusFilter] = useState<SiteLeadStatus | 'all'>('all');
  const [actionError, setActionError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return items.filter((i) => {
      if (verdictFilter !== 'all' && i.verdict !== verdictFilter) return false;
      if (statusFilter !== 'all' && i.status !== statusFilter) return false;
      if (needle) {
        const hay = `${i.landownerName} ${i.phone} ${i.address}`.toLowerCase();
        if (!hay.includes(needle)) return false;
      }
      return true;
    });
  }, [items, search, verdictFilter, statusFilter]);

  const openCount = useMemo(
    () => items.filter((i) => i.status === 'submitted' || i.status === 'under-review').length,
    [items],
  );

  const changeStatus = async (lead: SiteLead, status: SiteLeadStatus) => {
    setActionError(null);
    setBusyId(lead.id);
    try {
      await setSiteLeadStatus(lead.id, status, user?.uid);
    } catch {
      setActionError("Couldn't update that lead — check your connection and try again.");
    } finally {
      setBusyId(null);
    }
  };

  const promote = async (lead: SiteLead) => {
    if (!user) return;
    setActionError(null);
    setBusyId(lead.id);
    try {
      await promoteSiteLeadToLead(lead, {
        uid: user.uid,
        name: user.displayName || user.email || 'Unknown',
      });
    } catch {
      setActionError("Couldn't promote that lead — check your connection and try again.");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <Layout>
      <main className="py-6 space-y-6">
        <div>
          <h1 className="font-heading text-3xl font-semibold text-[#201F1E]">Site Leads</h1>
          <p className="mt-1 text-sm text-[#7A756E]">
            Inbound landowner submissions from the public &ldquo;Is my land powerable?&rdquo; form.
            Review, then promote the serious ones to a lead. {openCount} awaiting review.
          </p>
        </div>

        {/* Filters */}
        <div className="bg-white rounded-xl shadow-sm border border-[#D8D5D0] p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
            <div className="flex-1 min-w-[200px]">
              <label className="block text-xs font-medium text-[#7A756E] mb-1">Search</label>
              <input
                className={inputClass}
                placeholder="Filter by name, phone, address…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <div className="w-full sm:w-40">
              <label className="block text-xs font-medium text-[#7A756E] mb-1">Verdict</label>
              <select
                className={inputClass}
                value={verdictFilter}
                onChange={(e) => setVerdictFilter(e.target.value as SiteLead['verdict'] | 'all')}
              >
                <option value="all">All verdicts</option>
                <option value="GO">Go</option>
                <option value="CONDITIONAL">Conditional</option>
                <option value="NO_GO">No-go</option>
              </select>
            </div>
            <div className="w-full sm:w-40">
              <label className="block text-xs font-medium text-[#7A756E] mb-1">Status</label>
              <select
                className={inputClass}
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as SiteLeadStatus | 'all')}
              >
                <option value="all">All statuses</option>
                <option value="submitted">New</option>
                <option value="under-review">Under review</option>
                <option value="qualified">Promoted</option>
                <option value="rejected">Rejected</option>
              </select>
            </div>
          </div>
        </div>

        {actionError && (
          <div className="rounded-xl border border-[#ED202B]/30 bg-[#ED202B]/5 px-4 py-2 text-sm text-[#9B0E18]">
            {actionError}
          </div>
        )}

        {error ? (
          <div className="bg-white rounded-xl shadow-sm border border-[#D8D5D0] p-8 text-center space-y-3">
            <p className="text-sm text-[#ED202B]">Couldn’t load site leads: {error}</p>
            <button
              onClick={retry}
              className="inline-flex items-center rounded-lg bg-[#ED202B] px-4 py-2 text-sm font-medium text-white transition hover:bg-[#9B0E18]"
            >
              Retry
            </button>
          </div>
        ) : loading ? (
          <p className="text-sm text-[#7A756E]">Loading…</p>
        ) : filtered.length === 0 ? (
          <div className="bg-white rounded-xl shadow-sm border border-[#D8D5D0] p-8 text-center text-sm text-[#7A756E]">
            No site leads match your filters yet. Submissions from the public form land here.
          </div>
        ) : (
          <ul className="space-y-3">
            {filtered.map((lead) => {
              const v = VERDICT_STYLE[lead.verdict] ?? VERDICT_STYLE.NO_GO;
              const mw = mwLabel(lead.mwRange);
              const where = lead.address || `${lead.lat}, ${lead.lng}`;
              const mapsUrl = `https://www.google.com/maps?q=${lead.lat},${lead.lng}`;
              const busy = busyId === lead.id;
              const isOpen = lead.status === 'submitted' || lead.status === 'under-review';
              return (
                <li
                  key={lead.id}
                  className={`bg-white rounded-xl shadow-sm border border-[#D8D5D0] px-4 py-3 transition ${
                    lead.status === 'rejected' || lead.status === 'qualified' ? 'opacity-70' : ''
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span
                          className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${v.cls}`}
                        >
                          {v.label}
                          {mw ? ` · ${mw}` : ''}
                        </span>
                        <span className="font-heading font-semibold text-sm text-[#201F1E]">
                          {lead.landownerName}
                        </span>
                        <span className="text-xs text-[#7A756E]">· {STATUS_LABEL[lead.status]}</span>
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[#7A756E]">
                        <a href={`tel:${lead.phone}`} className="hover:text-[#ED202B] transition">
                          {lead.phone}
                        </a>
                        <span>·</span>
                        <a
                          href={mapsUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="hover:text-[#ED202B] transition truncate max-w-[260px]"
                        >
                          {where}
                        </a>
                        <span>·</span>
                        <span>{lead.acreage} ac</span>
                        <span>·</span>
                        <span>{formatDate(lead.createdAt)}</span>
                      </div>
                      {lead.nearestSubstation && (
                        <p className="mt-1 text-xs text-[#7A756E]">
                          Nearest node: {lead.nearestSubstation}
                          {lead.hasPowerInfra ? ' · existing power on/near site' : ''}
                        </p>
                      )}
                    </div>

                    <div className="flex shrink-0 flex-col items-end gap-1.5">
                      {lead.status === 'qualified' ? (
                        <span className="text-xs font-medium text-[#1B7A3D]">Promoted to Leads ✓</span>
                      ) : (
                        <>
                          <button
                            onClick={() => promote(lead)}
                            disabled={busy || !user}
                            className="inline-flex items-center rounded-lg bg-[#ED202B] px-3 py-1.5 text-xs font-medium text-white transition hover:bg-[#9B0E18] disabled:opacity-50"
                          >
                            Promote to Lead
                          </button>
                          <div className="flex items-center gap-2">
                            {lead.status === 'submitted' && (
                              <button
                                onClick={() => changeStatus(lead, 'under-review')}
                                disabled={busy}
                                className="text-xs font-medium text-[#7A756E] hover:text-[#ED202B] transition disabled:opacity-50"
                              >
                                Mark reviewing
                              </button>
                            )}
                            {isOpen ? (
                              <button
                                onClick={() => changeStatus(lead, 'rejected')}
                                disabled={busy}
                                className="text-xs font-medium text-[#7A756E] hover:text-[#ED202B] transition disabled:opacity-50"
                              >
                                Reject
                              </button>
                            ) : (
                              <button
                                onClick={() => changeStatus(lead, 'submitted')}
                                disabled={busy}
                                className="text-xs font-medium text-[#7A756E] hover:text-[#ED202B] transition disabled:opacity-50"
                              >
                                Restore
                              </button>
                            )}
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </main>
    </Layout>
  );
}
