import type { FederalBill } from '../../lib/politicalRadar/types';

interface Props {
  bills: FederalBill[];
  error: string | null;
}

const STATUS_STYLES: Record<string, string> = {
  Enacted: 'bg-red-50 text-red-700 ring-red-200',
  Vetoed: 'bg-stone-100 text-stone-700 ring-stone-200',
  'Passed Chamber': 'bg-orange-50 text-orange-700 ring-orange-200',
  Committee: 'bg-amber-50 text-amber-700 ring-amber-200',
  Introduced: 'bg-amber-50 text-amber-700 ring-amber-200',
  'In Progress': 'bg-stone-100 text-stone-700 ring-stone-200',
};

function statusStyle(status: string): string {
  return STATUS_STYLES[status] ?? STATUS_STYLES['In Progress'];
}

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  } catch {
    return iso;
  }
}

export default function BillsPanel({ bills, error }: Props) {
  if (error || bills.length === 0) return null;

  return (
    <div className="border-t border-stone-100 px-4 py-3 bg-stone-50/50">
      <h4 className="text-[11px] font-semibold uppercase tracking-wide text-[#7A756E] mb-2">
        Tracked bills ({bills.length})
      </h4>
      <ul className="space-y-1.5">
        {bills.map((b) => (
          <li
            key={`${b.type}-${b.number}-${b.congress}`}
            className="flex items-start justify-between gap-3 text-xs"
          >
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <a
                  href={b.url}
                  target="_blank"
                  rel="noreferrer"
                  className="font-mono font-semibold text-[#ED202B] hover:underline shrink-0"
                >
                  {b.type}.{b.number}
                </a>
                <span
                  className={`text-[10px] uppercase tracking-wide font-semibold px-1.5 py-0.5 rounded ring-1 ${statusStyle(b.status)}`}
                >
                  {b.status}
                </span>
                <span className="text-[11px] text-[#7A756E]">{formatDate(b.latestActionDate)}</span>
              </div>
              <p className="text-[11px] text-[#201F1E] leading-snug mt-0.5 line-clamp-2">
                {b.title}
              </p>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
