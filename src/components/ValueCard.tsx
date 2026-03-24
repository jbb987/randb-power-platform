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
      className={`${className} transition-colors duration-400 ${flash ? 'text-[#C1121F]' : ''}`}
    >
      {display}
    </span>
  );
}

export default function ValueCard({ label, value, ppa }: Props) {
  return (
    <div className="rounded-2xl border border-[#D8D5D0] bg-white flex flex-col items-center justify-center text-center w-full px-8 py-8 md:px-10 md:py-10">
      <div className="flex flex-col items-center gap-2">
        <span className="font-semibold uppercase tracking-[0.2em] text-[10px] text-[#7A756E]">
          {label}
        </span>

        <FlashValue
          value={value}
          format={formatCurrency}
          className="font-heading font-extrabold leading-none text-2xl sm:text-3xl md:text-4xl text-[#201F1E]"
        />

        <FlashValue
          value={ppa}
          format={formatPPA}
          className="font-medium mt-0.5 text-xs text-[#7A756E]"
        />
      </div>
    </div>
  );
}
