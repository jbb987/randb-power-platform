interface Props {
  iso: string;
  utilityTerritory: string;
  tsp: string;
}

const readOnlyClass =
  'rounded-lg border border-[#D8D5D0] bg-[#F5F4F2] px-3 py-2.5 text-sm text-[#201F1E]';

function TerritoryDisplay({ label, value }: { label: string; value: string }) {
  const parts = value ? value.split(' / ').filter(Boolean) : [];
  const hasMultiple = parts.length > 1;

  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-xs font-medium text-[#7A756E]">{label}</span>
      <div className={readOnlyClass}>{value || 'Not Available'}</div>
      {hasMultiple && (
        <div className="flex flex-wrap gap-1 mt-1">
          {parts.map((p, i) => (
            <span
              key={i}
              className="inline-block rounded-full bg-[#F5F4F2] border border-[#D8D5D0] px-2 py-0.5 text-[10px] text-[#201F1E]"
            >
              {p.trim()}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

export default function TerritorySection({ iso, utilityTerritory, tsp }: Props) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
      <TerritoryDisplay label="RTO / ISO" value={iso} />
      <TerritoryDisplay label="Utility Territory" value={utilityTerritory} />
      <TerritoryDisplay label="Transmission Service Provider" value={tsp} />
    </div>
  );
}
