import Layout from '../components/Layout';
import PowerMapView from '../components/power-map/PowerMapView';
import Methodology from '../components/power-map/Methodology';

export default function GridPowerAnalyzer() {
  return (
    <Layout fullWidth>
      <div className="flex flex-col h-[calc(100vh-8rem)]">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="font-heading text-2xl font-semibold text-[#201F1E]">
              Grid Power Analyzer
            </h1>
            <p className="text-sm text-[#7A756E] mt-1">
              Map power generators, transmission infrastructure, and identify available capacity
            </p>
          </div>
        </div>
        <div className="flex-1 rounded-xl overflow-hidden border border-[#D8D5D0] shadow-sm">
          <PowerMapView />
        </div>
      </div>
      <Methodology />
    </Layout>
  );
}
