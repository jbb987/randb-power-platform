import { useWellEnrichment } from '../../hooks/useWellEnrichment';
import { colorForStatus } from '../../lib/wellFinderRrc';
import { computeSb1150, formatTriggerDate, formatTriggerPressure } from '../../lib/sb1150';
import { computeReactivationScore, scoreColor, scoreLabel } from '../../lib/reactivationScore';
import type { WellEnrichment } from '../../types';

interface WellPopupProps {
  api: string;
  status: string;
  lat: number;
  lng: number;
}

function formatMonthsInactive(years?: number, months?: number): string | null {
  if (years == null && months == null) return null;
  const y = years ?? 0;
  const m = months ?? 0;
  if (y === 0 && m === 0) return '0 months';
  const parts: string[] = [];
  if (y > 0) parts.push(`${y} yr${y === 1 ? '' : 's'}`);
  if (m > 0) parts.push(`${m} mo`);
  return parts.join(' ');
}

function formatDollar(n?: number): string | null {
  if (n == null || !Number.isFinite(n)) return null;
  return `$${Math.round(n).toLocaleString()}`;
}

export default function WellPopup({ api, status, lat, lng }: WellPopupProps) {
  const { data, loading, error } = useWellEnrichment(api);

  return (
    <div className="p-2.5 min-w-[280px] max-w-[320px]">
      {/* Header */}
      <div className="flex items-center gap-2 mb-2">
        <span
          className="inline-block w-2.5 h-2.5 rounded-full shrink-0"
          style={{ backgroundColor: colorForStatus(status) }}
        />
        <h4 className="font-heading font-semibold text-sm text-[#201F1E]">
          {status || 'Well'}
        </h4>
      </div>

      {/* Always-shown identity */}
      <div className="space-y-1 pb-2 mb-2 border-b border-[#D8D5D0]">
        <PopupRow label="API #" value={api || '—'} mono />
        <PopupRow
          label="Coordinates"
          value={`${lat.toFixed(4)}, ${lng.toFixed(4)}`}
          mono
        />
      </div>

      {/* Enrichment */}
      {loading && (
        <div className="flex items-center gap-2 py-1">
          <div className="w-3 h-3 border-2 border-[#ED202B]/30 border-t-[#ED202B] rounded-full animate-spin" />
          <span className="text-xs text-[#7A756E]">Loading enrichment…</span>
        </div>
      )}

      {error && (
        <p className="text-xs text-[#ED202B]" title={error}>
          Enrichment unavailable
        </p>
      )}

      {!loading && !error && data == null && <NoEnrichmentNote />}

      {data && <EnrichmentBody data={data} />}

      {/* Aerial view — same pattern as the Grid Power Analyzer */}
      <div className="pt-2 mt-2 border-t border-[#D8D5D0]">
        <div className="text-[10px] uppercase tracking-wide text-[#7A756E] mb-1">Aerial view</div>
        <div className="flex gap-3 text-xs">
          <a
            href={`https://www.google.com/maps/@${lat},${lng},19z/data=!3m1!1e3`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[#ED202B] hover:underline"
          >
            Google Maps
          </a>
          <a
            href={`https://earth.google.com/web/@${lat},${lng},500a,500d,35y,0h,0t,0r`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[#ED202B] hover:underline"
          >
            Google Earth
          </a>
          <a
            href={`https://www.bing.com/maps?cp=${lat}~${lng}&lvl=20&style=o`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[#ED202B] hover:underline"
          >
            Bing 3D
          </a>
        </div>
      </div>
    </div>
  );
}

/** Computes the next monthly refresh date (the 12th of the next month). */
function nextRefreshLabel(): string {
  const now = new Date();
  const target = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 12));
  if (now.getTime() > target.getTime()) {
    target.setUTCMonth(target.getUTCMonth() + 1);
  }
  return target.toISOString().slice(0, 10); // YYYY-MM-DD
}

function NoEnrichmentNote() {
  return (
    <div className="text-[11px] text-[#7A756E] mt-2 leading-relaxed">
      <p className="font-medium text-[#201F1E] mb-1">Additional details coming soon</p>
      <p>
        Detailed information for this well isn't available yet. Records are
        refreshed monthly; recently changed wells typically appear within a few
        weeks.
      </p>
      <p className="mt-1.5">
        Next update:{' '}
        <span className="font-medium text-[#201F1E]">{nextRefreshLabel()}</span>
      </p>
    </div>
  );
}

function EnrichmentBody({ data }: { data: WellEnrichment }) {
  const inactive = formatMonthsInactive(data.iwarInactiveYears, data.iwarInactiveMonths);
  const operator = data.iwarOperator || data.orphanOperator || data.wellboreOperator;
  const operatorP5 = data.iwarOperatorP5 || data.orphanOperatorP5 || data.wellboreOperatorP5;
  const score = computeReactivationScore(data);

  return (
    <div className="space-y-1">
      {/* Reactivation Score header */}
      <div className="-mx-2.5 -mt-1 mb-2 px-2.5 py-2 bg-stone-50 border-y border-[#D8D5D0]">
        <div className="flex items-baseline justify-between gap-2">
          <div>
            <div className="text-[10px] uppercase tracking-wide text-[#7A756E]">Reactivation score</div>
            <div className="flex items-baseline gap-2 mt-0.5">
              <span
                className="text-2xl font-heading font-bold tabular-nums"
                style={{ color: scoreColor(score.total) }}
              >
                {score.disqualified ? '—' : score.total}
              </span>
              <span className="text-[10px] text-[#7A756E] uppercase tracking-wide">
                {score.disqualified ?? `/ 100 · ${scoreLabel(score.total)}`}
              </span>
            </div>
          </div>
        </div>
        {!score.disqualified && (
          <div className="mt-2 grid grid-cols-4 gap-1.5 text-[9px]">
            <ScoreBar label="Prod"   value={score.production}         />
            <ScoreBar label="Op"     value={score.operatorOpportunity} />
            <ScoreBar label="Cost"   value={score.costFeasibility}    />
            <ScoreBar label="Time"   value={score.timePressure}       />
          </div>
        )}
      </div>

      {operator && (
        <PopupRow
          label="Operator"
          value={operator}
          extra={operatorP5 ? `P-5 ${operatorP5}` : undefined}
        />
      )}
      {data.iwarFieldName && <PopupRow label="Field" value={data.iwarFieldName} />}
      {data.iwarLeaseName && (
        <PopupRow
          label="Lease"
          value={data.iwarLeaseName}
          extra={data.iwarLeaseNumber ? `#${data.iwarLeaseNumber}` : undefined}
        />
      )}
      {data.iwarCounty && (
        <PopupRow
          label="County"
          value={data.iwarCounty}
          extra={data.iwarDistrict ? `District ${data.iwarDistrict}` : undefined}
        />
      )}
      {data.iwarDepthFt != null && (
        <PopupRow label="Depth" value={`${data.iwarDepthFt.toLocaleString()} ft`} mono />
      )}
      {data.iwarOriginalCompletionDate && (
        <PopupRow label="Completed" value={data.iwarOriginalCompletionDate} mono />
      )}
      {data.iwarShutInDate && (
        <PopupRow label="Shut-in" value={data.iwarShutInDate} mono />
      )}
      {inactive && (
        <PopupRow label="Inactive" value={inactive} highlight />
      )}
      {data.iwarComplianceDueDate && (
        <PopupRow
          label="Plug deadline"
          value={data.iwarComplianceDueDate}
          mono
          warning
        />
      )}
      {data.iwarPluggingCostEstimate != null && data.iwarPluggingCostEstimate > 0 && (
        <PopupRow
          label="Plug cost est."
          value={formatDollar(data.iwarPluggingCostEstimate) ?? '—'}
          mono
        />
      )}

      {/* SB 1150 plug-or-reactivate deadline */}
      {(() => {
        const sb = computeSb1150(data);
        if (!sb) return null;
        return (
          <div title="SB 1150 (effective Sept 1, 2027): wells 25+ years old AND 15+ years inactive must be plugged or returned to production. Date is the later of completion+25, shut-in+15, and 2027-09-01.">
            <PopupRow
              label="Plug/reactivate by"
              value={formatTriggerDate(sb.triggerDate)}
              extra={formatTriggerPressure(sb)}
              mono
              warning={sb.monthsToTrigger < 24}
              highlight={sb.pastTrigger}
            />
          </div>
        );
      })()}

      {/* Badges */}
      <div className="flex flex-wrap gap-1 mt-2">
        {data.orphanListed && (
          <span
            className="text-[10px] px-1.5 py-0.5 rounded-full bg-red-100 text-red-700 font-medium"
            title={
              data.orphanMonthsP5Inactive
                ? `Operator P-5 delinquent ${data.orphanMonthsP5Inactive} months — adoptable under SB 1146 / Form P-4 takeover`
                : 'Operator P-5 delinquent >12 months — adoptable under SB 1146 / Form P-4 takeover'
            }
          >
            Orphan{data.orphanMonthsP5Inactive ? ` (${data.orphanMonthsP5Inactive} mo)` : ''}
          </span>
        )}
        {data.iwarP5OriginatingStatus === 'D' && (
          <span
            className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700"
            title="Operator's P-5 organization report was delinquent when this record was generated."
          >
            P-5 delinquent
          </span>
        )}
        {data.iwarExtensionStatus && data.iwarExtensionStatus !== ' ' && (
          <span
            className="text-[10px] px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-700"
            title={extensionTooltip(data.iwarExtensionStatus)}
          >
            W-3X {data.iwarExtensionStatus}
          </span>
        )}
        {data.iwarWellPlugged && (
          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-stone-200 text-stone-700">
            Plugged
          </span>
        )}
      </div>

      {/* Production rollups */}
      {hasProductionData(data) && (
        <div className="mt-2 pt-2 border-t border-[#D8D5D0]">
          <div className="text-[10px] uppercase tracking-wide text-[#7A756E] mb-1">
            Production
            {data.prodAllocated && (
              <span
                className="ml-1 text-amber-600 normal-case font-normal"
                title={`This lease has ${data.prodWellsOnLease} wells. Volumes shown are an equal-share estimate, not a per-well measurement.`}
              >
                · est. (1 of {data.prodWellsOnLease})
              </span>
            )}
          </div>
          {data.prodFirstYearMonth && data.prodLastYearMonth && (
            <PopupRow
              label="Active"
              value={`${data.prodFirstYearMonth} → ${data.prodLastYearMonth}`}
              extra={data.prodMonthsActive ? `${data.prodMonthsActive} mo` : undefined}
              mono
            />
          )}
          {data.prodLifetimeOilBbl != null && data.prodLifetimeOilBbl > 0 && (
            <PopupRow
              label="Cum oil"
              value={`${data.prodLifetimeOilBbl.toLocaleString()} bbl`}
              mono
            />
          )}
          {data.prodLifetimeGasMcf != null && data.prodLifetimeGasMcf > 0 && (
            <PopupRow
              label="Cum gas"
              value={`${data.prodLifetimeGasMcf.toLocaleString()} mcf`}
              mono
            />
          )}
          {data.prodLast12moOilBblPerD != null && data.prodLast12moOilBblPerD > 0 && (
            <PopupRow
              label="Last 12mo oil"
              value={`${data.prodLast12moOilBblPerD.toFixed(1)} bbl/d`}
              mono
              highlight
            />
          )}
          {data.prodLast12moGasMcfPerD != null && data.prodLast12moGasMcfPerD > 0 && (
            <PopupRow
              label="Last 12mo gas"
              value={`${data.prodLast12moGasMcfPerD.toFixed(1)} mcf/d`}
              mono
              highlight
            />
          )}
          {data.prodFirst6moOilBblPerD != null && data.prodFirst6moOilBblPerD > 0 && (
            <PopupRow
              label="IP oil"
              value={`${data.prodFirst6moOilBblPerD.toFixed(1)} bbl/d`}
              mono
            />
          )}
          {data.prodArpsEur != null && data.prodArpsEur > 0 && (
            <div title="Estimated Ultimate Recovery (EUR): total volume forecast for the remaining lifetime, computed by fitting an Arps decline curve to monthly production history.">
              <PopupRow
                label="Total recoverable"
                value={`${data.prodArpsEur.toLocaleString()} ${data.prodLifetimeOilBbl ? 'bbl' : 'mcf'}`}
                mono
              />
            </div>
          )}
        </div>
      )}

    </div>
  );
}

function hasProductionData(data: WellEnrichment): boolean {
  return (
    data.prodFirstYearMonth != null ||
    (data.prodLifetimeOilBbl != null && data.prodLifetimeOilBbl > 0) ||
    (data.prodLifetimeGasMcf != null && data.prodLifetimeGasMcf > 0)
  );
}

function extensionTooltip(code: string): string {
  switch (code.trim().toUpperCase()) {
    case 'A': return 'W-3X plugging extension currently active.';
    case 'D': return 'W-3X plugging extension denied — operator is on a forced compliance clock.';
    case 'P': return 'W-3X plugging extension pending review.';
    default:  return `W-3X extension status: ${code}`;
  }
}

function ScoreBar({ label, value }: { label: string; value: number }) {
  return (
    <div title={`${label}: ${value}/100`}>
      <div className="flex items-center justify-between mb-0.5">
        <span className="uppercase tracking-wide text-[#7A756E]">{label}</span>
        <span className="font-mono text-[#201F1E]">{value}</span>
      </div>
      <div className="h-1 bg-stone-200 rounded-full overflow-hidden">
        <div
          className="h-full rounded-full"
          style={{
            width: `${Math.max(0, Math.min(100, value))}%`,
            backgroundColor: value >= 70 ? '#ED202B' : value >= 50 ? '#C2410C' : value >= 30 ? '#7A756E' : '#D1D5DB',
          }}
        />
      </div>
    </div>
  );
}

function PopupRow({
  label,
  value,
  extra,
  mono,
  highlight,
  warning,
}: {
  label: string;
  value: string;
  extra?: string;
  mono?: boolean;
  highlight?: boolean;
  warning?: boolean;
}) {
  return (
    <div className="flex justify-between gap-2 text-xs">
      <span className="text-[#7A756E] shrink-0">{label}</span>
      <span
        className={[
          mono ? 'font-mono' : '',
          'text-right',
          highlight ? 'font-semibold text-[#ED202B]' : 'text-[#201F1E]',
          warning ? 'text-amber-700' : '',
        ]
          .filter(Boolean)
          .join(' ')}
      >
        {value}
        {extra && <span className="text-[#7A756E] ml-1">({extra})</span>}
      </span>
    </div>
  );
}
