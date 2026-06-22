import type { Lead, LeadStatus } from '../../types';
import { LEAD_STATUS_CONFIG, ACTIVE_LEAD_STATUSES } from '../../types';
import { TIER_CONFIG } from '../../lib/leadPipeline';

// Pipeline filter: the working set ('active' = the 5 open statuses), everything
// ('all'), or a single status (folds the old Archive's Won/Lost in as filters).
export type LeadFilter = 'active' | 'all' | LeadStatus;

const FILTER_ORDER: LeadStatus[] = [
  'new',
  'call_1',
  'email_sent',
  'call_2',
  'call_3',
  'won',
  'lost',
];

function matchesFilter(lead: Lead, filter: LeadFilter): boolean {
  if (filter === 'all') return true;
  if (filter === 'active') return ACTIVE_LEAD_STATUSES.includes(lead.status);
  return lead.status === filter;
}

function locationLabel(lead: Lead): string {
  const parts = [lead.city, lead.state].filter((p) => p && p.trim());
  return parts.join(', ');
}

interface Props {
  leads: Lead[];
  selectedLeadId: string | null;
  onSelectLead: (id: string) => void;
  searchQuery: string;
  onSearchChange: (q: string) => void;
  statusFilter: LeadFilter;
  onStatusFilterChange: (f: LeadFilter) => void;
}

export default function LeadTable({
  leads,
  selectedLeadId,
  onSelectLead,
  searchQuery,
  onSearchChange,
  statusFilter,
  onStatusFilterChange,
}: Props) {
  const filtered = leads
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
    {
      id: 'active',
      label: 'Active',
      count: leads.filter((l) => ACTIVE_LEAD_STATUSES.includes(l.status)).length,
    },
    { id: 'all', label: 'All', count: leads.length },
    ...FILTER_ORDER.map((s) => ({
      id: s as LeadFilter,
      label: LEAD_STATUS_CONFIG[s].label,
      count: leads.filter((l) => l.status === s).length,
    })),
  ];

  return (
    <div className="flex-1 flex flex-col min-w-0">
      {/* Status filter chips */}
      <div className="flex flex-wrap gap-1.5 mb-3">
        {chips.map((chip) => {
          const isActive = statusFilter === chip.id;
          const dotColor =
            chip.id === 'active' || chip.id === 'all'
              ? undefined
              : LEAD_STATUS_CONFIG[chip.id as LeadStatus].color;
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

      {/* Search bar */}
      <div className="mb-4">
        <div className="relative">
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
                <th className="text-left px-4 py-3 font-medium text-[#7A756E]">Phone</th>
                <th className="text-left px-4 py-3 font-medium text-[#7A756E]">Location</th>
                <th className="text-left px-4 py-3 font-medium text-[#7A756E]">Owner</th>
                <th className="text-left px-4 py-3 font-medium text-[#7A756E]">Status</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={6} className="text-center py-12 text-[#7A756E]">
                    {searchQuery
                      ? 'No leads match your search.'
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
                        <div className="text-xs text-[#7A756E] mt-0.5 line-clamp-1">
                          {lead.description}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="text-[#201F1E]">{lead.decisionMakerName}</div>
                        <div className="text-xs text-[#7A756E]">{lead.decisionMakerRole}</div>
                      </td>
                      <td className="px-4 py-3 text-[#201F1E] whitespace-nowrap">{lead.phone}</td>
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
