import { useMemo, useState } from 'react';
import type { WellEnrichment } from '../../types';
import { useViewportEnrichment } from '../../hooks/useViewportEnrichment';
import { colorForStatus } from '../../lib/wellFinderRrc';
import { computeSb1150, type Sb1150Bucket, type Sb1150Status } from '../../lib/sb1150';
import { computeReactivationScore, scoreColor, type ScoreBreakdown } from '../../lib/reactivationScore';

/**
 * The table now accepts EITHER a list of viewport wells (limit-to-view mode)
 * OR a list of statewide candidates from Firestore (default mode). It picks
 * whichever is non-null. Statewide candidates already include enrichment;
 * viewport wells need an additional Firestore lookup via useViewportEnrichment.
 */

interface ViewportWell {
  api: string;
  status: string;
  lat: number;
  lng: number;
}

interface WellTableProps {
  /** Statewide candidates already enriched (limitToView=false). */
  statewide: WellEnrichment[] | null;
  /** Loading flag for the statewide query. */
  statewideLoading: boolean;
  /** Wells visible in the map viewport (limitToView=true). */
  viewportWells: ViewportWell[] | null;
  operatorFilter: string;
  orphanOnly: boolean;
  minMonthsInactive: number;
  sb1150Filter: 'any' | Sb1150Bucket;
  minScore: number;
  /** Click handler — receives the API# of the selected row. */
  onSelect: (api: string) => void;
}

type SortKey =
  | 'score'
  | 'monthsInactive'
  | 'plugCost'
  | 'depth'
  | 'shutInDate'
  | 'completionDate'
  | 'operator'
  | 'api'
  | 'status'
  | 'sb1150';

interface Row {
  api: string;
  enrichment: WellEnrichment | null;
  monthsInactive: number | null;
  operator: string | null;
  sb1150: Sb1150Status | null;
  score: ScoreBreakdown | null;
}

export default function WellTable(props: WellTableProps) {
  const { statewide, statewideLoading, viewportWells, operatorFilter, orphanOnly, minMonthsInactive, minScore, onSelect } = props;
  const limitToView = viewportWells != null;

  // Viewport mode: batch-load enrichment for the visible APIs.
  const viewportApis = useMemo(
    () => (viewportWells ? viewportWells.map((w) => w.api) : []),
    [viewportWells],
  );
  const { data: viewportEnrichment, loading: viewportLoading, truncated } = useViewportEnrichment(viewportApis);

  const loading = limitToView ? viewportLoading : statewideLoading;

  const [sortKey, setSortKey] = useState<SortKey>('score');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  const rows: Row[] = useMemo(() => {
    if (limitToView && viewportWells) {
      return viewportWells.slice(0, 100).map((w) => {
        const e = viewportEnrichment.get(w.api) ?? null;
        return buildRow(w.api, e);
      });
    }
    return (statewide ?? []).slice(0, 200).map((e) => buildRow(e.api, e));
  }, [limitToView, viewportWells, viewportEnrichment, statewide]);

  const sb1150Filter = props.sb1150Filter;

  const filtered = useMemo(() => {
    let r = rows;
    if (operatorFilter.trim()) {
      const needle = operatorFilter.trim().toLowerCase();
      r = r.filter((row) => row.operator && row.operator.toLowerCase().includes(needle));
    }
    if (orphanOnly) {
      r = r.filter((row) => row.enrichment?.orphanListed);
    }
    if (minMonthsInactive > 0) {
      r = r.filter((row) => (row.monthsInactive ?? -1) >= minMonthsInactive);
    }
    if (sb1150Filter !== 'any') {
      r = r.filter((row) => row.sb1150 != null && row.sb1150.bucket === sb1150Filter);
    }
    if (minScore > 0) {
      r = r.filter((row) => (row.score?.total ?? 0) >= minScore);
    }
    return r;
  }, [rows, operatorFilter, orphanOnly, minMonthsInactive, sb1150Filter, minScore]);

  const sorted = useMemo(() => {
    const dir = sortDir === 'asc' ? 1 : -1;
    return [...filtered].sort((a, b) => {
      const av = pickSortValue(a, sortKey);
      const bv = pickSortValue(b, sortKey);
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * dir;
      return String(av).localeCompare(String(bv)) * dir;
    });
  }, [filtered, sortKey, sortDir]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir(key === 'operator' || key === 'api' || key === 'status' ? 'asc' : 'desc');
    }
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header / status */}
      <div className="px-3 py-2 border-b border-[#D8D5D0] bg-white">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium text-[#201F1E]">
            {filtered.length.toLocaleString()} wells
            {filtered.length !== rows.length && (
              <span className="text-[#7A756E]"> of {rows.length}</span>
            )}
          </span>
          <span className="text-[10px] text-[#7A756E] flex items-center gap-2">
            {limitToView ? (
              <span title="Sidebar restricted to current map view (toggle off in filters to see statewide)">
                viewport
              </span>
            ) : (
              <span title={`Top ${rows.length} statewide reactivation candidates ranked by score`}>
                statewide top {rows.length}
              </span>
            )}
            {loading && (
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 border-2 border-[#ED202B]/30 border-t-[#ED202B] rounded-full animate-spin" />
                Loading
              </span>
            )}
            {limitToView && truncated > 0 && (
              <span title="Zoom in to narrow viewport">(capped)</span>
            )}
          </span>
        </div>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto">
        <table className="w-full text-xs">
          <thead className="sticky top-0 bg-stone-50 z-10">
            <tr className="text-left text-[10px] uppercase tracking-wide text-[#7A756E]">
              <SortableHeader label="Score"  k="score"            current={sortKey} dir={sortDir} onClick={toggleSort} alignRight />
              <SortableHeader label="Status" k="status"           current={sortKey} dir={sortDir} onClick={toggleSort} />
              <SortableHeader label="API"    k="api"              current={sortKey} dir={sortDir} onClick={toggleSort} />
              <SortableHeader label="Operator" k="operator"       current={sortKey} dir={sortDir} onClick={toggleSort} />
              <SortableHeader label="Inactive" k="monthsInactive" current={sortKey} dir={sortDir} onClick={toggleSort} alignRight />
              <SortableHeader label="Plug $"  k="plugCost"        current={sortKey} dir={sortDir} onClick={toggleSort} alignRight />
              <SortableHeader label="Depth"   k="depth"           current={sortKey} dir={sortDir} onClick={toggleSort} alignRight />
              <SortableHeader label="SB 1150" k="sb1150"          current={sortKey} dir={sortDir} onClick={toggleSort} alignRight />
            </tr>
          </thead>
          <tbody>
            {sorted.length === 0 && !loading && (
              <tr>
                <td colSpan={8} className="px-3 py-8 text-center text-[#7A756E] text-xs italic">
                  No wells match the current filters.
                </td>
              </tr>
            )}
            {sorted.map((row) => (
              <tr
                key={row.api}
                onClick={() => onSelect(row.api)}
                className="border-b border-[#F0EDE9] hover:bg-stone-50 cursor-pointer"
              >
                <td
                  className="px-2 py-1.5 text-right font-mono font-semibold tabular-nums"
                  style={{ color: row.score ? scoreColor(row.score.total) : '#9CA3AF' }}
                  title={
                    row.score
                      ? row.score.disqualified
                        ? row.score.disqualified
                        : `Production ${row.score.production} · Operator ${row.score.operatorOpportunity} · Cost ${row.score.costFeasibility} · Time ${row.score.timePressure}`
                      : 'No enrichment data'
                  }
                >
                  {row.score && !row.score.disqualified ? row.score.total : '—'}
                </td>
                <td className="px-2 py-1.5">
                  <div className="flex items-center gap-1.5">
                    {row.enrichment?.orphanListed && (
                      <span className="text-[9px] px-1 py-0.5 rounded bg-red-100 text-red-700 font-medium" title="Orphan">
                        O
                      </span>
                    )}
                  </div>
                </td>
                <td className="px-2 py-1.5 font-mono text-[10px]">{row.api}</td>
                <td className="px-2 py-1.5 truncate max-w-[140px]" title={row.operator ?? ''}>
                  {row.operator ?? <span className="text-[#7A756E] italic">—</span>}
                </td>
                <td className="px-2 py-1.5 text-right font-mono">
                  {row.monthsInactive != null ? `${row.monthsInactive} mo` : '—'}
                </td>
                <td className="px-2 py-1.5 text-right font-mono">
                  {row.enrichment?.iwarPluggingCostEstimate
                    ? `$${Math.round(row.enrichment.iwarPluggingCostEstimate / 1000)}k`
                    : '—'}
                </td>
                <td className="px-2 py-1.5 text-right font-mono">
                  {row.enrichment?.iwarDepthFt
                    ? `${row.enrichment.iwarDepthFt.toLocaleString()}`
                    : '—'}
                </td>
                <td
                  className={`px-2 py-1.5 text-right font-mono text-[10px] ${
                    row.sb1150?.pastTrigger
                      ? 'text-[#ED202B] font-semibold'
                      : row.sb1150 && row.sb1150.monthsToTrigger < 24
                        ? 'text-amber-700'
                        : ''
                  }`}
                  title={row.sb1150 ? row.sb1150.triggerDate.toISOString().slice(0, 10) : 'No trigger date — not in scope'}
                >
                  {row.sb1150
                    ? row.sb1150.pastTrigger
                      ? `${Math.abs(row.sb1150.monthsToTrigger)}m past`
                      : `${row.sb1150.monthsToTrigger}m`
                    : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function buildRow(api: string, e: WellEnrichment | null): Row {
  const months = e
    ? (e.iwarInactiveYears ?? 0) * 12 + (e.iwarInactiveMonths ?? 0)
    : null;
  const operator = e?.iwarOperator ?? e?.orphanOperator ?? e?.wellboreOperator ?? null;
  const sb = e ? computeSb1150(e) : null;
  const score = e ? computeReactivationScore(e) : null;
  return { api, enrichment: e, monthsInactive: months, operator, sb1150: sb, score };
}

function pickSortValue(row: Row, key: SortKey): number | string | null {
  switch (key) {
    case 'score':          return row.score && !row.score.disqualified ? row.score.total : null;
    case 'monthsInactive': return row.monthsInactive ?? null;
    case 'plugCost':       return row.enrichment?.iwarPluggingCostEstimate ?? null;
    case 'depth':          return row.enrichment?.iwarDepthFt ?? null;
    case 'shutInDate':     return row.enrichment?.iwarShutInDate ?? null;
    case 'completionDate': return row.enrichment?.iwarOriginalCompletionDate ?? null;
    case 'operator':       return row.operator ?? null;
    case 'api':            return row.api ?? null;
    case 'status':         return row.status ?? null;
    // For SB 1150: smaller monthsToTrigger = more urgent → ascending sort puts
    // urgent first. Past-trigger wells get the most-negative values so they
    // sort to the top with asc and bottom with desc.
    case 'sb1150':         return row.sb1150 ? row.sb1150.monthsToTrigger : null;
    default:               return null;
  }
}

function SortableHeader({
  label,
  k,
  current,
  dir,
  onClick,
  alignRight,
}: {
  label: string;
  k: SortKey;
  current: SortKey;
  dir: 'asc' | 'desc';
  onClick: (k: SortKey) => void;
  alignRight?: boolean;
}) {
  const active = current === k;
  return (
    <th
      onClick={() => onClick(k)}
      className={`px-2 py-1.5 cursor-pointer hover:text-[#ED202B] select-none ${
        alignRight ? 'text-right' : ''
      } ${active ? 'text-[#ED202B] font-semibold' : ''}`}
    >
      {label}
      {active && <span className="ml-1">{dir === 'asc' ? '▲' : '▼'}</span>}
    </th>
  );
}
