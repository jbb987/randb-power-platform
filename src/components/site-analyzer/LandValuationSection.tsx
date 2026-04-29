import { useMemo, useCallback } from 'react';
import type { AppraisalResult, LandComp, FilteredCompResult } from '../../types';
import type { AnalysisInputs, AnalysisSectionState } from '../../hooks/useSiteAnalysis';
import { formatCurrencyShort, formatMultiple } from '../../utils/format';
import PowerSlider from '../PowerSlider';
import LandCompsPanel from './LandCompsPanel';

const VALUE_PER_MW = 3_000_000;

interface Props {
  section: AnalysisSectionState<AppraisalResult>;
  inputs: AnalysisInputs;
  mw: number;
  mwMin: number;
  mwMax: number;
  onMwChange: (mw: number) => void;
  landComps: LandComp[];
  onLandCompsChange: (comps: LandComp[]) => void;
  onFilteredCompsChange: (result: FilteredCompResult) => void;
}

function SectionSkeleton() {
  return (
    <div className="animate-pulse space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-20 bg-stone-100 rounded-xl" />
        ))}
      </div>
    </div>
  );
}

function SectionError({ message }: { message: string }) {
  return (
    <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
      {message}
    </div>
  );
}

function MetricCard({ label, value, subtitle, accent }: { label: string; value: string; subtitle?: string; accent?: boolean }) {
  return (
    <div className="bg-[#FAFAF9] rounded-xl border border-[#D8D5D0]/60 px-4 py-3 text-center">
      <p className="text-[10px] uppercase tracking-wider text-[#7A756E] font-medium">{label}</p>
      <p className={`text-lg font-heading font-semibold mt-1 ${accent ? 'text-[#ED202B]' : 'text-[#201F1E]'}`}>
        {value}
      </p>
      {subtitle && <p className="text-[10px] text-[#7A756E] mt-0.5">{subtitle}</p>}
    </div>
  );
}

export default function LandValuationSection({
  section, inputs, mw, mwMin, mwMax, onMwChange,
  landComps, onLandCompsChange, onFilteredCompsChange,
}: Props) {
  const { loading, error, data } = section;
  // When comps are present, ppaLow === ppaHigh === median, so midpoint = that value
  const liveData = useMemo(() => {
    if (!data) return null;
    const currentValue = inputs.acreage * ((inputs.ppaLow + inputs.ppaHigh) / 2);
    const ppa = (inputs.ppaLow + inputs.ppaHigh) / 2;
    const energizedValue = mw * VALUE_PER_MW;
    const valueCreated = energizedValue - currentValue;
    const returnMultiple = currentValue > 0 ? energizedValue / currentValue : 0;
    return { currentValue, ppa, energizedValue, valueCreated, returnMultiple };
  }, [data, inputs.acreage, inputs.ppaLow, inputs.ppaHigh, mw]);

  const handleFilteredChange = useCallback((result: FilteredCompResult) => {
    onFilteredCompsChange(result);
  }, [onFilteredCompsChange]);

  return (
    <div className="bg-white rounded-2xl border border-[#D8D5D0] p-5 md:p-6">
      <div className="flex items-center gap-2.5 mb-5">
        <div className="h-8 w-8 rounded-lg bg-[#ED202B]/10 flex items-center justify-center">
          <svg className="h-4 w-4 text-[#ED202B]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 1v22m-5-4h7a4 4 0 004-4 4 4 0 00-4-4H9a4 4 0 01-4-4 4 4 0 014-4h7" />
          </svg>
        </div>
        <h2 className="font-heading text-base font-semibold text-[#201F1E]">
          Land Valuation
        </h2>
      </div>

      {loading && <SectionSkeleton />}
      {error && <SectionError message={error} />}

      {liveData && (
        <div className="space-y-5">
          {/* Metric cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <MetricCard
              label="Estimated $/Acre"
              value={liveData.ppa > 0 ? formatCurrencyShort(liveData.ppa) : '--'}
            />
            <MetricCard
              label="Current Land Value"
              value={liveData.currentValue > 0 ? formatCurrencyShort(liveData.currentValue) : '--'}
            />
            <MetricCard
              label="Energized Value"
              value={formatCurrencyShort(liveData.energizedValue)}
              accent
            />
            <MetricCard
              label="Return Multiple"
              value={liveData.returnMultiple > 0 ? formatMultiple(liveData.returnMultiple) : '--'}
            />
          </div>

          {/* Detail rows */}
          <div className="border-t border-[#D8D5D0]/60 pt-4 space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-[#7A756E]">Acreage</span>
              <span className="text-[#201F1E] font-medium">
                {inputs.acreage > 0 ? `${inputs.acreage.toLocaleString()} acres` : '--'}
              </span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-[#7A756E]">Estimated $/Acre</span>
              <span className="text-[#201F1E] font-medium">
                {liveData.ppa > 0 ? `$${Math.round(liveData.ppa).toLocaleString()}` : '--'}
              </span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-[#7A756E]">MW Capacity</span>
              <span className="text-[#201F1E] font-medium">{mw} MW</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-[#7A756E]">Value Created</span>
              <span className="text-[#ED202B] font-semibold">
                {liveData.valueCreated > 0 ? `+${formatCurrencyShort(liveData.valueCreated)}` : formatCurrencyShort(liveData.valueCreated)}
              </span>
            </div>
          </div>

          {/* MW Slider */}
          <div className="border-t border-[#D8D5D0]/60 pt-4 max-w-md">
            <PowerSlider
              value={mw}
              min={mwMin}
              max={mwMax}
              step={5}
              label="MW Capacity"
              onChange={onMwChange}
            />
            <div className="flex justify-between mt-1">
              <span className="text-[10px] text-[#7A756E]">{mwMin} MW</span>
              <span className="text-sm font-heading font-semibold text-[#ED202B]">{mw} MW</span>
              <span className="text-[10px] text-[#7A756E]">{mwMax} MW</span>
            </div>
          </div>

          {/* Land Comps — internal only, not in PDF */}
          <div className="border-t border-[#D8D5D0]/60 pt-4">
            <LandCompsPanel
              comps={landComps}
              onCompsChange={onLandCompsChange}
              subjectAcres={inputs.acreage}
              onFilteredChange={handleFilteredChange}
            />
          </div>
        </div>
      )}
    </div>
  );
}
