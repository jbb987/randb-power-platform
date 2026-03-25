import { useNavigate } from 'react-router-dom';
import Layout from '../components/Layout';
import PipelineColumn from '../components/site-request/PipelineColumn';
import { useSiteRequests } from '../hooks/useSiteRequests';
import type { SiteRequestStatus } from '../types';

const STATUSES: SiteRequestStatus[] = ['new', 'ongoing', 'done'];

export default function SiteRequestPipeline() {
  const { requests, loading, updateStatus, deleteRequest } = useSiteRequests();
  const navigate = useNavigate();

  const handleDrop = (id: string, status: SiteRequestStatus) => {
    const req = requests.find((r) => r.id === id);
    if (req && req.status !== status) {
      updateStatus(id, status);
    }
  };

  if (loading) {
    return (
      <Layout>
        <div className="flex items-center justify-center py-24">
          <div className="h-8 w-8 animate-spin rounded-full border-[3px] border-[#D8D5D0] border-t-[#C1121F]" />
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <main className="py-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="font-heading text-2xl font-semibold text-[#201F1E]">
              Site Requests
            </h2>
            <p className="text-sm text-[#7A756E] mt-0.5">
              Drag cards between columns to update status.
            </p>
          </div>
          <button
            onClick={() => navigate('/site-request/form')}
            className="rounded-lg bg-white text-[#C1121F] border border-[#C1121F] hover:bg-[#C1121F] hover:text-white px-4 py-2 text-sm font-medium transition"
          >
            + New Request
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {STATUSES.map((status) => (
            <PipelineColumn
              key={status}
              status={status}
              requests={requests.filter((r) => r.status === status)}
              onDrop={handleDrop}
              onDelete={deleteRequest}
            />
          ))}
        </div>
      </main>
    </Layout>
  );
}
