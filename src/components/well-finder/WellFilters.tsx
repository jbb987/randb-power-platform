import StatusFilter from './StatusFilter';
import { ALL_WELL_STATUSES, type WellStatus } from '../../lib/wellFinderRrc';
import type { Sb1150Bucket } from '../../lib/sb1150';

interface WellFiltersProps {
  // Status filter (existing)
  visible: Set<WellStatus>;
  counts: Partial<Record<WellStatus, number>>;
  onToggle: (s: WellStatus) => void;
  onSelectAll: () => void;
  onClear: () => void;

  // New filters
  operatorFilter: string;
  onOperatorFilterChange: (s: string) => void;
  orphanOnly: boolean;
  onOrphanOnlyChange: (b: boolean) => void;
  minMonthsInactive: number;
  onMinMonthsInactiveChange: (n: number) => void;
  sb1150Filter: 'any' | Sb1150Bucket;
  onSb1150FilterChange: (b: 'any' | Sb1150Bucket) => void;
  minScore: number;
  onMinScoreChange: (n: number) => void;
  limitToView: boolean;
  onLimitToViewChange: (b: boolean) => void;
}

export default function WellFilters(props: WellFiltersProps) {
  const monthsPresets = [0, 12, 60, 120, 180];
  const monthsLabels = ['Any', '1+ yr', '5+ yr', '10+ yr', '15+ yr'];

  return (
    <div className="space-y-3 p-3 border-b border-[#D8D5D0] bg-stone-50">
      {/* Statewide vs viewport scope */}
      <div>
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={props.limitToView}
            onChange={(e) => props.onLimitToViewChange(e.target.checked)}
            className="w-3.5 h-3.5 accent-[#ED202B]"
          />
          <span className="text-xs text-[#201F1E]">Limit to current map view</span>
          <span
            className="text-[9px] text-[#7A756E] ml-auto"
            title="On: only rank wells visible in the current map viewport. Off (default): rank top candidates statewide."
          >
            ?
          </span>
        </label>
      </div>

      {/* Min Reactivation Score */}
      <div>
        <label className="flex items-baseline justify-between text-[10px] uppercase tracking-wide text-[#7A756E] mb-1">
          <span>Min reactivation score</span>
          <span className="font-mono normal-case tracking-normal text-[#201F1E]">
            {props.minScore > 0 ? `${props.minScore}+` : 'any'}
          </span>
        </label>
        <input
          type="range"
          min="0"
          max="100"
          step="5"
          value={props.minScore}
          onChange={(e) => props.onMinScoreChange(parseInt(e.target.value, 10))}
          className="w-full accent-[#ED202B]"
        />
      </div>

      {/* Operator search */}
      <div>
        <label className="block text-[10px] uppercase tracking-wide text-[#7A756E] mb-1">
          Operator
        </label>
        <input
          type="text"
          value={props.operatorFilter}
          onChange={(e) => props.onOperatorFilterChange(e.target.value)}
          placeholder="Search operator name…"
          className="w-full px-2 py-1.5 text-xs border border-[#D8D5D0] rounded bg-white focus:outline-none focus:border-[#ED202B] focus:ring-1 focus:ring-[#ED202B]/30"
        />
      </div>

      {/* Months inactive */}
      <div>
        <label className="block text-[10px] uppercase tracking-wide text-[#7A756E] mb-1">
          Min. inactive
        </label>
        <div className="flex gap-1">
          {monthsPresets.map((n, i) => (
            <button
              key={n}
              onClick={() => props.onMinMonthsInactiveChange(n)}
              className={`flex-1 px-1 py-1 text-[10px] rounded border transition ${
                props.minMonthsInactive === n
                  ? 'bg-[#ED202B] text-white border-[#ED202B]'
                  : 'bg-white text-[#201F1E] border-[#D8D5D0] hover:border-[#ED202B]'
              }`}
            >
              {monthsLabels[i]}
            </button>
          ))}
        </div>
      </div>

      {/* Orphan only */}
      <div>
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={props.orphanOnly}
            onChange={(e) => props.onOrphanOnlyChange(e.target.checked)}
            className="w-3.5 h-3.5 accent-[#ED202B]"
          />
          <span
            className="text-xs text-[#201F1E]"
            title="Operator P-5 delinquent — wells eligible for adoption under SB 1146 / Form P-4 takeover."
          >
            Orphan-listed only
          </span>
          <span className="text-[9px] px-1 py-0.5 rounded bg-red-100 text-red-700 font-medium ml-auto">
            SB 1146
          </span>
        </label>
      </div>

      {/* SB 1150 deadline window */}
      <div>
        <label
          className="block text-[10px] uppercase tracking-wide text-[#7A756E] mb-1"
          title="SB 1150 (effective Sept 1, 2027): wells 25+ yrs old AND 15+ yrs inactive must be plugged or reactivated. Filtering by trigger window surfaces operators facing the deadline."
        >
          SB 1150 deadline
        </label>
        <div className="flex gap-1 flex-wrap">
          {(['any', 'past', '<12mo', '<24mo', '<36mo'] as const).map((b) => (
            <button
              key={b}
              onClick={() => props.onSb1150FilterChange(b)}
              className={`flex-1 min-w-[42px] px-1 py-1 text-[10px] rounded border transition ${
                props.sb1150Filter === b
                  ? 'bg-[#ED202B] text-white border-[#ED202B]'
                  : 'bg-white text-[#201F1E] border-[#D8D5D0] hover:border-[#ED202B]'
              }`}
              title={b === 'any' ? 'All wells' : b === 'past' ? 'Already past trigger date' : `Trigger within ${b}`}
            >
              {b === 'any' ? 'Any' : b}
            </button>
          ))}
        </div>
      </div>

      {/* Status filter (existing component, simplified for sidebar layout) */}
      <div>
        <div className="text-[10px] uppercase tracking-wide text-[#7A756E] mb-1.5 flex items-center justify-between">
          Well Status
          <div className="flex gap-2 normal-case tracking-normal">
            <button onClick={props.onSelectAll} className="text-[#ED202B] hover:underline">
              All
            </button>
            <button onClick={props.onClear} className="text-[#7A756E] hover:underline">
              None
            </button>
          </div>
        </div>
        <div className="grid grid-cols-1 gap-0.5 max-h-48 overflow-auto">
          {ALL_WELL_STATUSES.map((s) => {
            const isOn = props.visible.has(s);
            const count = props.counts[s];
            return (
              <button
                key={s}
                onClick={() => props.onToggle(s)}
                className={`flex items-center gap-1.5 text-[10px] px-1 py-0.5 rounded transition ${
                  isOn ? 'opacity-100' : 'opacity-40 hover:opacity-70'
                }`}
              >
                <span
                  className="inline-block w-2 h-2 rounded-full shrink-0"
                  style={{ backgroundColor: STATUS_DOT_COLORS[s] }}
                />
                <span className="text-[#201F1E] flex-1 text-left truncate">{s}</span>
                {typeof count === 'number' && (
                  <span className="text-[#7A756E] font-mono text-[9px]">
                    {count.toLocaleString()}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// Re-export of color map so this file is self-contained for layout reasons.
// Mirrored from STATUS_COLORS in wellFinderRrc.
import { STATUS_COLORS } from '../../lib/wellFinderRrc';
const STATUS_DOT_COLORS: Record<string, string> = STATUS_COLORS;

// Suppress unused-import warning for the standalone StatusFilter (kept for future use).
void StatusFilter;
