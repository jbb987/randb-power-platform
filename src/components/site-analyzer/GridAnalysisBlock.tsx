import { useMemo } from 'react';
import { analyzeGrid, type GridScenario } from '../../lib/gridAnalysis';
import type { InfrastructureData } from '../power-calculator/InfrastructureResults';

interface Props {
  infra: InfrastructureData;
  targetMW: number;
}

function fmtM(m: number): string {
  const s = m % 1 === 0 ? m.toFixed(0) : m.toFixed(1);
  return `$${s}M`;
}
function StatusText({ ok }: { ok: boolean }) {
  return ok ? (
    <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700">
      <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
      </svg>
      in service
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-700">
      <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m0 3.75h.008M10.34 3.94l-7.5 12.99A1.5 1.5 0 004.14 19.5h15.72a1.5 1.5 0 001.3-2.57l-7.5-12.99a1.5 1.5 0 00-2.62 0z" />
      </svg>
      unconfirmed
    </span>
  );
}

/** Headline row: can we deliver the project's target MW, via which node, at what cost. */
function TargetRow({ s }: { s: GridScenario }) {
  const fits = s.fits !== false;
  return (
    <div className={`rounded-xl border p-4 ${fits ? 'border-[#ED202B]/40 bg-[#ED202B]/[0.03]' : 'border-amber-300 bg-amber-50'}`}>
      <div className="flex items-center justify-between gap-3">
        <span className="text-[11px] uppercase tracking-wider font-semibold text-[#7A756E]">{s.label}</span>
        <span className={`text-xs font-semibold ${fits ? 'text-emerald-700' : 'text-amber-700'}`}>
          {fits ? '✓ deliverable' : '⚠ needs upgrades'}
        </span>
      </div>
      <div className="mt-1.5 flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="font-heading text-2xl font-bold text-[#201F1E]">
          {s.mw.mid.toLocaleString()} <span className="text-base font-semibold">MW</span>
        </span>
        <span className="text-sm font-semibold text-[#201F1E]">{fmtM(s.cost.construction)} construction</span>
        <span className="text-xs text-[#7A756E]">· {s.timeline.years} yr (full {s.timeline.fullByYear})</span>
      </div>
      <p className="mt-1.5 text-xs text-[#57534E]">{s.justification}</p>
      {s.caveats.map((c, i) => (
        <p key={i} className="mt-1 text-[11px] text-amber-700 flex gap-1">
          <span>⚠</span>
          <span>{c}</span>
        </p>
      ))}
    </div>
  );
}

/** Supporting row: a nearby node and what it can deliver (capacity range + cost). */
function NearbyRow({ s }: { s: GridScenario }) {
  return (
    <div className="rounded-xl border border-[#E7E4E0] bg-[#FAFAF9] p-4">
      <div className="flex items-center justify-between gap-3">
        <span className="text-[11px] uppercase tracking-wider font-semibold text-[#7A756E]">{s.label}</span>
        <StatusText ok={s.basis.statusConfirmed} />
      </div>
      <div className="mt-1.5 flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="font-heading text-xl font-bold text-[#201F1E]">
          ~{s.mw.low.toLocaleString()}–{s.mw.high.toLocaleString()} <span className="text-sm font-semibold">MW</span>
        </span>
        <span className="text-xs text-[#7A756E]">deliverable</span>
      </div>
      <p className="mt-1 text-xs text-[#7A756E]">
        {s.basis.voltageKV} kV · {s.basis.lines} line{s.basis.lines === 1 ? '' : 's'} · {s.basis.distanceMi.toFixed(1)} mi · {s.basis.substationName}
      </p>
    </div>
  );
}

/**
 * Grid Analysis — can we deliver the project's target MW, via which nearby node, at what cost
 * (headline), with the deduped nearby substations as supporting capacity evidence.
 */
export default function GridAnalysisBlock({ infra, targetMW }: Props) {
  // When the 10mi screen found no substations, analyze the expanded-radius set so
  // the headline reflects the real nearest grid (with its true distance) instead
  // of reading "insufficient grid data".
  const effectiveInfra = useMemo(() => {
    if ((infra.nearbySubstations?.length ?? 0) > 0) return infra;
    if ((infra.expandedSubstations?.length ?? 0) > 0) {
      return { ...infra, nearbySubstations: infra.expandedSubstations ?? [] };
    }
    return infra;
  }, [infra]);

  const result = useMemo(
    () => analyzeGrid(effectiveInfra, { targetMW, currentYear: new Date().getFullYear() }),
    [effectiveInfra, targetMW],
  );

  if (!result) {
    const searchedMi = infra.expandedSubstationRadiusMi;
    return (
      <div className="bg-white rounded-2xl border border-[#D8D5D0] p-5 md:p-6">
        <h3 className="font-heading text-base font-semibold text-[#201F1E]">Grid Analysis</h3>
        <p className="mt-2 text-sm text-[#7A756E]">
          {searchedMi
            ? `No in-service substation found within ${searchedMi} mi of this site.`
            : 'No in-service substation found near this site — insufficient grid data.'}
        </p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl border border-[#D8D5D0] p-5 md:p-6">
      <h3 className="font-heading text-base font-semibold text-[#201F1E]">Grid Analysis</h3>
      <div className="mt-3 space-y-3">
        {result.target && <TargetRow s={result.target} />}
        {result.nearbyOptions.length > 0 && (
          <>
            <p className="text-[11px] uppercase tracking-widest text-[#A8A29E] font-semibold pt-1">Nearby grid</p>
            {result.nearbyOptions.map((s) => (
              <NearbyRow key={`${s.basis.substationName}-${s.basis.distanceMi}`} s={s} />
            ))}
          </>
        )}
      </div>
    </div>
  );
}
