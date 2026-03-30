interface MapStatsProps {
  totalPlants: number;
  totalGenerationMW: number;
  totalSubstations: number;
  totalLines: number;
  totalAvailableMW: number;
  loading: boolean;
}

function formatMW(mw: number): string {
  if (mw >= 1000) return `${(mw / 1000).toFixed(1)} GW`;
  return `${mw.toLocaleString()} MW`;
}

export default function MapStats({
  totalPlants,
  totalGenerationMW,
  totalSubstations,
  totalLines,
  totalAvailableMW,
  loading,
}: MapStatsProps) {
  const stats = [
    { label: 'Generators', value: totalPlants.toLocaleString() },
    { label: 'Avg. Output', value: formatMW(totalGenerationMW) },
    { label: 'Substations', value: totalSubstations.toLocaleString() },
    { label: 'Trans. Lines', value: totalLines.toLocaleString() },
    { label: 'Est. Surplus', value: formatMW(totalAvailableMW) },
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
