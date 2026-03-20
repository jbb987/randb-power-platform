import { useValueFlash } from '../hooks/useAnimatedNumber';
import { formatCurrency, formatPPA } from '../utils/format';

interface Props {
  label: string;
  value: number;
  ppa: number;
  variant: 'current' | 'energized';
}

function FlashValue({ value, format, className }: { value: number; format: (n: number) => string; className?: string }) {
  const { display, flash } = useValueFlash(value, format);
  return (
    <span
      className={`${className} transition-colors duration-400 ${flash ? 'text-amber-600' : ''}`}
    >
      {display}
    </span>
  );
}

export default function ValueCard({ label, value, ppa, variant }: Props) {
  const isCurrent = variant === 'current';

  return (
    <div
      className={`
        relative rounded-2xl border flex flex-col items-center justify-center text-center
        ${isCurrent
          ? 'bg-[#F0EEEB] border-[#D8D5D0] px-6 py-6 md:px-8 md:py-8 min-w-[180px] md:min-w-[220px]'
          : 'bg-white border-[#B8D8BE] px-8 py-8 md:px-12 md:py-10 min-w-[220px] md:min-w-[300px] shadow-lg shadow-[#B8D8BE]/25'
        }
      `}
    >
      {/* Subtle left accent for energized card */}
      {!isCurrent && (
        <div className="absolute left-0 top-4 bottom-4 w-[3px] rounded-full bg-[#4A9B5E]" />
      )}

      <div className="relative z-10 flex flex-col items-center gap-1.5">
        <span className={`font-semibold uppercase tracking-[0.2em] ${
          isCurrent
            ? 'text-[10px] text-[#8A847C]'
            : 'text-[11px] text-[#4A9B5E]'
        }`}>
          {label}
        </span>

        <FlashValue
          value={value}
          format={formatCurrency}
          className={`font-extrabold leading-none ${
            isCurrent
              ? 'text-2xl md:text-3xl text-[#5C5650]'
              : 'text-3xl md:text-[2.75rem] text-[#2D6E3A]'
          }`}
        />

        <FlashValue
          value={ppa}
          format={formatPPA}
          className={`font-medium mt-0.5 ${
            isCurrent ? 'text-xs text-[#A09A92]' : 'text-sm text-[#5EA46D]'
          }`}
        />
      </div>
    </div>
  );
}
