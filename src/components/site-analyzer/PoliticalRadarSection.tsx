import type { AnalysisSectionState } from '../../hooks/useSiteAnalysis';
import type { PoliticalRadarResult } from '../../lib/politicalRadar';
import FederalLayerCard from '../political/FederalLayerCard';
import StubLayerCard from '../political/StubLayerCard';

interface Props {
  section: AnalysisSectionState<PoliticalRadarResult>;
}

function SectionSkeleton() {
  return (
    <div className="space-y-3 animate-pulse">
      <div className="h-44 bg-stone-100 rounded-2xl" />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className="h-20 bg-stone-100 rounded-2xl" />
        <div className="h-20 bg-stone-100 rounded-2xl" />
        <div className="h-20 bg-stone-100 rounded-2xl" />
        <div className="h-20 bg-stone-100 rounded-2xl" />
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

export default function PoliticalRadarSection({ section }: Props) {
  const { loading, error, data } = section;

  return (
    <div>
      {/* Section header */}
      <div className="flex items-center gap-2.5 mb-5">
        <div className="h-8 w-8 rounded-lg bg-[#ED202B]/10 flex items-center justify-center">
          <svg
            className="h-4 w-4 text-[#ED202B]"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M3 3v1.5M3 21v-6m0 0l2.77-.693a9 9 0 016.208.682l.108.054a9 9 0 006.086.71l3.114-.732a48.524 48.524 0 01-.005-10.499l-3.11.732a9 9 0 01-6.085-.711l-.108-.054a9 9 0 00-6.208-.682L3 4.5M3 15V4.5"
            />
          </svg>
        </div>
        <h2 className="font-heading text-base font-semibold text-[#201F1E]">Political Radar</h2>
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

      {data && (
        <div className="space-y-3">
          <FederalLayerCard data={data.layers.federal.data} />
          <StubLayerCard
            layerNumber={2}
            layerName="State"
            hint={data.layers.state.label}
          />
          <StubLayerCard
            layerNumber={3}
            layerName="County"
            hint={data.layers.county.label}
          />
          <StubLayerCard
            layerNumber={4}
            layerName="City"
            hint={data.layers.city.label}
          />
          <StubLayerCard
            layerNumber={5}
            layerName="Sub-municipal"
            hint={data.layers.submunicipal.label}
          />
        </div>
      )}
    </div>
  );
}
