import { useMemo } from 'react';
import { AVAILABILITY_BINS } from '../../lib/powerMapData';
import type { MapSubstation } from '../../lib/powerMapData';

interface SubstationListProps {
  substations: MapSubstation[];
  onFlyTo: (lat: number, lng: number, name: string) => void;
}

const BIN_COLOR: Record<number, string> = {};
for (const { bin, color } of AVAILABILITY_BINS) {
  BIN_COLOR[bin] = color;
}

export default function SubstationList({ substations, onFlyTo }: SubstationListProps) {
  // Sort active substations by availableMW descending
  const sorted = useMemo(() => {
    return substations
      .filter((s) => s.status === 'active')
      .sort((a, b) => b.availableMW - a.availableMW);
  }, [substations]);

  if (sorted.length === 0) return null;

  return (
    <div className="bg-white rounded-xl shadow-sm border border-[#D8D5D0] p-3">
      <h3 className="font-heading font-semibold text-xs text-[#201F1E] mb-2">
        Substations ({sorted.length})
      </h3>
      <div className="space-y-0.5 max-h-60 overflow-y-auto -mx-1 px-1">
        {sorted.map((sub, i) => {
          const color = BIN_COLOR[sub.availabilityBin] ?? '#201F1E';
          const label = sub.availableMW <= 0
            ? '0 MW'
            : `${sub.availableMW.toLocaleString()} MW`;

          return (
            <button
              key={`${sub.name}-${i}`}
              onClick={() => onFlyTo(sub.lat, sub.lng, sub.name)}
              className="flex items-center justify-between w-full text-left px-1.5 py-1 rounded hover:bg-stone-50 transition group"
              title={`Fly to ${sub.name}`}
            >
              <span className="flex items-center gap-1.5 min-w-0">
                <span
                  className="w-2 h-2 rounded-full flex-shrink-0"
                  style={{ backgroundColor: color }}
                />
                <span className="text-[10px] text-[#201F1E] truncate group-hover:text-[#ED202B] transition">
                  {sub.name}
                </span>
              </span>
              <span
                className="text-[10px] font-semibold tabular-nums flex-shrink-0 ml-1"
                style={{ color }}
              >
                {label}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
