/**
 * Small key/value metric tile. Shared by the Land Valuation section and the
 * One-Pager. Centered label / value / optional subtitle, optional red accent.
 */
export default function MetricCard({
  label,
  value,
  subtitle,
  accent,
}: {
  label: string;
  value: string;
  subtitle?: string;
  accent?: boolean;
}) {
  return (
    <div className="bg-[#FAFAF9] rounded-xl border border-[#D8D5D0]/60 px-4 py-3 text-center">
      <p className="text-[10px] uppercase tracking-wider text-[#7A756E] font-medium">{label}</p>
      <p
        className={`text-lg font-heading font-semibold mt-1 ${accent ? 'text-[#ED202B]' : 'text-[#201F1E]'}`}
      >
        {value}
      </p>
      {subtitle && <p className="text-[10px] text-[#7A756E] mt-0.5">{subtitle}</p>}
    </div>
  );
}
