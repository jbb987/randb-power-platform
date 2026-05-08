import type { CongressionalRep } from '../../lib/politicalRadar/types';

interface Props {
  reps: CongressionalRep[];
  resolvedDistrict: string | null;
  error: string | null;
}

const PARTY_STYLES: Record<string, string> = {
  R: 'bg-red-50 text-red-700 ring-red-200',
  D: 'bg-blue-50 text-blue-700 ring-blue-200',
  I: 'bg-violet-50 text-violet-700 ring-violet-200',
  Other: 'bg-stone-100 text-stone-700 ring-stone-200',
};

function partyStyle(party: string | null): string {
  return PARTY_STYLES[party ?? 'Other'] ?? PARTY_STYLES.Other;
}

function chamberPrefix(rep: CongressionalRep): string {
  if (rep.chamber === 'senate') return 'Sen.';
  return 'Rep.';
}

function chamberSuffix(rep: CongressionalRep): string {
  if (rep.chamber === 'senate') return `${rep.party ?? '?'}-${rep.state}`;
  if (rep.district) return `${rep.state}-${rep.district}, ${rep.party ?? '?'}`;
  return rep.state;
}

export default function RepsPanel({ reps, resolvedDistrict, error }: Props) {
  return (
    <div className="border-t border-stone-100 px-4 py-3">
      <div className="flex items-center justify-between mb-2">
        <h4 className="text-[11px] font-semibold uppercase tracking-wide text-[#7A756E]">
          Federal contacts
        </h4>
        {resolvedDistrict && (
          <span className="text-[11px] text-[#7A756E]">District: {resolvedDistrict}</span>
        )}
      </div>

      {error && (
        <div className="text-xs text-stone-500 italic">
          {error}
          {error.includes('VITE_CONGRESS_API_KEY') && (
            <span className="block mt-1">Add the key to .env.local to populate this panel.</span>
          )}
        </div>
      )}

      {!error && reps.length === 0 && (
        <div className="text-xs text-stone-500 italic">No representatives resolved.</div>
      )}

      {reps.length > 0 && (
        <ul className="space-y-2">
          {reps.map((rep) => (
            <li
              key={`${rep.bioguideId ?? rep.name}-${rep.chamber}`}
              className="flex items-start justify-between gap-3"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs font-medium text-[#201F1E]">
                    {chamberPrefix(rep)} {rep.name}
                  </span>
                  <span
                    className={`text-[10px] uppercase tracking-wide font-semibold px-1.5 py-0.5 rounded ring-1 ${partyStyle(rep.party)}`}
                  >
                    {chamberSuffix(rep)}
                  </span>
                </div>
                {rep.energyCommittees.length > 0 && (
                  <p className="text-[11px] text-[#7A756E] mt-0.5">
                    {rep.energyCommittees.join(' • ')}
                  </p>
                )}
              </div>
              <div className="flex items-center gap-3 text-[11px]">
                {rep.phone && (
                  <a
                    href={`tel:${rep.phone.replace(/[^0-9+]/g, '')}`}
                    className="text-[#ED202B] hover:underline"
                  >
                    {rep.phone}
                  </a>
                )}
                {rep.url && (
                  <a
                    href={rep.url}
                    target="_blank"
                    rel="noreferrer"
                    className="text-[#ED202B] hover:underline"
                  >
                    Website
                  </a>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
