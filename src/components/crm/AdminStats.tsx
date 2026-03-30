import type { Lead } from '../../types';
import { LEAD_STATUS_CONFIG, ACTIVE_LEAD_STATUSES } from '../../types';
import type { LeadStatus } from '../../types';

interface Props {
  leads: Lead[];
}

interface SalespersonStats {
  name: string;
  total: number;
  active: number;
  won: number;
  lost: number;
  conversionRate: number;
}

export default function AdminStats({ leads }: Props) {
  // Aggregate by salesperson
  const byPerson = new Map<string, Lead[]>();
  leads.forEach((l) => {
    const name = l.assignedToName || 'Unassigned';
    if (!byPerson.has(name)) byPerson.set(name, []);
    byPerson.get(name)!.push(l);
  });

  const salespersonStats: SalespersonStats[] = Array.from(byPerson.entries())
    .map(([name, personLeads]) => {
      const won = personLeads.filter((l) => l.status === 'won').length;
      const lost = personLeads.filter((l) => l.status === 'lost').length;
      const archived = won + lost;
      return {
        name,
        total: personLeads.length,
        active: personLeads.filter((l) => ACTIVE_LEAD_STATUSES.includes(l.status)).length,
        won,
        lost,
        conversionRate: archived > 0 ? Math.round((won / archived) * 100) : 0,
      };
    })
    .sort((a, b) => b.won - a.won);

  // Global stats
  const totalLeads = leads.length;
  const totalActive = leads.filter((l) => ACTIVE_LEAD_STATUSES.includes(l.status)).length;
  const totalWon = leads.filter((l) => l.status === 'won').length;
  const totalLost = leads.filter((l) => l.status === 'lost').length;
  const totalArchived = totalWon + totalLost;
  const globalConversion = totalArchived > 0 ? Math.round((totalWon / totalArchived) * 100) : 0;

  // Status breakdown across all
  const statusCounts: Record<LeadStatus, number> = {
    new: 0, call_1: 0, email_sent: 0, call_2: 0, call_3: 0, won: 0, lost: 0,
  };
  leads.forEach((l) => { statusCounts[l.status]++; });
  const maxBarValue = Math.max(...Object.values(statusCounts), 1);

  return (
    <div className="space-y-6">
      {/* Global summary */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
        {[
          { label: 'Total Leads', value: totalLeads, color: '#ED202B' },
          { label: 'Active Pipeline', value: totalActive, color: '#3B82F6' },
          { label: 'Won', value: totalWon, color: '#10B981' },
          { label: 'Lost', value: totalLost, color: '#6B7280' },
          { label: 'Conversion Rate', value: `${globalConversion}%`, color: '#8B5CF6' },
        ].map((card) => (
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
        <h3 className="font-heading text-base font-semibold text-[#201F1E] mb-4">Pipeline Breakdown (All Sales)</h3>
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

      {/* Leaderboard */}
      <div className="bg-white rounded-xl border border-[#D8D5D0] shadow-sm p-5">
        <h3 className="font-heading text-base font-semibold text-[#201F1E] mb-4">Salesperson Leaderboard</h3>
        {salespersonStats.length === 0 ? (
          <p className="text-sm text-[#7A756E]">No leads assigned yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[#D8D5D0]">
                  <th className="text-left px-4 py-2 font-medium text-[#7A756E]">Salesperson</th>
                  <th className="text-center px-4 py-2 font-medium text-[#7A756E]">Total</th>
                  <th className="text-center px-4 py-2 font-medium text-[#7A756E]">Active</th>
                  <th className="text-center px-4 py-2 font-medium text-[#7A756E]">Won</th>
                  <th className="text-center px-4 py-2 font-medium text-[#7A756E]">Lost</th>
                  <th className="text-center px-4 py-2 font-medium text-[#7A756E]">Conversion</th>
                </tr>
              </thead>
              <tbody>
                {salespersonStats.map((sp, i) => (
                  <tr key={sp.name} className="border-b border-[#D8D5D0]/50 hover:bg-stone-50 transition">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        {i === 0 && salespersonStats.length > 1 && (
                          <span className="text-xs bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded font-medium">1st</span>
                        )}
                        <span className="font-medium text-[#201F1E]">{sp.name}</span>
                      </div>
                    </td>
                    <td className="text-center px-4 py-3 text-[#201F1E]">{sp.total}</td>
                    <td className="text-center px-4 py-3 text-[#3B82F6] font-medium">{sp.active}</td>
                    <td className="text-center px-4 py-3 text-emerald-600 font-medium">{sp.won}</td>
                    <td className="text-center px-4 py-3 text-[#7A756E]">{sp.lost}</td>
                    <td className="text-center px-4 py-3">
                      <span className={`font-medium ${sp.conversionRate >= 50 ? 'text-emerald-600' : sp.conversionRate > 0 ? 'text-amber-600' : 'text-[#7A756E]'}`}>
                        {sp.conversionRate}%
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
