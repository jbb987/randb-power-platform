import Layout from '../components/Layout';
import WellFinderMap from '../components/well-finder/WellFinderMap';
import Methodology from '../components/well-finder/Methodology';

export default function WellFinderTool() {
  return (
    <Layout fullWidth>
      <div className="flex flex-col h-[calc(100vh-8rem)]">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="font-heading text-2xl font-semibold text-[#201F1E]">
              Well Finder
            </h1>
            <p className="text-sm text-[#7A756E] mt-1">
              Texas oil &amp; gas reactivation candidates, ranked by opportunity.
            </p>
          </div>
        </div>
        <div className="flex-1 rounded-xl overflow-hidden border border-[#D8D5D0] shadow-sm">
          <WellFinderMap />
        </div>
      </div>
      <Methodology />
    </Layout>
  );
}
