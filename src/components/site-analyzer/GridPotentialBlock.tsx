import { useMemo } from 'react';
import type { GridMwEstimate } from '../../types';
import { estimatePotentialMW } from '../../lib/potentialMW';
import type { InfrastructureData } from '../power-calculator/InfrastructureResults';

interface Props {
  infra: InfrastructureData;
}

const CONF_STYLE: Record<GridMwEstimate['confidence'], string> = {
  high: 'bg-emerald-100 text-emerald-800',
  medium: 'bg-amber-100 text-amber-800',
  low: 'bg-stone-200 text-stone-700',
};

/**
 * Grid Strength inside the Power Infrastructure section — the breakdown of the
 * node-capacity score the Executive Summary shows. Gross node capacity only;
 * NOT a parcel deliverable (see lib/potentialMW.ts header). Pure-derives from
 * the infra already on screen.
 */
export default function GridPotentialBlock({ infra }: Props) {
  const est = useMemo(() => estimatePotentialMW(infra), [infra]);

  if (!est) {
    return (
      <div className="bg-white rounded-2xl border border-[#D8D5D0] p-5 md:p-6">
        <h3 className="font-heading text-base font-semibold text-[#201F1E]">Grid capacity · nearest node</h3>
        <p className="mt-2 text-sm text-[#7A756E]">
          No usable substation found near this site — insufficient grid data.
        </p>
      </div>
    );
  }

  const lineLabel = `${est.basis.lines} line${est.basis.lines === 1 ? '' : 's'}`;

  return (
    <div className="bg-white rounded-2xl border border-[#D8D5D0] p-5 md:p-6">
      <div className="flex items-center justify-between gap-3">
        <h3 className="font-heading text-base font-semibold text-[#201F1E]">
          Grid capacity · nearest node
        </h3>
        <span className={`rounded px-2 py-0.5 text-[10px] font-semibold uppercase ${CONF_STYLE[est.confidence]}`}>
          {est.confidence} confidence
        </span>
      </div>

      <p className="font-heading text-3xl font-bold text-[#201F1E] mt-2">
        ~{est.low.toLocaleString()}–{est.high.toLocaleString()}
        <span className="text-lg font-semibold ml-1">MW</span>
      </p>

      {/* Drivers */}
      <dl className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Driver substation', value: est.basis.substationNamed ? est.basis.substationName : `${est.basis.maxVoltKV} kV (unnamed)` },
          { label: 'Voltage class', value: `${est.basis.maxVoltKV} kV` },
          { label: 'Connected lines', value: `${lineLabel} (×${est.basis.lineFactor.toFixed(2)})` },
          { label: 'Distance', value: `${est.basis.distanceMi.toFixed(1)} mi` },
        ].map((d) => (
          <div key={d.label}>
            <dt className="text-[10px] uppercase tracking-wider text-[#7A756E] font-medium">{d.label}</dt>
            <dd className="text-sm font-medium text-[#201F1E] mt-0.5">{d.value}</dd>
          </div>
        ))}
      </dl>

      {/* Upside corridor */}
      {est.basis.upside && (
        <p className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-[#ED202B]/10 px-3 py-1.5 text-xs font-medium text-[#9B0E18]">
          ↑ {est.basis.upside.lineVoltageKV} kV corridor in range — high end reflects a potential
          tap/switchyard ({est.basis.upside.appliedHighMW.toLocaleString()} MW).
        </p>
      )}

      {/* Notes / caveats */}
      <ul className="mt-3 space-y-1 border-t border-[#EDEAE6] pt-3">
        {est.notes.map((n, i) => (
          <li key={i} className="text-[11px] text-[#7A756E] flex gap-1.5">
            <span className="text-[#D8D5D0]">•</span>
            <span>{n}</span>
          </li>
        ))}
      </ul>

    </div>
  );
}
