import { useState } from 'react';
import type { ElectricityPrice } from '../../types';
import { getStateElectricityAverage, US_NATIONAL_AVERAGE } from '../../lib/electricityAverages';

interface Props {
  electricityPrice: ElectricityPrice | null;
  detectedState: string | null;
  loading: boolean;
}

// ── Tooltip ────────────────────────────────────────────────────────────────

function Tooltip({ text }: { text: string }) {
  const [show, setShow] = useState(false);
  return (
    <span className="relative inline-flex ml-1">
      <button
        type="button"
        className="text-[#7A756E] hover:text-[#201F1E] transition"
        onMouseEnter={() => setShow(true)}
        onMouseLeave={() => setShow(false)}
        onFocus={() => setShow(true)}
        onBlur={() => setShow(false)}
        aria-label="Info"
      >
        <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z" />
        </svg>
      </button>
      {show && (
        <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 whitespace-nowrap rounded-md bg-[#201F1E] px-2 py-1 text-[10px] text-white shadow-lg z-10">
          {text}
        </span>
      )}
    </span>
  );
}

// ── Comparison bar ─────────────────────────────────────────────────────────

interface BarEntry {
  label: string;
  value: number;
  color: string;
  muted?: boolean;
}

function ComparisonBar({ label, tooltip, entries, unit }: {
  label: string;
  tooltip: string;
  entries: BarEntry[];
  unit: string;
}) {
  const maxVal = Math.max(...entries.map((e) => e.value), 0.1);

  return (
    <div>
      <div className="flex items-center mb-2">
        <span className="text-xs font-medium text-[#7A756E]">{label}</span>
        <Tooltip text={tooltip} />
      </div>
      <div className="space-y-1.5">
        {entries.map((entry) => (
          <div key={entry.label} className="flex items-center gap-2">
            <span className={`w-24 shrink-0 text-[11px] ${entry.muted ? 'text-[#7A756E]' : 'text-[#201F1E] font-medium'} truncate`}>
              {entry.label}
            </span>
            <div className="flex-1 h-5 bg-[#F5F4F2] rounded-full overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{
                  width: `${Math.min((entry.value / maxVal) * 100, 100)}%`,
                  backgroundColor: entry.color,
                }}
              />
            </div>
            <span className={`w-20 shrink-0 text-right text-[11px] tabular-nums ${entry.muted ? 'text-[#7A756E]' : 'text-[#201F1E] font-medium'}`}>
              {entry.value.toFixed(2)} {unit}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Skeleton loader ────────────────────────────────────────────────────────

function Skeleton() {
  return (
    <div className="animate-pulse space-y-4">
      {[0, 1, 2].map((i) => (
        <div key={i} className="space-y-2">
          <div className="h-3 w-28 bg-stone-200 rounded" />
          {[0, 1, 2].map((j) => (
            <div key={j} className="flex items-center gap-2">
              <div className="w-24 h-3 bg-stone-200 rounded" />
              <div className="flex-1 h-5 bg-stone-100 rounded-full" />
              <div className="w-16 h-3 bg-stone-200 rounded" />
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

// ── Main widget ────────────────────────────────────────────────────────────

export default function ElectricityPriceWidget({ electricityPrice, detectedState, loading }: Props) {
  if (loading) {
    return (
      <div>
        <h3 className="font-heading text-xs font-semibold uppercase tracking-wider text-[#201F1E] mb-3">
          Electricity Price
        </h3>
        <Skeleton />
      </div>
    );
  }

  // Use detected state to pull static averages — no live API needed
  const stateAvg = getStateElectricityAverage(detectedState);
  const stateLabel = detectedState ? `${detectedState} avg` : null;
  const siteData = electricityPrice ?? stateAvg;

  if (!siteData && !stateAvg) {
    return (
      <div>
        <h3 className="font-heading text-xs font-semibold uppercase tracking-wider text-[#201F1E] mb-3">
          Electricity Price
        </h3>
        <p className="text-xs text-[#7A756E]">Electricity price data unavailable for this location.</p>
      </div>
    );
  }

  const buildEntries = (
    sectorKey: keyof ElectricityPrice,
  ): BarEntry[] => {
    const entries: BarEntry[] = [];

    if (stateAvg && stateLabel) {
      entries.push({ label: stateLabel, value: stateAvg[sectorKey], color: '#ED202B' });
    }
    entries.push({ label: 'US avg', value: US_NATIONAL_AVERAGE[sectorKey], color: '#B8B3AC', muted: true });

    return entries;
  };

  return (
    <div>
      <h3 className="font-heading text-xs font-semibold uppercase tracking-wider text-[#201F1E] mb-3">
        Electricity Price
      </h3>

      <div className="space-y-5">
        <ComparisonBar
          label="Commercial"
          tooltip="Avg retail price for commercial customers"
          entries={buildEntries('commercial')}
          unit="¢/kWh"
        />

        <ComparisonBar
          label="Industrial"
          tooltip="Avg retail price for industrial customers"
          entries={buildEntries('industrial')}
          unit="¢/kWh"
        />

        <ComparisonBar
          label="All Sectors"
          tooltip="Avg retail price across all customer sectors"
          entries={buildEntries('allSectors')}
          unit="¢/kWh"
        />
      </div>
    </div>
  );
}
