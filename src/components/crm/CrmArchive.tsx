import { useState } from 'react';
import type { Lead } from '../../types';
import { LEAD_STATUS_CONFIG, ARCHIVED_LEAD_STATUSES } from '../../types';

interface Props {
  leads: Lead[];
  onSelectLead: (id: string) => void;
}

type ArchiveFilter = 'all' | 'won' | 'lost';

export default function CrmArchive({ leads, onSelectLead }: Props) {
  const [filter, setFilter] = useState<ArchiveFilter>('all');
  const [searchQuery, setSearchQuery] = useState('');

  const archivedLeads = leads.filter((l) => ARCHIVED_LEAD_STATUSES.includes(l.status));

  const filtered = archivedLeads
    .filter((l) => filter === 'all' || l.status === filter)
    .filter((l) => {
      if (!searchQuery) return true;
      const q = searchQuery.toLowerCase();
      return (
        l.businessName.toLowerCase().includes(q) ||
        l.decisionMakerName.toLowerCase().includes(q)
      );
    });

  const wonCount = archivedLeads.filter((l) => l.status === 'won').length;
  const lostCount = archivedLeads.filter((l) => l.status === 'lost').length;

  const filters: { id: ArchiveFilter; label: string; count: number }[] = [
    { id: 'all', label: 'All', count: archivedLeads.length },
    { id: 'won', label: 'Won', count: wonCount },
    { id: 'lost', label: 'Lost', count: lostCount },
  ];

  return (
    <div className="flex-1 space-y-4">
      {/* Filters + search */}
      <div className="flex items-center gap-3">
        <div className="flex bg-white rounded-lg border border-[#D8D5D0] p-0.5">
          {filters.map((f) => (
            <button
              key={f.id}
              onClick={() => setFilter(f.id)}
              className={`px-3 py-1.5 text-sm font-medium rounded-md transition ${
                filter === f.id
                  ? 'bg-[#ED202B] text-white'
                  : 'text-[#7A756E] hover:text-[#201F1E]'
              }`}
            >
              {f.label} ({f.count})
            </button>
          ))}
        </div>
        <div className="relative flex-1 max-w-xs">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#7A756E]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            placeholder="Search archive..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 text-sm bg-white border border-[#D8D5D0] rounded-lg focus:border-[#ED202B] focus:ring-2 focus:ring-[#ED202B]/20 outline-none transition"
          />
        </div>
      </div>

      {/* Archived leads grid */}
      {filtered.length === 0 ? (
        <div className="bg-white rounded-xl border border-[#D8D5D0] shadow-sm p-12 text-center">
          <p className="text-[#7A756E]">
            {searchQuery ? 'No archived leads match your search.' : 'No archived leads yet.'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {filtered.map((lead) => {
            const statusCfg = LEAD_STATUS_CONFIG[lead.status];
            return (
              <button
                key={lead.id}
                onClick={() => onSelectLead(lead.id)}
                className="bg-white rounded-xl border border-[#D8D5D0] shadow-sm p-4 text-left hover:shadow-md hover:border-[#ED202B]/30 transition"
              >
                <div className="flex items-start justify-between mb-2">
                  <h4 className="font-heading font-semibold text-sm text-[#201F1E]">{lead.businessName}</h4>
                  <span
                    className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium flex-shrink-0 ml-2"
                    style={{ backgroundColor: statusCfg.color + '18', color: statusCfg.color }}
                  >
                    {statusCfg.label}
                  </span>
                </div>
                <p className="text-xs text-[#7A756E] mb-1">{lead.decisionMakerName} &middot; {lead.decisionMakerRole} &middot; {lead.assignedToName}</p>
                <p className="text-xs text-[#7A756E] line-clamp-2">{lead.description}</p>
                <p className="text-xs text-[#D8D5D0] mt-2">
                  {new Date(lead.updatedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                </p>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
