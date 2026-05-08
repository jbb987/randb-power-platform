import { useState } from 'react';
import type { FederalLayerData, RiskBand } from '../../lib/politicalRadar/types';
import SignalRow from './SignalRow';
import RepsPanel from './RepsPanel';

interface Props {
  data: FederalLayerData;
}

const BAND_STYLES: Record<RiskBand, { badge: string; ring: string; label: string }> = {
  clean: { badge: 'bg-emerald-50 text-emerald-700', ring: 'ring-emerald-200', label: 'Clean' },
  watch: { badge: 'bg-amber-50 text-amber-700', ring: 'ring-amber-200', label: 'Watch' },
  elevated: { badge: 'bg-orange-50 text-orange-700', ring: 'ring-orange-200', label: 'Elevated' },
  critical: { badge: 'bg-red-50 text-red-700', ring: 'ring-red-200', label: 'Critical' },
  unknown: { badge: 'bg-stone-100 text-stone-700', ring: 'ring-stone-200', label: 'Unknown' },
};

export default function FederalLayerCard({ data }: Props) {
  const [showWhy, setShowWhy] = useState(false);
  const band = BAND_STYLES[data.band];

  return (
    <div className="bg-white rounded-2xl border border-[#D8D5D0] overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-stone-100">
        <div className="flex items-center gap-2">
          <span className="text-[10px] uppercase tracking-wide font-semibold text-[#7A756E]">
            Layer 1 of 5
          </span>
          <h3 className="font-heading text-sm font-semibold text-[#201F1E]">Federal</h3>
        </div>
        <div className="flex items-center gap-2">
          <span
            className={`text-[10px] uppercase tracking-wide font-semibold px-2 py-1 rounded ring-1 ${band.badge} ${band.ring}`}
          >
            {band.label}
          </span>
          <span className="font-heading text-2xl font-bold text-[#201F1E] tabular-nums leading-none">
            {data.subScore}
            <span className="text-sm text-[#7A756E] font-normal">/3</span>
          </span>
        </div>
      </div>

      {/* Signals */}
      <div>
        {data.signals.map((s) => (
          <SignalRow key={s.key} signal={s} />
        ))}
      </div>

      {/* Reps panel */}
      <RepsPanel
        reps={data.reps}
        resolvedDistrict={data.resolvedDistrict}
        error={data.repsError}
      />

      {/* Why this score */}
      <div className="border-t border-stone-100">
        <button
          type="button"
          onClick={() => setShowWhy((v) => !v)}
          className="w-full flex items-center justify-between px-4 py-2.5 text-xs font-medium text-[#7A756E] hover:bg-stone-50"
        >
          <span>Why this score</span>
          <svg
            className={`h-3.5 w-3.5 transition-transform ${showWhy ? 'rotate-180' : ''}`}
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={2}
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
          </svg>
        </button>
        {showWhy && (
          <div className="px-4 pb-3">
            {data.whyScored.length === 0 ? (
              <p className="text-xs text-stone-500 italic">No contributing signals.</p>
            ) : (
              <ul className="space-y-1.5">
                {data.whyScored.map((reason, i) => (
                  <li key={i} className="text-xs text-[#201F1E] leading-relaxed">
                    • {reason}
                  </li>
                ))}
              </ul>
            )}
            <p className="text-[11px] text-stone-500 mt-3">
              Federal layer contributes 3/100 to the combined political-risk score. The other four
              layers (state, county, city, sub-municipal) ship in upcoming PRs.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
