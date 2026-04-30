import { useCountyQueueLoad } from '../../hooks/useCountyQueueLoad';
import type { QueueFuel } from '../../types';

const FUEL_LABEL: Record<QueueFuel, string> = {
  SOLAR: 'Solar', WIND: 'Wind', STORAGE: 'Storage', HYBRID: 'Hybrid',
  GAS: 'Gas', NUCLEAR: 'Nuclear', HYDRO: 'Hydro', COAL: 'Coal',
  BIOMASS: 'Biomass', OIL: 'Oil', GEOTHERMAL: 'Geothermal', OTHER: 'Other',
};

const FUEL_COLOR: Record<QueueFuel, string> = {
  SOLAR: '#F59E0B', WIND: '#3B82F6', STORAGE: '#10B981', HYBRID: '#8B5CF6',
  GAS: '#EF4444', NUCLEAR: '#A855F7', HYDRO: '#06B6D4', COAL: '#6B7280',
  BIOMASS: '#22C55E', OIL: '#78716C', GEOTHERMAL: '#F97316', OTHER: '#9CA3AF',
};

const fmtMW = (mw: number) => {
  if (mw >= 1000) return `${(mw / 1000).toFixed(1)} GW`;
  return `${Math.round(mw).toLocaleString()} MW`;
};
const fmtCount = (n: number) => n.toLocaleString();
const fmtCodYear = (iso: string | null) => (iso ? iso.slice(0, 4) : '—');

interface Props {
  state: string | null | undefined;
  county: string | null | undefined;
}

export default function CountyQueueSection({ state, county }: Props) {
  const { data, loading } = useCountyQueueLoad(state, county);

  if (!state || !county) {
    const missing = [!state && 'state', !county && 'county'].filter(Boolean).join(' and ');
    return (
      <div className="bg-white rounded-2xl border border-[#D8D5D0] p-5 md:p-6 mt-5">
        <h3 className="font-heading font-semibold text-sm text-[#201F1E] mb-2">County Power Queue</h3>
        <p className="text-xs text-[#7A756E]">
          Set <span className="font-medium">{missing}</span> on this site (edit the site or re-run analysis) to see county-level queue data.
        </p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="bg-white rounded-2xl border border-[#D8D5D0] p-5 md:p-6 mt-5">
        <h3 className="font-heading font-semibold text-sm text-[#201F1E] mb-2">County Power Queue</h3>
        <p className="text-xs text-[#7A756E]">Loading…</p>
      </div>
    );
  }

  if (!data || (data.active_count === 0 && data.in_service_count === 0 && data.withdrawn_count_5y === 0)) {
    return (
      <div className="bg-white rounded-2xl border border-[#D8D5D0] p-5 md:p-6 mt-5">
        <h3 className="font-heading font-semibold text-sm text-[#201F1E] mb-2">County Power Queue</h3>
        <p className="text-xs text-[#7A756E]">No queue activity in this county.</p>
      </div>
    );
  }

  const wdRate = data.withdrawal_rate_5y;
  const medianYears = data.median_time_to_cod_days != null
    ? `${(data.median_time_to_cod_days / 365).toFixed(1)} yrs`
    : null;

  // Sort fuel mix by share desc
  const fuelEntries = Object.entries(data.fuel_mix)
    .filter(([, v]) => v != null && v > 0.001)
    .sort(([, a], [, b]) => (b ?? 0) - (a ?? 0)) as [QueueFuel, number][];

  // Sort voltage mix descending by class (numeric)
  const voltageEntries = Object.entries(data.voltage_mix)
    .filter(([, v]) => v > 0.001)
    .sort(([a], [b]) => Number(b) - Number(a));

  return (
    <div className="bg-white rounded-2xl border border-[#D8D5D0] p-5 md:p-6 mt-5">
      <h3 className="font-heading font-semibold text-sm text-[#201F1E] mb-4">County Power Queue</h3>

      {/* Snapshot stats */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-y-2 gap-x-6 text-xs mb-5">
        <div className="flex justify-between">
          <span className="text-[#7A756E]">Active</span>
          <span className="font-medium text-[#201F1E]">{fmtCount(data.active_count)} · {fmtMW(data.active_mw)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-[#7A756E]">Withdrawn (5y)</span>
          <span className="font-medium text-[#201F1E]">{fmtCount(data.withdrawn_count_5y)} · {fmtMW(data.withdrawn_mw_5y)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-[#7A756E]">In service</span>
          <span className="font-medium text-[#201F1E]">{fmtCount(data.in_service_count)} · {fmtMW(data.in_service_mw)}</span>
        </div>
        {wdRate != null && (
          <div className="flex justify-between">
            <span className="text-[#7A756E]">Withdrawal rate (5y)</span>
            <span
              className="font-semibold"
              style={{ color: wdRate >= 0.5 ? '#EF4444' : wdRate >= 0.25 ? '#F97316' : '#3B82F6' }}
            >
              {Math.round(wdRate * 100)}%
            </span>
          </div>
        )}
        {medianYears && (
          <div className="flex justify-between">
            <span className="text-[#7A756E]">Median time to COD</span>
            <span className="font-medium text-[#201F1E]">
              {medianYears}<span className="text-[#7A756E] ml-1">(n={data.completed_sample_size})</span>
            </span>
          </div>
        )}
        {data.earliest_active_cod && (
          <div className="flex justify-between">
            <span className="text-[#7A756E]">Earliest active COD</span>
            <span className="font-medium text-[#201F1E]">{fmtCodYear(data.earliest_active_cod)}</span>
          </div>
        )}
      </div>

      {/* Fuel mix */}
      {fuelEntries.length > 0 && (
        <div className="mb-5">
          <div className="text-[10px] uppercase tracking-wide text-[#7A756E] mb-2">Active queue fuel mix</div>
          <div className="space-y-1">
            {fuelEntries.map(([fuel, share]) => {
              const mwShare = (share ?? 0) * data.active_mw;
              return (
                <div key={fuel} className="flex items-center gap-2 text-xs">
                  <span className="w-16 text-[#7A756E] shrink-0">{FUEL_LABEL[fuel]}</span>
                  <div className="flex-1 h-2 bg-stone-100 rounded overflow-hidden">
                    <div
                      className="h-full rounded"
                      style={{ width: `${(share ?? 0) * 100}%`, backgroundColor: FUEL_COLOR[fuel] }}
                    />
                  </div>
                  <span className="w-12 text-right text-[#201F1E] font-medium tabular-nums">
                    {Math.round((share ?? 0) * 100)}%
                  </span>
                  <span className="w-16 text-right text-[#7A756E] tabular-nums shrink-0">{fmtMW(mwShare)}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Voltage class mix */}
      {voltageEntries.length > 0 && (
        <div className="mb-5">
          <div className="text-[10px] uppercase tracking-wide text-[#7A756E] mb-2">Voltage class breakdown</div>
          <div className="space-y-1">
            {voltageEntries.map(([volt, share]) => (
              <div key={volt} className="flex items-center gap-2 text-xs">
                <span className="w-16 text-[#7A756E] shrink-0">{volt} kV</span>
                <div className="flex-1 h-2 bg-stone-100 rounded overflow-hidden">
                  <div className="h-full bg-[#7A756E] rounded" style={{ width: `${share * 100}%` }} />
                </div>
                <span className="w-12 text-right text-[#201F1E] font-medium tabular-nums">
                  {Math.round(share * 100)}%
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Top 10 active projects */}
      {data.top_active.length > 0 && (
        <div>
          <div className="text-[10px] uppercase tracking-wide text-[#7A756E] mb-2">Top 10 active projects</div>
          <div className="overflow-x-auto -mx-1">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-[#7A756E] border-b border-[#D8D5D0]">
                  <th className="py-1 pr-2 font-normal">Project</th>
                  <th className="py-1 px-2 font-normal text-right">MW</th>
                  <th className="py-1 px-2 font-normal">Fuel</th>
                  <th className="py-1 px-2 font-normal">kV</th>
                  <th className="py-1 pl-2 font-normal">COD</th>
                </tr>
              </thead>
              <tbody>
                {data.top_active.slice(0, 10).map((p, i) => (
                  <tr key={i} className="border-b border-[#D8D5D0]/50 last:border-0">
                    <td className="py-1.5 pr-2 text-[#201F1E] truncate max-w-[280px]">{p.name || 'Unnamed'}</td>
                    <td className="py-1.5 px-2 text-right text-[#201F1E] font-medium tabular-nums">{fmtMW(p.mw)}</td>
                    <td className="py-1.5 px-2 text-[#7A756E]">{FUEL_LABEL[p.fuel]}</td>
                    <td className="py-1.5 px-2 text-[#7A756E] tabular-nums">{p.voltage_kv ? `${p.voltage_kv}` : '—'}</td>
                    <td className="py-1.5 pl-2 text-[#7A756E] tabular-nums">{fmtCodYear(p.cod)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
