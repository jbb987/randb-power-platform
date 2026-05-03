import {
  CONSTRUCTION_JOB_STATUS_COLORS,
  CONSTRUCTION_JOB_STATUS_LABELS,
  type ConstructionJobStatus,
} from '../../types';

export default function JobStatusBadge({ status }: { status: ConstructionJobStatus }) {
  const color = CONSTRUCTION_JOB_STATUS_COLORS[status];
  const label = CONSTRUCTION_JOB_STATUS_LABELS[status];
  return (
    <span
      className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-semibold"
      style={{ color, backgroundColor: `${color}1A` /* ~10% alpha */ }}
    >
      <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: color }} />
      {label}
    </span>
  );
}
