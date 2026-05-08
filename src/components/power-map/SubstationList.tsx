import { useMemo, useState } from 'react';
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

const PLACEHOLDER_RX = /^UNKNOWN\d+$|^TAP\d+$|^SUB\s*T?\d*$/i;

export default function SubstationList({ substations, onFlyTo }: SubstationListProps) {
  const [query, setQuery] = useState('');

  // Sort active substations by availableMW descending. Hide placeholder names
  // (UNKNOWN######, TAP######, SUB T###) unless the search matches them.
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return substations
      .filter((s) => s.status === 'active')
      .filter((s) => {
        const isPlaceholder = PLACEHOLDER_RX.test(s.name);
        if (q) {
          return s.name.toLowerCase().includes(q);
        }
        return !isPlaceholder;
      })
      .sort((a, b) => b.availableMW - a.availableMW);
  }, [substations, query]);

  if (substations.filter((s) => s.status === 'active').length === 0) return null;

  return (
    <div className="bg-white rounded-xl shadow-sm border border-[#D8D5D0] p-3">
      <h3 className="font-heading font-semibold text-xs text-[#201F1E] mb-2">
        Substations ({filtered.length.toLocaleString()})
      </h3>
      <input
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search by name…"
        className="w-full mb-2 px-2 py-1 text-xs rounded border border-[#D8D5D0] bg-white outline-none focus:border-[#ED202B] focus:ring-1 focus:ring-[#ED202B]/20 placeholder:text-[#7A756E]"
      />
      <div className="space-y-0.5 max-h-60 overflow-y-auto -mx-1 px-1">
        {filtered.length === 0 && (
          <div className="text-[10px] text-[#7A756E] py-2 text-center">
            {query ? 'No matches in this state.' : 'No named substations.'}
          </div>
        )}
        {filtered.map((sub, i) => {
          const color = BIN_COLOR[sub.availabilityBin] ?? '#201F1E';
          const label = sub.availableMW <= 0 ? '0 MW' : `${sub.availableMW.toLocaleString()} MW`;

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
