interface MapStatsProps {
  totalPlants: number;
  totalCapacityMW: number;
  totalDemandMW: number;
  totalSubstations: number;
  totalLines: number;
  loading: boolean;
}

function formatMW(mw: number): string {
  if (mw >= 1000) return `${(mw / 1000).toFixed(1)} GW`;
  return `${mw.toLocaleString()} MW`;
}

export default function MapStats({
  totalPlants,
  totalCapacityMW,
  totalDemandMW,
  totalSubstations,
  totalLines,
  loading,
}: MapStatsProps) {
  const stats = [
    { label: 'Generators', value: totalPlants.toLocaleString() },
    { label: 'Installed Cap.', value: formatMW(totalCapacityMW) },
    { label: 'Avg. Demand', value: formatMW(totalDemandMW) },
    { label: 'Substations', value: totalSubstations.toLocaleString() },
    { label: 'Trans. Lines', value: totalLines.toLocaleString() },
  ];

  return (
    <div className="bg-white rounded-xl shadow-sm border border-[#D8D5D0] p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-heading font-semibold text-sm text-[#201F1E]">State Overview</h3>
        {loading && (
          <div className="w-4 h-4 border-2 border-[#ED202B]/30 border-t-[#ED202B] rounded-full animate-spin" />
        )}
      </div>
      <div className="space-y-2">
        {stats.map((stat) => (
          <div key={stat.label} className="flex items-center justify-between">
            <span className="text-sm text-[#7A756E]">{stat.label}</span>
            <span className="text-sm font-medium text-[#201F1E] tabular-nums">{stat.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
