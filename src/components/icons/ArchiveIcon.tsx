/** Archive-box icon. Used everywhere the app exposes a SOFT-archive action
 *  (folder/document system Archive view + kebab menu, LLR site Archive,
 *  CRM Leads Archive view). Stroke uses `currentColor` so the icon inherits
 *  whatever color its parent button sets — works inside filled-red primary
 *  buttons (white text) and gray ghost buttons (red on hover) alike.
 *
 *  Intentionally distinct from the trash-can icon used on Site Analyzer's
 *  delete action — that one is HARD delete (permanent). Don't substitute. */
interface Props {
  className?: string;
}

export default function ArchiveIcon({ className = 'h-4 w-4' }: Props) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
      aria-hidden="true"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4"
      />
    </svg>
  );
}
