import type { PoliticalSignal, SignalStatus } from '../../lib/politicalRadar/types';

interface Props {
  signal: PoliticalSignal;
}

const STATUS_STYLES: Record<
  SignalStatus,
  { dot: string; label: string; labelText: string; ring: string }
> = {
  confirmed_clean: {
    dot: 'bg-emerald-500',
    label: 'bg-emerald-50 text-emerald-700',
    labelText: 'Clean',
    ring: 'ring-emerald-200',
  },
  positive: {
    dot: 'bg-emerald-500',
    label: 'bg-emerald-50 text-emerald-700',
    labelText: 'Positive',
    ring: 'ring-emerald-200',
  },
  watch: {
    dot: 'bg-amber-500',
    label: 'bg-amber-50 text-amber-700',
    labelText: 'Watch',
    ring: 'ring-amber-200',
  },
  elevated: {
    dot: 'bg-orange-500',
    label: 'bg-orange-50 text-orange-700',
    labelText: 'Elevated',
    ring: 'ring-orange-200',
  },
  critical: {
    dot: 'bg-red-500',
    label: 'bg-red-50 text-red-700',
    labelText: 'Critical',
    ring: 'ring-red-200',
  },
  unknown: {
    dot: 'bg-stone-400',
    label: 'bg-stone-100 text-stone-600',
    labelText: 'Unknown',
    ring: 'ring-stone-200',
  },
  checking: {
    dot: 'bg-stone-300 animate-pulse',
    label: 'bg-stone-100 text-stone-600',
    labelText: 'Checking…',
    ring: 'ring-stone-200',
  },
};

function StatusIcon({ status }: { status: SignalStatus }) {
  if (status === 'confirmed_clean' || status === 'positive') {
    return (
      <svg className="h-4 w-4 text-emerald-600" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
      </svg>
    );
  }
  if (status === 'watch') {
    return (
      <svg className="h-4 w-4 text-amber-600" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
      </svg>
    );
  }
  if (status === 'elevated') {
    return (
      <svg className="h-4 w-4 text-orange-600" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
      </svg>
    );
  }
  if (status === 'critical') {
    return (
      <svg className="h-4 w-4 text-red-600" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
      </svg>
    );
  }
  // unknown / checking
  return (
    <svg className="h-4 w-4 text-stone-500" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M9.879 7.519c1.171-1.025 3.071-1.025 4.242 0 1.172 1.025 1.172 2.687 0 3.712-.203.179-.43.326-.67.442-.745.361-1.45.999-1.45 1.827v.75M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9 5.25h.008v.008H12v-.008z" />
    </svg>
  );
}

export default function SignalRow({ signal }: Props) {
  const style = STATUS_STYLES[signal.status];

  return (
    <div className="flex items-start gap-3 py-3 px-4 border-b border-stone-100 last:border-b-0">
      <div className="flex-shrink-0 mt-0.5">
        <StatusIcon status={signal.status} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5">
          <span className="text-xs font-medium text-[#201F1E]">{signal.label}</span>
          <span
            className={`text-[10px] uppercase tracking-wide font-semibold px-1.5 py-0.5 rounded ring-1 ${style.label} ${style.ring}`}
          >
            {style.labelText}
          </span>
        </div>
        <p className="text-xs text-[#201F1E] leading-relaxed">{signal.summary}</p>
        {signal.detail && <p className="text-[11px] text-[#7A756E] mt-1">{signal.detail}</p>}
      </div>
    </div>
  );
}
