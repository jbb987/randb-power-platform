import { useState } from 'react';
import type { SolarWindResource } from '../../types';
import { getStateAverage, US_NATIONAL_AVERAGE } from '../../lib/solarAverages';

interface Props {
  solarWind: SolarWindResource | null;
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
      {[0, 1].map((i) => (
        <div key={i} className="space-y-2">
          <div className="h-3 w-24 bg-stone-200 rounded" />
          {[0, 1, 2].map((j) => (
            <div key={j} className="flex items-center gap-2">
              <div className="w-24 h-3 bg-stone-200 rounded" />
              <div className="flex-1 h-5 bg-stone-100 rounded-full" />
              <div className="w-16 h-3 bg-stone-200 rounded" />
            </div>
          ))}
        </div>
      ))}
      <div className="h-3 w-40 bg-stone-200 rounded" />
    </div>
  );
}

// ── Main widget ────────────────────────────────────────────────────────────

export default function SolarResourceWidget({ solarWind, detectedState, loading }: Props) {
  if (loading) {
    return (
      <div>
        <h3 className="font-heading text-xs font-semibold uppercase tracking-wider text-[#201F1E] mb-3">
          Solar Resource
        </h3>
        <Skeleton />
      </div>
    );
  }

  if (!solarWind) {
    return (
      <div>
        <h3 className="font-heading text-xs font-semibold uppercase tracking-wider text-[#201F1E] mb-3">
          Solar Resource
        </h3>
        <p className="text-xs text-[#7A756E]">Solar data unavailable for this location.</p>
      </div>
    );
  }

  const stateAvg = getStateAverage(detectedState);
  const stateLabel = detectedState ? `${detectedState} avg` : null;

  const ghiEntries: BarEntry[] = [
    { label: 'This site', value: solarWind.ghi, color: '#ED202B' },
    ...(stateAvg && stateLabel
      ? [{ label: stateLabel, value: stateAvg.ghi, color: '#D8D5D0', muted: true }]
      : []),
    { label: 'US avg', value: US_NATIONAL_AVERAGE.ghi, color: '#B8B3AC', muted: true },
  ];

  const latTiltEntries: BarEntry[] = [
    { label: 'This site', value: solarWind.capacity, color: '#ED202B' },
    ...(stateAvg && stateLabel
      ? [{ label: stateLabel, value: stateAvg.latTilt, color: '#D8D5D0', muted: true }]
      : []),
    { label: 'US avg', value: US_NATIONAL_AVERAGE.latTilt, color: '#B8B3AC', muted: true },
  ];

  return (
    <div>
      <h3 className="font-heading text-xs font-semibold uppercase tracking-wider text-[#201F1E] mb-3">
        Solar Resource
      </h3>

      <div className="space-y-5">
        <ComparisonBar
          label="GHI (annual avg)"
          tooltip="Total solar energy on a flat surface"
          entries={ghiEntries}
          unit="kWh/m²/day"
        />

        <ComparisonBar
          label="Lat-Tilt Irradiance (annual avg)"
          tooltip="Solar energy on panels tilted at site latitude"
          entries={latTiltEntries}
          unit="kWh/m²/day"
        />

        <div className="flex justify-between items-center pt-1 border-t border-[#D8D5D0]/50">
          <span className="text-xs text-[#7A756E]">Wind Speed (avg annual)</span>
          <span className="text-sm tabular-nums text-[#201F1E]">
            {solarWind.windSpeed > 0 ? `${solarWind.windSpeed.toFixed(1)} m/s` : 'Not available'}
          </span>
        </div>
      </div>
    </div>
  );
}
