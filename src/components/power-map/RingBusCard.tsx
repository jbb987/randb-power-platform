import { useState } from 'react';
import { estimateRingBus } from '../../lib/ringBus';

interface RingBusCardProps {
  /** Connected-line count from HIFLD. */
  lineCount: number;
  /** High-side voltage (kV) — sizes the typical transformer for the class. */
  maxVolt: number;
}

/**
 * Ring-bus estimator (Bailey's field rule): count the breakers on the aerial
 * view, and since a ring bus holds one breaker per circuit element,
 * transformers ≈ breakers − lines. Each inferred transformer is sized by the
 * typical MVA range for the voltage class — a screening read of how much
 * transformation capacity the station holds.
 */
export default function RingBusCard({ lineCount, maxVolt }: RingBusCardProps) {
  const [breakersRaw, setBreakersRaw] = useState('');
  const breakers = Number.parseInt(breakersRaw, 10);
  const estimate = estimateRingBus(breakers, lineCount, maxVolt);

  return (
    <div className="pt-2 mt-1 border-t border-[#D8D5D0]">
      <div className="text-[10px] uppercase tracking-wide text-[#7A756E] mb-1">
        Ring bus estimate
      </div>
      <div className="flex items-center justify-between gap-2 text-xs">
        <label htmlFor="ring-bus-breakers" className="text-[#7A756E]">
          Breakers counted on aerial
        </label>
        <input
          id="ring-bus-breakers"
          type="number"
          min={1}
          max={40}
          inputMode="numeric"
          value={breakersRaw}
          onChange={(e) => setBreakersRaw(e.target.value)}
          placeholder="—"
          className="w-14 rounded-md border border-[#D8D5D0] px-1.5 py-0.5 text-right text-xs text-[#201F1E] focus:border-[#ED202B] focus:ring-2 focus:ring-[#ED202B]/20 focus:outline-none"
        />
      </div>
      {estimate ? (
        <div className="mt-1.5 space-y-1">
          <div className="flex justify-between text-xs">
            <span className="text-[#7A756E]">Est. transformers</span>
            <span className="font-medium text-[#201F1E]">
              {estimate.transformers}
              {estimate.transformers > 0 && (
                <span className="text-[#7A756E] font-normal">
                  {' '}
                  × {estimate.mvaPerXfmr.low}–{estimate.mvaPerXfmr.high} MVA
                </span>
              )}
            </span>
          </div>
          {estimate.transformers > 0 && (
            <div className="flex justify-between text-xs">
              <span className="text-[#7A756E]">Est. capacity</span>
              <span className="font-semibold text-[#201F1E]">
                {estimate.capacityMVA.low.toLocaleString()}–
                {estimate.capacityMVA.high.toLocaleString()} MVA
              </span>
            </div>
          )}
          {estimate.caveats.map((c) => (
            <p key={c} className="text-[10px] leading-snug text-[#7A756E]">
              {c}
            </p>
          ))}
        </div>
      ) : (
        <p className="mt-1 text-[10px] leading-snug text-[#7A756E]">
          On a ring bus, breakers = lines + transformers — so transformers ≈ breakers − {lineCount}{' '}
          known line{lineCount === 1 ? '' : 's'}.
        </p>
      )}
    </div>
  );
}
