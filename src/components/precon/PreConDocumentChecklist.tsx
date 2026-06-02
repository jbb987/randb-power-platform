import {
  ALL_PRECON_UTILITIES,
  PRECON_UTILITY_LABELS,
  type PreConChecklistItemStatus,
  type PreConSite,
  type PreConUtility,
} from '../../types';
import {
  checklistForUtility,
  checklistProgress,
  effectiveChecklistStatus,
  type PreConChecklistItem,
} from '../../lib/preConWorkflow';

interface Props {
  site: PreConSite;
  canEdit: boolean;
  onSetStatus: (itemId: string, status: PreConChecklistItemStatus) => void;
  onSetUtility: (utility: PreConUtility) => void;
}

const STATUS_OPTIONS: { value: PreConChecklistItemStatus; label: string }[] = [
  { value: 'missing', label: 'Missing' },
  { value: 'provided', label: 'Provided' },
  { value: 'na', label: 'N/A' },
];

function StatusDot({ status }: { status: PreConChecklistItemStatus }) {
  if (status === 'provided')
    return (
      <span className="text-green-600" aria-label="Provided">
        ✓
      </span>
    );
  if (status === 'na')
    return (
      <span className="text-[#B8B4AE]" aria-label="Not applicable">
        –
      </span>
    );
  return (
    <span className="text-[#D8D5D0]" aria-label="Missing">
      ○
    </span>
  );
}

export default function PreConDocumentChecklist({
  site,
  canEdit,
  onSetStatus,
  onSetUtility,
}: Props) {
  const items = checklistForUtility(site.utility);
  const { provided, total, missing } = checklistProgress(items, site.documentChecklist);
  const pct = total > 0 ? Math.round((provided / total) * 100) : 0;
  const core = items.filter((i) => i.required);
  const conditional = items.filter((i) => !i.required);

  const renderRow = (item: PreConChecklistItem) => {
    const status = effectiveChecklistStatus(item, site.documentChecklist);
    return (
      <div
        key={item.id}
        className="flex items-start gap-3 py-2 border-t border-[#EFEDEA] first:border-t-0"
      >
        <div className="mt-0.5 w-4 text-center shrink-0">
          <StatusDot status={status} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-[#201F1E]">{item.label}</p>
          <p className="text-xs text-[#7A756E]">{item.description}</p>
        </div>
        <select
          value={status}
          disabled={!canEdit}
          onChange={(e) => onSetStatus(item.id, e.target.value as PreConChecklistItemStatus)}
          className="shrink-0 text-xs rounded-md border border-[#D8D5D0] px-2 py-1 bg-white text-[#201F1E] disabled:opacity-60 focus:border-[#ED202B] focus:ring-2 focus:ring-[#ED202B]/20"
        >
          {STATUS_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>
    );
  };

  return (
    <div className="bg-white rounded-xl border border-[#D8D5D0] shadow-sm p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
        <h2 className="font-heading text-lg font-semibold text-[#201F1E]">Submission checklist</h2>
        <label className="flex items-center gap-2 text-xs text-[#7A756E]">
          Utility
          <select
            value={site.utility ?? 'oncor'}
            disabled={!canEdit}
            onChange={(e) => onSetUtility(e.target.value as PreConUtility)}
            className="text-xs rounded-md border border-[#D8D5D0] px-2 py-1 bg-white text-[#201F1E] disabled:opacity-60 focus:border-[#ED202B] focus:ring-2 focus:ring-[#ED202B]/20"
          >
            {ALL_PRECON_UTILITIES.map((u) => (
              <option key={u} value={u}>
                {PRECON_UTILITY_LABELS[u]}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="mb-4">
        <div className="flex items-center justify-between text-xs text-[#7A756E] mb-1">
          <span>
            {provided} / {total} provided
          </span>
          <span>{pct}%</span>
        </div>
        <div className="h-2 rounded-full bg-[#EFEDEA] overflow-hidden">
          <div className="h-full bg-[#ED202B] transition-all" style={{ width: `${pct}%` }} />
        </div>
      </div>

      <div>{core.map(renderRow)}</div>

      {conditional.length > 0 && (
        <div className="mt-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-[#B8B4AE] mb-1">
            Conditional — larger studies
          </p>
          <div>{conditional.map(renderRow)}</div>
        </div>
      )}

      {missing.length > 0 && (
        <p className="mt-4 text-sm text-[#9B0E18]">
          <span className="font-semibold">Missing:</span> {missing.map((m) => m.label).join(', ')}
        </p>
      )}
    </div>
  );
}
