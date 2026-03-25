import { useValueFlash } from '../hooks/useAnimatedNumber';
import { formatCurrencyShort, formatMultiple } from '../utils/format';

interface Props {
  valueCreated: number;
  returnMultiple: number;
}

function FlashValue({ value, format, className }: { value: number; format: (n: number) => string; className?: string }) {
  const { display, flash } = useValueFlash(value, format);
  return (
    <span className={`${className} transition-colors duration-400 ${flash ? 'brightness-125' : ''}`}>
      {display}
    </span>
  );
}

export default function OutcomeBar({ valueCreated, returnMultiple }: Props) {
  return (
    <div className="mt-8 pt-6 border-t border-[#D8D5D0] flex items-center justify-center gap-10 sm:gap-16 flex-wrap">
      <div className="flex flex-col items-center">
        <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#7A756E]">
          Value Created
        </span>
        <FlashValue
          value={valueCreated}
          format={formatCurrencyShort}
          className="text-2xl sm:text-3xl font-heading font-bold text-[#201F1E]"
        />
      </div>

      <div className="w-px h-12 bg-[#D8D5D0] hidden sm:block" />

      <div className="flex flex-col items-center">
        <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#7A756E]">
          Return
        </span>
        <FlashValue
          value={returnMultiple}
          format={formatMultiple}
          className="text-2xl sm:text-3xl font-heading font-extrabold text-[#C1121F]"
        />
      </div>
    </div>
  );
}
