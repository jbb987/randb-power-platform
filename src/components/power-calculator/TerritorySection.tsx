import type { RetailUtilityResolution } from '../../lib/retailUtility';
import { cleanUtilityName } from '../../lib/retailUtility';

interface Props {
  iso: string;
  /** Transmission owner(s) of nearby lines — now shown as one merged row (TSP was the same source). */
  utilityTerritory: string;
  /** @deprecated Same source as utilityTerritory (its #1 entry); no longer rendered. Kept for back-compat. */
  tsp?: string;
  retailUtility?: RetailUtilityResolution | null;
  /** Human-confirmed serving utility name (authoritative; overrides the auto result). */
  retailUtilityConfirmedName?: string | null;
  /** When provided, renders the confirm/override control. Pass null to clear. */
  onConfirmRetailUtility?: (name: string | null) => void;
}

const readOnlyClass =
  'rounded-lg border border-[#D8D5D0] bg-[#F5F4F2] px-3 py-2.5 text-sm text-[#201F1E]';

function TerritoryDisplay({ label, value }: { label: string; value: string }) {
  const parts = value ? value.split(' / ').filter(Boolean) : [];
  const hasMultiple = parts.length > 1;

  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-xs font-medium text-[#7A756E]">{label}</span>
      <div className={readOnlyClass}>{value || 'Not Available'}</div>
      {hasMultiple && (
        <div className="flex flex-wrap gap-1 mt-1">
          {parts.map((p, i) => (
            <span
              key={i}
              className="inline-block rounded-full bg-[#F5F4F2] border border-[#D8D5D0] px-2 py-0.5 text-[10px] text-[#201F1E]"
            >
              {p.trim()}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

const typeLabel = (t: string) =>
  /cooperat/i.test(t)
    ? 'Co-op'
    : /investor/i.test(t)
      ? 'Investor-owned'
      : /municip/i.test(t)
        ? 'Municipal'
        : t
          ? t.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase())
          : '';

const LABEL = 'Retail / Distribution Utility (serving)';

/** Dropdown to confirm/override the serving utility (renders only when onConfirm given). */
function ConfirmControl({
  res,
  confirmedName,
  onConfirm,
}: {
  res: RetailUtilityResolution | null;
  confirmedName?: string | null;
  onConfirm: (name: string | null) => void;
}) {
  // Include the current confirmation so the controlled <select> always has a
  // matching <option> — a verified/typed name need not equal a candidate name.
  const options = Array.from(
    new Set([
      ...(confirmedName ? [confirmedName] : []),
      ...(res?.candidates ?? []).map((c) => cleanUtilityName(c.name)),
    ]),
  );
  return (
    <div className="flex items-center gap-2 mt-1.5">
      <select
        value={confirmedName ?? ''}
        onChange={(e) => onConfirm(e.target.value || null)}
        className="rounded-lg border border-[#D8D5D0] bg-white px-2 py-1 text-xs text-[#201F1E] focus:border-[#ED202B] focus:ring-2 focus:ring-[#ED202B]/20"
      >
        <option value="">
          {confirmedName ? 'Clear confirmation' : 'Confirm serving utility…'}
        </option>
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    </div>
  );
}

/** Serving retail/distribution utility — the entity that actually serves the meter. */
function RetailUtilityDisplay({
  res,
  confirmedName,
  onConfirm,
}: {
  res: RetailUtilityResolution | null;
  confirmedName?: string | null;
  onConfirm?: (name: string | null) => void;
}) {
  // 1) Human confirmation is authoritative.
  if (confirmedName) {
    return (
      <div className="flex flex-col gap-1.5">
        <span className="text-xs font-medium text-[#7A756E]">{LABEL}</span>
        <div className="rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-2.5 text-sm text-[#201F1E] flex items-center justify-between gap-2">
          <span className="font-medium">{confirmedName}</span>
          <span className="shrink-0 rounded-full bg-emerald-100 text-emerald-800 px-2 py-0.5 text-[10px] font-medium">
            verified
          </span>
        </div>
        {onConfirm && (
          <ConfirmControl res={res} confirmedName={confirmedName} onConfirm={onConfirm} />
        )}
      </div>
    );
  }

  // 2) High-confidence auto-pick.
  if (res && res.confidence === 'high' && res.serving) {
    return (
      <div className="flex flex-col gap-1.5">
        <span className="text-xs font-medium text-[#7A756E]">{LABEL}</span>
        <div className="rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-2.5 text-sm text-[#201F1E] flex items-center justify-between gap-2">
          <span className="font-medium">{cleanUtilityName(res.serving.name)}</span>
          <span className="shrink-0 rounded-full bg-emerald-100 text-emerald-800 px-2 py-0.5 text-[10px] font-medium">
            {typeLabel(res.serving.type)} · confident
          </span>
        </div>
        {onConfirm && <ConfirmControl res={res} onConfirm={onConfirm} />}
      </div>
    );
  }

  // 3) Low confidence — show the shortlist for a human pick.
  if (res && res.candidates.length > 0) {
    return (
      <div className="flex flex-col gap-1.5">
        <span className="text-xs font-medium text-[#7A756E]">{LABEL}</span>
        <div className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2.5 text-sm text-[#201F1E]">
          <span className="text-xs font-medium text-amber-800">
            Overlapping territories — confirm the correct one:
          </span>
          <div className="flex flex-wrap gap-1.5 mt-1.5">
            {res.candidates.slice(0, 4).map((c, i) => (
              <span
                key={i}
                className="inline-flex items-center gap-1 rounded-full bg-white border border-[#D8D5D0] px-2 py-0.5 text-[11px] text-[#201F1E]"
              >
                {cleanUtilityName(c.name)}
                <span className="text-[9px] text-[#7A756E]">{typeLabel(c.type)}</span>
              </span>
            ))}
          </div>
          {onConfirm && <ConfirmControl res={res} onConfirm={onConfirm} />}
        </div>
      </div>
    );
  }

  // 4) No result yet, or the service-territory lookup couldn't resolve a match
  //    (data source temporarily unreachable, or the point has no coverage).
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-xs font-medium text-[#7A756E]">{LABEL}</span>
      <div className="rounded-lg border border-[#D8D5D0] bg-[#F5F4F2] px-3 py-2.5 text-sm text-[#7A756E]">
        {res
          ? 'Service-territory lookup returned no match — re-run the analysis to retry.'
          : 'Not analyzed yet — run the analysis to detect the serving utility.'}
      </div>
    </div>
  );
}

export default function TerritorySection({
  iso,
  utilityTerritory,
  retailUtility,
  retailUtilityConfirmedName,
  onConfirmRetailUtility,
}: Props) {
  const showRetail = retailUtility || retailUtilityConfirmedName || onConfirmRetailUtility;
  return (
    <div className="flex flex-col gap-5">
      {showRetail && (
        <RetailUtilityDisplay
          res={retailUtility ?? null}
          confirmedName={retailUtilityConfirmedName}
          onConfirm={onConfirmRetailUtility}
        />
      )}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <TerritoryDisplay label="RTO / ISO" value={iso} />
        <TerritoryDisplay label="Transmission lines near site (owner)" value={utilityTerritory} />
      </div>
    </div>
  );
}
