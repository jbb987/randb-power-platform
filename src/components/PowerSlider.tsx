import { useRef, useCallback, useState, useEffect } from 'react';

interface Props {
  value: number;
  min: number;
  max: number;
  step: number;
  label: string;
  /** Track mapping. 'log' spaces equal ratios evenly — good for 10 MW–10 GW. Default 'linear'. */
  scale?: 'linear' | 'log';
  /** Render an inline number box for typing an exact value. Default false. */
  showValueInput?: boolean;
  /** Unit suffix shown next to the number box (e.g. "MW"). */
  unit?: string;
  onChange: (v: number) => void;
}

/**
 * Snap step that scales with magnitude, so dragging lands on clean numbers
 * across orders of magnitude. NOTE: these tiers are tuned for this app's MW
 * range (10–10,000) and only apply in `scale="log"` mode, where they override
 * the `step` prop. A future caller on a very different range should pass
 * `scale="linear"` (which honours `step`) or this ladder will mis-snap.
 */
function niceStep(v: number): number {
  const a = Math.abs(v);
  if (a <= 100) return 5;
  if (a < 500) return 10;
  if (a < 1000) return 25;
  if (a < 5000) return 100;
  return 250;
}

function snapNice(v: number): number {
  const s = niceStep(v);
  return Math.round(v / s) * s;
}

export default function PowerSlider({
  value,
  min,
  max,
  step,
  label,
  scale = 'linear',
  showValueInput = false,
  unit,
  onChange,
}: Props) {
  const trackRef = useRef<HTMLDivElement>(null);
  const isLog = scale === 'log' && min > 0;

  const clamp = useCallback((v: number) => Math.max(min, Math.min(max, v)), [min, max]);

  const valueToPercent = useCallback(
    (v: number) => {
      const cv = clamp(v);
      if (isLog) return (Math.log(cv / min) / Math.log(max / min)) * 100;
      return ((cv - min) / (max - min)) * 100;
    },
    [clamp, isLog, min, max],
  );

  const percentToValue = useCallback(
    (pct: number) => {
      const p = Math.max(0, Math.min(1, pct));
      if (isLog) return clamp(snapNice(min * Math.pow(max / min, p)));
      return clamp(Math.round((min + p * (max - min)) / step) * step);
    },
    [clamp, isLog, min, max, step],
  );

  const percent = valueToPercent(value);

  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault();
      const track = trackRef.current;
      if (!track) return;

      const update = (clientX: number) => {
        const rect = track.getBoundingClientRect();
        const pct = (clientX - rect.left) / rect.width;
        onChange(percentToValue(pct));
      };

      update(e.clientX);

      const onMove = (ev: PointerEvent) => update(ev.clientX);
      const onUp = () => {
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
      };
      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
    },
    [onChange, percentToValue],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      const delta = isLog ? niceStep(value) : step;
      let next = value;
      if (e.key === 'ArrowRight' || e.key === 'ArrowUp') {
        next = clamp(value + delta);
      } else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') {
        next = clamp(value - delta);
      } else if (e.key === 'Home') {
        next = min;
      } else if (e.key === 'End') {
        next = max;
      } else {
        return;
      }
      e.preventDefault();
      onChange(next);
    },
    [value, min, max, step, isLog, clamp, onChange],
  );

  // Number box: free-typing buffer synced to the committed value. A value below
  // `min` is treated as "unset" and shows an empty box (no defaulted number).
  const display = useCallback((v: number) => (v >= min ? String(v) : ''), [min]);
  const [text, setText] = useState(() => display(value));
  useEffect(() => {
    setText(display(value));
  }, [value, display]);

  const commit = useCallback(() => {
    // parseFloat (not parseInt) so "6.6" reads as 6.6→7, never silently 6;
    // round to a whole MW. Empty / non-numeric → revert to the committed value.
    const n = Math.round(parseFloat(text.replace(/[^0-9.]/g, '')));
    if (Number.isFinite(n)) onChange(clamp(n));
    else setText(display(value));
  }, [text, value, clamp, onChange, display]);

  return (
    <div className="w-full">
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-medium text-[#7A756E]">{label}</span>
        {showValueInput && (
          <div className="flex items-center gap-1.5">
            <input
              type="text"
              inputMode="numeric"
              value={text}
              placeholder="Set MW"
              onChange={(e) => setText(e.target.value)}
              onBlur={commit}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  commit();
                }
              }}
              aria-label={`${label} exact value`}
              className="w-24 rounded-lg border border-[#D8D5D0] bg-white/80 px-2.5 py-1.5 text-right text-sm font-heading font-semibold text-[#ED202B] outline-none transition focus:border-[#ED202B] focus:ring-2 focus:ring-[#ED202B]/20"
            />
            {unit && <span className="text-xs text-[#7A756E]">{unit}</span>}
          </div>
        )}
      </div>

      <div
        ref={trackRef}
        className="relative h-[10px] rounded-full bg-[#D8D5D0] cursor-pointer touch-none select-none"
        role="slider"
        tabIndex={0}
        aria-valuenow={value}
        aria-valuemin={min}
        aria-valuemax={max}
        aria-label={label}
        onPointerDown={handlePointerDown}
        onKeyDown={handleKeyDown}
      >
        <div
          className="absolute top-0 left-0 h-full rounded-full bg-[#ED202B]"
          style={{ width: `${percent}%` }}
        />

        <div
          className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-7 h-7 rounded-full bg-[#ED202B] shadow-md shadow-black/15 border-[3px] border-white transition-transform hover:scale-110 active:scale-105"
          style={{ left: `${percent}%` }}
        />
      </div>
    </div>
  );
}
