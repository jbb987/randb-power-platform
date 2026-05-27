/** Restore-from-archive icon — an archive box with an upward arrow exiting
 *  through the lid. Counterpart to `ArchiveIcon`; used on the "Restore"
 *  action inside the Archive view (FolderBrowser) and anywhere else we add
 *  an un-archive affordance later.
 *
 *  Same color / sizing contract as ArchiveIcon (stroke=currentColor,
 *  className-driven dimensions). */
interface Props {
  className?: string;
}

export default function RestoreIcon({ className = 'h-4 w-4' }: Props) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
      aria-hidden="true"
    >
      {/* Box body (no top, since the arrow exits through it) */}
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M4 12v8a1 1 0 001 1h14a1 1 0 001-1v-8"
      />
      {/* Box lid */}
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M3 8a1 1 0 011-1h6m4 0h6a1 1 0 011 1v3a1 1 0 01-1 1H4a1 1 0 01-1-1V8z"
      />
      {/* Upward arrow rising through the lid */}
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M12 17V3m0 0l-3 3m3-3l3 3"
      />
    </svg>
  );
}
