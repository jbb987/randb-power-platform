import type { NearbyPowerPlant } from '../../types';
import { computeSiteFuelMix, computeStateGenMix, type FuelMixEntry } from '../../utils/fuelMix';

interface Props {
  nearbyPowerPlants: NearbyPowerPlant[];
  stateGenerationByFuel: Record<string, number> | null;
  detectedState: string | null;
  loading: boolean;
}

const DISPLAY_LABELS: Record<string, string> = {
  'Other': 'Other (Battery, etc.)',
};

function fmtValue(value: number, unit: string): string {
  if (unit === 'MW') {
    if (value >= 1000) return `${(value / 1000).toFixed(1)} GW`;
    return `${Math.round(value).toLocaleString()} MW`;
  }
  if (unit === 'TWh') {
    const twh = value / 1000;
    if (twh >= 1) return `${twh.toFixed(1)} TWh`;
    return `${Math.round(value).toLocaleString()} GWh`;
  }
  return `${Math.round(value).toLocaleString()} ${unit}`;
}

function StackedBar({ entries }: { entries: FuelMixEntry[] }) {
  if (entries.length === 0) {
    return (
      <div className="h-8 rounded-lg bg-[#F5F4F2] flex items-center justify-center">
        <span className="text-[10px] text-[#7A756E]">No data available</span>
      </div>
    );
  }

  return (
    <div className="h-8 rounded-lg overflow-hidden flex">
      {entries.map((e) => (
        <div
          key={e.source}
          className="h-full transition-all duration-500 flex items-center justify-center"
          style={{
            width: `${Math.max(e.pct, 0.5)}%`,
            backgroundColor: e.color,
          }}
          title={`${e.source}: ${e.pct.toFixed(1)}%`}
        >
          {e.pct >= 10 && (
            <span className="text-[10px] font-medium text-white drop-shadow-sm whitespace-nowrap">
              {e.pct.toFixed(0)}%
            </span>
          )}
        </div>
      ))}
    </div>
  );
}

function Legend({ entries, unit }: { entries: FuelMixEntry[]; unit: string }) {
  return (
    <div className="flex flex-wrap gap-x-5 gap-y-1 mt-2">
      {entries.map((e) => (
        <div key={e.source} className="flex items-center gap-1.5">
          <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: e.color }} />
          <span className="text-[11px] text-[#201F1E]">{DISPLAY_LABELS[e.source] ?? e.source}</span>
          <span className="text-[11px] text-[#7A756E] tabular-nums">{e.pct.toFixed(1)}%</span>
          <span className="text-[10px] text-[#7A756E] tabular-nums">({fmtValue(e.value, unit)})</span>
        </div>
      ))}
    </div>
  );
}

function FuelMixRow({ label, subtitle, entries, unit }: {
  label: string;
  subtitle?: string;
  entries: FuelMixEntry[];
  unit: string;
}) {
  return (
    <div>
      <div className="flex items-baseline gap-2 mb-1.5">
        <span className="text-xs font-medium text-[#201F1E]">{label}</span>
        {subtitle && <span className="text-[10px] text-[#7A756E]">{subtitle}</span>}
      </div>
      <StackedBar entries={entries} />
      <Legend entries={entries} unit={unit} />
    </div>
  );
}

function Skeleton() {
  return (
    <div className="animate-pulse space-y-2">
      <div className="h-3 w-24 bg-stone-200 rounded" />
      <div className="h-8 bg-stone-100 rounded-lg" />
      <div className="flex gap-4">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-3 w-20 bg-stone-200 rounded" />
        ))}
      </div>
    </div>
  );
}

export default function FuelMixCard({ nearbyPowerPlants, stateGenerationByFuel, detectedState, loading }: Props) {
  if (loading) {
    return (
      <div>
        <h3 className="font-heading text-sm font-semibold text-[#201F1E] mb-4">Fuel Mix</h3>
        <div className="space-y-5">
          <Skeleton />
          <Skeleton />
        </div>
      </div>
    );
  }

  const siteMix = computeSiteFuelMix(nearbyPowerPlants);
  const stateMix = stateGenerationByFuel ? computeStateGenMix(stateGenerationByFuel) : [];
  const totalSiteMW = siteMix.reduce((a, b) => a + b.value, 0);

  return (
    <div>
      <h3 className="font-heading text-sm font-semibold text-[#201F1E] mb-4">Fuel Mix</h3>

      <div className="space-y-5">
        <FuelMixRow
          label="Site (75mi radius)"
          subtitle={totalSiteMW >= 1000
            ? `${(totalSiteMW / 1000).toFixed(1)} GW total capacity`
            : totalSiteMW > 0
              ? `${Math.round(totalSiteMW).toLocaleString()} MW total capacity`
              : undefined}
          entries={siteMix}
          unit="MW"
        />

        <FuelMixRow
          label={detectedState ? `State (${detectedState})` : 'State'}
          subtitle="Annual generation"
          entries={stateMix}
          unit="TWh"
        />
      </div>
    </div>
  );
}
