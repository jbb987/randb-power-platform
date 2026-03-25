import { useValueFlash } from '../hooks/useAnimatedNumber';
import { formatCurrencyShort } from '../utils/format';

interface RangeProps {
  label: string;
  valueLow: number;
  valueHigh: number;
  variant: 'current';
}

interface SingleProps {
  label: string;
  value: number;
  variant: 'energized';
}

type Props = RangeProps | SingleProps;

function FlashValue({ value, format, className }: { value: number; format: (n: number) => string; className?: string }) {
  const { display, flash } = useValueFlash(value, format);
  return (
    <span className={`${className} transition-colors duration-400 ${flash ? 'text-[#ED202B]' : ''}`}>
      {display}
    </span>
  );
}

function RangeValue({ low, high, format, className }: { low: number; high: number; format: (n: number) => string; className?: string }) {
  const lowFlash = useValueFlash(low, format);
  const highFlash = useValueFlash(high, format);
  const flash = lowFlash.flash || highFlash.flash;

  if (low === 0 && high === 0) {
    return <span className={className}>{format(0)}</span>;
  }

  return (
    <span className={`${className} transition-colors duration-400 ${flash ? 'text-[#ED202B]' : ''}`}>
      {lowFlash.display} – {highFlash.display}
    </span>
  );
}

export default function ValueCard(props: Props) {
  const isRange = props.variant === 'current';

  return (
    <div className="rounded-2xl border border-[#D8D5D0] bg-white flex flex-col items-center justify-center text-center w-full px-5 py-5 md:px-6 md:py-6">
      <div className="flex flex-col items-center gap-2">
        <span className="font-semibold uppercase tracking-[0.2em] text-[10px] text-[#7A756E]">
          {props.label}
        </span>

        <div className="flex flex-col items-center gap-0.5">
          <span className="text-[10px] font-medium text-[#7A756E] uppercase tracking-wider">Est.</span>
          {isRange ? (
            <RangeValue
              low={(props as RangeProps).valueLow}
              high={(props as RangeProps).valueHigh}
              format={formatCurrencyShort}
              className="font-heading font-extrabold leading-none text-xl sm:text-2xl md:text-3xl text-[#201F1E]"
            />
          ) : (
            <FlashValue
              value={(props as SingleProps).value}
              format={formatCurrencyShort}
              className="font-heading font-extrabold leading-none text-2xl sm:text-3xl md:text-4xl text-[#201F1E]"
            />
          )}
        </div>
      </div>
    </div>
  );
}
