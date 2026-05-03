import {
  ALL_WELL_STATUSES,
  STATUS_COLORS,
  type WellStatus,
} from '../../lib/wellFinderRrc';

interface StatusFilterProps {
  visible: Set<WellStatus>;
  counts?: Partial<Record<WellStatus, number>>;
  onToggle: (status: WellStatus) => void;
  onSelectAll: () => void;
  onClear: () => void;
}

export default function StatusFilter({
  visible,
  counts,
  onToggle,
  onSelectAll,
  onClear,
}: StatusFilterProps) {
  return (
    <div className="bg-white rounded-lg shadow-sm border border-[#D8D5D0] px-3 py-2.5 w-56">
      <div className="flex items-center justify-between mb-2">
        <span className="text-[10px] uppercase tracking-wide text-[#7A756E]">
          Well Status
        </span>
        <div className="flex gap-2 text-[10px]">
          <button
            onClick={onSelectAll}
            className="text-[#ED202B] hover:underline"
          >
            All
          </button>
          <button
            onClick={onClear}
            className="text-[#7A756E] hover:underline"
          >
            None
          </button>
        </div>
      </div>
      <div className="space-y-1">
        {ALL_WELL_STATUSES.map((status) => {
          const isOn = visible.has(status);
          const count = counts?.[status];
          return (
            <button
              key={status}
              onClick={() => onToggle(status)}
              className={`w-full flex items-center gap-2 text-xs px-1 py-0.5 rounded transition ${
                isOn ? 'opacity-100' : 'opacity-40 hover:opacity-70'
              }`}
            >
              <span
                className="inline-block w-2.5 h-2.5 rounded-full shrink-0"
                style={{ backgroundColor: STATUS_COLORS[status] }}
              />
              <span className="text-[#201F1E] flex-1 text-left">{status}</span>
              {typeof count === 'number' && (
                <span className="text-[#7A756E] font-mono text-[10px]">
                  {count.toLocaleString()}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
