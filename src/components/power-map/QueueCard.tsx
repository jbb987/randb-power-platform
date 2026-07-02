import { useQueueLoad } from '../../hooks/useQueueLoad';
import type {
  QueueAreaBucket,
  QueueAreaCluster,
  QueueConfirmedBucket,
  QueueFuel,
  QueueIso,
  QueueTopActive,
} from '../../types';

const FUEL_LABEL: Record<QueueFuel, string> = {
  SOLAR: 'Solar',
  WIND: 'Wind',
  STORAGE: 'Storage',
  HYBRID: 'Hybrid',
  GAS: 'Gas',
  NUCLEAR: 'Nuclear',
  HYDRO: 'Hydro',
  COAL: 'Coal',
  BIOMASS: 'Biomass',
  OIL: 'Oil',
  GEOTHERMAL: 'Geothermal',
  OTHER: 'Other',
};

const ISO_LABEL: Record<QueueIso, string> = {
  PJM: 'PJM',
  MISO: 'MISO',
  ERCOT: 'ERCOT',
  SPP: 'SPP',
  CAISO: 'CAISO',
  NYISO: 'NYISO',
  ISONE: 'ISO-NE',
};

/** Format power: GW (1 decimal) above 1000 MW, MW (rounded) below. */
const fmtMW = (mw: number) => {
  if (mw >= 1000) return `${(mw / 1000).toFixed(1)} GW`;
  return `${Math.round(mw).toLocaleString()} MW`;
};
const fmtCount = (n: number, label: string) =>
  `${n.toLocaleString()} ${n === 1 ? label : `${label}s`}`;
const fmtCodYear = (iso: string | null) => (iso ? iso.slice(0, 4) : '—');

interface QueueCardProps {
  hifldId: number | null | undefined;
}

function StatRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between text-xs">
      <span className="text-[#7A756E]">{label}</span>
      <span className="font-medium text-[#201F1E]">{value}</span>
    </div>
  );
}

function TopActive({ items }: { items: QueueTopActive[] }) {
  if (items.length === 0) return null;
  return (
    <ul className="mt-1.5 space-y-0.5 text-xs">
      {items.map((p, i) => (
        <li key={i} className="flex justify-between gap-2">
          <span className="text-[#201F1E] truncate">{p.name || 'Unnamed'}</span>
          <span className="text-[#7A756E] shrink-0">
            {fmtMW(p.mw)} · {FUEL_LABEL[p.fuel]} · {fmtCodYear(p.cod)}
          </span>
        </li>
      ))}
    </ul>
  );
}

function ConfirmedSection({ data, iso }: { data: QueueConfirmedBucket; iso: QueueIso }) {
  const wdRate = data.withdrawal_rate_5y;
  const medianYears =
    data.median_time_to_cod_days != null
      ? `${(data.median_time_to_cod_days / 365).toFixed(1)} yrs`
      : null;

  return (
    <div>
      <div className="text-[10px] uppercase tracking-wide text-[#7A756E] mb-1.5">
        Interconnection queue · {ISO_LABEL[iso]}
      </div>
      <div className="space-y-1">
        {data.active_count > 0 && (
          <StatRow
            label="Active"
            value={`${fmtCount(data.active_count, 'project')} · ${fmtMW(data.active_mw)}`}
          />
        )}
        {data.withdrawn_count_5y > 0 && (
          <StatRow
            label="Withdrawn (5y)"
            value={`${fmtCount(data.withdrawn_count_5y, 'project')} · ${fmtMW(data.withdrawn_mw_5y)}`}
          />
        )}
        {data.in_service_count > 0 && (
          <StatRow
            label="In service"
            value={`${fmtCount(data.in_service_count, 'project')} · ${fmtMW(data.in_service_mw)}`}
          />
        )}
        {wdRate != null && (
          <div className="flex justify-between text-xs">
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
          <div className="flex justify-between text-xs">
            <span className="text-[#7A756E]">Median time to COD</span>
            <span className="font-medium text-[#201F1E]">
              {medianYears}
              <span className="text-[#7A756E] ml-1">(n={data.completed_sample_size})</span>
            </span>
          </div>
        )}
        {data.earliest_active_cod && (
          <StatRow label="Earliest active COD" value={fmtCodYear(data.earliest_active_cod)} />
        )}
      </div>
      {data.top_active.length > 0 && (
        <>
          <div className="text-[10px] uppercase tracking-wide text-[#7A756E] mt-2 mb-0.5">
            Top active projects
          </div>
          <TopActive items={data.top_active} />
        </>
      )}
    </div>
  );
}

function AreaSection({
  data,
  iso,
  cluster,
  hasConfirmed,
}: {
  data: QueueAreaBucket;
  iso: QueueIso;
  cluster?: QueueAreaCluster;
  hasConfirmed: boolean;
}) {
  const sizeText = cluster?.size && cluster.size > 1 ? cluster.size : null;
  const countyText = cluster?.county;
  const voltText = cluster?.voltage_kv;
  const scopeBits = [countyText, voltText ? `${voltText} kV` : null].filter(Boolean).join(' · ');

  return (
    <div className={hasConfirmed ? 'pt-2 mt-2 border-t border-[#D8D5D0]/60' : ''}>
      {!hasConfirmed && (
        <div className="text-[10px] uppercase tracking-wide text-[#7A756E] mb-1.5">
          Interconnection queue · {ISO_LABEL[iso]}
        </div>
      )}
      <div className="rounded bg-amber-50 border border-amber-200 px-2 py-1.5 mb-1.5 text-[11px] text-amber-900 leading-snug">
        <span className="font-semibold">Area-level data.</span>{' '}
        {hasConfirmed ? 'Additional projects' : 'Projects'} requested
        {scopeBits ? ` in ${scopeBits}` : ''} but not confirmed at this specific substation
        {sizeText
          ? ` — also shown on ${sizeText - 1} other ${sizeText - 1 === 1 ? 'substation' : 'substations'} in this cluster`
          : ''}
        .
      </div>
      <div className="space-y-1">
        {data.active_count > 0 && (
          <StatRow
            label="Active"
            value={`${fmtCount(data.active_count, 'project')} · ${fmtMW(data.active_mw)}`}
          />
        )}
        {data.withdrawn_count_5y > 0 && (
          <StatRow
            label="Withdrawn (5y)"
            value={`${fmtCount(data.withdrawn_count_5y, 'project')} · ${fmtMW(data.withdrawn_mw_5y)}`}
          />
        )}
        {data.in_service_count > 0 && (
          <StatRow
            label="In service"
            value={`${fmtCount(data.in_service_count, 'project')} · ${fmtMW(data.in_service_mw)}`}
          />
        )}
        {data.earliest_active_cod && (
          <StatRow label="Earliest active COD" value={fmtCodYear(data.earliest_active_cod)} />
        )}
      </div>
      {data.top_active.length > 0 && (
        <>
          <div className="text-[10px] uppercase tracking-wide text-[#7A756E] mt-2 mb-0.5">
            Top {hasConfirmed ? 'area ' : ''}projects
          </div>
          <TopActive items={data.top_active} />
        </>
      )}
    </div>
  );
}

export default function QueueCard({ hifldId }: QueueCardProps) {
  const { data, loading, error } = useQueueLoad(hifldId);

  if (hifldId == null) return null;

  const wrap = (children: React.ReactNode) => (
    <div className="pt-2 mt-1 border-t border-[#D8D5D0]">{children}</div>
  );

  if (loading)
    return wrap(
      <>
        <div className="text-[10px] uppercase tracking-wide text-[#7A756E] mb-1">
          Interconnection queue
        </div>
        <div className="text-xs text-[#7A756E]">Loading…</div>
      </>,
    );

  if (error)
    return wrap(
      <>
        <div className="text-[10px] uppercase tracking-wide text-[#7A756E] mb-1">
          Interconnection queue
        </div>
        <div className="text-xs text-[#7A756E]">Could not load queue data.</div>
      </>,
    );

  if (!data || (!data.confirmed && !data.area))
    return wrap(
      <>
        <div className="text-[10px] uppercase tracking-wide text-[#7A756E] mb-1">
          Interconnection queue
        </div>
        <div className="text-xs text-[#7A756E]">No queue activity.</div>
      </>,
    );

  return wrap(
    <>
      {data.confirmed && <ConfirmedSection data={data.confirmed} iso={data.iso} />}
      {data.area && (
        <AreaSection
          data={data.area}
          iso={data.iso}
          cluster={data.area_cluster}
          hasConfirmed={!!data.confirmed}
        />
      )}
    </>,
  );
}
