import type { Project, SavedSite } from '../../types';

interface Props {
  project: Project;
  sites: SavedSite[];
  onSelectSite: (id: string) => void;
  onCreateSite: () => void;
}

export default function ProjectOverview({
  project,
  sites,
  onSelectSite,
  onCreateSite,
}: Props) {
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
              </tr>
            </thead>
            <tbody>
              {sites.map((site) => (
                <tr
                  key={site.id}
                  onClick={() => onSelectSite(site.id)}
                  className="border-b border-[#D8D5D0] last:border-0 hover:bg-[#D8D5D0] cursor-pointer transition"
                >
                  <td className="px-4 py-2.5 font-medium text-[#201F1E]">
                    {site.inputs.siteName || 'Untitled Site'}
                  </td>
                  <td className="px-4 py-2.5 text-right text-[#7A756E]">
                    {site.inputs.totalAcres > 0 ? site.inputs.totalAcres.toLocaleString() : '—'}
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
