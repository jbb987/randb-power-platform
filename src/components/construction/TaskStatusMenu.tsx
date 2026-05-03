import {
  JOB_TASK_STATUS_LABELS,
  type JobTaskStatus,
} from '../../types';

interface Props {
  status: JobTaskStatus;
  disabled?: boolean;
  onChange: (next: JobTaskStatus) => void;
  /** Render style: full pill, or just a colored circle. Both cycle on click. */
  variant?: 'pill' | 'circle';
}

const PILL_STYLES: Record<JobTaskStatus, string> = {
  'todo':         'bg-stone-100 text-[#7A756E] border-stone-200',
  'in-progress':  'bg-[#3B82F6]/10 text-[#3B82F6] border-[#3B82F6]/20',
  'done':         'bg-[#10B981]/10 text-[#10B981] border-[#10B981]/20',
};

function nextStatus(s: JobTaskStatus): JobTaskStatus {
  // Cycle: todo → in-progress → done → todo.
  if (s === 'todo') return 'in-progress';
  if (s === 'in-progress') return 'done';
  return 'todo';
}

/** Status indicator that advances state by one step on click. The component
 *  name is historical (formerly a dropdown menu) — kept to minimize churn. */
export default function TaskStatusMenu({ status, disabled, onChange, variant = 'pill' }: Props) {
  function handleClick() {
    if (disabled) return;
    onChange(nextStatus(status));
  }

  if (variant === 'circle') {
    return (
      <button
        type="button"
        disabled={disabled}
        onClick={handleClick}
        title={disabled ? JOB_TASK_STATUS_LABELS[status] : `Click to mark ${JOB_TASK_STATUS_LABELS[nextStatus(status)]}`}
        aria-label={`Status: ${JOB_TASK_STATUS_LABELS[status]}. Click to advance.`}
        className={`h-5 w-5 shrink-0 rounded-full border-2 flex items-center justify-center transition ${
          status === 'done' ? 'border-[#10B981] bg-[#10B981]' :
          status === 'in-progress' ? 'border-[#3B82F6] bg-[#3B82F6]/15' :
          'border-[#D8D5D0] bg-white'
        } ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer hover:scale-110'}`}
      >
        {status === 'done' && (
          <svg className="h-3 w-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        )}
        {status === 'in-progress' && (
          <span className="h-1.5 w-1.5 rounded-full bg-[#3B82F6]" />
        )}
      </button>
    );
  }

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={handleClick}
      title={disabled ? JOB_TASK_STATUS_LABELS[status] : `Click to mark ${JOB_TASK_STATUS_LABELS[nextStatus(status)]}`}
      className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wide border ${PILL_STYLES[status]} ${
        disabled ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer hover:brightness-95'
      }`}
    >
      {JOB_TASK_STATUS_LABELS[status]}
    </button>
  );
}
