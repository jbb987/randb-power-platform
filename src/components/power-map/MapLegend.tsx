import { AVAILABILITY_BINS } from '../../lib/powerMapData';

interface MapLegendProps {
  showGenerators: boolean;
  onToggleGenerators: () => void;
  showLines: boolean;
  onToggleLines: () => void;
  showSubstations: boolean;
  onToggleSubstations: () => void;
  subsRed: number;
  subsOrange: number;
  subsBlue: number;
  visibleBins: Set<number>;
  onToggleBin: (bin: number) => void;
}

const BIN_COUNTS_KEY: Record<number, 'subsRed' | 'subsOrange' | 'subsBlue'> = {
  0: 'subsRed',
  1: 'subsOrange',
  2: 'subsBlue',
};

export default function MapLegend({
  showGenerators,
  onToggleGenerators,
  showLines,
  onToggleLines,
  showSubstations,
  onToggleSubstations,
  subsRed,
  subsOrange,
  subsBlue,
  visibleBins,
  onToggleBin,
}: MapLegendProps) {
  const counts = { subsRed, subsOrange, subsBlue };

  return (
    <div className="bg-white rounded-xl shadow-sm border border-[#D8D5D0] p-4 space-y-4">
      <h3 className="font-heading font-semibold text-sm text-[#201F1E]">Layers</h3>

      {/* Toggle layers */}
      <div className="space-y-2">
        <label className="flex items-center gap-2 text-sm cursor-pointer">
          <input
            type="checkbox"
            checked={showGenerators}
            onChange={onToggleGenerators}
            className="accent-[#ED202B] w-3.5 h-3.5"
          />
          <span className="flex items-center gap-1.5">
            <svg className="w-3.5 h-3.5 flex-shrink-0" viewBox="0 0 16 16">
              <path d="M9 1L5 8h2l-1 7 5-8H9l1-6z" fill="#F59E0B" stroke="#FFF" strokeWidth="0.8" />
            </svg>
            Generators
          </span>
        </label>
        <label className="flex items-center gap-2 text-sm cursor-pointer">
          <input
            type="checkbox"
            checked={showLines}
            onChange={onToggleLines}
            className="accent-[#ED202B] w-3.5 h-3.5"
          />
          <span className="flex items-center gap-1.5">
            <span className="w-5 h-[2px] bg-[#201F1E] inline-block rounded-full" />
            Transmission Lines
          </span>
        </label>
        <label className="flex items-center gap-2 text-sm cursor-pointer">
          <input
            type="checkbox"
            checked={showSubstations}
            onChange={onToggleSubstations}
            className="accent-[#ED202B] w-3.5 h-3.5"
          />
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-[#201F1E] inline-block" />
            Substations
          </span>
        </label>
      </div>

      <hr className="border-[#D8D5D0]" />

      {/* Capacity Availability — checkbox per bin */}
      <div>
        <h4 className="text-xs font-medium text-[#7A756E] uppercase tracking-wide mb-2">
          Capacity Availability
        </h4>
        <div className="space-y-1.5">
          {AVAILABILITY_BINS.map(({ bin, color, label }) => (
            <label key={bin} className="flex items-center justify-between cursor-pointer">
              <span className="flex items-center gap-1.5">
                <input
                  type="checkbox"
                  checked={visibleBins.has(bin)}
                  onChange={() => onToggleBin(bin)}
                  className="w-3.5 h-3.5"
                  style={{ accentColor: color }}
                />
                <span
                  className="w-3 h-3 rounded-full inline-block flex-shrink-0 border border-white shadow-sm"
                  style={{ backgroundColor: color }}
                />
                <span className="text-xs text-[#7A756E]">{label}</span>
              </span>
              <span
                className="text-xs font-semibold tabular-nums"
                style={{ color }}
              >
                {counts[BIN_COUNTS_KEY[bin]]}
              </span>
            </label>
          ))}
        </div>
      </div>
    </div>
  );
}
