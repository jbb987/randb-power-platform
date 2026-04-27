import { Link } from 'react-router-dom';

interface Props {
  siteName: string;
  companyId: string | null;
  companyName: string | null;
  lastAnalyzedAt: number | null;
  isAnalyzing: boolean;
  canExportPdf: boolean;
  isExportingPdf: boolean;
  onEdit: () => void;
  onReanalyze: () => void;
  onExportPdf: () => void;
  onDelete: () => void;
}

function formatDate(ts: number | null): string | null {
  if (!ts) return null;
  return new Date(ts).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

/**
 * Header for a single site analysis: name, company chip, last-analyzed
 * timestamp, and action buttons (Edit, Re-analyze, Export PDF, Delete).
 * Mobile: name + meta stack on top, actions wrap below.
 */
export default function DetailHeader({
  siteName,
  companyId,
  companyName,
  lastAnalyzedAt,
  isAnalyzing,
  canExportPdf,
  isExportingPdf,
  onEdit,
  onReanalyze,
  onExportPdf,
  onDelete,
}: Props) {
  const lastDate = formatDate(lastAnalyzedAt);

  return (
    <div className="mb-5">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mb-2">
        <div className="min-w-0 flex-1">
          <h1 className="font-heading text-2xl font-semibold text-[#201F1E] truncate">
            {siteName || 'Untitled Site'}
          </h1>
          <div className="flex flex-wrap items-center gap-2 mt-1.5 text-xs text-[#7A756E]">
            {companyId && companyName ? (
              <Link
                to={`/crm/companies/${companyId}`}
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-[#ED202B]/10 text-[#ED202B] font-medium hover:bg-[#ED202B]/15 transition"
              >
                {companyName}
              </Link>
            ) : (
              <span className="italic text-[#7A756E]">Unlinked</span>
            )}
            {lastDate && (
              <>
                <span className="text-[#D8D5D0]">·</span>
                <span>Analyzed {lastDate}</span>
              </>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <button
            onClick={onEdit}
            disabled={isAnalyzing}
            className="text-sm font-medium text-[#ED202B] border border-[#ED202B] px-3 py-1.5 rounded-lg hover:bg-[#ED202B]/5 transition disabled:opacity-40"
          >
            Edit
          </button>
          <button
            onClick={onReanalyze}
            disabled={isAnalyzing}
            className="inline-flex items-center gap-1.5 text-sm font-medium text-white bg-[#ED202B] px-3 py-1.5 rounded-lg hover:bg-[#9B0E18] transition disabled:opacity-40"
          >
            {isAnalyzing ? (
              <>
                <svg className="h-3.5 w-3.5 animate-spin" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Analyzing…
              </>
            ) : (
              'Re-analyze'
            )}
          </button>
          <button
            onClick={onExportPdf}
            disabled={!canExportPdf || isExportingPdf || isAnalyzing}
            className="inline-flex items-center gap-1.5 text-sm font-medium text-[#7A756E] border border-[#D8D5D0] bg-white px-3 py-1.5 rounded-lg hover:bg-stone-50 transition disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {isExportingPdf ? (
              <>
                <svg className="h-3.5 w-3.5 animate-spin" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                PDF…
              </>
            ) : (
              <>
                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                Export PDF
              </>
            )}
          </button>
          <button
            onClick={onDelete}
            disabled={isAnalyzing}
            className="text-sm font-medium text-stone-500 hover:text-red-600 px-2 py-1.5 transition disabled:opacity-40"
            aria-label="Delete site"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6M1 7h22M9 7V4a1 1 0 011-1h4a1 1 0 011 1v3" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}
