import { AVAILABILITY_BINS, STATUS_COLORS } from '../../lib/powerMapData';

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
    <div className="bg-white rounded-xl shadow-sm border border-[#D8D5D0] p-3 space-y-3 text-xs">
      {/* Layer toggles */}
      <div className="space-y-1.5">
        <label className="flex items-center gap-2 cursor-pointer">
          <input type="checkbox" checked={showGenerators} onChange={onToggleGenerators} className="accent-[#ED202B] w-3 h-3" />
          <svg className="w-3 h-3 flex-shrink-0" viewBox="0 0 16 16">
            <path d="M9 1L5 8h2l-1 7 5-8H9l1-6z" fill="#22C55E" stroke="#FFF" strokeWidth="0.8" />
          </svg>
          <span className="text-[#7A756E]">Generators</span>
        </label>
        <label className="flex items-center gap-2 cursor-pointer">
          <input type="checkbox" checked={showLines} onChange={onToggleLines} className="accent-[#ED202B] w-3 h-3" />
          <span className="w-4 h-[2px] bg-[#201F1E] inline-block rounded-full" />
          <span className="text-[#7A756E]">Transmission Lines</span>
        </label>
        <label className="flex items-center gap-2 cursor-pointer">
          <input type="checkbox" checked={showSubstations} onChange={onToggleSubstations} className="accent-[#ED202B] w-3 h-3" />
          <span className="w-2.5 h-2.5 rounded-full bg-[#201F1E] inline-block" />
          <span className="text-[#7A756E]">Substations</span>
        </label>
      </div>

      <hr className="border-[#D8D5D0]" />

      {/* Substation availability */}
      <div className="space-y-1.5">
        {AVAILABILITY_BINS.map(({ bin, color, label }) => (
          <label key={bin} className="flex items-center justify-between cursor-pointer">
            <span className="flex items-center gap-1.5">
              <input type="checkbox" checked={visibleBins.has(bin)} onChange={() => onToggleBin(bin)} className="accent-[#ED202B] w-3 h-3" />
              <span className="w-2.5 h-2.5 rounded-full inline-block flex-shrink-0" style={{ backgroundColor: color }} />
              <span className="text-[#7A756E]">{label}</span>
            </span>
            <span className="font-semibold tabular-nums" style={{ color }}>{counts[BIN_COUNTS_KEY[bin]]}</span>
          </label>
        ))}
      </div>

      <hr className="border-[#D8D5D0]" />

      {/* Status key */}
      <div className="space-y-1">
        <div className="flex items-center gap-1.5">
          <span className="w-4 h-[2px] inline-block rounded-full" style={{ backgroundColor: STATUS_COLORS.active }} />
          <span className="text-[#7A756E]">Active</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-4 inline-block" style={{ height: 0, borderTop: `2px dashed ${STATUS_COLORS.planned}` }} />
          <span className="text-[#7A756E]">Planned</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-4 inline-block" style={{ height: 0, borderTop: `2px dashed ${STATUS_COLORS.retired}` }} />
          <span className="text-[#7A756E]">Retired</span>
        </div>
      </div>
    </div>
  );
}
