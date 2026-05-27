import { useNavigate } from 'react-router-dom';
import Button from '../ui/Button';
import type { SiteRegistryEntry } from '../../types';

interface Props {
  registryEntry: SiteRegistryEntry | null;
  siteRegistryId: string;
  preConSiteId: string;
}

/** Maps each Site Analyzer section to the field on `SiteRegistryEntry` that's
 *  populated once that section has run successfully. The presence-or-absence of
 *  that field drives the ✓ / ○ status on the checklist. */
const ANALYSIS_SECTIONS: Array<{ label: string; field: keyof SiteRegistryEntry }> = [
  { label: 'Land valuation', field: 'appraisalResult' },
  { label: 'Power', field: 'infraResult' },
  { label: 'Broadband', field: 'broadbandResult' },
  { label: 'Transport', field: 'transportResult' },
  { label: 'Water', field: 'waterResult' },
  { label: 'Gas', field: 'gasResult' },
  { label: 'Labor', field: 'laborResult' },
  { label: 'Political', field: 'politicalResult' },
];

function formatLastAnalyzed(ts: number | null | undefined): string {
  if (!ts) return 'Last analyzed: never';
  const date = new Date(ts).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
  return `Last analyzed ${date}`;
}

function SectionRow({ label, done }: { label: string; done: boolean }) {
  const color = done ? '#10B981' : '#D8D5D0';
  const textColor = done ? '#201F1E' : '#7A756E';
  return (
    <div className="flex items-center gap-2 text-sm" style={{ color: textColor }}>
      <span
        className="h-4 w-4 rounded-full inline-flex items-center justify-center shrink-0"
        style={{ backgroundColor: done ? color : 'transparent', borderColor: color, borderWidth: 1.5 }}
      >
        {done && (
          <svg
            className="h-2.5 w-2.5 text-white"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={3}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        )}
      </span>
      <span className="truncate">{label}</span>
    </div>
  );
}

export default function PreConAppraisalSummary({
  registryEntry,
  siteRegistryId,
  preConSiteId,
}: Props) {
  const navigate = useNavigate();

  const sectionStatus = ANALYSIS_SECTIONS.map((s) => ({
    label: s.label,
    done: !!registryEntry?.[s.field],
  }));
  const doneCount = sectionStatus.filter((s) => s.done).length;
  const totalCount = sectionStatus.length;

  return (
    <div className="bg-white rounded-xl border border-[#D8D5D0] shadow-sm p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
        <h2 className="font-heading text-lg font-semibold text-[#201F1E]">Site analysis</h2>
        <Button
          onClick={() =>
            navigate(`/site-analyzer/${siteRegistryId}?returnTo=/llr/${preConSiteId}`)
          }
        >
          View site analysis
        </Button>
      </div>

      <div className="text-xs text-[#7A756E] mb-3">
        {doneCount} of {totalCount} sections complete ·{' '}
        {formatLastAnalyzed(registryEntry?.piddrGeneratedAt)}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-3 gap-y-2">
        {sectionStatus.map((s) => (
          <SectionRow key={s.label} label={s.label} done={s.done} />
        ))}
      </div>
    </div>
  );
}
