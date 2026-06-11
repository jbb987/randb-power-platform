import PowerSlider from '../PowerSlider';

/** Single source of truth for the MW capacity range across the Site Analyzer. */
export const MW_MIN = 10;
export const MW_MAX = 10000;

interface Props {
  value: number;
  onChange: (mw: number) => void;
}

/**
 * MW capacity input — a log-scaled slider (good resolution from 10 MW to 10 GW)
 * paired with a typed number box. Keeps the 10 MW–10 GW range (MW_MIN/MW_MAX) in
 * one place so any consumer of this field stays in sync.
 */
export default function MwCapacityField({ value, onChange }: Props) {
  return (
    <div className="max-w-md">
      <PowerSlider
        value={value}
        min={MW_MIN}
        max={MW_MAX}
        step={5}
        scale="log"
        showValueInput
        unit="MW"
        label="MW Capacity"
        onChange={onChange}
      />
      <div className="flex justify-between mt-1">
        <span className="text-[10px] text-[#7A756E]">{MW_MIN} MW</span>
        <span className="text-[10px] text-[#7A756E]">{MW_MAX.toLocaleString()} MW</span>
      </div>
    </div>
  );
}
