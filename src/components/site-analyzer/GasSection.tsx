import type { GasAnalysisResult } from '../../lib/gasAnalysis';
import type { AnalysisSectionState } from '../../hooks/useSiteAnalysis';
import GasReport from '../gas/GasReport';

interface Props {
  section: AnalysisSectionState<GasAnalysisResult>;
  pipelineMarketers?: Record<string, string>;
  onMarketerChange?: (operator: string, marketer: string) => void;
}

function SectionSkeleton() {
  return (
    <div className="animate-pulse space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-16 bg-stone-100 rounded-xl" />
        ))}
      </div>
      <div className="h-48 bg-stone-100 rounded-xl" />
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

export default function GasSection({ section, pipelineMarketers, onMarketerChange }: Props) {
  const { loading, error, data } = section;

  return (
    <div>
      {/* Section header */}
      <div className="flex items-center gap-2.5 mb-5">
        <div className="h-8 w-8 rounded-lg bg-[#ED202B]/10 flex items-center justify-center">
          <svg className="h-4 w-4 text-[#ED202B]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.362 5.214A8.252 8.252 0 0112 21 8.25 8.25 0 016.038 7.048 8.287 8.287 0 009 9.6a8.983 8.983 0 013.361-6.867 8.21 8.21 0 003 2.48z" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 18a3.75 3.75 0 00.495-7.467 5.99 5.99 0 00-1.925 3.546 5.974 5.974 0 01-2.133-1.001A3.75 3.75 0 0012 18z" />
          </svg>
        </div>
        <h2 className="font-heading text-base font-semibold text-[#201F1E]">
          Gas Infrastructure
        </h2>
      </div>

      {loading && (
        <div className="bg-white rounded-2xl border border-[#D8D5D0] p-5 md:p-6">
          <SectionSkeleton />
        </div>
      )}

      {error && (
        <div className="bg-white rounded-2xl border border-[#D8D5D0] p-5 md:p-6">
          <SectionError message={error} />
        </div>
      )}

      {data && <GasReport result={data} pipelineMarketers={pipelineMarketers} onMarketerChange={onMarketerChange} />}
    </div>
  );
}
