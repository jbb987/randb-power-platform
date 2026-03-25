import { useState } from 'react';
import type { SiteRequest } from '../../types';

interface RequestCardProps {
  request: SiteRequest;
  onDelete: (id: string) => void;
}

export default function RequestCard({ request, onDelete }: RequestCardProps) {
  const [expanded, setExpanded] = useState(false);

  const date = new Date(request.createdAt).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });

  return (
    <div
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData('text/plain', request.id);
        e.dataTransfer.effectAllowed = 'move';
      }}
      className="bg-white rounded-lg border border-[#D8D5D0] p-4 shadow-sm hover:shadow-md transition cursor-grab active:cursor-grabbing"
    >
      <div className="flex items-start justify-between mb-2">
        <h4 className="font-heading font-semibold text-sm text-[#201F1E]">
          {request.customerName}
        </h4>
        <span className="text-xs text-[#7A756E] flex-shrink-0 ml-2">{date}</span>
      </div>

      <div className="flex items-center gap-2 mb-2">
        <span className="inline-flex items-center gap-1 text-xs text-[#7A756E]">
          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
          {request.sites.length} site{request.sites.length !== 1 ? 's' : ''}
        </span>
        <span className="text-xs text-[#7A756E]">by {request.submittedBy}</span>
      </div>

      {/* Expand/collapse site details */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="text-xs text-[#ED202B] hover:underline"
      >
        {expanded ? 'Hide details' : 'Show details'}
      </button>

      {expanded && (
        <div className="mt-3 space-y-2">
          {request.sites.map((site, i) => (
            <div key={i} className="rounded-md bg-white px-3 py-2">
              {site.address && (
                <p className="text-xs font-medium text-[#201F1E]">{site.address}</p>
              )}
              {site.coordinates && (
                <p className="text-xs text-[#7A756E] mt-0.5">{site.coordinates}</p>
              )}
              {site.acres > 0 && (
                <p className="text-xs text-[#7A756E] mt-0.5">{site.acres} acres</p>
              )}
            </div>
          ))}
          <button
            onClick={() => onDelete(request.id)}
            className="text-xs text-[#7A756E] hover:text-[#ED202B] transition mt-1"
          >
            Delete request
          </button>
        </div>
      )}
    </div>
  );
}
