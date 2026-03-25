import { useRef, useCallback } from 'react';

interface Props {
  value: number;
  min: number;
  max: number;
  step: number;
  label: string;
  formatValue?: (v: number) => string;
  onChange: (v: number) => void;
}

export default function PowerSlider({ value, min, max, step, label, onChange }: Props) {
  const trackRef = useRef<HTMLDivElement>(null);
  const percent = ((value - min) / (max - min)) * 100;

  const clamp = (v: number) => Math.max(min, Math.min(max, v));

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    const track = trackRef.current;
    if (!track) return;

    const update = (clientX: number) => {
      const rect = track.getBoundingClientRect();
      const pct = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
      const raw = min + pct * (max - min);
      const snapped = Math.round(raw / step) * step;
      onChange(clamp(snapped));
    };

    update(e.clientX);

    const onMove = (ev: PointerEvent) => update(ev.clientX);
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  }, [min, max, step, onChange]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    let next = value;
    if (e.key === 'ArrowRight' || e.key === 'ArrowUp') {
      next = clamp(value + step);
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') {
      next = clamp(value - step);
    } else if (e.key === 'Home') {
      next = min;
    } else if (e.key === 'End') {
      next = max;
    } else {
      return;
    }
    e.preventDefault();
    onChange(next);
  }, [value, min, max, step, onChange]);

  return (
    <div className="w-full">
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-medium text-[#7A756E]">{label}</span>
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
