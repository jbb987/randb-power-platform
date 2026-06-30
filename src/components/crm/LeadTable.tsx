import { useState, type ReactNode } from 'react';
import type { Lead, LeadStatus } from '../../types';
import { LEAD_STATUS_CONFIG } from '../../types';
import { TIER_CONFIG } from '../../lib/leadPipeline';

const PhoneGlyph = (
  <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z"
    />
  </svg>
);

const MailGlyph = (
  <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
    />
  </svg>
);

// One contact line (phone or email) with a one-click copy that never opens the row.
function CopyField({ value, icon }: { value: string; icon: ReactNode }) {
  const [copied, setCopied] = useState(false);
  const copy = (e: React.MouseEvent) => {
    e.stopPropagation();
    void navigator.clipboard.writeText(value).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1000);
    });
  };
  return (
    <div className="flex items-center gap-1.5 min-w-0">
      <span className="text-[#A9A39B] flex-shrink-0">{icon}</span>
      <span className="text-[#201F1E] truncate">{value}</span>
      <button
        type="button"
        onClick={copy}
        title={copied ? 'Copied' : 'Copy'}
        className={`flex-shrink-0 transition ${copied ? 'text-emerald-500' : 'text-[#A9A39B] hover:text-[#ED202B]'}`}
      >
        {copied ? (
          <svg
            className="h-3.5 w-3.5"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        ) : (
          <svg
            className="h-3.5 w-3.5"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
            />
          </svg>
        )}
      </button>
    </div>
  );
}

// Pipeline filter: everything ('all') or a single status. Chip order is fixed:
// All · New · Call 1 · Call 2 · Call 3 · Won · Lost.
export type LeadFilter = 'all' | LeadStatus;

const FILTER_ORDER: LeadStatus[] = ['new', 'call_1', 'call_2', 'call_3', 'won', 'lost'];

function matchesFilter(lead: Lead, filter: LeadFilter): boolean {
  if (filter === 'all') return true;
  return lead.status === filter;
}

function locationLabel(lead: Lead): string {
  // Prefer County, State — the Lead Builder territory unit, present on every
  // built lead. Fall back to City, State (legacy/manual leads), then State alone.
  const county = lead.county?.trim();
  const state = lead.state?.trim();
  if (county) {
    const withSuffix = /county$/i.test(county) ? county : `${county} County`;
    return state ? `${withSuffix}, ${state}` : withSuffix;
  }
  return [lead.city, lead.state].filter((p) => p && p.trim()).join(', ');
}

interface Props {
  leads: Lead[];
  selectedLeadId: string | null;
  onSelectLead: (id: string) => void;
  searchQuery: string;
  onSearchChange: (q: string) => void;
  statusFilter: LeadFilter;
  onStatusFilterChange: (f: LeadFilter) => void;
  /** When set, this is the Pool view: render a Grab button per row. */
  onGrab?: (id: string) => void;
}

export default function LeadTable({
  leads,
  selectedLeadId,
  onSelectLead,
  searchQuery,
  onSearchChange,
  statusFilter,
  onStatusFilterChange,
  onGrab,
}: Props) {
  const [stateFilter, setStateFilter] = useState('');
  const [countyFilter, setCountyFilter] = useState('');

  // Distinct states/counties present in the data (counties scope to the chosen
  // state so same-named counties across states don't collide).
  const availableStates = Array.from(
    new Set(leads.map((l) => l.state?.trim()).filter((s): s is string => !!s)),
  ).sort();
  const availableCounties = Array.from(
    new Set(
      leads
        .filter((l) => !stateFilter || l.state === stateFilter)
        .map((l) => l.county?.trim())
        .filter((c): c is string => !!c),
    ),
  ).sort();

  // Location filter is applied first so the status-chip counts reflect the
  // chosen territory ("New 3" = 3 New leads in Texas, not company-wide).
  const byLocation = leads.filter((lead) => {
    if (stateFilter && lead.state !== stateFilter) return false;
    if (countyFilter && lead.county !== countyFilter) return false;
    return true;
  });

  const filtered = byLocation
    .filter((lead) => matchesFilter(lead, statusFilter))
    .filter((lead) => {
      if (!searchQuery) return true;
      const q = searchQuery.toLowerCase();
      return (
        lead.businessName.toLowerCase().includes(q) ||
        lead.decisionMakerName.toLowerCase().includes(q) ||
        lead.email.toLowerCase().includes(q) ||
        lead.phone.includes(q) ||
        locationLabel(lead).toLowerCase().includes(q) ||
        lead.assignedToName.toLowerCase().includes(q)
      );
    });

  const chips: { id: LeadFilter; label: string; count: number }[] = [
    { id: 'all', label: 'All', count: byLocation.length },
    ...FILTER_ORDER.map((s) => ({
      id: s as LeadFilter,
      label: LEAD_STATUS_CONFIG[s].label,
      count: byLocation.filter((l) => l.status === s).length,
    })),
  ];

  return (
    <div className="flex-1 flex flex-col min-w-0">
      {/* Status filter chips */}
      <div className="flex flex-wrap gap-1.5 mb-3">
        {chips.map((chip) => {
          const isActive = statusFilter === chip.id;
          const dotColor =
            chip.id === 'all' ? undefined : LEAD_STATUS_CONFIG[chip.id as LeadStatus].color;
          return (
            <button
              key={chip.id}
              onClick={() => onStatusFilterChange(chip.id)}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition border ${
                isActive
                  ? 'bg-[#ED202B] text-white border-[#ED202B]'
                  : 'bg-white text-[#7A756E] border-[#D8D5D0] hover:text-[#201F1E] hover:border-[#7A756E]'
              }`}
            >
              {dotColor && (
                <span
                  className="h-2 w-2 rounded-full flex-shrink-0"
                  style={{ backgroundColor: isActive ? '#fff' : dotColor }}
                />
              )}
              {chip.label}
              <span className={isActive ? 'text-white/80' : 'text-[#A9A39B]'}>{chip.count}</span>
            </button>
          );
        })}
      </div>

      {/* Location filters + search. Both selects always render (disabled when the
          data carries no state/county yet) so the territory filter is discoverable. */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <select
          value={stateFilter}
          onChange={(e) => {
            setStateFilter(e.target.value);
            setCountyFilter(''); // counties are state-scoped — reset on state change
          }}
          disabled={availableStates.length === 0}
          className="text-sm bg-white border border-[#D8D5D0] rounded-lg px-3 py-2.5 outline-none transition focus:border-[#ED202B] focus:ring-2 focus:ring-[#ED202B]/20 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <option value="">All states</option>
          {availableStates.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <select
          value={countyFilter}
          onChange={(e) => setCountyFilter(e.target.value)}
          disabled={availableCounties.length === 0}
          className="text-sm bg-white border border-[#D8D5D0] rounded-lg px-3 py-2.5 outline-none transition focus:border-[#ED202B] focus:ring-2 focus:ring-[#ED202B]/20 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <option value="">All counties</option>
          {availableCounties.map((c) => (
            <option key={c} value={c}>
              {/county$/i.test(c) ? c : `${c} County`}
            </option>
          ))}
        </select>
        <div className="relative flex-1 min-w-[200px]">
          <svg
            className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#7A756E]"
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
            type="text"
            placeholder="Search leads..."
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 text-sm bg-white border border-[#D8D5D0] rounded-lg focus:border-[#ED202B] focus:ring-2 focus:ring-[#ED202B]/20 outline-none transition"
          />
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-[#D8D5D0] shadow-sm overflow-hidden flex-1">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[#D8D5D0] bg-stone-50/50">
                <th className="text-left px-4 py-3 font-medium text-[#7A756E]">Business</th>
                <th className="text-left px-4 py-3 font-medium text-[#7A756E]">Decision Maker</th>
                <th className="text-left px-4 py-3 font-medium text-[#7A756E]">Contact</th>
                <th className="text-left px-4 py-3 font-medium text-[#7A756E]">Location</th>
                <th className="text-left px-4 py-3 font-medium text-[#7A756E]">Owner</th>
                <th className="text-left px-4 py-3 font-medium text-[#7A756E]">Status</th>
                {onGrab && <th className="px-4 py-3" />}
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={onGrab ? 7 : 6} className="text-center py-12 text-[#7A756E]">
                    {searchQuery || stateFilter || countyFilter || statusFilter !== 'all'
                      ? 'No leads match your filters.'
                      : 'No leads here yet. Create one to get started.'}
                  </td>
                </tr>
              ) : (
                filtered.map((lead) => {
                  const statusCfg = LEAD_STATUS_CONFIG[lead.status];
                  const location = locationLabel(lead);
                  return (
                    <tr
                      key={lead.id}
                      onClick={() => onSelectLead(lead.id)}
                      className={`border-b border-[#D8D5D0]/50 cursor-pointer transition ${
                        selectedLeadId === lead.id ? 'bg-[#ED202B]/5' : 'hover:bg-stone-50'
                      }`}
                    >
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-[#201F1E]">{lead.businessName}</span>
                          {lead.tier && (
                            <span
                              className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-semibold shrink-0"
                              style={{
                                backgroundColor: TIER_CONFIG[lead.tier].color + '18',
                                color: TIER_CONFIG[lead.tier].color,
                              }}
                            >
                              {TIER_CONFIG[lead.tier].label}
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-[#7A756E] mt-0.5 max-w-md">
                          {lead.description}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="text-[#201F1E]">{lead.decisionMakerName}</div>
                        <div className="text-xs text-[#7A756E]">{lead.decisionMakerRole}</div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-col gap-1 text-xs max-w-[220px]">
                          {lead.phone && <CopyField value={lead.phone} icon={PhoneGlyph} />}
                          {lead.email && <CopyField value={lead.email} icon={MailGlyph} />}
                          {!lead.phone && !lead.email && (
                            <span className="text-[#A9A39B]">—</span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-[#201F1E] max-w-[160px] truncate">
                        {location || <span className="text-[#A9A39B]">—</span>}
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-xs text-[#7A756E] bg-stone-100 px-2 py-0.5 rounded-full">
                          {lead.assignedToName || 'Unassigned'}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium"
                          style={{
                            backgroundColor: statusCfg.color + '18',
                            color: statusCfg.color,
                          }}
                        >
                          {statusCfg.label}
                        </span>
                      </td>
                      {onGrab && (
                        <td className="px-4 py-3 text-right">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              onGrab(lead.id);
                            }}
                            className="text-xs font-medium bg-[#ED202B] text-white px-3 py-1.5 rounded-lg hover:bg-[#9B0E18] transition"
                          >
                            Grab
                          </button>
                        </td>
                      )}
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
