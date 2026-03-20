import { useValueFlash } from '../hooks/useAnimatedNumber';
import { formatCurrency, formatMultiple } from '../utils/format';

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
    <div className="mt-6 pt-5 border-t border-[#E8E6E3] flex items-center justify-center gap-8 sm:gap-14 flex-wrap">
      <div className="flex flex-col items-center">
        <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#A09A92]">
          Value Created
        </span>
        <FlashValue
          value={valueCreated}
          format={formatCurrency}
          className="text-xl sm:text-2xl font-bold text-[#9E7B23]"
        />
      </div>

      <div className="w-px h-10 bg-[#D8D5D0] hidden sm:block" />

      <div className="flex flex-col items-center">
        <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#A09A92]">
          Return
        </span>
        <FlashValue
          value={returnMultiple}
          format={formatMultiple}
          className="text-xl sm:text-2xl font-extrabold text-[#ED202B]"
        />
      </div>
    </div>
  );
}
