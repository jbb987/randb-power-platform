import type { Lead } from '../../types';
import { LEAD_STATUS_CONFIG, ACTIVE_LEAD_STATUSES } from '../../types';
import type { LeadStatus } from '../../types';

interface Props {
  leads: Lead[];
}

export default function CrmStats({ leads }: Props) {
  const total = leads.length;
  const active = leads.filter((l) => ACTIVE_LEAD_STATUSES.includes(l.status)).length;
  const won = leads.filter((l) => l.status === 'won').length;
  const lost = leads.filter((l) => l.status === 'lost').length;
  const archived = won + lost;
  const conversionRate = archived > 0 ? Math.round((won / archived) * 100) : 0;

  // Status breakdown
  const statusCounts: Record<LeadStatus, number> = {
    new: 0, call_1: 0, email_sent: 0, call_2: 0, call_3: 0, won: 0, lost: 0,
  };
  leads.forEach((l) => { statusCounts[l.status]++; });

  // Leads created per week (last 4 weeks)
  const now = Date.now();
  const weekMs = 7 * 24 * 60 * 60 * 1000;
  const weeklyData = [0, 0, 0, 0].map((_, i) => {
    const start = now - (i + 1) * weekMs;
    const end = now - i * weekMs;
    return leads.filter((l) => l.createdAt >= start && l.createdAt < end).length;
  }).reverse();

  const summaryCards = [
    { label: 'Total Leads', value: total, color: '#ED202B' },
    { label: 'Active Pipeline', value: active, color: '#3B82F6' },
    { label: 'Won', value: won, color: '#10B981' },
    { label: 'Lost', value: lost, color: '#6B7280' },
    { label: 'Conversion Rate', value: `${conversionRate}%`, color: '#8B5CF6' },
  ];

  const maxBarValue = Math.max(...Object.values(statusCounts), 1);

  return (
    <div className="flex-1 space-y-6">
      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
        {summaryCards.map((card) => (
          <div key={card.label} className="bg-white rounded-xl border border-[#D8D5D0] shadow-sm p-4">
            <p className="text-xs font-medium text-[#7A756E] mb-1">{card.label}</p>
            <p className="text-2xl font-heading font-semibold" style={{ color: card.color }}>
              {card.value}
            </p>
          </div>
        ))}
      </div>

      {/* Pipeline breakdown */}
      <div className="bg-white rounded-xl border border-[#D8D5D0] shadow-sm p-5">
        <h3 className="font-heading text-base font-semibold text-[#201F1E] mb-4">Pipeline Breakdown</h3>
        <div className="space-y-3">
          {(Object.keys(statusCounts) as LeadStatus[]).map((status) => {
            const cfg = LEAD_STATUS_CONFIG[status];
            const count = statusCounts[status];
            const pct = Math.round((count / maxBarValue) * 100);
            return (
              <div key={status} className="flex items-center gap-3">
                <span className="text-xs font-medium text-[#7A756E] w-20 text-right">{cfg.label}</span>
                <div className="flex-1 bg-stone-100 rounded-full h-6 overflow-hidden">
                  <div
                    className="h-full rounded-full flex items-center justify-end pr-2 transition-all duration-500"
                    style={{ width: `${Math.max(pct, count > 0 ? 8 : 0)}%`, backgroundColor: cfg.color }}
                  >
                    {count > 0 && (
                      <span className="text-xs font-medium text-white">{count}</span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Weekly activity */}
      <div className="bg-white rounded-xl border border-[#D8D5D0] shadow-sm p-5">
        <h3 className="font-heading text-base font-semibold text-[#201F1E] mb-4">Leads Created (Last 4 Weeks)</h3>
        <div className="flex items-end gap-3 h-32">
          {weeklyData.map((count, i) => {
            const maxWeek = Math.max(...weeklyData, 1);
            const heightPct = (count / maxWeek) * 100;
            return (
              <div key={i} className="flex-1 flex flex-col items-center gap-1">
                <span className="text-xs font-medium text-[#201F1E]">{count}</span>
                <div className="w-full bg-stone-100 rounded-t-md overflow-hidden" style={{ height: '100px' }}>
                  <div
                    className="w-full bg-[#ED202B] rounded-t-md transition-all duration-500"
                    style={{ height: `${Math.max(heightPct, count > 0 ? 4 : 0)}%`, marginTop: `${100 - Math.max(heightPct, count > 0 ? 4 : 0)}%` }}
                  />
                </div>
                <span className="text-xs text-[#7A756E]">W{i === 3 ? ' (this)' : `-${3 - i}`}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
