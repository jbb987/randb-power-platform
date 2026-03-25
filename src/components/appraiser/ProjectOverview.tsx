import { useState } from 'react';
import type { Project, SavedSite } from '../../types';

interface Props {
  project: Project;
  sites: SavedSite[];
  onSelectSite: (id: string) => void;
  onCreateSite: () => void;
  onDeleteSite: (id: string) => void;
  canDeleteSite: boolean;
}

export default function ProjectOverview({
  project,
  sites,
  onSelectSite,
  onCreateSite,
  onDeleteSite,
  canDeleteSite,
}: Props) {
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const handleDelete = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (confirmDeleteId === id) {
      onDeleteSite(id);
      setConfirmDeleteId(null);
    } else {
      setConfirmDeleteId(id);
      setTimeout(() => setConfirmDeleteId(null), 3000);
    }
  };
  return (
    <div className="max-w-3xl">
      {/* Project name */}
      <div className="mb-6">
        <h2 className="font-heading text-2xl font-semibold text-[#201F1E]">
          {project.name}
        </h2>
        <p className="text-sm text-[#7A756E] mt-1">
          {sites.length} site{sites.length !== 1 ? 's' : ''}
        </p>
      </div>

      {/* Sites table */}
      {sites.length > 0 ? (
        <div className="bg-white rounded-xl shadow-sm border border-[#D8D5D0] overflow-hidden mb-4">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[#D8D5D0] bg-white">
                <th className="text-left text-xs font-medium text-[#7A756E] px-4 py-2.5">Site Name</th>
                <th className="text-right text-xs font-medium text-[#7A756E] px-4 py-2.5">Acres</th>
                <th className="w-10" />
              </tr>
            </thead>
            <tbody>
              {sites.map((site) => (
                <tr
                  key={site.id}
                  onClick={() => onSelectSite(site.id)}
                  className="group border-b border-[#D8D5D0] last:border-0 hover:bg-[#D8D5D0] cursor-pointer transition"
                >
                  <td className="px-4 py-2.5 font-medium text-[#201F1E]">
                    {site.inputs.siteName || 'Untitled Site'}
                  </td>
                  <td className="px-4 py-2.5 text-right text-[#7A756E]">
                    {site.inputs.totalAcres > 0 ? site.inputs.totalAcres.toLocaleString() : '—'}
                  </td>
                  <td className="px-2 py-2.5">
                    {canDeleteSite && (
                      <button
                        onClick={(e) => handleDelete(e, site.id)}
                        className={`p-1 rounded transition ${
                          confirmDeleteId === site.id
                            ? 'text-[#ED202B]'
                            : 'text-[#7A756E] opacity-0 group-hover:opacity-100 hover:bg-[#D8D5D0]/60'
                        }`}
                        title={confirmDeleteId === site.id ? 'Click again to confirm' : 'Delete site'}
                      >
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="bg-white rounded-xl shadow-sm border border-[#D8D5D0] p-6 text-center mb-4">
          <p className="text-sm text-[#7A756E] mb-3">No sites in this project yet.</p>
        </div>
      )}

      {/* Add site button */}
      <button
        onClick={onCreateSite}
        className="rounded-xl border-2 border-dashed border-[#D8D5D0] py-3 px-4 text-sm font-medium text-[#7A756E] hover:border-[#ED202B]/30 hover:text-[#ED202B] transition w-full"
      >
        + Add Site
      </button>
    </div>
  );
}
