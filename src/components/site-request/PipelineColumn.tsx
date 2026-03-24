import { useState } from 'react';
import type { SiteRequest, SiteRequestStatus } from '../../types';
import RequestCard from './RequestCard';

const statusConfig: Record<SiteRequestStatus, { label: string; color: string; bg: string }> = {
  new: { label: 'New', color: 'text-blue-700', bg: 'bg-blue-50' },
  ongoing: { label: 'Ongoing', color: 'text-amber-700', bg: 'bg-amber-50' },
  done: { label: 'Done', color: 'text-emerald-700', bg: 'bg-emerald-50' },
};

interface PipelineColumnProps {
  status: SiteRequestStatus;
  requests: SiteRequest[];
  onDrop: (id: string, status: SiteRequestStatus) => void;
  onDelete: (id: string) => void;
}

export default function PipelineColumn({
  status,
  requests,
  onDrop,
  onDelete,
}: PipelineColumnProps) {
  const [dragOver, setDragOver] = useState(false);
  const config = statusConfig[status];

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragOver(false);
        const id = e.dataTransfer.getData('text/plain');
        if (id) onDrop(id, status);
      }}
      className={`flex flex-col rounded-xl border-2 transition-colors min-h-[300px] ${
        dragOver
          ? 'border-[#C1121F]/40 bg-[#C1121F]/5'
          : 'border-[#D8D5D0] bg-white/50'
      }`}
    >
      {/* Column header */}
      <div className="flex items-center gap-2 px-4 pt-4 pb-3">
        <span
          className={`text-xs font-semibold px-2 py-0.5 rounded-full ${config.color} ${config.bg}`}
        >
          {config.label}
        </span>
        <span className="text-xs text-[#7A756E]">{requests.length}</span>
      </div>

      {/* Cards */}
      <div className="flex-1 px-3 pb-3 space-y-2">
        {requests.map((req) => (
          <RequestCard key={req.id} request={req} onDelete={onDelete} />
        ))}
        {requests.length === 0 && (
          <div className="flex items-center justify-center h-24 text-xs text-[#7A756E]">
            Drop cards here
          </div>
        )}
      </div>
    </div>
  );
}
