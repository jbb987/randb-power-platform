import type { BroadbandResult } from '../../types';
import type { AnalysisSectionState } from '../../hooks/useSiteAnalysis';
import BroadbandReport from '../broadband/BroadbandReport';

interface Props {
  section: AnalysisSectionState<BroadbandResult>;
}

function SectionSkeleton() {
  return (
    <div className="animate-pulse space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {[0, 1, 2, 3, 4].map((i) => (
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

export default function BroadbandSection({ section }: Props) {
  const { loading, error, data } = section;

  return (
    <div>
      {/* Section header */}
      <div className="flex items-center gap-2.5 mb-5">
        <div className="h-8 w-8 rounded-lg bg-[#ED202B]/10 flex items-center justify-center">
          <svg className="h-4 w-4 text-[#ED202B]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M8.288 15.038a5.25 5.25 0 017.424 0M5.106 11.856c3.807-3.808 9.98-3.808 13.788 0M1.924 8.674c5.565-5.565 14.587-5.565 20.152 0M12.53 18.22l-.53.53-.53-.53a.75.75 0 011.06 0z" />
          </svg>
        </div>
        <h2 className="font-heading text-base font-semibold text-[#201F1E]">
          Broadband & Connectivity
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

      {data && <BroadbandReport result={data} />}
    </div>
  );
}
