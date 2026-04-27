import type { WaterAnalysisResult } from '../../lib/waterAnalysis.types';
import type { AnalysisSectionState } from '../../hooks/useSiteAnalysis';
import WaterReport from '../water/WaterReport';

interface Props {
  section: AnalysisSectionState<WaterAnalysisResult>;
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

export default function WaterSection({ section }: Props) {
  const { loading, error, data } = section;

  return (
    <div>
      {/* Section header */}
      <div className="flex items-center gap-2.5 mb-5">
        <div className="h-8 w-8 rounded-lg bg-[#ED202B]/10 flex items-center justify-center">
          <svg className="h-4 w-4 text-[#ED202B]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 21a9.004 9.004 0 008.716-6.747M12 21a9.004 9.004 0 01-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 017.843 4.582M12 3a8.997 8.997 0 00-7.843 4.582m15.686 0A11.953 11.953 0 0112 10.5c-2.998 0-5.74-1.1-7.843-2.918m15.686 0A8.959 8.959 0 0121 12c0 .778-.099 1.533-.284 2.253m0 0A17.919 17.919 0 0112 16.5a17.92 17.92 0 01-8.716-2.247m0 0A9.015 9.015 0 003 12c0-1.605.42-3.113 1.157-4.418" />
          </svg>
        </div>
        <h2 className="font-heading text-base font-semibold text-[#201F1E]">
          Water & Environmental
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

      {data && <WaterReport result={data} />}
    </div>
  );
}
