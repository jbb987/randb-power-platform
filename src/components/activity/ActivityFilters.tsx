import {
  ACTIVITY_ACTIONS,
  ACTIVITY_ACTION_LABELS,
  ACTIVITY_RESOURCE_TYPES,
  ACTIVITY_RESOURCE_LABELS,
  type ActivityAction,
  type ActivityResourceType,
} from '../../types/activity';

export type DateRange = 'all' | 'today' | 'week' | 'month';

export interface ActivityFilterState {
  email: string; // '' = all
  action: ActivityAction | '';
  resourceType: ActivityResourceType | '';
  range: DateRange;
}

export const EMPTY_FILTERS: ActivityFilterState = {
  email: '',
  action: '',
  resourceType: '',
  range: 'all',
};

interface ActivityFiltersProps {
  filters: ActivityFilterState;
  onChange: (next: ActivityFilterState) => void;
  emailOptions: string[];
}

const RANGE_LABEL: Record<DateRange, string> = {
  all: 'All time',
  today: 'Today',
  week: 'This week',
  month: 'This month',
};

export default function ActivityFilters({ filters, onChange, emailOptions }: ActivityFiltersProps) {
  const set = <K extends keyof ActivityFilterState>(key: K, value: ActivityFilterState[K]) =>
    onChange({ ...filters, [key]: value });

  const reset = () => onChange(EMPTY_FILTERS);
  const hasFilters =
    filters.email !== '' ||
    filters.action !== '' ||
    filters.resourceType !== '' ||
    filters.range !== 'all';

  return (
    <div className="bg-white rounded-xl shadow-sm border border-[#D8D5D0] p-3 flex flex-wrap items-center gap-2">
      <Select
        label="User"
        value={filters.email}
        onChange={(v) => set('email', v)}
        options={[
          { value: '', label: 'All users' },
          ...emailOptions.map((e) => ({ value: e, label: e })),
        ]}
      />
      <Select
        label="Action"
        value={filters.action}
        onChange={(v) => set('action', v as ActivityAction | '')}
        options={[
          { value: '', label: 'Any action' },
          ...ACTIVITY_ACTIONS.map((a) => ({ value: a, label: ACTIVITY_ACTION_LABELS[a] })),
        ]}
      />
      <Select
        label="Type"
        value={filters.resourceType}
        onChange={(v) => set('resourceType', v as ActivityResourceType | '')}
        options={[
          { value: '', label: 'Any type' },
          ...ACTIVITY_RESOURCE_TYPES.map((t) => ({ value: t, label: ACTIVITY_RESOURCE_LABELS[t] })),
        ]}
      />
      <Select
        label="When"
        value={filters.range}
        onChange={(v) => set('range', v as DateRange)}
        options={(['all', 'today', 'week', 'month'] as DateRange[]).map((r) => ({
          value: r,
          label: RANGE_LABEL[r],
        }))}
      />
      {hasFilters && (
        <button
          type="button"
          onClick={reset}
          className="ml-auto text-xs text-[#ED202B] hover:text-[#9B0E18] font-medium"
        >
          Clear filters
        </button>
      )}
    </div>
  );
}

interface SelectProps {
  label: string;
  value: string;
  onChange: (next: string) => void;
  options: { value: string; label: string }[];
}

function Select({ label, value, onChange, options }: SelectProps) {
  return (
    <label className="flex items-center gap-1.5 text-xs">
      <span className="text-[#7A756E] font-medium">{label}:</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-md border border-[#D8D5D0] bg-white px-2 py-1 text-xs text-[#201F1E] focus:border-[#ED202B] focus:outline-none focus:ring-2 focus:ring-[#ED202B]/20"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}
