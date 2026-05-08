import { useNavigate } from 'react-router-dom';
import type { ActivityEntry, ActivityAction, ActivityResourceType } from '../../types/activity';
import { ACTIVITY_ACTION_LABELS, ACTIVITY_RESOURCE_LABELS } from '../../types/activity';
import { resourceUrl } from '../../lib/activityRoutes';
import { formatRelativeTime } from '../../utils/format';

interface ActivityRowProps {
  entry: ActivityEntry;
}

export default function ActivityRow({ entry }: ActivityRowProps) {
  const navigate = useNavigate();
  const url = resourceUrl(entry.resource);
  const isClickable = url !== null;

  const ts = entry.timestamp?.toMillis ? entry.timestamp.toMillis() : Date.now();

  const onClick = () => {
    if (url) navigate(url);
  };

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!isClickable}
      className={`w-full flex items-start gap-3 px-4 py-3 text-left transition border-b border-[#D8D5D0] last:border-b-0 ${
        isClickable ? 'hover:bg-[#F5F4F2] cursor-pointer' : 'cursor-default'
      }`}
    >
      <div className="shrink-0 mt-0.5">
        <ActionIcon action={entry.action} />
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-2 flex-wrap">
          <span className="text-sm font-medium text-[#201F1E] truncate">{entry.summary}</span>
        </div>
        <div className="flex items-center gap-2 mt-1 text-[11px] text-[#7A756E]">
          <span className="font-mono truncate">{entry.actor.email}</span>
          <span>·</span>
          <ActionPill action={entry.action} />
          <ResourcePill type={entry.resource.type} />
          {entry.changedFields && entry.changedFields.length > 0 && (
            <>
              <span>·</span>
              <span className="truncate">
                {entry.changedFields.slice(0, 4).join(', ')}
                {entry.changedFields.length > 4 ? '…' : ''}
              </span>
            </>
          )}
        </div>
      </div>

      <div className="shrink-0 text-[11px] text-[#7A756E]">{formatRelativeTime(ts)}</div>
    </button>
  );
}

function ActionIcon({ action }: { action: ActivityAction }) {
  const cls = 'h-4 w-4 text-[#7A756E]';
  if (action === 'create') {
    return (
      <svg className={cls} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
      </svg>
    );
  }
  if (action === 'delete') {
    return (
      <svg className={cls} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6M1 7h22M9 7V4a1 1 0 011-1h4a1 1 0 011 1v3"
        />
      </svg>
    );
  }
  if (action === 'upload') {
    return (
      <svg className={cls} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M16 8l-4-4m0 0L8 8m4-4v12"
        />
      </svg>
    );
  }
  if (action === 'tool-run') {
    return (
      <svg className={cls} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
      </svg>
    );
  }
  if (action === 'login') {
    return (
      <svg className={cls} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M11 16l-4-4m0 0l4-4m-4 4h14m-5 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h7a3 3 0 013 3v1"
        />
      </svg>
    );
  }
  if (action === 'export') {
    return (
      <svg className={cls} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
        />
      </svg>
    );
  }
  // update
  return (
    <svg className={cls} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
      />
    </svg>
  );
}

const ACTION_PILL_COLOR: Record<ActivityAction, string> = {
  create: 'bg-emerald-50 text-emerald-700',
  update: 'bg-stone-100 text-stone-700',
  delete: 'bg-red-50 text-red-700',
  upload: 'bg-blue-50 text-blue-700',
  'tool-run': 'bg-amber-50 text-amber-700',
  login: 'bg-indigo-50 text-indigo-700',
  export: 'bg-violet-50 text-violet-700',
};

function ActionPill({ action }: { action: ActivityAction }) {
  return (
    <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${ACTION_PILL_COLOR[action]}`}>
      {ACTIVITY_ACTION_LABELS[action]}
    </span>
  );
}

function ResourcePill({ type }: { type: ActivityResourceType }) {
  return (
    <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-stone-100 text-stone-600">
      {ACTIVITY_RESOURCE_LABELS[type]}
    </span>
  );
}
